#!/usr/bin/env tsx
/**
 * hipsters — unified CLI for the Hipsters Builders site
 *
 * One entry point for the whole content pipeline. Each subcommand wraps
 * one of the existing scripts in scripts/, so the underlying behavior
 * stays the same — this just gives a consistent interface and `--help`.
 *
 * USAGE
 *   hipsters <command> [options]
 *   hipsters <command> --help
 *
 * COMMANDS
 *   sync          Vault → Astro content collections (episodes, curtas, newsletters, media)
 *   signals       Build signals.json / stories.json / graph.json from the vault
 *   editorialize  Editorial pass on stories with Sonnet (titles, lede, body)
 *   classify      Sensitivity classification with Haiku (public vs private)
 *   stories       signals + editorialize + classify (the "generate news" flow)
 *   build         sync + stories (full pipeline, ~ what `npm run build` covers)
 *   status        Show counts: signals, stories, editorial, public, private
 *
 * COMMON OPTIONS
 *   --vault <path>   Path to stromae-vault-alura (default: ~/stromae-vault-alura)
 *   --from <date>    Process only stories with date >= YYYY-MM-DD (LLM steps)
 *   --to <date>      Process only stories with date <= YYYY-MM-DD (LLM steps)
 *   --limit <N>      Cap LLM steps at N stories (after date filter)
 *   --force          Re-process stories that were already done (LLM steps)
 *   --dry-run        Run everything but don't write files
 *   --help, -h       Show help (global or per-command)
 *
 * EXAMPLES
 *   # First-time setup, after cloning the vault:
 *   hipsters build
 *
 *   # Generate stories for the last week (no full re-sync):
 *   hipsters stories --from 2026-04-01
 *
 *   # Just preview what would be editorialized in a date range:
 *   hipsters editorialize --from 2026-04-01 --to 2026-04-08 --dry-run
 *
 *   # Re-classify a single story to test the prompt:
 *   hipsters classify --limit 1 --force
 *
 *   # Status of the current build:
 *   hipsters status
 *
 * ENV
 *   ANTHROPIC_API_KEY  required for editorialize, classify, stories, build
 *                      (loaded from .env or ~/pkm/.env)
 *
 * NOTES
 *   - signals is fast and has no LLM cost — always processes the full vault.
 *   - --from/--to apply only to LLM steps (editorialize, classify, stories).
 *   - editorialize and classify already skip stories that were processed
 *     before; pass --force to re-run them.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, "..");

// ── arg parsing ──

type Args = {
  command: string;
  flags: Set<string>;
  values: Map<string, string>;
  rest: string[];
};

function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const rest: string[] = [];
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "";
  const tail = command ? argv.slice(1) : argv;

  for (let i = 0; i < tail.length; i++) {
    const a = tail[i];
    if (a === "--help" || a === "-h") {
      flags.add("help");
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = tail[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        values.set(key, next);
        i++;
      } else {
        flags.add(key);
      }
      continue;
    }
    rest.push(a);
  }

  return { command, flags, values, rest };
}

// ── help text ──

const HELP = readFileSync(fileURLToPath(import.meta.url), "utf-8")
  .match(/\/\*\*([\s\S]*?)\*\//)?.[1]
  ?.replace(/^[ \t]*\*[ \t]?/gm, "")
  .trim() ?? "";

function printHelp(): void {
  console.log(HELP);
}

const COMMAND_HELP: Record<string, string> = {
  sync: `hipsters sync — Vault → Astro content collections

Reads the Stromae vault and writes src/content/{episodes,curtas,newsletters}
and public/media/whatsapp. Replaces \`npm run sync\`.

Options:
  --vault <path>   Path to stromae-vault-alura (default: ~/stromae-vault-alura)
  --since <date>   Only include episodes since this date (default: 2025-01-01)
  --dry-run        Preview without writing files

Example:
  hipsters sync --since 2026-01-01
`,
  signals: `hipsters signals — Build signals/stories/graph JSON from the vault

Reads telegram-groups + whatsapp-clauders + whatsapp-ia-sob-controle from
the vault, dedupes, builds stories, fetches OG metadata, and writes
src/data/{signals,stories,graph}.json.

Fast, no LLM cost. Always processes the full vault — preserves existing
editorial/public fields from stories.json on rewrite.

Options:
  --vault <path>   Path to stromae-vault-alura (default: ~/stromae-vault-alura)
  --dry-run        Preview without writing files

Example:
  hipsters signals
`,
  editorialize: `hipsters editorialize — Editorial pass on stories (Sonnet)

Reads stories.json and writes back editorial.{title,subtitle,body} for each
story. Skips stories that already have editorial content unless --force.

Options:
  --from <date>    Only process stories with date >= YYYY-MM-DD
  --to <date>      Only process stories with date <= YYYY-MM-DD
  --limit <N>      Cap at N stories (after date filter)
  --force          Re-editorialize stories that already have editorial
  --dry-run        Run the LLM but don't write stories.json

Examples:
  hipsters editorialize --from 2026-04-01
  hipsters editorialize --limit 5 --dry-run
  hipsters editorialize --force --limit 1
`,
  classify: `hipsters classify — Sensitivity classification (Haiku)

Reads stories.json and assigns story.public = true|false plus a reason.
Stories flagged as private don't appear in the public site.

Options:
  --from <date>    Only classify stories with date >= YYYY-MM-DD
  --to <date>      Only classify stories with date <= YYYY-MM-DD
  --limit <N>      Cap at N stories (after date filter)
  --force          Re-classify stories that already have a verdict
  --dry-run        Run the LLM but don't write stories.json

Examples:
  hipsters classify --from 2026-04-01
  hipsters classify --force --limit 10
`,
  stories: `hipsters stories — Generate news (signals + editorialize + classify)

The "generate news" flow. Runs the three steps in sequence:
  1. signals       (build stories.json from vault)
  2. editorialize  (Sonnet editorial pass)
  3. classify      (Haiku sensitivity check)

Options:
  --vault <path>   Path to stromae-vault-alura (default: ~/stromae-vault-alura)
  --from <date>    Only LLM-process stories with date >= YYYY-MM-DD
  --to <date>      Only LLM-process stories with date <= YYYY-MM-DD
  --limit <N>      Cap LLM steps at N stories (after date filter)
  --force          Re-process stories that were already done
  --dry-run        Run everything but don't write files
  --skip-signals   Skip the build-signals step (start from existing stories.json)
  --skip-editorialize  Skip the editorial pass
  --skip-classify  Skip the sensitivity pass

Examples:
  # Generate news for the last week
  hipsters stories --from 2026-04-01

  # Cheap re-classify pass on a date range
  hipsters stories --skip-signals --skip-editorialize --from 2026-04-01

  # Preview what would happen
  hipsters stories --from 2026-04-01 --dry-run
`,
  build: `hipsters build — Full pipeline (sync + stories)

Equivalent to running:
  hipsters sync
  hipsters stories

Options: any of sync's or stories' options. --vault is shared.

Example:
  hipsters build
`,
  status: `hipsters status — Show counts of the current build

Reports on src/data/signals.json and src/data/stories.json:
  - signals (raw + by source)
  - stories (total, with editorial, public, private, unclassified)

No options. Reads files only.
`,
};

// ── runner ──

function runScript(file: string, scriptArgs: string[]): Promise<number> {
  const scriptPath = resolve(SCRIPTS_DIR, file);
  if (!existsSync(scriptPath)) {
    console.error(`hipsters: script not found: ${file}`);
    return Promise.resolve(1);
  }
  return new Promise((resolveP) => {
    const child = spawn("npx", ["tsx", scriptPath, ...scriptArgs], {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolveP(code ?? 1));
    child.on("error", (err) => {
      console.error(`hipsters: failed to spawn ${file}: ${err.message}`);
      resolveP(1);
    });
  });
}

function flagsToArgv(args: Args, allowed: string[]): string[] {
  const out: string[] = [];
  for (const k of allowed) {
    if (args.values.has(k)) {
      out.push(`--${k}`, args.values.get(k)!);
    } else if (args.flags.has(k)) {
      out.push(`--${k}`);
    }
  }
  return out;
}

async function cmdSync(args: Args): Promise<number> {
  return runScript("sync-content.ts", flagsToArgv(args, ["vault", "since", "dry-run"]));
}

async function cmdSignals(args: Args): Promise<number> {
  return runScript("build-signals.ts", flagsToArgv(args, ["vault", "dry-run"]));
}

async function cmdEditorialize(args: Args): Promise<number> {
  return runScript(
    "editorialize-stories.ts",
    flagsToArgv(args, ["from", "to", "limit", "force", "dry-run"]),
  );
}

async function cmdClassify(args: Args): Promise<number> {
  return runScript(
    "classify-stories.ts",
    flagsToArgv(args, ["from", "to", "limit", "force", "dry-run"]),
  );
}

async function cmdStories(args: Args): Promise<number> {
  const skipSignals = args.flags.has("skip-signals");
  const skipEditorialize = args.flags.has("skip-editorialize");
  const skipClassify = args.flags.has("skip-classify");

  if (!skipSignals) {
    console.log("\n━━━ [1/3] hipsters signals ━━━");
    const code = await cmdSignals(args);
    if (code !== 0) return code;
  } else {
    console.log("\n━━━ [1/3] signals (skipped) ━━━");
  }

  if (!skipEditorialize) {
    console.log("\n━━━ [2/3] hipsters editorialize ━━━");
    const code = await cmdEditorialize(args);
    if (code !== 0) return code;
  } else {
    console.log("\n━━━ [2/3] editorialize (skipped) ━━━");
  }

  if (!skipClassify) {
    console.log("\n━━━ [3/3] hipsters classify ━━━");
    const code = await cmdClassify(args);
    if (code !== 0) return code;
  } else {
    console.log("\n━━━ [3/3] classify (skipped) ━━━");
  }

  return 0;
}

async function cmdBuild(args: Args): Promise<number> {
  console.log("\n━━━ hipsters sync ━━━");
  const syncCode = await cmdSync(args);
  if (syncCode !== 0) return syncCode;

  console.log("\n━━━ hipsters stories ━━━");
  return cmdStories(args);
}

interface Story {
  id: string;
  date?: string;
  editorial?: unknown;
  public?: boolean;
  sources?: string[];
  sourceGroups?: string[];
}

interface Signal {
  id: string;
  source?: string;
  sourceLabel?: string;
}

async function cmdStatus(): Promise<number> {
  const dataDir = resolve(PROJECT_ROOT, "src", "data");
  const signalsPath = resolve(dataDir, "signals.json");
  const storiesPath = resolve(dataDir, "stories.json");

  let signals: Signal[] = [];
  let stories: Story[] = [];
  try {
    if (existsSync(signalsPath)) signals = JSON.parse(readFileSync(signalsPath, "utf-8"));
  } catch (e) {
    console.error(`Could not read signals.json: ${(e as Error).message}`);
  }
  try {
    if (existsSync(storiesPath)) stories = JSON.parse(readFileSync(storiesPath, "utf-8"));
  } catch (e) {
    console.error(`Could not read stories.json: ${(e as Error).message}`);
  }

  const sourceCounts = new Map<string, number>();
  for (const s of signals) {
    const label = s.sourceLabel || s.source || "unknown";
    sourceCounts.set(label, (sourceCounts.get(label) || 0) + 1);
  }

  const editorialCount = stories.filter((s) => s.editorial).length;
  const publicCount = stories.filter((s) => s.public === true).length;
  const privateCount = stories.filter((s) => s.public === false).length;
  const unclassified = stories.filter((s) => s.public === undefined).length;
  const noEditorial = stories.length - editorialCount;

  const datedStories = stories.filter((s) => typeof s.date === "string" && s.date);
  datedStories.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const oldest = datedStories[0]?.date?.slice(0, 10);
  const newest = datedStories[datedStories.length - 1]?.date?.slice(0, 10);

  console.log("hipsters status");
  console.log("───────────────");
  console.log(`signals.json    ${signals.length}`);
  for (const [label, count] of sourceCounts) {
    console.log(`  ${label.padEnd(30)} ${count}`);
  }
  console.log("");
  console.log(`stories.json    ${stories.length}`);
  console.log(`  with editorial${" ".repeat(16)} ${editorialCount}`);
  console.log(`  no editorial${" ".repeat(18)} ${noEditorial}`);
  console.log(`  public${" ".repeat(24)} ${publicCount}`);
  console.log(`  private${" ".repeat(23)} ${privateCount}`);
  console.log(`  unclassified${" ".repeat(18)} ${unclassified}`);
  if (oldest && newest) {
    console.log("");
    console.log(`date range      ${oldest} → ${newest}`);
  }
  return 0;
}

// ── main ──

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command || (args.command === "" && args.flags.has("help"))) {
    printHelp();
    process.exit(args.command ? 0 : 0);
  }

  if (args.flags.has("help")) {
    const help = COMMAND_HELP[args.command];
    if (help) {
      console.log(help);
      process.exit(0);
    }
  }

  let code = 1;
  switch (args.command) {
    case "sync":
      code = await cmdSync(args);
      break;
    case "signals":
      code = await cmdSignals(args);
      break;
    case "editorialize":
      code = await cmdEditorialize(args);
      break;
    case "classify":
      code = await cmdClassify(args);
      break;
    case "stories":
      code = await cmdStories(args);
      break;
    case "build":
      code = await cmdBuild(args);
      break;
    case "status":
      code = await cmdStatus();
      break;
    case "help":
    case "":
      printHelp();
      code = 0;
      break;
    default:
      console.error(`hipsters: unknown command "${args.command}"`);
      console.error(`Run \`hipsters --help\` for the list of commands.`);
      code = 1;
  }

  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
