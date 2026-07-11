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
// Versi kembar untuk render ada di src/lib/sanitize.ts — WAJIB dijaga identik.

const BLOCK_ELEMENTS = 'script|style|iframe|object|embed|noscript|template|svg|math';
const STRIP_TAGS = 'script|style|iframe|object|embed|noscript|template|form|meta|link|base|svg|math';

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || !html) return '';
  let out = html;

  const blockRe = new RegExp(`<(${BLOCK_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
  const stripRe = new RegExp(`<\\/?(?:${STRIP_TAGS})\\b[^>]*>`, 'gi');

  // 1+2) Hapus elemen berbahaya BESERTA isinya, lalu sisa tag pembuka/penutupnya.
  //      Diulang sampai stabil (maks 5x) agar tag bersarang obfuscated seperti
  //      `<scr<script>ipt>` tidak tersusun ulang menjadi tag aktif setelah satu pass.
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out.replace(blockRe, '').replace(stripRe, '');
    if (out === before) break;
  }

  // 3) Hapus atribut event handler on* (onclick, onerror, onload, ...).
  //    Separator dibuat [\s/] agar bypass tanpa spasi (mis. <img/onerror=...>) ikut kena.
  out = out.replace(/[\s/]+on\w+\s*=\s*"[^"]*"/gi, ' ');
  out = out.replace(/[\s/]+on\w+\s*=\s*'[^']*'/gi, ' ');
  out = out.replace(/[\s/]+on\w+\s*=\s*[^\s>]+/gi, ' ');

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

  // 5) Netralkan atribut style yang memuat vektor lawas (javascript:/expression()).
  out = out.replace(/\sstyle\s*=\s*"[^"]*(?:javascript:|expression\s*\()[^"]*"/gi, ' ');
  out = out.replace(/\sstyle\s*=\s*'[^']*(?:javascript:|expression\s*\()[^']*'/gi, ' ');

  return out;
}
