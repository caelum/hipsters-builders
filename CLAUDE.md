# CLAUDE.md — Hipsters Builders

## What is this

Portal/comunidade da Hipsters Network. Publica resumos de episódios de podcast, quotes curtos e uma newsletter semanal. O conteúdo vem do vault do Stromae (`~/stromae-vault-alura`) em build time.

## Stack

- **Framework**: Astro 6 (SSG)
- **Styling**: Tailwind v4 (CSS-first via `@tailwindcss/vite`)
- **Deploy**: GitHub Pages (planned)
- **Newsletter**: Resend (Phase 2)
- **Content source**: Stromae vault (read-only, build time)

## Commands

```bash
npm run sync     # vault → content collections (episodes, curtas, newsletters)
npm run dev      # dev server (port 4321)
npm run build    # sync + astro build
```

### sync-content.ts options

```bash
npx tsx scripts/sync-content.ts --help
npx tsx scripts/sync-content.ts --dry-run          # preview
npx tsx scripts/sync-content.ts --since 2024-01-01 # change date filter
npx tsx scripts/sync-content.ts --vault ~/other     # different vault path
```

## Content pipeline

```
Stromae vault (signals/, drafts/)
  ↓ sync-content.ts
src/content/
  episodes/    # 1 .md per podcast episode (grouped by parent_episode)
  curtas/      # best quotes from podcast segments + WhatsApp threads
  newsletters/ # copied from vault drafts/newsletter-hipsters-builders/
  ↓ astro build
dist/ (static site)
```

## Content types

| Type | Source | Count (as of 2026-03-24) |
|------|--------|--------------------------|
| Episodes | Hipsters Ponto Tech + IA Sob Controle (2025+) | 198 |
| Curtas (podcast) | Best quotes from podcast segments | 30 |
| Curtas (WhatsApp) | Builders SP, Clauders, IA SC groups | 20 |
| Newsletters | Stromae drafts | 2 |

## Cross-project dependency

This project reads from `~/stromae-vault-alura/` at build time. The vault is the source of truth.

**Contract:**
- `signals/podcasts/*.md` — podcast signals with `parent_episode`, `segment`, `source_name` fields
- `signals/internal/*.md` — WhatsApp signals with `source_name`, `thread_start`/`thread_end`
- `drafts/newsletter-hipsters-builders/*.md` — newsletter editions with `subject`, `created_at`
- Signal format: `**[Speaker · HH:MM]** text` for quotes

## Design

- Dark theme (surface: #0f0f13, brand: indigo #6366f1)
- Bento grid layout with variable card sizes
- Responsive: 1 col mobile, 2 col tablet, 3 col desktop

## Phases

- **Phase 1 (done)**: Site with episodes, curtas, bento grid, newsletter archive
- **Phase 2**: Resend newsletter delivery, subscribe form, GitHub Action (wednesdays)
- **Phase 3**: OG images (Satori), share buttons, RSS, llms.txt, search (pagefind)
