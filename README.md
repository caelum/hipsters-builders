# Hipsters.builders

O **Hipsters Builders** deixa mais explicito o que estamos falando em cada episodio dos podcasts da Hipsters Network. Alem disso, traz comentarios da comunidade Hipsters (WhatsApp Builders, Clauders e outros canais) para dentro de uma pagina, criando uma verdadeira conversa entre as pessoas da comunidade.

Na pratica: episodios com destaques e quotes, curtas com as melhores frases, e uma newsletter semanal. Todo conteudo vem do [Stromae vault](https://github.com/caelum/stromae-vault-alura) no build.

**Site**: https://hipsters.builders

## Quick start

```bash
# Requirements: Node.js >= 22.12.0

# 1. Install dependencies
npm install

# 2. Clone the Stromae vault (content source)
#    The vault has podcast transcriptions, WhatsApp threads, and newsletter
#    drafts. Without it there's no content to build. You need access to
#    caelum/stromae-vault-alura on GitHub.
git clone git@github.com:caelum/stromae-vault-alura.git ~/stromae-vault-alura

# 3. Configure Anthropic API key (used by editorialize/classify steps)
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 4. Build everything: sync content + generate stories
npm run hipsters -- build

# 5. Run dev server (port 5332)
npm run dev
```

## The `hipsters` CLI

Single entry point for the whole content pipeline. Each subcommand wraps
one of the underlying scripts in `scripts/`. Run `--help` on any command
for details, options, and examples.

```bash
npm run hipsters -- --help                      # global help
npm run hipsters -- <command> --help            # per-command help
```

| Command | What it does |
|---------|--------------|
| `hipsters sync` | Vault → Astro content collections (episodes, curtas, newsletters, media) |
| `hipsters signals` | Build `signals.json` / `stories.json` / `graph.json` from the vault (fast, no LLM) |
| `hipsters editorialize` | Editorial pass on stories with Sonnet (titles, lede, body) |
| `hipsters classify` | Sensitivity classification with Haiku (public vs private) |
| `hipsters stories` | `signals` + `editorialize` + `classify` (the "generate news" flow) |
| `hipsters build` | `sync` + `stories` — full pipeline |
| `hipsters status` | Show counts: signals, stories, editorial, public, private |

### Common options

| Option | Where it applies | Notes |
|--------|------------------|-------|
| `--vault <path>` | sync, signals, build | Default `~/stromae-vault-alura` |
| `--from <YYYY-MM-DD>` | editorialize, classify, stories | LLM steps only — older stories are left untouched |
| `--to <YYYY-MM-DD>` | editorialize, classify, stories | |
| `--limit <N>` | editorialize, classify, stories | Cap LLM calls after the date filter |
| `--force` | editorialize, classify, stories | Re-process stories that were already done |
| `--dry-run` | all | Run everything but don't write files |

### Examples

```bash
# Generate news for the last week
npm run hipsters -- stories --from 2026-04-01

# Preview what would be editorialized in a date range (no writes)
npm run hipsters -- editorialize --from 2026-04-01 --to 2026-04-08 --dry-run

# Re-classify a single story to test the prompt
npm run hipsters -- classify --limit 1 --force

# Cheap re-classify pass on a date range (skip the expensive editorial step)
npm run hipsters -- stories --skip-signals --skip-editorialize --from 2026-04-01

# Quick health check
npm run hipsters -- status
```

> Tip: after `npm install` you can also call the CLI directly via `npx hipsters <command>`
> from the project root, since `hipsters` is exposed as a `bin`.

### Underlying scripts

The standalone scripts still work — `hipsters` is just a thin wrapper:

| Script | Wrapped by |
|--------|------------|
| `scripts/sync-content.ts` | `hipsters sync` |
| `scripts/build-signals.ts` | `hipsters signals` |
| `scripts/editorialize-stories.ts` | `hipsters editorialize` |
| `scripts/classify-stories.ts` | `hipsters classify` |

## NPM scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on `localhost:5332` |
| `npm run hipsters -- <cmd>` | Unified content pipeline CLI (see above) |
| `npm run sync` | Alias of `hipsters sync` (legacy) |
| `npm run build-signals` | Alias of `hipsters signals` (legacy) |
| `npm run build` | `sync` + `build-signals` + `astro build` (production site) |
| `npx astro preview` | Preview production build |

## Environment

`.env` in the project root (or `~/pkm/.env` if you also work on the PKM repo) is loaded automatically:

| Variable | Required for | Notes |
|----------|--------------|-------|
| `ANTHROPIC_API_KEY` | `editorialize`, `classify`, `stories`, `build` | LLM passes |
| `PUBLIC_SUBSCRIBE_URL` | deploy | Newsletter signup form URL |
| `RESEND_API_KEY` | newsletter sending (Phase 2) | Optional |
| `RESEND_AUDIENCE_ID` | newsletter sending (Phase 2) | Optional |
| `RESEND_FROM_EMAIL` | newsletter sending (Phase 2) | Optional |

## Architecture

```
Stromae vault (signals/, drafts/)
  | npm run sync
  v
src/content/          <-- gitignored, regenerated on every sync
  episodes/           <-- 1 .md per podcast episode
  curtas/             <-- best quotes from podcasts + WhatsApp
  newsletters/        <-- weekly editions
public/media/whatsapp/ <-- images from WhatsApp threads (gitignored)
  | npm run build
  v
dist/                 <-- static site (GitHub Pages)
```

## Stack

- **Framework**: [Astro 6](https://astro.build/) (SSG)
- **Styling**: [Tailwind v4](https://tailwindcss.com/) (CSS-first)
- **Design**: Editorial (light, serif, newspaper-inspired)
- **Content source**: Stromae vault (read-only at build time)
- **Deploy**: GitHub Pages (planned)

## Content sources

| Source | Type | Count |
|--------|------|-------|
| Hipsters Ponto Tech | Podcast | ~100 episodes |
| IA Sob Controle | Podcast | ~100 episodes |
| WhatsApp Builders SP | Community | ~20 curtas |
| WhatsApp Clauders | Community | curtas |

## Related repos

| Repo | Description |
|------|-------------|
| [caelum/stromae](https://github.com/caelum/stromae) | Content orchestrator |
| [caelum/stromae-vault-alura](https://github.com/caelum/stromae-vault-alura) | Vault (signals, drafts, voices) |
