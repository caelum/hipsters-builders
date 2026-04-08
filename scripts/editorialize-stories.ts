#!/usr/bin/env tsx
/**
 * editorialize-stories.ts — Transform raw chat into editorial content
 *
 * Reads stories.json, sends each story to Sonnet for editorial treatment:
 * - Short journalistic title (~60 chars)
 * - Subtitle/lede (1-2 sentences of context)
 * - Editorial body: indirect speech + direct quotes, formatted with paragraphs and bold
 * - Splits mixed threads into separate stories
 *
 * Usage:
 *   npx tsx scripts/editorialize-stories.ts [--dry-run] [--limit N] [--force]
 *
 * The script writes editorial fields back to stories.json.
 * Stories that already have editorial content are skipped (unless --force).
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

// Load .env from this project or from ~/pkm (shared Anthropic key)
loadDotenv({ path: resolve(import.meta.dirname, "..", ".env") });
loadDotenv({ path: resolve(import.meta.dirname, "..", "..", "pkm", ".env") });

const args = process.argv.slice(2);
const hasFlag = (name: string) => args.includes(`--${name}`);
const getArg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

const dryRun = hasFlag("dry-run");
const force = hasFlag("force");
const limit = parseInt(getArg("limit") || "0", 10);
const projectRoot = resolve(import.meta.dirname, "..");
const storiesPath = resolve(projectRoot, "src", "data", "stories.json");

if (hasFlag("help")) {
  console.log("Usage: npx tsx scripts/editorialize-stories.ts [--dry-run] [--limit N] [--force]");
  process.exit(0);
}

const anthropic = new Anthropic();

interface ConversationMsg {
  author: string;
  text: string;
  time?: string;
}

interface Story {
  id: string;
  title: string;
  date: string;
  authors: string[];
  tags: string[];
  sources: string[];
  links: any[];
  sourceGroups: string[];
  conversation: ConversationMsg[];
  messageCount: number;
  authorCount: number;
  linkCount: number;
  weight: number;
  editorial?: {
    title: string;
    subtitle: string;
    body: string; // HTML with paragraphs, bold, quotes
  };
}

const SYSTEM_PROMPT = `Você é editor do Hipsters Builders, um portal de notícias e discussões sobre tecnologia, IA e startups no Brasil. Seu trabalho é transformar conversas de WhatsApp/Telegram em conteúdo editorial legível.

REGRAS ABSOLUTAS:
- NUNCA invente informações, opiniões, dados ou citações que não estejam na conversa original
- Use APENAS as palavras das pessoas que participaram
- Citações diretas entre aspas devem ser literais (pode corrigir capitalização e pontuação)
- Discurso indireto deve preservar o significado exato
- Se algo não está claro na conversa, omita — não preencha lacunas
- Remova horários internos, "hahaha", "kkk", reações vazias
- Corrija capitalização e pontuação básica, mas preserve o tom informal
- Não use linguagem de IA: sem "crucial", "pivotal", "é importante notar", em dashes excessivos

FORMATO DE SAÍDA (JSON):
{
  "title": "Título curto jornalístico (~60 chars, sem ponto final)",
  "subtitle": "1-2 frases de contexto sobre o que foi debatido.",
  "body": "HTML com <p>, <strong>, citações entre aspas. Discurso indireto livre misturado com citações diretas."
}

EXEMPLO DE BODY BOM:
<p>Mauricio Aniche trouxe o assunto depois de descobrir quanto a empresa paga de Clickup. <strong>"Perguntei pra Jessica quanto pagamos só de curiosidade"</strong>, contou.</p>
<p>Paulo reagiu pensando na pressão de performance: "com IA o paradigma muda, porque agora cada um entrega muito mais". A conversa evoluiu para como medir produtividade nesse novo contexto.</p>

EXEMPLO DE BODY RUIM:
<p>Os participantes discutiram sobre custos de ferramentas SaaS e como a IA está transformando a produtividade dos times de engenharia.</p>
(Isso é um resumo genérico — queremos as vozes das pessoas.)

SE A CONVERSA MISTURA 2+ ASSUNTOS DIFERENTES:
Retorne um array com múltiplos objetos, cada um sendo uma story separada. Isso é raro — só faça se os assuntos são realmente desconectados.`;

async function editorialize(story: Story): Promise<Story["editorial"] | Story["editorial"][]> {
  const conversationText = story.conversation
    .map(m => `[${m.author}${m.time ? " " + m.time : ""}] ${m.text}`)
    .join("\n\n");

  const linkContext = story.links
    .filter(l => l.title)
    .map((l: any) => `Link: ${l.title} (${l.site || new URL(l.url).hostname})`)
    .join("\n");

  const userPrompt = `Transforme esta conversa em conteúdo editorial.

FONTE: ${story.sourceGroups.join(", ")}
DATA: ${story.date.slice(0, 10)}
TÓPICO ORIGINAL: ${story.title}
AUTORES: ${story.authors.join(", ")}
${linkContext ? "\nLINKS COMPARTILHADOS:\n" + linkContext : ""}

CONVERSA:
${conversationText}

Retorne APENAS o JSON (sem markdown code blocks).`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text.trim();

  // Parse JSON (might be object or array)
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    // Try extracting JSON from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      return JSON.parse(match[1].trim());
    }
    // Try finding JSON object/array
    const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`Could not parse editorial response: ${text.slice(0, 200)}`);
  }
}

async function main() {
  const stories: Story[] = JSON.parse(await readFile(storiesPath, "utf-8"));
  console.log(`[editorial] Loaded ${stories.length} stories`);

  const toProcess = stories.filter(s => force || !s.editorial);
  const batch = limit > 0 ? toProcess.slice(0, limit) : toProcess;
  console.log(`[editorial] Processing ${batch.length} stories (${stories.length - toProcess.length} already done)`);

  let processed = 0;
  let splits = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const story of batch) {
    const charCount = story.conversation.reduce((s, m) => s + m.text.length, 0);
    process.stdout.write(`  ${story.id.slice(0, 50).padEnd(50)} ${charCount}ch ${story.messageCount}msg... `);

    try {
      const result = await editorialize(story);

      if (Array.isArray(result)) {
        // Story was split — use first one for this story, log the rest
        story.editorial = result[0];
        splits += result.length - 1;
        console.log(`split into ${result.length} (keeping first)`);
      } else {
        story.editorial = result;
        console.log(`"${result.title.slice(0, 40)}"`);
      }
      processed++;
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message.slice(0, 80)}`);
    }

    // Rate limit: small delay between requests
    if (processed < batch.length) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n[editorial] Done: ${processed} processed, ${splits} splits`);

  if (!dryRun) {
    await writeFile(storiesPath, JSON.stringify(stories, null, 2));
    console.log(`[editorial] Wrote updated stories.json`);
  } else {
    console.log(`[editorial] Dry run — not writing`);
    for (const s of batch.slice(0, 3)) {
      if (s.editorial) {
        console.log(`\n--- ${s.editorial.title} ---`);
        console.log(s.editorial.subtitle);
        console.log(s.editorial.body.slice(0, 200) + "...");
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
