// sanitize.ts — Versi client/SSR dari functions/_lib/sanitize.js.
// Sanitasi HTML ringan tanpa dependency (aman di Workers SSR maupun browser).
// Dipakai di src/app/routes/blog-detail.tsx sebagai defense-in-depth saat render
// konten blog (dangerouslySetInnerHTML). Logika identik dengan versi backend.

const BLOCK_ELEMENTS = 'script|style|iframe|object|embed|noscript|template';
const STRIP_TAGS = 'script|style|iframe|object|embed|noscript|template|form|meta|link|base';

export function sanitizeHtml(html: string | null | undefined): string {
  if (typeof html !== 'string' || !html) return '';
  let out = html;

  // 1) Hapus elemen berbahaya beserta isinya
  out = out.replace(
    new RegExp(`<(${BLOCK_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'),
    ''
  );

  // 2) Hapus tag pembuka/penutup berbahaya yang tersisa
  out = out.replace(new RegExp(`<\\/?(?:${STRIP_TAGS})\\b[^>]*>`, 'gi'), '');

  // 3) Hapus atribut event handler on*
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');

  // 4) Netralkan protokol berbahaya pada href/src (data:image/ tetap diizinkan)
  out = out.replace(
    /\s(href|src|xlink:href)\s*=\s*"(?:\s*(?:javascript|vbscript):|\s*data:(?!image\/))[^"]*"/gi,
    ' $1="#"'
  );
  out = out.replace(
    /\s(href|src|xlink:href)\s*=\s*'(?:\s*(?:javascript|vbscript):|\s*data:(?!image\/))[^']*'/gi,
    " $1='#'"
  );

  return out;
}
