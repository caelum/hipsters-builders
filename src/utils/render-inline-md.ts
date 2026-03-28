/**
 * Renders inline markdown to HTML for quote text.
 *
 * Supports:
 * - **bold** → <strong>
 * - *italic* → <em>
 * - ![alt](url) → <img> (rewrites media/ paths to /media/whatsapp/)
 * - [text](url) → <a>
 * - bare URLs → <a>
 * - \n\n → <br><br> (paragraph breaks)
 */
export function renderInlineMd(text: string): string {
  let html = escapeHtml(text);

  // Images: ![alt](media/file.jpg) → <img src="/media/whatsapp/file.jpg">
  html = html.replace(
    /!\[([^\]]*)\]\((media\/[^)]+)\)/g,
    (_match, alt, src) => {
      const publicSrc = src.replace('media/', '/media/whatsapp/');
      return `<img src="${publicSrc}" alt="${alt}" class="quote-img" loading="lazy" />`;
    },
  );

  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );

  // Bold: **text** (must come before italic)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Bare URLs (not already inside href or src)
  html = html.replace(
    /(?<!href="|src=")(https?:\/\/[^\s<)"]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>',
  );

  // Paragraph breaks
  html = html.replace(/\n\n+/g, '<br><br>');
  html = html.replace(/\n/g, ' ');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
