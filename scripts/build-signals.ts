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
  links: Array<{ url: string; title?: string; site?: string }>;
  messageCount: number;
  threadSlug?: string;
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
  links: Array<{ url: string; title?: string; site?: string }>;
  sourceGroups: string[]; // which groups contributed
  conversation: ConversationMsg[]; // actual quoted messages
  messageCount: number;
  authorCount: number;
  linkCount: number;
  weight: number; // engagement score: msgs + authors*3 + links*2
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
 *  Format: **[Author · HH:MM]** Message text...
 *  Returns only messages with actual text content (not just links). */
function extractConversation(body: string): ConversationMsg[] {
  const msgs: ConversationMsg[] = [];
  // Split by message headers
  const parts = body.split(/\*\*\[/);
  for (const part of parts) {
    if (!part.trim()) continue;
    const headerEnd = part.indexOf("**");
    if (headerEnd < 0) continue;
    const header = part.slice(0, headerEnd);
    const text = part.slice(headerEnd + 2).trim();

    // Parse author and time from "Author · HH:MM]"
    const match = header.match(/^(.+?)(?:\s*[·]\s*(\d{1,2}:\d{2}))?\]/);
    if (!match) continue;
    const author = match[1].trim();
    const time = match[2] || undefined;

    // Skip messages that are ONLY a URL (no commentary)
    const stripped = text.replace(/https?:\/\/[^\s]+/g, "").trim();
    if (stripped.length < 10) continue;

    // Clean up: remove markdown image refs, keep text
    const clean = text
      .replace(/!\[.*?\]\(.*?\)/g, "") // remove images
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (clean.length < 10) continue;

    msgs.push({ author, text: clean, time });
  }
  return msgs;
}

/** Check if a signal has enough real discussion to be a story.
 *  Needs at least 2 messages with actual text (not just shared links). */
function hasSubstantiveDiscussion(body: string): boolean {
  const msgs = extractConversation(body);
  return msgs.length >= 2;
}

function extractLinks(body: string, frontmatterLinks?: any[]): Array<{ url: string; title?: string; site?: string }> {
  const links: Array<{ url: string; title?: string; site?: string }> = [];
  // From frontmatter
  if (Array.isArray(frontmatterLinks)) {
    for (const l of frontmatterLinks) {
      if (l.url) links.push({ url: l.url, title: l.title, site: l.site });
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
      const authors = Array.isArray(data.authors) ? data.authors.filter((a: string) => a !== "Unknown") : [];
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
      });
    } catch { /* skip */ }
  }
  return signals;
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

    // Story quality: need real discussion (2+ messages with text)
    if (conversation.length < 2) continue;

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
      weight: conversation.length + allAuthors.length * 3 + allLinks.length * 2,
    });
  }

  // WhatsApp signals → stories (already consolidated threads)
  for (const s of standaloneSignals) {
    const conversation = extractConversation(s.body);

    // Story quality: need real discussion (2+ messages with text)
    if (conversation.length < 2) continue;

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
      weight: conversation.length + conversationAuthors.length * 3 + s.links.length * 2,
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

  // 2. WhatsApp Clauders (multiple naming patterns)
  // Named: whatsapp-clauders-*, wa-clauders-*
  // Group IDs: 120363154248832196 (Clauders), 120363425465757403 (Clauders liderança)
  const CLAUDERS_PATTERNS = [
    "whatsapp-clauders-",
    "wa-clauders-",
    "whatsapp-120363154248832196-g-us-",
    "whatsapp-120363425465757403-g-us-",
  ];
  const claudersSignals = await readSignalsFromDir(
    join(vaultPath, "signals", "internal"),
    (f) => CLAUDERS_PATTERNS.some(p => f.startsWith(p)),
    "whatsapp-clauders",
    "Clauders",
  );
  allSignals.push(...claudersSignals);
  console.log(`  Clauders: ${claudersSignals.length} signals`);

  // 3. WhatsApp IA Sob Controle (multiple naming patterns)
  // Named: whatsapp-ia-sob-controle-*, wa-ia-sob-controle-*
  // Group ID: 120363408138765885
  const SOB_CONTROLE_PATTERNS = [
    "whatsapp-ia-sob-controle-",
    "wa-ia-sob-controle-",
    "whatsapp-120363408138765885-g-us-",
  ];
  const sobControleSignals = await readSignalsFromDir(
    join(vaultPath, "signals", "internal"),
    (f) => SOB_CONTROLE_PATTERNS.some(p => f.startsWith(p)),
    "whatsapp-sob-controle",
    "IA Sob Controle",
  );
  allSignals.push(...sobControleSignals);
  console.log(`  IA Sob Controle: ${sobControleSignals.length} signals`);

  console.log(`  Total: ${allSignals.length} signals`);

  // Sort all signals by date desc
  allSignals.sort((a, b) => b.date.localeCompare(a.date));

  // Build stories
  const stories = buildStories(allSignals);
  console.log(`\n[build-signals] Built ${stories.length} stories`);

  // Stats
  const bySource = new Map<string, number>();
  for (const s of stories) {
    for (const g of s.sourceGroups) bySource.set(g, (bySource.get(g) || 0) + 1);
  }
  for (const [src, count] of bySource) console.log(`  ${src}: ${count} stories`);

  // Build graph
  const graph = buildGraph(allSignals, stories);
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

  // signals.json — all raw signals (without body, for the grid)
  const signalsOut = allSignals.map(s => ({
    id: s.id,
    source: s.source,
    sourceLabel: s.sourceLabel,
    date: s.date,
    authors: s.authors,
    tags: s.tags,
    topic: s.topic,
    summary: s.summary,
    links: s.links,
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
