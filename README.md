# Hipsters.builders

Community portal for the **Hipsters Network** (Alura podcasts + community). Publishes episode summaries with quotes, short-form "curtas", and a weekly newsletter. All content comes from the [Stromae vault](https://github.com/caelum/stromae-vault-alura) at build time.

**Live site**: https://hipsters.builders

## Quick start

```bash
# Requirements: Node.js >= 22.12.0

# 1. Install dependencies
npm install

# 2. Set up the vault (content source)
# Option A: symlink from existing vault clone
ln -s ~/stromae-vault-alura/signals vault/signals
ln -s ~/stromae-vault-alura/drafts vault/drafts

# Option B: clone the vault into ./vault/
git clone git@github.com:caelum/stromae-vault-alura.git vault-repo
ln -s vault-repo/signals vault/signals
ln -s vault-repo/drafts vault/drafts

# 3. Sync content from vault to Astro content collections
npm run sync

# 4. Run dev server (port 5332)
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on `localhost:5332` |
| `npm run sync` | Vault to content collections (episodes, curtas, newsletters, media) |
| `npm run build` | Sync + production build |
| `npx astro preview` | Preview production build |

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
