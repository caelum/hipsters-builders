---
name: Project status
description: Hipsters Builders current state, architecture decisions, and next steps
type: project
---

## Current state (2026-03-30)

**Pivot**: Site changed from podcast portal to **newsletter landing page** for the Brazilian builder community.

**Live at**: https://caelum.github.io/hipsters-builders/ (GitHub Pages, public repo)
**Repo**: caelum/hipsters-builders (public). viniciosneves has push access.

**What's deployed**:
- Newsletter landing page (warm paper/clay design, Space Grotesk + Source Sans 3)
- BETA badge
- Email capture form (UI ready, no backend yet)
- No newsletter editions yet (section hidden)
- Dev server port: 3323

**What's in the repo but not deployed**:
- Curtas page (/curtas) — internal, for future newsletter generation
- Episode pages (/episodios) — kept for now, will move to generator repo
- Design prototypes (/design/v1, v2, v3) — reference only
- sync-content.ts + tag-taxonomy.ts — content pipeline
- Cloudflare Worker in workers/subscribe.ts (not deployed yet)

## Architecture decision: split repos

| Repo | Visibility | Purpose |
|------|-----------|---------|
| `caelum/hipsters-builders` | Public | Static newsletter site (landing + editions) |
| `caelum/hipsters-builders-generator` | Private (TODO) | Vault, sync, transcripts, AI newsletter generation |

**Why:** Vault contains 383MB of podcast transcriptions and WhatsApp threads. Must not be public.

## Resend setup

- API key in `.env` (gitignored): `re_DkHjgkmD_...`
- Audience: "Hipsters Builders" ID `1f0625e7-1208-4c1b-8a94-60c2ca2437e8`
- 3 test contacts in audience
- Domain `hipsters.tech` NOT verified yet (emails come from onboarding@resend.dev)
- From email will be `builders@hipsters.tech` once domain is verified

## TODOs

1. **Deploy Cloudflare Worker** for subscribe endpoint (workers/subscribe.ts ready)
2. **Create hipsters-builders-generator** repo (private) with vault, sync, transcripts
3. **Verify hipsters.tech** domain in Resend
4. **Set up hipsters.tech/builders** redirect to GitHub Pages
5. **Newsletter generation with AI** using curtas/transcripts as source material
6. **Double opt-in** (implement later, HMAC approach documented)

## Design

- Base: Builders SP warm paper (#f5f1e8) + clay accent (#c56e4a)
- Brand dot stays red (#c4342d)
- Fonts: Space Grotesk (display), Source Sans 3 (body), IBM Plex Mono (labels), Source Serif 4 (brand)
- Left-aligned editorial layout (not centered)
- Self-contained page (no Astro layout wrapper, uses `<style is:inline>`)
