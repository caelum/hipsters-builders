#!/usr/bin/env tsx
/**
 * sync-content.ts — Vault → Content Collections
 *
 * Reads podcast signals and WhatsApp signals from the Stromae vault
 * and generates Astro content collections for hipsters-builders.
 *
 * Usage:
 *   npx tsx scripts/sync-content.ts [options]
 *
 * Options:
 *   --vault <path>   Path to vault (default: ~/stromae-vault-alura)
 *   --since <date>   Only include episodes since this date (default: 2025-01-01)
 *   --dry-run        Preview without writing files
 *   --help           Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';

// --- CLI ---

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(fs.readFileSync(import.meta.filename, 'utf-8').match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? '');
  process.exit(0);
}

const vaultPath = args.includes('--vault')
  ? args[args.indexOf('--vault') + 1]
  : path.join(os.homedir(), 'stromae-vault-alura');

if (!fs.existsSync(vaultPath)) {
  console.error(`\n❌ Vault not found at: ${vaultPath}\n`);
  console.error(`The Stromae vault contains podcast transcriptions, WhatsApp threads,`);
  console.error(`and newsletter drafts — it's the content source for this site.\n`);
  console.error(`To set it up:\n`);
  console.error(`  git clone git@github.com:caelum/stromae-vault-alura.git ~/stromae-vault-alura\n`);
  console.error(`Or point to a different location:\n`);
  console.error(`  npx tsx scripts/sync-content.ts --vault /path/to/vault\n`);
  process.exit(1);
}

const sinceDate = new Date(
  args.includes('--since') ? args[args.indexOf('--since') + 1] : '2025-01-01'
);

const dryRun = args.includes('--dry-run');
const projectRoot = path.resolve(import.meta.dirname, '..');
const contentDir = path.join(projectRoot, 'src', 'content');

// --- Types ---

interface SignalFrontmatter {
  type: string;
  source_type: string;
  source_name: string;
  source_url: string;
  captured_at: string;
  author?: string;
  authors?: string[];
  brand: string;
  tags: string[];
  origin: string;
  summary: string;
  parent_episode?: string;
  segment?: number;
  timestamp_start?: string;
  timestamp_end?: string;
  thread_start?: string;
  thread_end?: string;
  classified?: boolean;
}

interface ParsedSignal {
  filename: string;
  frontmatter: SignalFrontmatter;
  content: string;
  body: string; // without frontmatter
}

interface Quote {
  text: string;
  speaker: string;
  timestamp?: string;
}

// --- Quote quality ---

/** Patterns that indicate low-quality quotes (greetings, meta-commentary, filler) */
/** Patterns that HARD-REJECT a quote regardless of length */
const HARD_REJECT_PATTERNS = [
  // Opening greetings that dominate the first 60 chars
  /^(salve|fala|oi|olá|e aí|ei|boa noite|bom dia|boa tarde|tudo bem|tudo ótimo|tudo certo|tudo bom)[,!.\s]/i,
  // "Tá no ar mais um episódio", "seja bem vindo"
  /\b(t[áa] no ar|mais um epis[óo]dio|bem[- ]?vind[oa]s?|seu podcast favorito)\b/i,
  // Self-intros: "eu sou fulano", "meu nome é", "tudo bem com você", "bom estar aqui"
  /\b(eu sou .{2,20}(seu host|seu apresentador|host)|meu nome [eé]|tudo bem com voc[eê]|prazer em estar|prazer estar aqui|bom estar aqui)\b/i,
  // Host introducing guests: "tenho o prazer de chamar", "quem tá aqui com a gente"
  /\b(tenho o prazer de|prazer de chamar|quem t[aá] aqui com|quem est[aá] aqui com|chamo aqui|convido aqui|nosso[a]? convidado[a]? de hoje|terceiro[a]? convidado[a])\b/i,
  // "Tudo bem contigo?", "Como é que você tá?"
  /\b(tudo bem contigo|tudo bem com ele|como [eé] que voc[eê])\b/i,
  // Closings
  /\b(obrigad[oa] pela? |valeu pela?|até a próxima|até mais|tchau|falou pessoal)\b/i,
  // Pure filler
  /^(e aí|tudo bem|como vai|beleza|vamos lá|bora)[?.!]?$/i,
  // Promotion ("acabei de descobrir que fui promovida" — inside joke, not insightful)
  /\b(acabei de descobrir que fui promovid)\b/i,
  // Support/help questions (not insights)
  /\b(me tirar d[uú]vida|algu[eé]m (sabe|pode|consegue) me (ajudar|dizer|explicar)|como (fa[cç]o|configuro|instalo)|n[aã]o (consigo|sei como|manjo))\b/i,
  // Begging/gratitude filler
  /\b(agrade[cç]o d\+|por favor me ajud|sei que posso pesquisar)\b/i,
  // Job seeking / personal requests in community groups
  /\b(aceito indica[çc][oõ]es|n[aã]o tenho emprego|procurando (vaga|emprego|oportunidade)|me desculpa usar o grupo|[eé] urgente)\b/i,
  // Event announcements without substance
  /\b(pessoal amanh[aã]|teremos (uma|um)|particip[ae]m|inscrevam|link de inscri)\b/i,
];

/** Patterns that penalize score but don't hard-reject */
const LOW_QUALITY_PATTERNS = [
  // Greetings mixed with content (less severe)
  /\b(bom dia|boa tarde|boa noite|olá|oi pessoal|oi gente|fala pessoal|e aí pessoal|fala[, ]galera)\b/i,
  // Guest intros
  /\b(quem t[aá] aqui com|super empolgad[ao]|animad[ao] com esse papo)\b/i,
  // Meta-commentary
  /\b(como a gente falou|voltando ao assunto|como eu disse|a gente já conversou|como eu falei|retomando aqui|deixa eu falar)\b/i,
  // Filler transitions
  /\b(vamos lá|é isso aí|é isso mesmo|brincadeiras à parte)\b/i,
];

/** Tech product/tool names → **bold** */
const TECH_PRODUCTS = [
  'ChatGPT', 'GPT-4', 'GPT-4o', 'GPT-3', 'GPT',
  'Claude', 'Claude Code', 'Gemini', 'Copilot', 'GitHub Copilot',
  'Cursor', 'Windsurf', 'Bolt', 'Lovable', 'Replit', 'v0',
  'OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'Apple',
  'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Astro',
  'Python', 'JavaScript', 'TypeScript', 'Java', 'Kotlin', 'Swift', 'Rust', 'Go',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
  'TensorFlow', 'PyTorch', 'LangChain', 'LlamaIndex',
  'Whisper', 'Midjourney', 'DALL-E', 'Stable Diffusion', 'Sora',
  'Linux', 'Git', 'GitHub', 'VS Code', 'Node.js',
  'Figma', 'Notion', 'Slack', 'Discord',
  'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch',
  'Spring Boot', 'Django', 'FastAPI', 'Rails',
  'Vercel', 'Netlify', 'Fly.io', 'Heroku',
  'DeepSeek', 'Llama', 'Mistral', 'Groq', 'Perplexity',
  'OpenClaw', 'Devin', 'SWE-bench',
  'Alura', 'FIAP', 'Hipsters',
];

/** Concept terms → *italic* */
const TECH_CONCEPTS = [
  'machine learning', 'deep learning', 'inteligência artificial',
  'vibe coding', 'pair programming', 'code review',
  'agentes', 'agentic', 'multi-agentes',
  'embeddings', 'fine-tuning', 'fine tuning',
  'prompt engineering', 'chain of thought', 'few-shot',
  'RAG', 'retrieval augmented generation',
  'large language model', 'LLM', 'LLMs',
  'transformer', 'transformers', 'attention mechanism',
  'API', 'APIs', 'microserviços', 'microsserviços',
  'DevOps', 'CI/CD', 'deploy contínuo',
  'refatoração', 'refactoring', 'clean code', 'code smell',
  'product market fit', 'product-led growth',
  'data science', 'data engineering', 'data lake', 'data mesh',
  'cloud computing', 'serverless', 'edge computing',
  'open source', 'código aberto',
  'sprint', 'scrum', 'kanban', 'agile', 'ágil',
  'tech lead', 'staff engineer', 'principal engineer',
  'burnout', 'soft skills', 'hard skills',
  'token', 'tokens', 'context window', 'janela de contexto',
  'hallucination', 'alucinação',
  'multimodal', 'text-to-speech', 'speech-to-text',
];

/** Score a quote for quality (higher = better). Returns 0 for rejected quotes. */
function scoreQuote(text: string): number {
  // Hard reject: intro/greeting/closing patterns — regardless of length
  for (const pat of HARD_REJECT_PATTERNS) {
    if (pat.test(text)) return 0;
  }

  // Soft penalty: low-quality patterns reduce score
  let penalty = 0;
  for (const pat of LOW_QUALITY_PATTERNS) {
    if (pat.test(text)) penalty += 15;
  }

  let score = 10; // base score

  // Bonus: quotes with images or links are richer content
  if (/!\[Image\]\(media\//.test(text)) score += 10;
  if (/https?:\/\/[^\s)]+/.test(text)) score += 8;

  // Prefer quotes with numbers/data
  if (/\d+%|\d+\s*(mil(hões|hão)?|bi(lhões|lhão)?|trilhões|vezes|x)\b/i.test(text)) score += 15;
  if (/\d{2,}/.test(text)) score += 5;

  // Prefer quotes with opinions/insights
  if (/\b(eu acho|na minha opinião|eu acredito|o ponto é|a questão é|o problema é|o interessante é|o legal é)\b/i.test(text)) score += 10;

  // Prefer quotes with tech terms
  const lowerText = text.toLowerCase();
  let techHits = 0;
  for (const term of TECH_PRODUCTS) {
    if (lowerText.includes(term.toLowerCase())) techHits++;
  }
  for (const term of TECH_CONCEPTS) {
    if (lowerText.includes(term.toLowerCase())) techHits++;
  }
  score += Math.min(techHits * 5, 25);

  // Prefer medium-length quotes (not too short, not too long)
  if (text.length >= 100 && text.length <= 400) score += 10;
  else if (text.length > 400) score += 5;

  // Reject very short quotes
  if (text.length < 100) return 0;

  // Penalize informal/broken Portuguese (WhatsApp abbreviations = likely casual question, not insight)
  const informalMarkers = (text.match(/\b(mto|d\+|vc|vcs|tb|tbm|pq|eh|oq|q |nao manjo|n[aã]o manjo|codigos que)\b/gi) ?? []).length;
  if (informalMarkers >= 3) score -= 20;

  // Apply soft penalty from low-quality patterns
  score -= penalty;

  return Math.max(score, 1); // never go below 1 (0 means hard reject)
}

/** Truncate text at a sentence boundary, never mid-word */
function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  // Look for last sentence boundary within maxLen
  const sentenceEnd = /[.?!…]+["»)]*\s/g;
  let lastBoundary = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceEnd.exec(text)) !== null) {
    const endPos = m.index + m[0].trimEnd().length;
    if (endPos <= maxLen) {
      lastBoundary = endPos;
    } else if (lastBoundary === -1 && endPos <= maxLen + 500) {
      // No boundary found within limit — extend to next one (up to +500)
      return text.slice(0, endPos);
    } else {
      break;
    }
  }

  if (lastBoundary > 0) {
    return text.slice(0, lastBoundary);
  }

  // No sentence boundary found even within +500 — find last word boundary
  const wordBoundary = text.lastIndexOf(' ', maxLen);
  if (wordBoundary > maxLen * 0.5) {
    return text.slice(0, wordBoundary) + '...';
  }

  return text.slice(0, maxLen) + '...';
}

/** Apply bold to tech product names and italic to concept terms */
function boldTechKeywords(text: string): string {
  // Skip if text already has formatting markers (WhatsApp *bold*, >blockquote, [links])
  if (/\*\w|\n>/.test(text)) return text;

  let result = text;

  // Sort by length descending to match longer terms first (e.g., "Claude Code" before "Claude")
  const sortedProducts = [...TECH_PRODUCTS].sort((a, b) => b.length - a.length);
  const sortedConcepts = [...TECH_CONCEPTS].sort((a, b) => b.length - a.length);

  // Bold products — case-insensitive match, preserve original casing
  for (const term of sortedProducts) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\*)\\b(${escaped})\\b(?!\\*)`, 'gi');
    result = result.replace(regex, '**$1**');
  }

  // Italic concepts — case-insensitive, preserve original casing
  // Skip terms already wrapped in * (bold or italic)
  for (const term of sortedConcepts) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\*)\\b(${escaped})\\b(?!\\*)`, 'gi');
    result = result.replace(regex, '*$1*');
  }

  return result;
}

// --- Helpers ---

function readSignals(dir: string): ParsedSignal[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(filename => {
      const raw = fs.readFileSync(path.join(dir, filename), 'utf-8');
      const { data, content } = matter(raw);
      return { filename, frontmatter: data as SignalFrontmatter, content: raw, body: content };
    });
}

function extractQuotes(body: string, maxQuotes = 5): Quote[] {
  // Pattern: **[Speaker · HH:MM]** text
  const regex = /\*\*\[(.+?)\s*·\s*(\d+:\d+)\]\*\*\s*([\s\S]*?)(?=\n\n\*\*\[|\n\n#|$)/g;
  const scored: { quote: Quote; score: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const rawText = match[3].trim();
    // Truncate at sentence boundary instead of hard cut
    const text = truncateAtSentence(rawText, 500);
    const score = scoreQuote(text);
    if (score === 0) continue; // rejected by quality filter
    scored.push({
      quote: {
        text: boldTechKeywords(text),
        speaker: match[1].trim(),
        timestamp: match[2],
      },
      score,
    });
  }

  // Sort by quality score descending
  scored.sort((a, b) => b.score - a.score);

  // Pick diverse speakers via round-robin, but ordered by score within each speaker
  const bySpeaker = new Map<string, typeof scored>();
  for (const item of scored) {
    const arr = bySpeaker.get(item.quote.speaker) ?? [];
    arr.push(item);
    bySpeaker.set(item.quote.speaker, arr);
  }

  const selected: Quote[] = [];
  let round = 0;
  while (selected.length < maxQuotes) {
    let added = false;
    for (const [, arr] of bySpeaker) {
      if (round < arr.length && selected.length < maxQuotes) {
        selected.push(arr[round].quote);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return selected;
}

function extractBestQuote(body: string): Quote | null {
  // extractQuotes already scores and sorts by quality — just pick the top one
  const quotes = extractQuotes(body, 20);
  return quotes[0] ?? null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function writeContent(filepath: string, frontmatter: Record<string, unknown>, body: string) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = matter.stringify(body, frontmatter);
  fs.writeFileSync(filepath, content, 'utf-8');
}

function extractEpisodeNumber(slug: string): number | undefined {
  // "vibe-coding-hipsters-ponto-tech-482" → 482
  const hipMatch = slug.match(/hipsters-ponto-tech-(\d+)/);
  if (hipMatch) return parseInt(hipMatch[1]);
  // "203-claude-opus-4-5-hardware..." → 203 (IA Sob Controle)
  const iascMatch = slug.match(/^(\d+)-/);
  if (iascMatch) return parseInt(iascMatch[1]);
  return undefined;
}

function podcastDisplayName(sourceName: string): string {
  switch (sourceName) {
    case 'hipsters-rss': return 'Hipsters Ponto Tech';
    case 'ia-sob-controle-rss': return 'IA Sob Controle';
    case 'mesa-de-produto-rss': return 'Mesa de Produto';
    case 'like-a-boss-rss': return 'Like a Boss';
    default: return sourceName;
  }
}

function extractTitle(body: string, slug: string): string {
  // First H1 in content
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  // Fallback: humanize slug
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// --- Main: Sync Episodes ---

function syncEpisodes() {
  console.log('\n📻 Syncing episodes...');
  const podcastDir = path.join(vaultPath, 'signals', 'podcasts');
  const signals = readSignals(podcastDir);

  // Filter: hipsters + ia-sob-controle, since date
  const relevant = signals.filter(s => {
    const fm = s.frontmatter;
    if (!['hipsters-rss', 'ia-sob-controle-rss'].includes(fm.source_name)) return false;
    const date = new Date(fm.captured_at);
    return date >= sinceDate;
  });

  console.log(`  Found ${relevant.length} signals from Hipsters + IA Sob Controle since ${sinceDate.toISOString().slice(0, 10)}`);

  // Group by parent_episode
  const episodes = new Map<string, ParsedSignal[]>();
  for (const s of relevant) {
    const key = s.frontmatter.parent_episode ?? s.filename.replace('.md', '');
    const arr = episodes.get(key) ?? [];
    arr.push(s);
    episodes.set(key, arr);
  }

  console.log(`  ${episodes.size} unique episodes`);

  const outDir = path.join(contentDir, 'episodes');
  let written = 0;

  for (const [episodeSlug, signals] of episodes) {
    // Find the parent signal (no segment number, or segment=undefined)
    const parent = signals.find(s => !s.frontmatter.segment) ?? signals[0];
    const segments = signals
      .filter(s => s.frontmatter.segment)
      .sort((a, b) => (a.frontmatter.segment ?? 0) - (b.frontmatter.segment ?? 0));

    // Collect all quotes from all segments
    const allQuotes: Quote[] = [];
    for (const seg of segments) {
      allQuotes.push(...extractQuotes(seg.body, 3));
    }
    // If no segments, extract from parent
    if (segments.length === 0) {
      allQuotes.push(...extractQuotes(parent.body, 5));
    }

    // Pick top 5 diverse quotes
    const topQuotes = allQuotes.slice(0, 5);

    // Collect all authors
    const authorsSet = new Set<string>();
    for (const s of signals) {
      const authors = s.frontmatter.authors ?? (s.frontmatter.author ? [s.frontmatter.author] : []);
      for (const a of authors) authorsSet.add(a);
    }
    // Remove generic author names
    authorsSet.delete('Alura - Hipsters Network');
    authorsSet.delete('IA Sob Controle - Inteligência Artificial');

    // Collect all tags
    const tagsSet = new Set<string>();
    for (const s of signals) {
      for (const t of s.frontmatter.tags ?? []) tagsSet.add(t);
    }
    // Remove noise tags
    tagsSet.delete('transcrição completa');

    const title = extractTitle(parent.body, episodeSlug);
    const episodeNum = extractEpisodeNumber(episodeSlug);
    const podcast = podcastDisplayName(parent.frontmatter.source_name);

    // Build highlights body from best segments
    let body = '';
    if (segments.length > 0) {
      const bestSegments = segments.slice(0, 5); // top 5 segments
      for (const seg of bestSegments) {
        const segTitle = extractTitle(seg.body, '');
        body += `## ${segTitle}\n\n`;
        // Pick best 2 quotes from this segment
        const segQuotes = extractQuotes(seg.body, 2);
        for (const q of segQuotes) {
          body += `> "${q.text}"\n> — **${q.speaker}**${q.timestamp ? ` (${q.timestamp})` : ''}\n\n`;
        }
        if (seg.frontmatter.summary) {
          body += `${seg.frontmatter.summary}\n\n`;
        }
      }
    } else {
      // Parent-only episode (no segments)
      if (parent.frontmatter.summary) {
        body += `${parent.frontmatter.summary}\n\n`;
      }
      for (const q of topQuotes) {
        body += `> "${q.text}"\n> — **${q.speaker}**${q.timestamp ? ` (${q.timestamp})` : ''}\n\n`;
      }
    }

    const frontmatter = {
      title,
      description: parent.frontmatter.summary ?? '',
      pubDate: parent.frontmatter.captured_at,
      podcast,
      ...(episodeNum !== undefined && { episodeNumber: episodeNum }),
      sourceUrl: parent.frontmatter.source_url,
      authors: [...authorsSet],
      tags: [...tagsSet].slice(0, 10),
      segmentCount: segments.length,
      quotes: topQuotes,
    };

    if (dryRun) {
      console.log(`  [dry-run] ${episodeSlug}.md — ${title} (${segments.length} segments, ${topQuotes.length} quotes)`);
    } else {
      writeContent(path.join(outDir, `${episodeSlug}.md`), frontmatter, body);
      written++;
    }
  }

  console.log(`  ✅ ${dryRun ? 'Would write' : 'Wrote'} ${written || episodes.size} episodes`);
}

// --- Main: Sync Curtas ---

function syncCurtas() {
  console.log('\n💬 Syncing curtas...');
  const outDir = path.join(contentDir, 'curtas');
  let written = 0;

  // 1. Best quotes from podcast segments
  const podcastDir = path.join(vaultPath, 'signals', 'podcasts');
  const podcastSignals = readSignals(podcastDir).filter(s => {
    const fm = s.frontmatter;
    if (!['hipsters-rss', 'ia-sob-controle-rss'].includes(fm.source_name)) return false;
    if (!fm.segment) return false; // only segments have good quotes
    return new Date(fm.captured_at) >= sinceDate;
  });

  console.log(`  Scanning ${podcastSignals.length} podcast segments for quotes...`);

  // Pick 1 best quote per segment, then take top N overall
  const podcastQuotes: { quote: Quote; signal: ParsedSignal }[] = [];
  for (const s of podcastSignals) {
    const q = extractBestQuote(s.body);
    if (q && q.text.length >= 100) {
      podcastQuotes.push({ quote: q, signal: s });
    }
  }

  // Sort by text length (proxy for insight density), take top 50
  podcastQuotes.sort((a, b) => {
    const lenA = Math.min(a.quote.text.length, 300);
    const lenB = Math.min(b.quote.text.length, 300);
    return lenB - lenA;
  });

  // Deduplicate by speaker — max 3 per speaker
  const speakerCount = new Map<string, number>();
  const selectedPodcast = podcastQuotes.filter(pq => {
    const count = speakerCount.get(pq.quote.speaker) ?? 0;
    if (count >= 3) return false;
    speakerCount.set(pq.quote.speaker, count + 1);
    return true;
  }).slice(0, 30);

  for (const { quote, signal } of selectedPodcast) {
    const dateStr = new Date(signal.frontmatter.captured_at).toISOString().slice(0, 10);
    const slug = `${dateStr}-${slugify(quote.speaker)}-${slugify(quote.text.slice(0, 40))}`;
    const episode = signal.frontmatter.parent_episode ?? signal.filename.replace('.md', '');
    const podcast = podcastDisplayName(signal.frontmatter.source_name);
    const context = `${podcast}: ${extractTitle(signal.body, episode)}`;

    const frontmatter = {
      quote: quote.text,
      speaker: quote.speaker,
      context,
      sourceType: 'podcast' as const,
      sourceUrl: signal.frontmatter.source_url,
      pubDate: signal.frontmatter.captured_at,
      tags: (signal.frontmatter.tags ?? []).slice(0, 5),
    };

    if (!dryRun) {
      writeContent(path.join(outDir, `${slug}.md`), frontmatter, '');
      written++;
    }
  }

  console.log(`  ${dryRun ? 'Would write' : 'Wrote'} ${written || selectedPodcast.length} podcast curtas`);

  // 2. WhatsApp insights
  const whatsappDir = path.join(vaultPath, 'signals', 'internal');
  const whatsappSignals = readSignals(whatsappDir).filter(s => {
    const name = s.frontmatter.source_name;
    return ['whatsapp-builders-sp-claude-code', 'whatsapp-clauders', 'whatsapp-ia-sob-controle'].includes(name)
      && new Date(s.frontmatter.captured_at) >= sinceDate;
  });

  console.log(`  Scanning ${whatsappSignals.length} WhatsApp threads for quotes...`);

  let waWritten = 0;
  const waQuotes: { quote: Quote; signal: ParsedSignal }[] = [];
  for (const s of whatsappSignals) {
    const q = extractBestQuote(s.body);
    if (q && q.text.length >= 80) {
      waQuotes.push({ quote: q, signal: s });
    }
  }

  // Filter out low-quality WhatsApp quotes more aggressively
  const filteredWa = waQuotes.filter(({ quote }) => {
    const text = quote.text.replace(/\n+/g, ' ').trim();
    // Reject short real content (strip markdown/whitespace before measuring)
    const plainText = text.replace(/[*_>\[\]()!#]/g, '').replace(/\s+/g, ' ').trim();
    if (plainText.length < 100) return false;
    // Reject greetings/requests/closings at the start
    if (/^(bom dia|boa tarde|boa noite|salve|fala|oi |olá|obrigad|valeu|ei,)/i.test(plainText)) return false;
    // Reject job seeking, help requests, event announcements
    if (/\b(aceito indica|n[aã]o tenho emprego|procurando vaga|me desculpa usar|precisava de.{0,20}dicas|algu[eé]m (sabe|pode) me)\b/i.test(plainText)) return false;
    // Reject URL-only messages
    if (/^https?:\/\//.test(plainText) && plainText.split(' ').length < 10) return false;
    // Reject image-only messages
    if (/^\!\[Image\]/.test(text) && plainText.length < 150) return false;
    return true;
  });
  filteredWa.sort((a, b) => Math.min(b.quote.text.length, 300) - Math.min(a.quote.text.length, 300));

  const groupNames: Record<string, string> = {
    'whatsapp-builders-sp-claude-code': 'Builders SP',
    'whatsapp-clauders': 'Clauders',
    'whatsapp-ia-sob-controle': 'IA Sob Controle',
  };

  for (const { quote, signal } of filteredWa.slice(0, 20)) {
    const dateStr = new Date(signal.frontmatter.captured_at).toISOString().slice(0, 10);
    const slug = `${dateStr}-wa-${slugify(quote.speaker)}-${slugify(quote.text.slice(0, 40))}`;
    const context = groupNames[signal.frontmatter.source_name] ?? signal.frontmatter.source_name;

    const frontmatter = {
      quote: quote.text,
      speaker: quote.speaker,
      context,
      sourceType: 'whatsapp' as const,
      pubDate: signal.frontmatter.captured_at,
      tags: (signal.frontmatter.tags ?? []).slice(0, 5),
    };

    if (!dryRun) {
      writeContent(path.join(outDir, `${slug}.md`), frontmatter, '');
      waWritten++;
    }
  }

  console.log(`  ${dryRun ? 'Would write' : 'Wrote'} ${waWritten || Math.min(waQuotes.length, 20)} WhatsApp curtas`);
}

// --- Main: Sync Newsletters ---

function syncNewsletters() {
  console.log('\n📮 Syncing newsletters...');
  const nlDir = path.join(vaultPath, 'drafts', 'newsletter-hipsters-builders');
  if (!fs.existsSync(nlDir)) {
    console.log('  No newsletter drafts found');
    return;
  }

  const files = fs.readdirSync(nlDir).filter(f => f.endsWith('.md')).sort();
  console.log(`  Found ${files.length} newsletter editions`);

  const outDir = path.join(contentDir, 'newsletters');
  let written = 0;

  for (let i = 0; i < files.length; i++) {
    const raw = fs.readFileSync(path.join(nlDir, files[i]), 'utf-8');
    const { data, content } = matter(raw);

    const title = extractTitle(content, files[i].replace('.md', ''));
    const frontmatter = {
      title,
      subject: data.subject ?? title,
      editionNumber: i + 1,
      pubDate: data.created_at ?? new Date().toISOString(),
      status: data.status ?? 'generated',
    };

    const slug = files[i].replace('.md', '');
    if (!dryRun) {
      writeContent(path.join(outDir, `${slug}.md`), frontmatter, content);
      written++;
    }
  }

  console.log(`  ✅ ${dryRun ? 'Would write' : 'Wrote'} ${written || files.length} newsletters`);
}

// --- Run ---

console.log(`🔄 Syncing vault → content collections`);
console.log(`   Vault: ${vaultPath}`);
console.log(`   Since: ${sinceDate.toISOString().slice(0, 10)}`);
console.log(`   Output: ${contentDir}`);
if (dryRun) console.log('   ⚠️  DRY RUN — no files will be written');

syncEpisodes();
syncCurtas();
syncNewsletters();

syncMedia();

console.log('\n✅ Sync complete!');

// --- Sync Media ---

function syncMedia() {
  console.log('\n🖼️  Syncing media...');
  const mediaSource = path.join(vaultPath, 'signals', 'internal', 'whatsapp', 'media');
  const mediaDest = path.join(projectRoot, 'public', 'media', 'whatsapp');

  if (!fs.existsSync(mediaSource)) {
    console.log('  No WhatsApp media directory found');
    return;
  }

  // Scan curtas for image references
  const curtasDir = path.join(contentDir, 'curtas');
  if (!fs.existsSync(curtasDir)) return;

  const referencedImages = new Set<string>();
  for (const file of fs.readdirSync(curtasDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(curtasDir, file), 'utf-8');
    const matches = content.matchAll(/!\[Image\]\(media\/([^)]+)\)/g);
    for (const m of matches) {
      referencedImages.add(m[1]);
    }
  }

  if (referencedImages.size === 0) {
    console.log('  No image references found in curtas');
    return;
  }

  if (!dryRun) {
    fs.mkdirSync(mediaDest, { recursive: true });
  }

  let copied = 0;
  for (const img of referencedImages) {
    const src = path.join(mediaSource, img);
    const dest = path.join(mediaDest, img);
    if (fs.existsSync(src)) {
      if (!dryRun) {
        fs.copyFileSync(src, dest);
      }
      copied++;
    } else {
      console.log(`  ⚠️  Missing: ${img}`);
    }
  }

  console.log(`  ✅ ${dryRun ? 'Would copy' : 'Copied'} ${copied} images`);
}
