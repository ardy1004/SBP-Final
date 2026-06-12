// Helper Cloudflare Image Transformations (/cdn-cgi/image/) — resize on-the-fly.
// Terverifikasi aktif di zone salambumi.xyz (testimoni 297KB → 4.8KB @width=96).
// Di dev (vite/wrangler dev) /cdn-cgi/image tidak tersedia → kembalikan src asli.

const ENABLED = import.meta.env.PROD;

/**
 * Bungkus URL gambar dengan transformasi resize + format auto (webp/avif).
 * Mendukung: path relatif same-zone (/api/media?key=…) dan URL images.salambumi.xyz.
 * URL lain (unsplash dll. yang punya resizer sendiri) dikembalikan apa adanya.
 */
export function cfImg(src: string, width: number): string {
  if (!src || !ENABLED) return src;
  const opts = `width=${width},format=auto,quality=80`;
  if (src.startsWith('/')) {
    if (src.startsWith('/cdn-cgi/')) return src; // sudah ditransform
    return `/cdn-cgi/image/${opts}${src}`;
  }
  if (src.startsWith('https://images.salambumi.xyz/')) {
    return `/cdn-cgi/image/${opts}/${src}`;
  }
  return src;
}

/** srcset beberapa lebar — dipakai bersama atribut sizes. */
export function cfSrcSet(src: string, widths: number[]): string | undefined {
  if (!src || !ENABLED) return undefined;
  if (!src.startsWith('/') && !src.startsWith('https://images.salambumi.xyz/')) return undefined;
  return widths.map(w => `${cfImg(src, w)} ${w}w`).join(', ');
}
