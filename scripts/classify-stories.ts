#!/usr/bin/env tsx
/**
 * classify-stories.ts — Sensitivity classification for public visibility
 *
 * Reads stories.json, classifies each story as public or private using Haiku.
 * Flags: internal company data, employee criticism, offensive language,
 * political content, private/irrelevant conversations.
 *
 * Usage:
 *   npx tsx scripts/classify-stories.ts [--dry-run] [--limit N] [--force]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

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
const storiesPath = resolve(import.meta.dirname, "..", "src", "data", "stories.json");

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `Você é moderador de conteúdo do Hipsters Builders, um portal PÚBLICO de tecnologia para desenvolvedores. Classifique se uma conversa é apropriada para publicação.

O público-alvo são devs que constroem software, interessados em IA, ferramentas, carreira tech.

MARQUE COMO NÃO PÚBLICO (public: false) se contiver:
- Dados internos de empresa: preços específicos pagos, salários, métricas internas, estratégia não pública
- Crítica nominal a funcionários/colegas (julgamentos pessoais, não técnicos)
- Linguagem ofensiva ou sarcasmo excessivo (palavrões, "burrice", ataques pessoais)
- Conteúdo político-partidário sem relação direta com tech
- Conversas pessoais/privadas irrelevantes para audiência tech (saúde, família, logística pessoal)
- Menção a ferramentas/links de acesso interno da empresa (support.anthropic.com, dashboards internos)
- Assuntos sobre expulsão de membros, conflitos internos de comunidade

MARQUE COMO PÚBLICO (public: true) se for:
- Discussão técnica sobre ferramentas, modelos de IA, linguagens, frameworks
- Análise de produtos, benchmarks, comparações
- Compartilhamento de links/notícias com comentários técnicos
- Debate sobre carreira, mercado, tendências
- Opinião sobre indústria tech (mesmo opinada, desde que sem dados internos)

Na dúvida, marque como NÃO PÚBLICO. Melhor errar pra lado da privacidade.

Responda APENAS com JSON: {"public": true, "reason": "motivo em poucas palavras"} ou {"public": false, "reason": "motivo"}`;

interface Story {
  id: string;
  title: string;
  conversation: Array<{ author: string; text: string }>;
  public?: boolean;
  sensitivityReason?: string;
  [key: string]: any;
}

async function classifySensitivity(story: Story): Promise<{ public: boolean; reason: string }> {
  const conversationText = story.conversation
    .slice(0, 20) // cap at 20 messages
    .map(m => `[${m.author}] ${m.text.slice(0, 200)}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Classifique esta conversa:\n\nTÍTULO: ${story.title}\n\nCONVERSA:\n${conversationText}`,
    }],
  });

  const text = (response.content[0] as { type: string; text: string }).text.trim();
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return { public: true, reason: "parse error — defaulting to public" };
}

async function main() {
  const stories: Story[] = JSON.parse(await readFile(storiesPath, "utf-8"));
  const toProcess = stories.filter(s => force || s.public === undefined);
  const batch = limit > 0 ? toProcess.slice(0, limit) : toProcess;

  console.log(`[classify] ${stories.length} stories, ${batch.length} to classify (${stories.length - toProcess.length} already done)`);

  let publicCount = 0;
  let privateCount = 0;

  // Process in batches of 10 for speed
  for (let i = 0; i < batch.length; i += 10) {
    const chunk = batch.slice(i, i + 10);
    const results = await Promise.all(chunk.map(async (story) => {
      try {
        return { story, result: await classifySensitivity(story) };
      } catch (err) {
        return { story, result: { public: true, reason: `error: ${(err as Error).message.slice(0, 50)}` } };
      }
    }));

    for (const { story, result } of results) {
      story.public = result.public;
      story.sensitivityReason = result.reason;
      if (result.public) publicCount++;
      else privateCount++;
      const icon = result.public ? "  " : "XX";
      console.log(`  ${icon} ${(story.editorial?.title || story.title).slice(0, 50).padEnd(50)} ${result.reason}`);
    }
    console.log(`  [${Math.min(i + 10, batch.length)}/${batch.length}]`);
  }

  console.log(`\n[classify] Public: ${publicCount}, Private: ${privateCount}`);

  if (!dryRun) {
    await writeFile(storiesPath, JSON.stringify(stories, null, 2));
    console.log(`[classify] Wrote updated stories.json`);
  } else {
    console.log(`[classify] (dry run — no files written)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
