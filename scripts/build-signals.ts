#!/usr/bin/env tsx
/**
 * build-signals.ts — Build signals wiki for Hipsters Builders
 *
 * Reads signals from 3 sources in the Stromae vault, normalizes them,
 * groups into stories, and generates JSON files for the Astro site.
 *
 * Usage:
 *   npx tsx scripts/build-signals.ts [--vault <path>] [--dry-run]
 *
 * Sources (all in stromae-vault-alura):
 *   - signals/telegram-groups/         (Hipsters Bot, real-time capture)
 *   - signals/internal/whatsapp-clauders-*     (Stromae, batch capture)
 *   - signals/internal/whatsapp-ia-sob-controle-*  (Stromae, batch capture)
 *
 * Outputs (to src/data/):
 *   - signals.json   — all normalized signals
 *   - stories.json   — grouped signals (curated topics/news)
 *   - graph.json     — nodes + links for knowledge graph
 *
 * Story criteria: a signal becomes a story if it has:
 *   - 2+ authors, OR 3+ messages, OR a shared link
 *   - Weak signals (casual chat, no substance) are kept as signals but not promoted to stories
 *
 * Karpathy-inspired: signals are raw captures, stories are wiki pages,
 * entities are the connective tissue.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import matter from "gray-matter";

// --- OG metadata fetcher with disk cache ---

interface OGMeta {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
}

const OG_CACHE_PATH = join(resolve(import.meta.dirname, ".."), ".og-cache.json");
let ogCache: Record<string, OGMeta> = {};

async function loadOGCache(): Promise<void> {
  try {
    ogCache = JSON.parse(await readFile(OG_CACHE_PATH, "utf-8"));
  } catch { ogCache = {}; }
}

async function saveOGCache(): Promise<void> {
  await writeFile(OG_CACHE_PATH, JSON.stringify(ogCache, null, 2));
}

async function fetchOG(url: string): Promise<OGMeta> {
  if (ogCache[url]) return ogCache[url];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HipstersBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) { ogCache[url] = { url }; return ogCache[url]; }
    const html = await res.text();
    const meta: OGMeta = { url };
    const og = (prop: string) => html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']+)`, "i"))?.[1];
    const tw = (name: string) => html.match(new RegExp(`<meta[^>]*name=["']twitter:${name}["'][^>]*content=["']([^"']+)`, "i"))?.[1];
    meta.title = og("title") || tw("title") || html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim();
    meta.description = og("description") || tw("description") || html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)?.[1];
    meta.image = og("image") || tw("image");
    meta.site = og("site_name") || new URL(url).hostname.replace("www.", "");
    // Decode HTML entities
    for (const k of ["title", "description"] as const) {
      if (meta[k]) meta[k] = meta[k]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    }
    ogCache[url] = meta;
    return meta;
  } catch {
    ogCache[url] = { url };
    return ogCache[url];
  }
}

// --- CLI ---

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

if (hasFlag("help")) {
  console.log("Usage: npx tsx scripts/build-signals.ts [--vault <path>] [--dry-run]");
  process.exit(0);
}

const vaultPath = getArg("vault") || join(process.env.HOME || "~", "stromae-vault-alura");
const dryRun = hasFlag("dry-run");
const projectRoot = resolve(import.meta.dirname, "..");
const dataDir = join(projectRoot, "src", "data");

// --- Types ---

// --- Author normalization ---

const AUTHOR_ALIASES: Record<string, string> = {
  "Marcell Pm3": "Marcell Almeida",
  "marcell pm3": "Marcell Almeida",
};

function normalizeAuthor(name: string): string {
  return AUTHOR_ALIASES[name] || name;
}

interface RawSignal {
  id: string;
  source: "telegram" | "whatsapp-clauders" | "whatsapp-sob-controle";
  sourceLabel: string;
  date: string;
  authors: string[];
  tags: string[];
  topic: string;
  summary: string;
  body: string;
  links: OGMeta[];
  messageCount: number;
  threadSlug?: string;
  threadStart?: string;
  threadEnd?: string;
}

interface ConversationMsg {
  author: string;
  text: string;
  time?: string; // HH:MM
}

interface Story {
  id: string;
  title: string;
  date: string;
  authors: string[];
  tags: string[];
  sources: string[]; // signal IDs
  links: OGMeta[];
  sourceGroups: string[]; // which groups contributed
  conversation: ConversationMsg[]; // actual quoted messages
  messageCount: number;
  authorCount: number;
  linkCount: number;
  weight: number; // engagement score: msgs + authors*3 + links*2
  editorial?: {
    title: string;
    subtitle: string;
    body: string;
  };
  public?: boolean;
  sensitivityReason?: string;
  slug?: string;
}

interface GraphNode {
  id: string;
  title: string;
  type: string; // story, signal, tag, person
  tags?: string[];
}

interface GraphLink {
  source: string;
  target: string;
}

// --- Signal readers ---

function countMessages(body: string): number {
  return (body.match(/\*\*\[.+?\]\*\*/g) || []).length || 1;
}

/** Extract conversation messages from signal body.
 *  Handles two formats:
 *  1. WhatsApp: **[Author · HH:MM]** Message text...
 *  2. Telegram: # Author — Group\n**DD/MM/YYYY, HH:MM**\n\nMessage text...
 *  Returns only messages with actual text content (not just links). */
function extractConversation(body: string): ConversationMsg[] {
  const msgs: ConversationMsg[] = [];

  // Try WhatsApp format first: **[Author · HH:MM]**
  const whatsappParts = body.split(/\*\*\[/);
  if (whatsappParts.length > 1) {
    for (const part of whatsappParts) {
      if (!part.trim()) continue;
      const headerEnd = part.indexOf("**");
      if (headerEnd < 0) continue;
      const header = part.slice(0, headerEnd);
      const text = part.slice(headerEnd + 2).trim();

      const match = header.match(/^(.+?)(?:\s*[·]\s*(\d{1,2}:\d{2}))?\]/);
      if (!match) continue;
      const author = match[1].trim();
      const time = match[2] || undefined;

      const clean = cleanMsgText(text);
      if (!clean) continue;

      msgs.push({ author, text: clean, time });
    }
  }

  // Try Telegram format: # Author — Group\n**date**\n\nBody
  if (msgs.length === 0) {
    const authorMatch = body.match(/^#\s+(.+?)\s*(?:—|–|-)\s*.+$/m);
    const timeMatch = body.match(/\*\*(\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2})\*\*/);
    if (authorMatch) {
      // Everything after the date line is the message body
      const dateLineEnd = timeMatch ? body.indexOf(timeMatch[0]) + timeMatch[0].length : 0;
      const text = body.slice(dateLineEnd).trim();
      const clean = cleanMsgText(text);
      if (clean) {
        msgs.push({
          author: authorMatch[1].trim(),
          text: clean,
          time: timeMatch?.[1]?.split(",")[1]?.trim(),
        });
      }
    }
  }

  return msgs;
}

/** Clean a message text: remove link-only content, images, emoji-only lines */
function cleanMsgText(text: string): string | null {
  // Strip markdown images
  let clean = text.replace(/!\[.*?\]\(.*?\)/g, "").trim();
  // Strip lines that are ONLY a URL
  clean = clean.split("\n").filter(line => {
    const stripped = line.replace(/https?:\/\/[^\s]+/g, "").replace(/🔗/g, "").trim();
    return stripped.length > 0;
  }).join("\n").trim();
  // Remove excessive newlines
  clean = clean.replace(/\n{3,}/g, "\n\n");
  // Skip if too short after cleanup
  if (clean.length < 15) return null;
  return clean;
}

/** Calculate total substantive text in a conversation (chars of actual commentary). */
function conversationTextLength(msgs: ConversationMsg[]): number {
  return msgs.reduce((sum, m) => sum + m.text.length, 0);
}

/** Check if a signal qualifies as a story.
 *  - Long single-author post (>300 chars) = story (Telegram editorial posts)
 *  - Thread with 3+ substantive messages AND >200 chars total = story
 *  - Otherwise just a signal */
function qualifiesAsStory(msgs: ConversationMsg[]): boolean {
  if (msgs.length === 0) return false;
  const totalChars = conversationTextLength(msgs);
  // Single author with substantial text (editorial post)
  if (msgs.length === 1 && totalChars >= 300) return true;
  // Thread with real discussion
  if (msgs.length >= 3 && totalChars >= 200) return true;
  // 2 messages but with real substance
  if (msgs.length >= 2 && totalChars >= 400) return true;
  return false;
}

function extractLinks(body: string, frontmatterLinks?: any[]): OGMeta[] {
  const links: OGMeta[] = [];
  // From frontmatter (may already have OG data from Hipsters Bot enrichment)
  if (Array.isArray(frontmatterLinks)) {
    for (const l of frontmatterLinks) {
      if (l.url) links.push({ url: l.url, title: l.title, description: l.description, image: l.image, site: l.site });
    }
  }
  // From body (URLs not already captured)
  const urlRe = /https?:\/\/[^\s)>\]]+/g;
  const bodyUrls = body.match(urlRe) || [];
  const seen = new Set(links.map(l => l.url));
  for (const u of bodyUrls) {
    if (!seen.has(u)) { links.push({ url: u }); seen.add(u); }
  }
  return links;
}

/** Enrich links that don't have OG metadata yet */
async function enrichLinks(links: OGMeta[]): Promise<OGMeta[]> {
  const enriched: OGMeta[] = [];
  for (const link of links) {
    if (link.title && link.image) {
      enriched.push(link); // Already enriched (from vault frontmatter)
    } else {
      const og = await fetchOG(link.url);
      enriched.push({ ...link, ...og, url: link.url });
    }
  }
  return enriched;
}

async function readSignalsFromDir(
  dir: string,
  filter: (filename: string) => boolean,
  source: RawSignal["source"],
  sourceLabel: string,
): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];
  let files: string[];
  try {
    files = (await readdir(dir)).filter(f => f.endsWith(".md") && filter(f));
  } catch { return signals; }

  for (const file of files.sort()) {
    try {
      const raw = await readFile(join(dir, file), "utf-8");
      const { data, content } = matter(raw);
      const id = file.replace(".md", "");
      const authors = Array.isArray(data.authors)
        ? [...new Set(data.authors.filter((a: string) => a !== "Unknown").map(normalizeAuthor))]
        : [];
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const body = content.trim();
      const links = extractLinks(body, data.links);
      const messageCount = countMessages(body);

      signals.push({
        id,
        source,
        sourceLabel,
        date: data.captured_at || data.date || "",
        authors,
        tags,
        topic: data.topic || data.summary || "",
        summary: data.summary || "",
        body,
        links,
        messageCount,
        threadSlug: data.thread_slug || undefined,
        threadStart: data.thread_start || undefined,
        threadEnd: data.thread_end || undefined,
      });
    } catch { /* skip */ }
  }
  return signals;
}

// --- Signal deduplication ---

interface DedupResult {
  signals: RawSignal[];
  idMapping: Map<string, string[]>; // newId → [oldIds that were merged into it]
}

function deduplicateSignals(signals: RawSignal[]): DedupResult {
  const idMapping = new Map<string, string[]>();

  // Hard dedup: group by source + threadStart + threadEnd (identical = same conversation)
  const threadKey = (s: RawSignal) =>
    s.threadStart && s.threadEnd ? `${s.source}|${s.threadStart}|${s.threadEnd}` : null;

  const threadGroups = new Map<string, RawSignal[]>();
  const noThread: RawSignal[] = [];

  for (const s of signals) {
    const key = threadKey(s);
    if (key) {
      const group = threadGroups.get(key) || [];
      group.push(s);
      threadGroups.set(key, group);
    } else {
      noThread.push(s);
    }
  }

  const deduped: RawSignal[] = [...noThread];
  let mergedCount = 0;

  for (const [, group] of threadGroups) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    // Keep the signal with most tags (richest classification)
    group.sort((a, b) => b.tags.length - a.tags.length);
    const winner = group[0];

    // Merge authors and tags from all duplicates
    const allAuthors = new Set<string>();
    const allTags = new Set<string>();
    const mergedFromIds: string[] = [];

    for (const s of group) {
      for (const a of s.authors) allAuthors.add(a);
      for (const t of s.tags) allTags.add(t);
      if (s.id !== winner.id) mergedFromIds.push(s.id);
    }

    winner.authors = [...allAuthors];
    winner.tags = [...allTags];

    deduped.push(winner);
    idMapping.set(winner.id, mergedFromIds);
    mergedCount += group.length - 1;
  }

  console.log(`[dedup] ${signals.length} → ${deduped.length} signals (${mergedCount} duplicates removed, ${threadGroups.size} thread groups)`);
  return { signals: deduped, idMapping };
}

// --- Story builder ---

function buildStories(signals: RawSignal[]): Story[] {
  // Group Telegram signals by thread_slug
  const telegramByThread = new Map<string, RawSignal[]>();
  const standaloneSignals: RawSignal[] = [];

  for (const s of signals) {
    if (s.source === "telegram" && s.threadSlug) {
      const existing = telegramByThread.get(s.threadSlug) || [];
      existing.push(s);
      telegramByThread.set(s.threadSlug, existing);
    } else if (s.source !== "telegram") {
      // WhatsApp signals are already consolidated threads — each is a potential story
      standaloneSignals.push(s);
    } else {
      // Telegram without thread_slug — standalone
      standaloneSignals.push(s);
    }
  }

  const stories: Story[] = [];

  // Telegram thread groups → stories
  for (const [slug, group] of telegramByThread) {
    const sortedByDate = group.sort((a, b) => a.date.localeCompare(b.date));
    const combinedBody = sortedByDate.map(s => s.body).join("\n\n");
    const conversation = extractConversation(combinedBody);
    if (!qualifiesAsStory(conversation)) continue;

    const allAuthors = [...new Set(conversation.map(m => m.author))];
    const allTags = [...new Set(group.flatMap(s => s.tags))];
    const allLinks = dedupeLinks(group.flatMap(s => s.links));

    stories.push({
      id: `story-tg-${slug}`,
      title: sortedByDate[0].topic || allTags.slice(0, 3).join(", "),
      date: sortedByDate[sortedByDate.length - 1].date,
      authors: allAuthors,
      tags: allTags,
      sources: group.map(s => s.id),
      links: allLinks,
      sourceGroups: ["Hipsters Builders"],
      conversation,
      messageCount: conversation.length,
      authorCount: allAuthors.length,
      linkCount: allLinks.length,
      weight: conversation.length + allAuthors.length * 3 + allLinks.length * 2 + Math.floor(conversationTextLength(conversation) / 100),
    });
  }

  // WhatsApp signals → stories (already consolidated threads)
  for (const s of standaloneSignals) {
    const conversation = extractConversation(s.body);
    if (!qualifiesAsStory(conversation)) continue;

    const groupLabel = s.source === "whatsapp-clauders" ? "Clauders"
      : s.source === "whatsapp-sob-controle" ? "IA Sob Controle"
      : s.sourceLabel;

    const conversationAuthors = [...new Set(conversation.map(m => m.author))];

    stories.push({
      id: `story-${s.id}`,
      title: s.topic || s.tags.slice(0, 3).join(", "),
      date: s.date,
      authors: conversationAuthors,
      tags: s.tags,
      sources: [s.id],
      links: s.links,
      sourceGroups: [groupLabel],
      conversation,
      messageCount: conversation.length,
      authorCount: conversationAuthors.length,
      linkCount: s.links.length,
      weight: conversation.length + conversationAuthors.length * 3 + s.links.length * 2 + Math.floor(conversationTextLength(conversation) / 100),
    });
  }

  // Sort by date desc
  stories.sort((a, b) => b.date.localeCompare(a.date));
  return stories;
}

function dedupeLinks(links: Array<{ url: string; title?: string; site?: string }>): typeof links {
  const seen = new Set<string>();
  return links.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

// --- Graph builder ---

function buildGraph(signals: RawSignal[], stories: Story[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const nodeIds = new Set<string>();
  const linkSet = new Set<string>();
  const links: GraphLink[] = [];

  function addLink(a: string, b: string) {
    if (a === b) return;
    const key = [a, b].sort().join("->");
    if (linkSet.has(key)) return;
    linkSet.add(key);
    links.push({ source: a, target: b });
  }

  // Story nodes
  for (const story of stories) {
    const id = story.id;
    nodes.push({ id, title: story.title, type: "story", tags: story.tags });
    nodeIds.add(id);
  }

  // Tag nodes (only tags appearing in 2+ stories)
  const tagCount = new Map<string, number>();
  for (const story of stories) {
    for (const tag of story.tags) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
  }
  for (const [tag, count] of tagCount) {
    if (count < 2) continue;
    const id = `tag/${tag}`;
    nodes.push({ id, title: tag, type: "tag" });
    nodeIds.add(id);
  }

  // Person nodes (authors appearing in 2+ stories)
  const personCount = new Map<string, number>();
  for (const story of stories) {
    for (const author of story.authors) personCount.set(author, (personCount.get(author) || 0) + 1);
  }
  for (const [person, count] of personCount) {
    if (count < 2) continue;
    const id = `person/${person.toLowerCase().replace(/\s+/g, "-")}`;
    nodes.push({ id, title: person, type: "person" });
    nodeIds.add(id);
  }

  // Story ↔ Tag links
  for (const story of stories) {
    for (const tag of story.tags) {
      const tagId = `tag/${tag}`;
      if (nodeIds.has(tagId)) addLink(story.id, tagId);
    }
  }

  // Story ↔ Person links
  for (const story of stories) {
    for (const author of story.authors) {
      const personId = `person/${author.toLowerCase().replace(/\s+/g, "-")}`;
      if (nodeIds.has(personId)) addLink(story.id, personId);
    }
  }

  // Story ↔ Story via shared tags (2+ shared)
  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      const shared = stories[i].tags.filter(t => stories[j].tags.includes(t));
      if (shared.length >= 2) addLink(stories[i].id, stories[j].id);
    }
  }

  // Prune isolated
  const connected = new Set<string>();
  for (const l of links) { connected.add(l.source); connected.add(l.target); }
  const prunedNodes = nodes.filter(n => n.type === "story" || connected.has(n.id));
  for (const n of prunedNodes) { if (!n.tags || n.tags.length === 0) delete n.tags; }
  const prunedIds = new Set(prunedNodes.map(n => n.id));
  const prunedLinks = links.filter(l => prunedIds.has(l.source) && prunedIds.has(l.target));

  return { nodes: prunedNodes, links: prunedLinks };
}

// --- Main ---

async function main() {
  console.log("[build-signals] Reading signals from Stromae vault...");
  console.log(`  Vault: ${vaultPath}`);

  const allSignals: RawSignal[] = [];

  // 1. Telegram Hipsters Builders
  const tgSignals = await readSignalsFromDir(
    join(vaultPath, "signals", "telegram-groups"),
    () => true,
    "telegram",
    "Hipsters Builders (Telegram)",
  );
  allSignals.push(...tgSignals);
  console.log(`  Telegram: ${tgSignals.length} signals`);

  // 2. WhatsApp Clauders (only explicitly named files)
  // IMPORTANT: Do NOT include unnamed group IDs (whatsapp-12036*) — may be Builders SP (large group, excluded)
  const claudersSignals = await readSignalsFromDir(
    join(vaultPath, "signals", "internal"),
    (f) => f.startsWith("whatsapp-clauders-"),
    "whatsapp-clauders",
    "Clauders",
  );
  allSignals.push(...claudersSignals);
  console.log(`  Clauders: ${claudersSignals.length} signals`);

  // 3. WhatsApp IA Sob Controle (only explicitly named files)
  const sobControleSignals = await readSignalsFromDir(
    join(vaultPath, "signals", "internal"),
    (f) => f.startsWith("whatsapp-ia-sob-controle-"),
    "whatsapp-sob-controle",
    "IA Sob Controle",
  );
  allSignals.push(...sobControleSignals);
  console.log(`  IA Sob Controle: ${sobControleSignals.length} signals`);

  console.log(`  Total: ${allSignals.length} signals`);

  // Sort all signals by date desc
  allSignals.sort((a, b) => b.date.localeCompare(a.date));

  // Deduplicate signals (same thread_start + thread_end = same conversation)
  const { signals: dedupedSignals, idMapping } = deduplicateSignals(allSignals);

  // Build stories from deduped signals
  const stories = buildStories(dedupedSignals);
  console.log(`\n[build-signals] Built ${stories.length} stories`);

  // Stats
  const bySource = new Map<string, number>();
  for (const s of stories) {
    for (const g of s.sourceGroups) bySource.set(g, (bySource.get(g) || 0) + 1);
  }
  for (const [src, count] of bySource) console.log(`  ${src}: ${count} stories`);

  // Preserve editorial, public, slug from existing stories.json
  // Also check merged IDs (dedup may have changed which signal ID is the "winner")
  const storiesJsonPath = join(dataDir, "stories.json");
  try {
    const existing: Story[] = JSON.parse(await readFile(storiesJsonPath, "utf-8"));
    const existingById = new Map<string, Story>();
    for (const s of existing) existingById.set(s.id, s);

    // Build reverse map: oldId → existingStory (for dedup ID migration)
    const oldIdToStory = new Map<string, Story>();
    for (const [newId, oldIds] of idMapping) {
      for (const oldId of oldIds) {
        // A story might have been created from an oldId that's now merged
        const oldStoryId = `story-${oldId}`;
        const found = existingById.get(oldStoryId);
        if (found) oldIdToStory.set(newId, found);
      }
    }

    let preserved = 0;
    for (const story of stories) {
      // Try direct match first, then check merged IDs
      const match = existingById.get(story.id) || oldIdToStory.get(story.id.replace("story-", ""));
      if (!match) continue;
      if (match.editorial) { story.editorial = match.editorial; preserved++; }
      if (match.public !== undefined) story.public = match.public;
      if (match.sensitivityReason) story.sensitivityReason = match.sensitivityReason;
      if (match.slug) story.slug = match.slug;
    }
    if (preserved > 0) console.log(`[build-signals] Preserved ${preserved} editorial entries from existing stories.json`);
  } catch { /* no existing file */ }

  // Enrich links with OG metadata
  await loadOGCache();
  let enriched = 0;
  for (const story of stories) {
    if (story.links.length === 0) continue;
    const before = story.links.filter(l => l.title && l.image).length;
    story.links = await enrichLinks(story.links);
    const after = story.links.filter(l => l.title && l.image).length;
    enriched += after - before;
  }
  await saveOGCache();
  console.log(`[build-signals] Enriched ${enriched} links with OG metadata (cache: ${Object.keys(ogCache).length} URLs)`);

  // Build graph
  const graph = buildGraph(dedupedSignals, stories);
  console.log(`\n[build-signals] Graph: ${graph.nodes.length} nodes, ${graph.links.length} links`);

  if (dryRun) {
    console.log("\n[build-signals] Dry run — not writing files");
    // Show some stories
    for (const s of stories.slice(0, 5)) {
      console.log(`  ${s.date.slice(0, 10)} | ${s.authors.join(", ")} | ${s.title.slice(0, 60)}`);
    }
    return;
  }

  // Write outputs
  await mkdir(dataDir, { recursive: true });

  // Filter low-value signals from public output (logistics, events, internal comms)
  const LOW_VALUE_TAGS = new Set([
    "eventos", "eventos presenciais", "inscrição", "acesso gratuito",
    "gestão de comunidade", "logística", "sympla", "confirmação",
    "tools discovery", "comunidade", "casual-check-in",
  ]);
  const LOW_VALUE_TOPICS = [
    "inscrição", "presença", "sympla", "evento pago", "confirmação",
    "acesso sem custo", "compartilham referências sobre ferrament",
    "conversa casual sobre", "breve troca sobre", "breve exchange pessoal",
    "compartilhamento de posts sobre tópicos", "sem detalhes e",
    "solicitação de informações pessoais", "compartilha imagens relacionadas",
    "comentário breve sobre mudança", "reação rápida ao",
    "episódio de podcast recomendado", "consulta ao bot de conhecimento",
    "compilação de múltiplas notícias", "reação a vídeo comparativo",
    "reações emocionais de llms",
  ];

  const filteredSignals = dedupedSignals.filter(s => {
    const topicLower = (s.topic || "").toLowerCase();
    if (LOW_VALUE_TOPICS.some(kw => topicLower.includes(kw))) return false;
    const tagSet = new Set(s.tags.map(t => t.toLowerCase()));
    const lowTagCount = [...tagSet].filter(t => LOW_VALUE_TAGS.has(t)).length;
    // Skip if majority of tags are low-value
    if (tagSet.size > 0 && lowTagCount >= tagSet.size * 0.5) return false;
    return true;
  });

  const filtered = dedupedSignals.length - filteredSignals.length;
  if (filtered > 0) console.log(`[build-signals] Filtered ${filtered} low-value signals (events, logistics)`);

  // signals.json — deduped + filtered signals, metadata only
  const signalsOut = filteredSignals.map(s => ({
    id: s.id,
    source: s.source,
    sourceLabel: s.sourceLabel,
    date: s.date,
    authors: s.authors,
    tags: s.tags,
    topic: s.topic,
    linkCount: s.links.length,
    messageCount: s.messageCount,
  }));
  await writeFile(join(dataDir, "signals.json"), JSON.stringify(signalsOut, null, 2));
  console.log(`[build-signals] Wrote signals.json (${signalsOut.length} signals)`);

  // stories.json
  await writeFile(join(dataDir, "stories.json"), JSON.stringify(stories, null, 2));
  console.log(`[build-signals] Wrote stories.json (${stories.length} stories)`);

  // graph.json
  await writeFile(join(dataDir, "graph.json"), JSON.stringify(graph, null, 2));
  console.log(`[build-signals] Wrote graph.json (${graph.nodes.length} nodes, ${graph.links.length} links)`);

  console.log("\n[build-signals] Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
