// sanitize.ts — Versi client/SSR dari functions/_lib/sanitize.js.
// Sanitasi HTML ringan tanpa dependency (aman di Workers SSR maupun browser).
// Dipakai di src/app/routes/blog-detail.tsx sebagai defense-in-depth saat render
// konten blog (dangerouslySetInnerHTML). WAJIB dijaga identik dengan versi backend.

const BLOCK_ELEMENTS = 'script|style|iframe|object|embed|noscript|template|svg|math';
const STRIP_TAGS = 'script|style|iframe|object|embed|noscript|template|form|meta|link|base|svg|math';

export function sanitizeHtml(html: string | null | undefined): string {
  if (typeof html !== 'string' || !html) return '';
  let out = html;

  const blockRe = new RegExp(`<(${BLOCK_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
  const stripRe = new RegExp(`<\\/?(?:${STRIP_TAGS})\\b[^>]*>`, 'gi');

  // 1+2) Hapus elemen berbahaya beserta isinya, lalu sisa tag pembuka/penutupnya.
  //      Diulang sampai stabil (maks 5x) untuk melawan tag bersarang obfuscated.
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out.replace(blockRe, '').replace(stripRe, '');
    if (out === before) break;
  }

  // 3) Hapus atribut event handler on* — separator [\s/] menangkap <img/onerror=...>
  out = out.replace(/[\s/]+on\w+\s*=\s*"[^"]*"/gi, ' ');
  out = out.replace(/[\s/]+on\w+\s*=\s*'[^']*'/gi, ' ');
  out = out.replace(/[\s/]+on\w+\s*=\s*[^\s>]+/gi, ' ');

  // 4) Netralkan protokol berbahaya pada href/src (data:image/ tetap diizinkan)
  out = out.replace(
    /\s(href|src|xlink:href)\s*=\s*"(?:\s*(?:javascript|vbscript):|\s*data:(?!image\/))[^"]*"/gi,
    ' $1="#"'
  );
  out = out.replace(
    /\s(href|src|xlink:href)\s*=\s*'(?:\s*(?:javascript|vbscript):|\s*data:(?!image\/))[^']*'/gi,
    " $1='#'"
  );

  // 5) Netralkan atribut style dengan vektor lawas (javascript:/expression())
  out = out.replace(/\sstyle\s*=\s*"[^"]*(?:javascript:|expression\s*\()[^"]*"/gi, ' ');
  out = out.replace(/\sstyle\s*=\s*'[^']*(?:javascript:|expression\s*\()[^']*'/gi, ' ');

  return out;
}
