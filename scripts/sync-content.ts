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
  const quotes: Quote[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const text = match[3].trim();
    // Skip very short messages (greetings, etc.)
    if (text.length < 80) continue;
    quotes.push({
      text: text.slice(0, 500), // cap at 500 chars
      speaker: match[1].trim(),
      timestamp: match[2],
    });
  }
  // Pick diverse speakers, prefer longer quotes
  const bySpeaker = new Map<string, Quote[]>();
  for (const q of quotes) {
    const arr = bySpeaker.get(q.speaker) ?? [];
    arr.push(q);
    bySpeaker.set(q.speaker, arr);
  }
  const selected: Quote[] = [];
  // Round-robin by speaker, picking longest first
  for (const [, arr] of bySpeaker) {
    arr.sort((a, b) => b.text.length - a.text.length);
  }
  let round = 0;
  while (selected.length < maxQuotes) {
    let added = false;
    for (const [, arr] of bySpeaker) {
      if (round < arr.length && selected.length < maxQuotes) {
        selected.push(arr[round]);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return selected;
}

function extractBestQuote(body: string): Quote | null {
  const quotes = extractQuotes(body, 20);
  if (quotes.length === 0) return null;
  // Pick the quote with the best "insight density" (longer but not too long)
  return quotes.sort((a, b) => {
    const scoreA = Math.min(a.text.length, 300);
    const scoreB = Math.min(b.text.length, 300);
    return scoreB - scoreA;
  })[0];
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

  waQuotes.sort((a, b) => Math.min(b.quote.text.length, 300) - Math.min(a.quote.text.length, 300));

  const groupNames: Record<string, string> = {
    'whatsapp-builders-sp-claude-code': 'Builders SP',
    'whatsapp-clauders': 'Clauders',
    'whatsapp-ia-sob-controle': 'IA Sob Controle',
  };

  for (const { quote, signal } of waQuotes.slice(0, 20)) {
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

console.log('\n✅ Sync complete!');
