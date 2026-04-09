/**
 * newsletter-template.ts — F3 (Diálogo split) HTML renderer
 *
 * Pure function that renders the Hipsters Builders newsletter in
 * format F3 from a typed data object. Used by both:
 *   - scripts/generate-newsletter.ts (CLI) to produce previews and
 *     test sends
 *   - the future Resend integration to produce the actual outgoing
 *     emails
 *
 * The template is intentionally inline-styled and table-based so it
 * survives Gmail/Outlook/Apple Mail without modification. Width
 * 640px max, system fonts, no images, no media queries (mobile Gmail
 * supports them but desktop Outlook does not, so we design mobile-
 * first and let the base styles work everywhere).
 */

export interface NewsletterMessage {
  /** Author handle/name as it appears in the message */
  author: string;
  /** Literal message text — no paraphrasing */
  text: string;
  /** Optional context shown in italics next to the author */
  context?: string;
}

export interface NewsletterBlock {
  /** Section title (the H2) */
  title: string;
  /**
   * Editorial paragraph(s) — analytical tone, may include inline links
   * and <em>...</em> for cited quotes. Should be HTML, not markdown.
   */
  editorialHtml: string;
  /**
   * Optional literal community quotes block (the "No grupo" callout).
   * Omit when the block is built around a long Telegram editorial and
   * doesn't need a separate chat callout.
   */
  groupMessages?: NewsletterMessage[];
  /** Optional second batch of group messages, shown after a connector */
  groupMessages2?: NewsletterMessage[];
  /** Connector paragraph between groupMessages and groupMessages2 */
  connectorText?: string;
  /** Optional kicker line rendered after the group block */
  kicker?: string;
}

/**
 * The dark closing block. Originally "A mensagem que ninguém
 * respondeu"; now generic so the editor can use it for a closing
 * curta, a forgotten thread, a small but curious item, etc.
 */
export interface NewsletterClosing {
  /** Section title shown in the closing block (e.g., "Pra fechar") */
  title: string;
  /** One-line eyebrow above the title */
  eyebrow: string;
  /** Optional intro paragraph above the quote */
  intro?: string;
  /** Literal quote(s) shown in the highlight box */
  messages: NewsletterMessage[];
  /** Editorial framing of the closing item */
  context: string;
  /** Optional CTA at the bottom of the closing block */
  cta?: string;
}

export interface NewsletterData {
  /** Edition number (e.g., "1") */
  edition: number | string;
  /** Date range subtitle, e.g. "30 de março a 7 de abril de 2026" */
  dateRange: string;
  /** Tagline below the masthead */
  tagline: string;
  /** Pre-header text shown in inbox preview (45-110 chars ideal) */
  preheader: string;
  /** Optional intro paragraph after the cold open (override default) */
  introParagraph?: string;
  /** Cold open quote (literal) */
  coldOpen: NewsletterMessage;
  /** Section blocks — usually 3 to 5 */
  blocks: NewsletterBlock[];
  /** Closing dark block (was "A mensagem que ninguém respondeu") */
  closing: NewsletterClosing;
  /** Sign-off attribution, e.g. "Paulo e Vinny" */
  signoff: string;
  /** Footnote shown after the sign-off */
  signoffFootnote: string;

  /** ── Email plumbing (best practices) ── */

  /** Public URL to view this edition in browser (CRITICAL — first thing in email) */
  webViewUrl: string;
  /** Subscribe URL (for "forwarded by a friend?" link) */
  subscribeUrl: string;
  /** Unsubscribe URL (CAN-SPAM / LGPD requirement) */
  unsubscribeUrl: string;
  /** Update preferences URL (optional but standard) */
  preferencesUrl?: string;
  /** Reply email shown in the "responde esse email" CTA */
  replyEmail: string;
  /** Physical sender address (CAN-SPAM / LGPD requirement) */
  senderAddress: string;
  /** Reason the recipient is receiving this email */
  permissionReminder: string;
}

// ── Helpers ──

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render an inline message inside a callout block. The text is
 * italicized to signal it's a literal quote (per Paulo's request).
 */
function renderMessage(msg: NewsletterMessage, isLast: boolean): string {
  const ctx = msg.context
    ? ` <span style="font-size:13px;color:#888;font-style:normal;">(${esc(msg.context)}):</span>`
    : ":";
  const margin = isLast ? "0" : "0 0 14px";
  return `<div style="margin:${margin};"><strong style="color:#1a1a1a;font-style:normal;">${esc(msg.author)}</strong>${ctx} <em style="color:#2a2a2a;">${esc(msg.text)}</em></div>`;
}

function renderMessages(messages: NewsletterMessage[]): string {
  return messages
    .map((m, i) => renderMessage(m, i === messages.length - 1))
    .join("\n");
}

function renderBlock(block: NewsletterBlock, index: number): string {
  const groupBlock = (msgs: NewsletterMessage[]) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f3e8;border-left:3px solid #c6361b;margin:0 0 8px;">
<tr><td style="padding:18px 22px;font-size:15px;line-height:1.6;color:#2a2a2a;">
${renderMessages(msgs)}
</td></tr>
</table>`.trim();

  const hasGroup = !!(block.groupMessages && block.groupMessages.length > 0);

  const groupSection = hasGroup
    ? `
<div style="margin-bottom:8px;margin-top:24px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#9b2c1a;">No grupo</div>
${groupBlock(block.groupMessages!)}`
    : "";

  const second = block.groupMessages2
    ? `
<p style="margin:18px 0 8px;font-size:15px;line-height:1.65;color:#5a5a5a;">${esc(block.connectorText || "")}</p>
${groupBlock(block.groupMessages2)}`
    : "";

  const kicker = block.kicker
    ? `\n<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#5a5a5a;font-style:italic;">${esc(block.kicker)}</p>`
    : "";

  return `
<!-- ============ BLOCO ${index + 1} ============ -->
<h2 style="margin:${index === 0 ? "0" : "48px"} 0 18px;font-size:23px;line-height:1.3;font-weight:700;color:#1a1a1a;">${index + 1}. ${esc(block.title)}</h2>

${block.editorialHtml}${groupSection}${second}${kicker}
`.trim();
}

// ── Main render ──

export function renderNewsletterF3(d: NewsletterData): string {
  const blocksHtml = d.blocks.map((b, i) => renderBlock(b, i)).join("\n\n");

  const closingMessages = d.closing.messages
    .map(
      (m, i) => `
<div style="margin:${i === d.closing.messages.length - 1 ? "0" : "0 0 12px"};font-size:15px;line-height:1.6;color:#fefdf9;"><strong style="font-style:normal;">${esc(m.author)}</strong>${m.context ? ` <span style="font-size:13px;color:#a8c5e8;font-style:normal;">(${esc(m.context)}):</span>` : ":"} <em>${esc(m.text)}</em></div>`,
    )
    .join("");

  const introHtml = d.introParagraph
    ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#5a5a5a;">${d.introParagraph}</p>`
    : `<p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#5a5a5a;">Hipsters Builders é uma newsletter feita pelas pessoas que formam a comunidade do Builders, através de suas trocas de mensagens, links e comentários ao longo da semana. A gente lê tudo, edita, e devolve aqui com algum recorte editorial.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hipsters Builders nº ${esc(String(d.edition))}</title>
</head>
<body style="margin:0;padding:0;background:#eeeae0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">

<!-- Pre-header (hidden, shown in inbox preview only) -->
<div style="display:none;font-size:1px;color:#eeeae0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
${esc(d.preheader)}
&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
</div>

<!-- Top utility bar: view in browser + forwarded by friend? -->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;">
<tr><td style="padding:14px 36px 0;font-size:12px;color:#7a7466;line-height:1.5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="left" style="font-size:12px;color:#7a7466;">
Recebeu de um amigo? <a href="${esc(d.subscribeUrl)}" style="color:#1d3557;text-decoration:underline;">Inscreva-se</a>
</td>
<td align="right" style="font-size:12px;color:#7a7466;">
<a href="${esc(d.webViewUrl)}" style="color:#1d3557;text-decoration:underline;">Ver no navegador</a>
</td>
</tr>
</table>
</td></tr>
</table>

<!-- Main email body -->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;background:#fefdf9;">
<tr><td style="padding:48px 36px 48px;">

<!-- masthead -->
<div style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#1d3557;">Hipsters Builders &nbsp;·&nbsp; nº ${esc(String(d.edition))}</div>
<div style="margin:0 0 36px;font-size:14px;color:#6b6b6b;font-style:italic;">${esc(d.tagline)}</div>

<!-- cold open -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
<tr>
<td style="padding:0 0 0 18px;border-left:3px solid #1d3557;">
<div style="font-size:20px;line-height:1.5;font-style:italic;color:#1a1a1a;">"${esc(d.coldOpen.text)}"</div>
<div style="margin-top:10px;font-size:13px;color:#888;">— ${esc(d.coldOpen.author)}${d.coldOpen.context ? ", " + esc(d.coldOpen.context) : ""}.</div>
</td>
</tr>
</table>

${introHtml}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
<tr><td style="border-top:1px solid #d9d4c5;line-height:0;">&nbsp;</td></tr>
</table>

${blocksHtml}

<!-- ============ CLOSING DARK BLOCK ============ -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:56px 0 0;">
<tr><td style="background:#1d3557;padding:32px 28px;border-radius:6px;">

<div style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a8c5e8;">${esc(d.closing.eyebrow)}</div>
<h3 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:#fefdf9;">${esc(d.closing.title)}</h3>

${d.closing.intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#d4dde9;">${d.closing.intro}</p>` : ""}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.08);border-left:3px solid #f4c542;margin:0 0 18px;">
<tr><td style="padding:16px 20px;">${closingMessages}
</td></tr>
</table>

<p style="margin:0 0 ${d.closing.cta ? "18px" : "0"};font-size:15px;line-height:1.6;color:#d4dde9;">${d.closing.context}</p>

${d.closing.cta ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#fefdf9;">${d.closing.cta}</p>` : ""}

</td></tr>
</table>

<!-- signoff -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:48px 0 0;">
<tr><td style="border-top:2px solid #1d3557;padding-top:24px;">
<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3a3a;"><em>${esc(d.signoff)} — Hipsters Builders.</em></p>
<p style="margin:0;font-size:13px;line-height:1.55;color:#6b6b6b;font-style:italic;">${esc(d.signoffFootnote)}</p>
</td></tr>
</table>

</td></tr>
</table>

<!-- Footer: legal + unsubscribe + permission reminder -->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;">
<tr><td style="padding:24px 36px 48px;font-size:12px;line-height:1.6;color:#7a7466;text-align:center;">

<p style="margin:0 0 14px;">
<a href="${esc(d.unsubscribeUrl)}" style="color:#7a7466;text-decoration:underline;">Cancelar inscrição</a>
${d.preferencesUrl ? ` &nbsp;·&nbsp; <a href="${esc(d.preferencesUrl)}" style="color:#7a7466;text-decoration:underline;">Atualizar preferências</a>` : ""}
&nbsp;·&nbsp; <a href="${esc(d.webViewUrl)}" style="color:#7a7466;text-decoration:underline;">Ver no navegador</a>
&nbsp;·&nbsp; <a href="mailto:${esc(d.replyEmail)}" style="color:#7a7466;text-decoration:underline;">Responder</a>
</p>

<p style="margin:0 0 10px;color:#9a9485;">${esc(d.permissionReminder)}</p>

<p style="margin:0;color:#9a9485;">Hipsters Builders &nbsp;·&nbsp; ${esc(d.senderAddress)}</p>

</td></tr>
</table>

</body>
</html>
`;
}
