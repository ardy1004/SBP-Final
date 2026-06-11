// sanitize.js — Sanitasi HTML ringan tanpa dependency, aman untuk Cloudflare Workers.
// Library populer (sanitize-html, isomorphic-dompurify) butuh Node API / jsdom yang
// TIDAK tersedia di Workers runtime, jadi kita pakai pendekatan regex defensif.
//
// Konteks: konten blog ditulis oleh admin terpercaya (bukan input publik), jadi tujuan
// utamanya defense-in-depth — mencegah stored XSS jika akun admin di-compromise.
//
// Dipakai di:
//   - functions/api/admin/blog/index.js  (POST  — sanitasi saat simpan)
//   - functions/api/admin/blog/[id].js   (PATCH — sanitasi saat update)
// Versi kembar untuk render ada di src/lib/sanitize.ts (defense-in-depth saat render).

const BLOCK_ELEMENTS = 'script|style|iframe|object|embed|noscript|template';
const STRIP_TAGS = 'script|style|iframe|object|embed|noscript|template|form|meta|link|base';

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || !html) return '';
  let out = html;

  // 1) Hapus elemen berbahaya BESERTA isinya (script/style/iframe/...)
  out = out.replace(
    new RegExp(`<(${BLOCK_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'),
    ''
  );

  // 2) Hapus tag pembuka/penutup berbahaya yang tersisa (tanpa pasangan)
  out = out.replace(new RegExp(`<\\/?(?:${STRIP_TAGS})\\b[^>]*>`, 'gi'), '');

  // 3) Hapus atribut event handler on* (onclick, onerror, onload, dll)
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');

  // 4) Netralkan protokol berbahaya pada href/src/xlink:href
  //    (javascript:, vbscript:, data: kecuali data:image/ untuk gambar inline)
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
