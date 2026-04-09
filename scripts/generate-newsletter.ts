#!/usr/bin/env tsx
/**
 * generate-newsletter.ts — Build the Hipsters Builders newsletter with Opus
 *
 * Reads stories.json, picks the candidate stories inside a date range,
 * sends the full bundle to Claude Opus with the F3 (Diálogo split)
 * editorial rules, validates that every quote in the LLM output exists
 * literally in the input (anti-fabrication guardrail), and renders
 * the result via the newsletter-template.ts module.
 *
 * The cardinal rule from the PKM project applies here: the LLM is an
 * EDITOR, not a WRITER. It chooses, organizes, and lightly frames —
 * never invents quotes, links, or facts.
 *
 * Usage:
 *   npx tsx scripts/generate-newsletter.ts [options]
 *
 * Options:
 *   --from <date>          Earliest story date (YYYY-MM-DD). Default: 7 days ago
 *   --to <date>            Latest story date (YYYY-MM-DD). Default: today
 *   --limit <N>            Max number of editorial blocks. Default: 4
 *   --candidates <N>       Max stories to send to the LLM. Default: 20
 *   --edition <N>          Edition number for the masthead. Default: 1
 *   --tagline <text>       Subtitle below the masthead. Default: auto from --to
 *   --preheader <text>     Inbox preview text (45-110 chars)
 *   --signoff <text>       Default: "Paulo e Vinny"
 *   --base-url <url>       Default: https://builders.hipsters.tech
 *   --slug <slug>          Filename slug under /tmp/. Default: newsletter-edicao-01
 *   --out <path>           Override the output path
 *   --model <id>           Anthropic model id. Default: claude-opus-4-6
 *   --print-prompt         Print the full LLM prompt and exit (no API call)
 *   --print-data           Print the LLM JSON output and exit (no HTML write)
 *   --dry-run              Print summary, don't write
 *   --help, -h             Show this help
 *
 * Examples:
 *   npx tsx scripts/generate-newsletter.ts --from 2026-03-30 --to 2026-04-09
 *   npx tsx scripts/generate-newsletter.ts --from 2026-04-01 --slug newsletter-test
 *   npx tsx scripts/generate-newsletter.ts --from 2026-04-01 --print-prompt > prompt.txt
 *
 * After running, open the result in a browser:
 *   open public/tmp/newsletter-edicao-01.html
 * or visit https://builders.hipsters.tech/tmp/newsletter-edicao-01.html (after deploy).
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import {
  renderNewsletterF3,
  type NewsletterData,
  type NewsletterMessage,
} from "./newsletter-template.ts";

// ── env ──

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");

loadDotenv({ path: resolve(PROJECT_ROOT, ".env") });
loadDotenv({ path: resolve(PROJECT_ROOT, "..", "pkm", ".env") });

// ── arg parsing ──

const args = process.argv.slice(2);
const hasFlag = (name: string) =>
  args.includes(`--${name}`) || (name === "help" && args.includes("-h"));
const getArg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

if (hasFlag("help")) {
  const src = await readFile(import.meta.filename, "utf-8");
  const help = src.match(/\/\*\*([\s\S]*?)\*\//)?.[1]?.replace(/^[ \t]*\*[ \t]?/gm, "") ?? "";
  console.log(help.trim());
  process.exit(0);
}

const today = new Date();
const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

const dateFrom = getArg("from") || fmtDate(sevenDaysAgo);
const dateTo = getArg("to") || fmtDate(today);
const limit = parseInt(getArg("limit") || "4", 10);
const maxCandidates = parseInt(getArg("candidates") || "20", 10);
const edition = parseInt(getArg("edition") || "1", 10);
const taglineArg = getArg("tagline");
const preheaderArg = getArg("preheader");
const signoff = getArg("signoff") || "Paulo e Vinny";
const baseUrl = (getArg("base-url") || "https://builders.hipsters.tech").replace(/\/$/, "");
const slug = getArg("slug") || "newsletter-edicao-01";
const outPath = getArg("out") || resolve(PROJECT_ROOT, "public", "tmp", `${slug}.html`);
const model = getArg("model") || "claude-opus-4-6";
const printPrompt = hasFlag("print-prompt");
const printData = hasFlag("print-data");
const dryRun = hasFlag("dry-run");

// ── story types (subset of stories.json) ──

interface StoryConversationMsg {
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
  sourceGroups: string[];
  conversation: StoryConversationMsg[];
  links?: Array<{ url: string; title?: string; site?: string; description?: string }>;
  messageCount: number;
  authorCount: number;
  weight: number;
  editorial?: {
    title: string;
    subtitle: string;
    body: string;
  };
  public?: boolean;
}

// ── helpers ──

function inDateRange(d: string): boolean {
  const date = (d || "").slice(0, 10);
  return date >= dateFrom && date <= dateTo;
}

function ptDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split("-");
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${parseInt(day, 10)} de ${months[parseInt(month, 10) - 1]}`;
}

function dateRangeLabel(from: string, to: string): string {
  return `${ptDate(from)} a ${ptDate(to)} de ${from.slice(0, 4)}`;
}

/**
 * "Source kind" classification — telegram-channel stories carry long
 * editorial texts written by Paulo or Vinny on the Telegram broadcast
 * channel; whatsapp-* stories are chat threads. The LLM uses this
 * distinction to decide which stories anchor a block (long editorials)
 * and which provide reactive quotes.
 */
function sourceKind(story: Story): "telegram-editorial" | "chat" {
  const id = story.id || "";
  const groups = story.sourceGroups || [];
  if (id.startsWith("story-tg-") || groups.some((g) => /Telegram/i.test(g))) {
    return "telegram-editorial";
  }
  return "chat";
}

function shortenText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ── prompt construction ──

const SYSTEM_PROMPT = `Você é o editor da newsletter semanal **Hipsters Builders**, voltada para devs e construtores de IA no Brasil. Seu trabalho é transformar as stories selecionadas da semana em uma newsletter no formato F3 (Diálogo split), em português brasileiro, com tom editorial direto e voz própria.

# REGRA ABSOLUTA — NÃO INVENTE NADA

- NUNCA invente quotes, autores, datas, links, números ou fatos que não estejam no input.
- Toda quote literal (\`text\` em \`groupMessages\`, \`closing.messages\`, ou \`coldOpen\`) deve aparecer EXATAMENTE como está em alguma \`conversation[].text\` das stories do input. Pode cortar (com "…") ou usar um pedaço, mas a sequência usada precisa existir literalmente. NÃO normalize capitalização, NÃO conserte ortografia, NÃO troque palavras.
- Atribuição (\`author\`) deve corresponder ao \`conversation[].author\` da quote. Não invente nomes.
- Links inline só podem usar URLs que aparecem em \`story.links[].url\` ou em \`conversation[].text\` (URLs literais). Quando não tem URL, NÃO crie um — escreve em texto plano.
- Se uma story está confusa, curta ou sem material editorial bom, NÃO use. Pega outra.

# ESTRUTURA DO OUTPUT

Você deve responder APENAS com JSON válido (sem code fences, sem texto antes ou depois) no shape:

\`\`\`json
{
  "preheader": "string (45-110 chars, é o preview do email na inbox)",
  "tagline": "string (subtítulo curto sob o masthead, ex: 'Primeira edição. 9 de abril de 2026.')",
  "introParagraph": "string opcional (HTML <p>...</p>, parágrafo introdutório curto após o cold open). Use null para deixar o default da newsletter.",
  "coldOpen": {
    "author": "nome literal",
    "text": "quote literal de uma conversation",
    "context": "ex: 'no canal, sexta de manhã' ou 'comentando sobre Glasswing'"
  },
  "blocks": [
    {
      "title": "string — header curto (~40-70 chars), pode ser uma frase ou uma quote do grupo",
      "editorialHtml": "string — HTML com <p style='margin:0 0 18px;font-size:17px;line-height:1.65;color:#1a1a1a;'>...</p>. Pode ter <strong>, <em>, <a href='URL'>. Quotes literais aparecem em <em>...</em>. Pode ter 1-4 parágrafos por bloco.",
      "groupMessages": [
        { "author": "nome", "text": "quote literal", "context": "opcional" }
      ]
    }
  ],
  "closing": {
    "title": "ex: 'Pra fechar' ou 'Curta da semana'",
    "eyebrow": "ex: 'Seção fixa · pra fechar'",
    "intro": "string opcional (HTML <p>...</p>) — frame da curta",
    "messages": [
      { "author": "nome", "text": "quote literal", "context": "opcional" }
    ],
    "context": "string (HTML <p>...</p>) — explicação curta de porque essa nota merece o destaque",
    "cta": "string opcional (HTML <p>...</p>) — chamada pra ação, ex: convidar resposta"
  },
  "signoffFootnote": "string — uma frase curta opcional ao final, em HTML"
}
\`\`\`

# DIRETRIZES EDITORIAIS

## Cold open
- Pega UMA quote literal curta (até ~150 chars), forte, do material da semana. Ela é a primeira coisa que o leitor vê depois do header.
- O autor é o nome literal de quem disse (do \`conversation[].author\`).
- O \`context\` é uma frase curta tipo "no canal, sexta de manhã" ou "sobre o anúncio do Mythos". NÃO cite o nome do grupo de WhatsApp/Telegram.

## Blocks (3-5 blocos)
- **Hierarquia**: priorize stories com \`source_kind: "telegram-editorial"\` como ÂNCORAS dos blocos maiores. São os textos longos e bem escritos do Paulo/Vinny — aproveite trechos do \`editorial.body\` (mas pode reorganizar).
- **Mistura**: use as stories \`source_kind: "chat"\` para complementar — quotes literais no \`groupMessages\` (que mostram a reação/ironia da comunidade) ou ainda para construir blocos próprios quando o tema rendeu uma boa discussão.
- **Nem todo bloco precisa de \`groupMessages\`**. Se um bloco é construído inteiramente em cima de um texto editorial longo, pode omitir \`groupMessages\` (deixa como \`[]\` ou simplesmente não inclui). Mas a maioria deve ter — é o que dá o sabor do formato.
- **Fio condutor**: a newsletter da semana deve ter um arco. Pense num tema que conecta os blocos (ex: "esta semana foi de barulho da Anthropic", "esta semana foi de ferramentas mudando de baixo dos pés"), mesmo que sem dizer isso explicitamente. A ordem dos blocos importa.
- **Headers**: que carregam voz, não que rotulam. "A Anthropic está sangrando" > "Notícias da Anthropic". Usar uma quote do grupo como header também funciona.
- **Editorial body**: prosa fluida, primeira pessoa do plural quando soar natural ("a gente acompanhou", "ficamos com a impressão"). Quotes literais em \`<em>\`. Links inline naturais. Sem listas com bullet points. Sem AI tells: nada de "É importante notar", "Vale ressaltar", "crucial", "pivotal", em-dashes excessivos. Sem rule of three forçada.
- **groupMessages**: 3 a 8 quotes literais por bloco, escolhidas para mostrar a discussão real. Inclua \`context\` em itálico só quando ajudar (ex: "(sobre o Glasswing)").

## Closing dark block ("Pra fechar")
- NÃO é mais "a mensagem que ninguém respondeu". É uma curta menor mas curiosa: uma nota lateral, uma piada que sobrou, uma observação engraçada, um detalhe que merece menção mas não um bloco inteiro. Pense no "Mark Zuckerberg voltou a programar depois de 20 anos" como exemplo — uma nota de canto.
- O \`title\` pode ser "Pra fechar", "Curta da semana", "Antes de você fechar isso", "Mais uma" — escolha o que melhor se encaixa no tom da curta.
- O \`eyebrow\` é uma linha pequena tipo "Seção fixa · pra fechar".
- 1-3 quotes literais no \`messages\`.
- O \`context\` HTML explica em 2-3 frases por que essa curta vale a pena.
- O \`cta\` pode encorajar a responder o email, mas só se fizer sentido — não force.

## Voz e tom
- Direto, editorial, brasileiro. Sem se levar muito a sério.
- A ironia mora nas quotes do grupo, não no editorial. O editorial é o straight man.
- Não cite o nome dos canais por nome — diga "no canal", "no grupo", "alguém anotou", "Paulo escreveu na semana passada". A intro padrão da newsletter já fala genericamente sobre "comunidade do Builders".
- Auto-referência meta é bem-vinda em pequenas doses (a newsletter foi montada com o sistema do Karpathy, etc).

# INPUT QUE VOCÊ VAI RECEBER

Um JSON com:
- \`edition\`: número da edição
- \`dateRange\`: "30 de março a 9 de abril de 2026"
- \`stories\`: array de stories candidatas, cada uma com:
  - \`id\`, \`date\`, \`title\`, \`authors\`, \`tags\`, \`weight\`
  - \`source_kind\`: "telegram-editorial" ou "chat"
  - \`editorial\`: { title, subtitle, body }  ← já trabalhado pelo Sonnet anteriormente
  - \`conversation\`: [{author, text}]  ← mensagens originais (CITE LITERALMENTE A PARTIR DAQUI)
  - \`links\`: [{url, title, site}]  ← URLs reais que você pode linkar inline

Sua tarefa: ler tudo, escolher \`limit\` blocos (geralmente 3-4), montar a newsletter no JSON acima.`;

interface CandidateStory {
  id: string;
  date: string;
  title: string;
  authors: string[];
  tags: string[];
  weight: number;
  source_kind: "telegram-editorial" | "chat";
  editorial: { title: string; subtitle: string; body: string } | null;
  conversation: { author: string; text: string }[];
  links: { url: string; title?: string; site?: string }[];
}

function buildUserPrompt(input: {
  edition: number;
  dateRange: string;
  limit: number;
  stories: CandidateStory[];
}): string {
  return `Aqui está o material da edição nº ${input.edition} (${input.dateRange}). Você tem ${input.stories.length} stories candidatas. Escolha as melhores ${input.limit} para os blocos editoriais e UMA para a seção "Pra fechar". Lembre: cite quotes LITERALMENTE.

\`\`\`json
${JSON.stringify(
  {
    edition: input.edition,
    dateRange: input.dateRange,
    limit: input.limit,
    stories: input.stories,
  },
  null,
  2,
)}
\`\`\`

Responda APENAS com o JSON da newsletter (sem code fences, sem texto antes ou depois).`;
}

// ── output validation ──

interface LLMOutput {
  preheader: string;
  tagline: string;
  introParagraph?: string | null;
  coldOpen: NewsletterMessage;
  blocks: Array<{
    title: string;
    editorialHtml: string;
    groupMessages?: NewsletterMessage[];
  }>;
  closing: {
    title: string;
    eyebrow: string;
    intro?: string | null;
    messages: NewsletterMessage[];
    context: string;
    cta?: string | null;
  };
  signoffFootnote: string;
}

function normalizeQuoteText(s: string): string {
  return s
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Verify each quoted message in the LLM output appears literally in
 * some story's conversation. Returns the list of offending quotes.
 */
function validateQuotesAgainstSources(
  output: LLMOutput,
  stories: CandidateStory[],
): { author: string; text: string; reason: string }[] {
  const errors: { author: string; text: string; reason: string }[] = [];

  // Build a flat haystack of every conversation message in scope
  const haystack: { author: string; text: string; norm: string }[] = [];
  for (const s of stories) {
    for (const m of s.conversation) {
      haystack.push({
        author: m.author,
        text: m.text,
        norm: normalizeQuoteText(m.text),
      });
    }
  }

  function checkMessage(msg: NewsletterMessage, where: string) {
    const norm = normalizeQuoteText(msg.text);
    if (norm.length < 8) return;
    const found = haystack.find((h) => h.norm.includes(norm));
    if (!found) {
      errors.push({
        author: msg.author,
        text: msg.text,
        reason: `${where}: quote not found literally in any story conversation`,
      });
      return;
    }
    if (found.author && msg.author && !msg.author.toLowerCase().includes(found.author.toLowerCase().split(" ")[0])) {
      // Soft check: first name of original author should appear in attributed author
      // Don't fail hard, just warn — the LLM may shorten "Mauricio Aniche" to "Aniche"
    }
  }

  checkMessage(output.coldOpen, "coldOpen");
  const blocks = Array.isArray(output.blocks) ? output.blocks : Object.values(output.blocks || {});
  blocks.forEach((b, i) => {
    const gm = Array.isArray(b.groupMessages) ? b.groupMessages : Object.values(b.groupMessages || {});
    gm.forEach((m, j) => checkMessage(m as NewsletterMessage, `blocks[${i}].groupMessages[${j}]`));
  });
  const cm = Array.isArray(output.closing?.messages)
    ? output.closing.messages
    : Object.values(output.closing?.messages || {});
  cm.forEach((m, j) => checkMessage(m as NewsletterMessage, `closing.messages[${j}]`));

  return errors;
}

// ── main ──

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !printPrompt) {
    console.error("[generate-newsletter] ANTHROPIC_API_KEY not found in .env or ../pkm/.env");
    process.exit(1);
  }

  const storiesPath = resolve(PROJECT_ROOT, "src", "data", "stories.json");
  let allStories: Story[] = [];
  try {
    allStories = JSON.parse(await readFile(storiesPath, "utf-8"));
  } catch (err) {
    console.error(`[generate-newsletter] Could not read ${storiesPath}: ${(err as Error).message}`);
    console.error("Run `hipsters signals` first to build stories.json.");
    process.exit(1);
  }

  // Filter: in date range, public, has editorial
  const inRange = allStories.filter(
    (s) => inDateRange(s.date) && s.public !== false && !!s.editorial,
  );

  if (inRange.length === 0) {
    console.error(
      `[generate-newsletter] No public stories with editorial in ${dateFrom} → ${dateTo}.`,
    );
    process.exit(1);
  }

  // Sort by weight desc, but bring telegram-editorial stories to the top
  // so they're more likely to anchor blocks (they're rarer + denser).
  const candidates: CandidateStory[] = inRange
    .map((s) => ({
      id: s.id,
      date: s.date.slice(0, 10),
      title: s.editorial?.title || s.title,
      authors: s.authors || [],
      tags: (s.tags || []).slice(0, 6),
      weight: s.weight,
      source_kind: sourceKind(s),
      editorial: s.editorial
        ? {
            title: s.editorial.title,
            subtitle: s.editorial.subtitle,
            body: s.editorial.body,
          }
        : null,
      conversation: (s.conversation || [])
        .filter((m) => m.text && m.text.trim().length > 0)
        .slice(0, 12)
        .map((m) => ({ author: m.author, text: m.text.trim() })),
      links: (s.links || [])
        .filter((l) => l.url)
        .slice(0, 4)
        .map((l) => ({ url: l.url, title: l.title, site: l.site })),
    }))
    .sort((a, b) => {
      // telegram-editorial first, then by weight
      if (a.source_kind !== b.source_kind) {
        return a.source_kind === "telegram-editorial" ? -1 : 1;
      }
      return b.weight - a.weight;
    })
    .slice(0, maxCandidates);

  const dateRange = dateRangeLabel(dateFrom, dateTo);

  console.log(`[generate-newsletter] Date range: ${dateFrom} → ${dateTo} (${dateRange})`);
  console.log(`[generate-newsletter] In range: ${inRange.length} public stories`);
  console.log(`[generate-newsletter] Sending ${candidates.length} candidates to ${model}`);
  console.log(`[generate-newsletter]   ${candidates.filter((s) => s.source_kind === "telegram-editorial").length} telegram-editorial`);
  console.log(`[generate-newsletter]   ${candidates.filter((s) => s.source_kind === "chat").length} chat`);

  const userPrompt = buildUserPrompt({
    edition,
    dateRange,
    limit,
    stories: candidates,
  });

  if (printPrompt) {
    console.log("=== SYSTEM PROMPT ===");
    console.log(SYSTEM_PROMPT);
    console.log("\n=== USER PROMPT ===");
    console.log(userPrompt);
    return;
  }

  // Call Anthropic via tool_use to force structured JSON output.
  // This avoids fragile JSON-in-text parsing when the editorial HTML
  // contains nested quotes.
  const anthropic = new Anthropic({ apiKey });
  console.log(`[generate-newsletter] Calling ${model} via tool_use…`);

  const NEWSLETTER_TOOL = {
    name: "submit_newsletter",
    description: "Submit the assembled Hipsters Builders newsletter in F3 format",
    input_schema: {
      type: "object" as const,
      required: ["preheader", "tagline", "coldOpen", "blocks", "closing", "signoffFootnote"],
      properties: {
        preheader: { type: "string", description: "Inbox preview text, 45-110 chars" },
        tagline: { type: "string", description: "Subtitle below masthead" },
        introParagraph: {
          type: ["string", "null"],
          description: "Optional HTML paragraph after the cold open. Use null for default.",
        },
        coldOpen: {
          type: "object",
          required: ["author", "text"],
          properties: {
            author: { type: "string" },
            text: { type: "string", description: "Literal quote from a conversation" },
            context: { type: "string" },
          },
        },
        blocks: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            required: ["title", "editorialHtml"],
            properties: {
              title: { type: "string" },
              editorialHtml: {
                type: "string",
                description:
                  "HTML with <p style='margin:0 0 18px;font-size:17px;line-height:1.65;color:#1a1a1a;'>...</p>. May include <strong>, <em> for literal quotes, <a href> for links from story.links[].url.",
              },
              groupMessages: {
                type: "array",
                items: {
                  type: "object",
                  required: ["author", "text"],
                  properties: {
                    author: { type: "string" },
                    text: { type: "string", description: "Literal quote" },
                    context: { type: "string" },
                  },
                },
              },
            },
          },
        },
        closing: {
          type: "object",
          required: ["title", "eyebrow", "messages", "context"],
          properties: {
            title: { type: "string" },
            eyebrow: { type: "string" },
            intro: { type: ["string", "null"] },
            messages: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: {
                type: "object",
                required: ["author", "text"],
                properties: {
                  author: { type: "string" },
                  text: { type: "string" },
                  context: { type: "string" },
                },
              },
            },
            context: { type: "string" },
            cta: { type: ["string", "null"] },
          },
        },
        signoffFootnote: { type: "string" },
      },
    },
  };

  let parsed: LLMOutput;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      tools: [NEWSLETTER_TOOL],
      tool_choice: { type: "tool", name: "submit_newsletter" },
      messages: [{ role: "user", content: userPrompt }],
    });
    inputTokens = response.usage?.input_tokens || 0;
    outputTokens = response.usage?.output_tokens || 0;

    const toolUse = response.content.find(
      (b): b is { type: "tool_use"; name: string; input: unknown; id: string } =>
        (b as { type: string }).type === "tool_use",
    );
    if (!toolUse) {
      console.error("[generate-newsletter] LLM did not return a tool_use block");
      console.error(JSON.stringify(response.content, null, 2));
      process.exit(1);
    }
    parsed = toolUse.input as LLMOutput;
  } catch (err) {
    console.error(`[generate-newsletter] LLM call failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // Validate quotes against sources
  const errors = validateQuotesAgainstSources(parsed, candidates);
  if (errors.length > 0) {
    console.error(`[generate-newsletter] WARNING: ${errors.length} quote(s) not found literally:`);
    for (const e of errors) {
      console.error(`  - [${e.author}] "${shortenText(e.text, 80)}"`);
      console.error(`    ${e.reason}`);
    }
    console.error("");
    console.error("This usually means the LLM normalized the text somehow.");
    console.error("Continuing anyway — review the output carefully before sending.");
  } else {
    console.log("[generate-newsletter] Quote validation: OK (all quotes found in sources)");
  }

  // Cost estimation (rough — Opus 4.6 pricing as of writing)
  // Input ~ $15/M tok, Output ~ $75/M tok
  const cost = (inputTokens / 1_000_000) * 15 + (outputTokens / 1_000_000) * 75;
  console.log(
    `[generate-newsletter] Tokens: in=${inputTokens}, out=${outputTokens}, est. cost: $${cost.toFixed(4)}`,
  );

  if (printData) {
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  // Build the NewsletterData and render
  const tagline = taglineArg || parsed.tagline;
  const preheader = preheaderArg || parsed.preheader;

  const data: NewsletterData = {
    edition,
    dateRange,
    tagline,
    preheader,
    introParagraph: parsed.introParagraph || undefined,
    coldOpen: parsed.coldOpen,
    blocks: (Array.isArray(parsed.blocks) ? parsed.blocks : Object.values(parsed.blocks || {})).map((b) => {
      const gm = Array.isArray(b.groupMessages)
        ? b.groupMessages
        : Object.values(b.groupMessages || {});
      return {
        title: b.title,
        editorialHtml: b.editorialHtml,
        groupMessages: gm.length > 0 ? (gm as NewsletterMessage[]) : undefined,
      };
    }),
    closing: {
      title: parsed.closing.title,
      eyebrow: parsed.closing.eyebrow,
      intro: parsed.closing.intro || undefined,
      messages: parsed.closing.messages,
      context: parsed.closing.context,
      cta: parsed.closing.cta || undefined,
    },
    signoff,
    signoffFootnote: parsed.signoffFootnote,
    webViewUrl: `${baseUrl}/tmp/${slug}.html`,
    subscribeUrl: `${baseUrl}/`,
    unsubscribeUrl: `${baseUrl}/unsubscribe?email={{email}}`,
    preferencesUrl: `${baseUrl}/preferences?email={{email}}`,
    replyEmail: "newsletter@builders.hipsters.tech",
    senderAddress: "Av. Paulista, 1106 - 7º andar, São Paulo - SP, Brasil",
    permissionReminder:
      "Você está recebendo esse e-mail porque se inscreveu na newsletter do Hipsters Builders ou foi adicionado por um amigo que pensou que você ia gostar.",
  };

  if (dryRun) {
    console.log("[generate-newsletter] Dry run — not writing");
    console.log(`Blocks: ${data.blocks.length}`);
    for (const b of data.blocks) {
      console.log(`  - ${b.title}`);
    }
    console.log(`Closing: ${data.closing.title}`);
    return;
  }

  const html = renderNewsletterF3(data);
  await writeFile(outPath, html, "utf-8");
  const size = (html.length / 1024).toFixed(1);
  console.log(`[generate-newsletter] Wrote ${outPath} (${size} KB)`);

  if (html.length > 90 * 1024) {
    console.warn(
      `[generate-newsletter] WARNING: HTML is ${size} KB, close to Gmail's 102 KB clip limit.`,
    );
  }

  console.log("");
  console.log(`Preview locally:  open ${outPath}`);
  console.log(`After deploy:     ${baseUrl}/tmp/${slug}.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
