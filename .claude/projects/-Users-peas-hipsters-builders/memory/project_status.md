---
name: Project status
description: Hipsters Builders phase 1.5 progress, repo at caelum/hipsters-builders, key decisions
type: project
---

Repo created at caelum/hipsters-builders (private) on 2026-03-28.
viniciosneves added as collaborator (push access, invitation sent).

Phase 1.5 complete:
- Editorial design (V1 light/serif) chosen and applied to all inner pages
- Bento grid for curtas with variable card sizes
- Spotify embed for IA Sob Controle episodes
- Inline markdown rendering in quotes (bold, italic, links, images)
- Quote scoring bonus for images and links
- sync-content.ts copies referenced WhatsApp images to public/media/whatsapp/
- Dev server fixed at port 5332

**Why:** V1 editorial was chosen because it best fits the content-first, newspaper-inspired vision for the site.

**How to apply:** All new pages should use EditorialLayout, not BaseLayout. Design prototypes at /design/* are for reference only.
