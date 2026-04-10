# CLAUDE.md — Hipsters Builders

## What is this

Community portal for the **Hipsters Network** (Alura podcasts + community). Publishes episode summaries with quotes, short-form "curtas" (best quotes from podcasts and WhatsApp groups), and a weekly newsletter. All content comes from the Stromae vault at build time — this is a read-only consumer, not a content producer.

**Site**: https://builders.hipsters.tech

## Owner

Paulo Silveira — Chief Visionary Officer, Grupo Alun. Co-founder of Alura.

## Stack

- **Framework**: Astro 6 (SSG, static output)
- **Styling**: Tailwind v4 (CSS-first via `@tailwindcss/vite`)
- **Deploy**: GitHub Pages (planned)
- **Newsletter**: Resend (Phase 2)
- **Content source**: Stromae vault (`~/stromae-vault-alura/`, read-only at build time)
- **Node**: >= 22.12.0

## Commands

```bash
npm run sync           # vault -> content collections (episodes, curtas, newsletters)
npm run build-signals  # vault signals -> src/data/{signals,stories,graph}.json + OG enrichment
npm run dev            # dev server (port 3323)
npm run build          # sync + build-signals + astro build
npx astro preview      # preview production build locally
```

### Sensitivity classification (classify-stories.ts)

Runs **Haiku** on each story to classify public vs private. Flags: internal company data, employee criticism, offensive language, political content, private conversations. Writes `public` boolean + `reason` to stories.json.

```bash
npx tsx scripts/classify-stories.ts              # classify all unclassified stories
npx tsx scripts/classify-stories.ts --limit 5    # classify 5 stories
npx tsx scripts/classify-stories.ts --force      # reclassify all (even already done)
npx tsx scripts/classify-stories.ts --dry-run    # preview without writing
```

Requires ANTHROPIC_API_KEY (loads from .env or ~/pkm/.env).

### Stories pipeline flow

```
vault signals → build-signals.ts (dedup + group + quality filter) → stories.json
  → editorialize-stories.ts (Sonnet: titles, body, quotes) → stories.json (enriched)
  → classify-stories.ts (Haiku: public/private sensitivity) → stories.json (classified)
  → /stories (public only, top by weight) + /stories/all (everything for review)
```

Key steps:
1. **Dedup**: signals from same source + same day + 2+ shared tags are merged before story creation. Cross-source (Telegram + WhatsApp) dedup by shared tags + 2-day window.
2. **Editorialize**: Sonnet generates journalistic titles, subtitle, editorial body with indirect speech + direct quotes.
3. **Classify sensitivity**: Haiku flags stories with internal data, employee criticism, offensive language, etc.
4. **Render**: `/stories` shows only `public: true` top stories. `/stories/all` shows everything.

### Signals pipeline (build-signals.ts)

Reads 3 sources from Stromae vault, normalizes, groups by thread, filters quality, enriches links with OG metadata, builds graph. Outputs `signals.json`, `stories.json`, `graph.json` to `src/data/`.

Sources: `signals/telegram-groups/` (Hipsters Bot) + `signals/internal/whatsapp-clauders-*` + `signals/internal/whatsapp-ia-sob-controle-*`.
**DO NOT include**: Builders SP WhatsApp group (large, excluded), unnamed group IDs (`whatsapp-12036*`).

Story quality: needs 2+ messages with >200 chars OR 1 message >300 chars.

### Editorial pass (editorialize-stories.ts)

Runs **Sonnet** on each story to generate editorial content: short title, subtitle, body with indirect speech + direct quotes. Run separately (not in build pipeline — costs ~$0.50 for all stories):

```bash
npx tsx scripts/editorialize-stories.ts              # process all unedited stories
npx tsx scripts/editorialize-stories.ts --limit 5    # process 5 stories
npx tsx scripts/editorialize-stories.ts --force      # reprocess all (even already done)
npx tsx scripts/editorialize-stories.ts --dry-run    # preview without writing
```

Requires ANTHROPIC_API_KEY (loads from .env or ~/pkm/.env).

### sync-content.ts options

```bash
npx tsx scripts/sync-content.ts --help
npx tsx scripts/sync-content.ts --dry-run          # preview without writing
npx tsx scripts/sync-content.ts --since 2024-01-01 # change date filter (default: 2025-01-01)
npx tsx scripts/sync-content.ts --vault ~/other     # different vault path
```

## Architecture

```
Stromae vault (signals/, drafts/)
  | sync-content.ts
  v
src/content/
  episodes/       # 1 .md per podcast episode (grouped by parent_episode)
  curtas/         # best quotes from podcast segments + WhatsApp threads
  newsletters/    # copied from vault drafts/newsletter-hipsters-builders/
  | astro build
  v
dist/ (static site)
```

### Project structure

```
hipsters-builders/
  vault/                      # gitignored, 383MB — source data
    signals/
      podcasts/               # episode summaries + segments with speaker timestamps
        _full/                # complete transcriptions (not used by sync, kept as reference)
      internal/               # WhatsApp group messages (raw dumps, LID mappings)
    voices/                   # voice guides (not directly used by this project)
    config.yaml               # Stromae source configuration
  scripts/
    sync-content.ts           # vault -> content collections (the bridge)
  src/
    content.config.ts         # Zod schemas for episodes, curtas, newsletters
    content/                  # gitignored — generated by sync-content.ts
      episodes/               # generated .md files
      curtas/                 # generated .md files
      newsletters/            # generated .md files
    components/
      BentoCard.astro         # bento grid card
      EpisodeCard.astro       # podcast episode card
      QuoteCard.astro         # curta/quote card
      Nav.astro               # site navigation
      NewsletterForm.astro    # email subscribe form (Phase 2)
    layouts/
      BaseLayout.astro        # shared HTML shell
    pages/
      index.astro             # homepage
      episodios/index.astro   # episode listing
      episodios/[...slug].astro  # episode detail
      curtas/index.astro      # quotes listing
      newsletter/index.astro  # newsletter archive
      newsletter/[...slug].astro  # newsletter detail
      design/v1.astro         # prototype: Editorial (light, serif, newspaper)
      design/v2.astro         # prototype: Linear (dark minimal, Vercel-inspired)
      design/v3.astro         # prototype: Magazine (dark warm, carousels)
      rss.xml.ts              # RSS feed
    styles/
      global.css              # Tailwind v4 + custom styles
```

### Content collections (Zod schemas)

Defined in `src/content.config.ts`:

**episodes** — one per podcast episode, grouped from multiple segment signals:
- `title`, `description`, `pubDate`, `podcast` (display name), `episodeNumber?`
- `sourceUrl`, `authors[]`, `tags[]`, `segmentCount`
- `quotes[]` — `{ text, speaker, timestamp? }`

**curtas** — standalone quotes (short-form content):
- `quote`, `speaker`, `context` (episode name or WhatsApp group)
- `sourceType` — `'podcast'` | `'whatsapp'`
- `sourceUrl?`, `pubDate`, `tags[]`

**newsletters** — weekly edition:
- `title`, `subject`, `editionNumber`, `pubDate`, `status`

### Generated content is gitignored

`src/content/episodes/`, `src/content/curtas/`, and `src/content/newsletters/` are in `.gitignore`. They are regenerated on every `npm run sync` from the vault. Never edit them manually.

## Vault — source of truth

The vault directory is a local copy of `~/stromae-vault-alura/` (the `caelum/stromae-vault-alura` repo). It is maintained by the Stromae orchestrator and is gitignored in this project.

### Updating vault content

```bash
# Option 1: git pull the vault repo, then copy
cd ~/stromae-vault-alura && git pull
rsync -av ~/stromae-vault-alura/signals/ ~/hipsters-builders/vault/signals/

# Option 2: symlink (avoids double storage)
rm -rf ~/hipsters-builders/vault/signals
ln -s ~/stromae-vault-alura/signals ~/hipsters-builders/vault/signals
```

After updating the vault, run `npm run sync` to regenerate content collections.

### Signal frontmatter contract

Podcast signals (`vault/signals/podcasts/*.md`):
```yaml
type: signal
source_type: podcast
source_name: hipsters-rss          # or ia-sob-controle-rss, mesa-de-produto-rss, like-a-boss-rss
source_url: https://...
captured_at: 2026-03-08T14:30:00Z
author: Paulo Silveira
authors: [Paulo Silveira, Sergio Lopes]
brand: Alura
tags: [ai, agents, claude]
origin: external
summary: "..."
parent_episode: hipsters-ponto-tech-482   # groups segments together
segment: 3                                # segment number within episode
timestamp_start: "12:30"
timestamp_end: "18:45"
audio_url: https://...                    # for re-transcription without re-fetching RSS
```

WhatsApp signals (`vault/signals/internal/*.md`):
```yaml
type: signal
source_type: internal
source_name: whatsapp-builders-sp-claude-code  # or whatsapp-clauders, whatsapp-ia-sob-controle
captured_at: 2026-03-08T14:30:00Z
authors: [Paulo Silveira, Sergio Lopes]
thread_start: "2026-03-08T14:30:00Z"
thread_end: "2026-03-08T15:45:00Z"
tags: [ai, claude]
```

### Quote format in signal bodies

```
**[Speaker Name · HH:MM]** Message text here...

**[Another Speaker · HH:MM]** Reply text here...
```

This format is parsed by `extractQuotes()` in `sync-content.ts` using the regex:
```
/\*\*\[(.+?)\s*·\s*(\d+:\d+)\]\*\*\s*([\s\S]*?)(?=\n\n\*\*\[|\n\n#|$)/g
```

## Quote extraction rules (critical for quality)

sync-content.ts extracts quotes from signal bodies. Quality rules:

- Minimum length: 80 chars (filters out greetings, intros)
- Maximum length: 500 chars (capped, not truncated mid-sentence)
- Max 3 quotes per speaker per episode (diversity via round-robin selection)
- Sorted by text length (proxy for insight density), preferring 100-300 char range
- For episodes: 5 quotes total, collected across all segments
- For curtas: 1 best quote per segment, top 30 overall (podcast) + top 20 (WhatsApp)
- Filter out greetings ("bom dia", "bem vindos"), meta-commentary ("como a gente falou")
- Prioritize: insights, opinions, data points, surprising takes

## Podcast sources

| Podcast | source_name | In sync | Notes |
|---------|-------------|---------|-------|
| Hipsters Ponto Tech | `hipsters-rss` | Yes | Main podcast |
| IA Sob Controle | `ia-sob-controle-rss` | Yes | AI focus |
| Mesa de Produto | `mesa-de-produto-rss` | No (available in vault) | PM3 podcast |
| Like a Boss | `like-a-boss-rss` | No (available in vault) | Startup interviews |
| Carreira Sem Fronteiras | `carreira-sem-fronteiras-rss` | No | Career focus |

sync-content.ts currently filters to `hipsters-rss` + `ia-sob-controle-rss` only. Other podcasts are in the vault but not synced.

### WhatsApp groups included

| Group | source_name | Members |
|-------|-------------|---------|
| Builders SP: Claude Code | `whatsapp-builders-sp-claude-code` | 951 |
| Clauders | `whatsapp-clauders` | 8 |
| IA Sob Controle | `whatsapp-ia-sob-controle` | 6 |

## Podcast transcription details

Transcriptions are produced by the Stromae orchestrator:
- **Service**: AssemblyAI with speaker diarization
- **Format**: `**[Speaker Name · HH:MM]** text` per speaker turn
- **Segmentation**: episodes are split into ~5-10min segments by topic change (LLM-detected)
- `parent_episode` groups all segments of the same episode
- `_full/` directory has complete unsegmented transcriptions (reference only, not used by sync)
- `audio_url` is saved in signal frontmatter so re-transcription doesn't require re-fetching RSS
- Each signal is one **segment**, not a full episode. "A signal should be referenceable in full by a draft."

## Key people (podcast hosts and frequent guests)

- **Paulo Silveira** — CVO Grupo Alun, Hipsters host
- **Sergio Lopes** — CTO Alura
- **Guilherme Silveira** — CINO/co-founder Alura
- **Fabricio Carraro** — Program Manager Alura, co-host IA Sob Controle
- **Marcus (Marcos) Mendes** — host IA Sob Controle
- **Marcell Almeida** — CEO PM3, host Mesa de Produto

## Design

Three prototype directions at `/design/v1`, `/design/v2`, `/design/v3`:

| Version | Style | Theme | Notes |
|---------|-------|-------|-------|
| V1 (Editorial) | Serif, newspaper-inspired | Light | Current favorite |
| V2 (Linear) | Minimal, list-based, Vercel-inspired | Dark | |
| V3 (Magazine) | Warm, carousels, streaming-inspired | Dark | |

**Important**: Prototypes in `/design/*` are exploratory, not final. They exist for comparison and alignment. The main site pages (`/`, `/episodios`, `/curtas`, `/newsletter`) use the bento grid layout with dark theme (surface: #0f0f13, brand: indigo #6366f1).

## Anti-AI writing rules

When generating any user-facing text (descriptions, summaries, newsletter content):

- No em dashes (---). Use commas or periods instead
- No "rule of three" patterns
- No promotional language ("imperdivel", "incrivel", "revolucionario")
- No AI vocabulary: "transformador", "paradigma", "ecossistema" (when used generically), "sinergia"
- **Post-processing is mandatory**: LLMs consistently ignore em dash rules even with explicit instructions. Always replace programmatically after generation

## Coding conventions

- **Language**: TypeScript ESM, Node.js 22+
- **Code language**: English (variables, types, functions, comments)
- **Content language**: Portuguese (UI text, labels, user-facing strings)
- **Commit messages**: English
- **No N+1**: never fetch N items then make N additional requests. Batch-fetch always
- **Scripts have `--help`**: all CLI scripts must be self-documenting
- **Read docs before guessing**: when an API or library doesn't work as expected, read official docs and source code first. Don't loop through try/fail cycles

## Content counts (as of 2026-03-24)

| Type | Count |
|------|-------|
| Episodes (Hipsters PT + IA Sob Controle, 2025+) | 198 |
| Curtas (podcast quotes) | 30 |
| Curtas (WhatsApp quotes) | 20 |
| Newsletters | 2 |

## TODOs

### Quote curation via LLM (high priority)
Current regex-based heuristics for selecting "best quotes" from WhatsApp threads and podcast segments are insufficient. Greetings, help requests, and job postings still slip through.

**Better approach:** Use Haiku to read full WhatsApp threads and select top 3-5 most impactful messages. Criteria:
- Messages that generated the most replies (engagement signal)
- Messages with links that sparked discussion
- Technical insights, opinions with data, surprising takes
- NOT: greetings, support questions, job seeking, event announcements

**Implementation plan:**
1. In `syncCurtas()`, instead of `extractBestQuote()` per signal, collect all WhatsApp signals for a group
2. Send full thread text to Haiku with prompt: "Pick the 5 most insightful messages from this thread. Return speaker, timestamp, quote text, and why it's interesting."
3. Score by: reply count (if detectable from thread structure), tech term density, opinion markers
4. Cache LLM results to avoid re-calling on every sync

For podcast quotes, similar approach: Haiku reads full episode transcript, picks top 5 quotes that are genuine insights (not intros, not filler).

### Apply V1 editorial design fully
V1 (light, editorial, newspaper-inspired) was chosen as the direction. Inner pages (episodios, curtas, newsletter) already use EditorialLayout. Next:
- Polish responsive layout for mobile
- Add podcast cover images where available
- Episode detail: better quote formatting, segment navigation

## Phases

- **Phase 1 (done)**: Site with episodes, curtas, newsletter archive, RSS feed, sitemap
- **Phase 1.5 (in progress)**: 3 design prototypes (V1 editorial, V2 linear, V3 magazine), editorial inner pages, improved quote extraction
- **Phase 2**: Resend newsletter delivery, subscribe form, GitHub Action (Wednesday sends)
- **Phase 3**: OG images (Satori), share buttons, pagefind search, llms.txt

## Cross-project dependencies

### This project reads from Stromae vault

The vault is the source of truth. This project never writes to it.

**Contract** (what sync-content.ts expects from the vault):
- `signals/podcasts/*.md` — podcast signals with `parent_episode`, `segment`, `source_name`, `source_url`, `captured_at`, `summary`, `tags`, `authors`
- `signals/internal/*.md` — WhatsApp signals with `source_name`, `captured_at`, `thread_start`/`thread_end`
- `drafts/newsletter-hipsters-builders/*.md` — newsletter editions with `subject`, `created_at`, `status`
- Quote format in body: `**[Speaker · HH:MM]** text`

### Related repos

| Repo | Purpose |
|------|---------|
| `caelum/stromae` | Orchestrator that produces the vault content |
| `caelum/stromae-vault-alura` | The vault itself (signals, drafts, voices) |
| `peas/paulo.com.br` | Paulo's blog (separate project, same Astro/Tailwind stack) |

## Newsletter pipeline (F3 — Diálogo split)

Independent flow that lives alongside the stories pipeline. Reads `src/data/stories.json` (already classified + editorialized), picks candidates from a date range, and renders an HTML email in the F3 (Diálogo split) format ready for Resend.

### Files

- **`scripts/newsletter-template.ts`** — pure renderer. Function `renderNewsletterF3(data: NewsletterData): string`. Inline-styled, table-based, mobile-first, ~640px max-width, system fonts, no images. Survives Gmail/Outlook/Apple Mail without modification.
- **`scripts/generate-newsletter.ts`** — LLM-based assembler. Calls `claude-opus-4-6` via **tool_use** to force structured JSON output (avoids fragile JSON-in-text parsing when editorial HTML contains nested quotes). Validates every output quote literally exists in some source `conversation` (anti-fabrication guardrail). Run via `hipsters newsletter`.

### Run

```bash
hipsters newsletter --from 2026-04-01 --to 2026-04-09 --edition 1 --slug newsletter-edicao-01
hipsters newsletter --from 2026-04-01 --print-prompt   # see the system+user prompts (no API call)
hipsters newsletter --from 2026-04-01 --print-data     # see the LLM JSON output (no HTML write)
hipsters newsletter --from 2026-04-01 --dry-run        # full LLM call but skip the file write
```

Outputs to `public/tmp/<slug>.html` by default. After deploy, lives at `https://builders.hipsters.tech/tmp/<slug>.html`.

### What's in the F3 template

- **Pre-header** (hidden inbox preview)
- **Top utility bar**: "Recebeu de um amigo? Inscreva-se" + "Ver no navegador"
- **Cold open** (literal quote with attribution, no preamble)
- **Intro paragraph** (default explains the format without naming WhatsApp/Telegram by name)
- **3-5 editorial blocks**, each with:
  - Header that carries voice (not a label)
  - Editorial paragraphs (HTML, with `<em>` on literal quotes and `<a>` on links)
  - Optional "No grupo" callout with literal community messages (handles + quote text in italic)
- **Closing dark block** (the blue-bg highlight). Originally "A mensagem que ninguém respondeu" — now generic so the editor can use it for a closing curta, a forgotten note, a small but curious item. Title and eyebrow are configurable per edition.
- **Sign-off** with footnote
- **Email footer**: unsubscribe + preferences + view in browser + reply, permission reminder, sender address (CAN-SPAM / LGPD)

### Anti-fabrication rules baked into the prompt

1. NEVER invent quotes, authors, dates, links, numbers, or facts not in the input
2. Every quote in the output must appear EXACTLY in some `conversation[].text` (validator enforces this post-call and warns)
3. URLs only from `story.links[].url` or literal URLs in conversation text — never invent
4. Don't normalize capitalization, fix typos, or "polish" quotes
5. Skip stories that are confused or short on material
6. Don't name WhatsApp/Telegram groups by name — use "no canal", "alguém anotou", "Paulo escreveu na semana passada"

### Source priority (telegram-editorial vs chat)

Stories whose `id` starts with `story-tg-` or whose `sourceGroups` matches `/Telegram/i` are tagged `source_kind: "telegram-editorial"` — these are the long editorial texts Paulo and Vinny write on the Telegram broadcast channel and they should anchor the bigger blocks. Chat stories (WhatsApp) provide reaction quotes for the "No grupo" callouts, or anchor smaller blocks when the discussion was rich.

The script sorts candidates with `telegram-editorial` first, then by weight desc, before sending to Opus.

### Cost

~$0.55 per edition with `claude-opus-4-6` (16k input tokens, 4k output tokens). Pricing assumed: $15/M input, $75/M output. The `--print-prompt` and `--dry-run` flags let you iterate without spending.

### Lessons from edition 1 (2026-04-09)

**The manual mockups still beat the LLM on quote curation.** The 3 manual F1/F2/F3 mockups in `public/tmp/format-{1,2,3}-*.html` were written by hand, and Paulo preferred their selection of quotes and phrasing over the Opus-generated edition 1. Reasons to internalize:

- **Manual picks the punchier quotes.** Heuristics like "shortest message between 25-200 chars" miss the punch line. Manual went for "todo mundo com github verdinho mas comitando onde nao precisa", "Estão sangrando MESMO", "balela demais né". Opus picked safer, more obvious quotes.
- **Opus over-indexes on meta auto-reference.** Edition 1 had a full block on "essa newsletter foi feita pelo sistema do Karpathy" — too much. Cap meta references at 1 brief mention, not a whole block.
- **Manual mockups have rhythm variation between blocks** (one long + one short + one editorial + one closing). Opus tends to make every block the same length and density.
- **Opus headers are short and punchy** (good) but sometimes too distant from the content (ex: "Quem paga a conta é o ecossistema" works, but loses the specificity that "todo mundo com github verdinho" had as a header in the manual version).
- **Opus closing pick was OK but not surprising.** "1bi commits" was the obvious closing. Manual would have picked "Mark Zuckerberg voltou a programar" — more surprising, more "ah, e mais uma".
- **Manual has explicit thesis per block.** Opus has implicit thesis. Make the prompt require an explicit one-sentence thesis per block before the LLM writes the editorial.

**Iteration ideas for the prompt** (for next time, not a TODO yet):
- Tell Opus to prefer quotes with slang, irony, or cynical observation over "safe" technical statements
- Require an explicit one-line thesis per block as scratch reasoning before writing
- Cap auto-meta references to 1 brief mention max
- Explicitly ask for rhythm variation: not all blocks the same length
- Allow human override per block via `--block-1-id`, `--block-2-id`, etc., so the editor can lock the key picks before Opus writes

**Hybrid is the realistic path**: LLM does plumbing (template, structure, validation, links, footer), human does the curation pass on `--print-data` JSON before rendering. Or: LLM proposes 3 versions with different selections, human picks one.

### Files written this session (2026-04-09 → 2026-04-10)

- `scripts/hipsters.ts` — unified CLI (subcommands: sync, signals, editorialize, classify, stories, newsletter, build, status)
- `scripts/newsletter-template.ts` — F3 renderer
- `scripts/generate-newsletter.ts` — Opus generator with anti-fabrication validator
- `public/tmp/format-{1,2,3}-*.html` — 3 manual mockups (kept as canonical reference for tone)
- `public/tmp/newsletter-edicao-01.html` — first Opus-generated edition
- `public/tmp/index.html` — preview index

The 3 manual mockups in `public/tmp/format-*.html` are the canonical voice reference. Use them when calibrating future prompt versions.
