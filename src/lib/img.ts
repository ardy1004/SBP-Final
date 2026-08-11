// Helper Cloudflare Image Transformations (/cdn-cgi/image/) — resize on-the-fly.
// Terverifikasi aktif di zone salambumi.xyz (testimoni 297KB → 4.8KB @width=96).
// Di dev (vite/wrangler dev) /cdn-cgi/image tidak tersedia → kembalikan src asli.

const ENABLED = import.meta.env.PROD;

/**
 * Bungkus URL gambar dengan transformasi resize + format auto (webp/avif).
 * Mendukung: path relatif same-zone (/api/media?key=…) dan URL images.salambumi.xyz.
 * Unsplash: gunakan native resize API (CF Image Transforms tidak bisa proxy domain lain).
 * URL lain dikembalikan apa adanya.
 */
export function cfImg(src: string, width: number): string {
  if (!src || !ENABLED) return src;
  // quality=65: sweet spot AVIF/WebP — visual tetap bagus, ukuran ±50% lebih kecil
  // dari quality=80 (temuan Lighthouse "Improve image delivery").
  const opts = `width=${width},format=auto,quality=65`;
  if (src.startsWith('/')) {
    if (src.startsWith('/cdn-cgi/')) return src; // sudah ditransform
    return `/cdn-cgi/image/${opts}${src}`;
  }
  if (src.startsWith('https://images.salambumi.xyz/')) {
    return `/cdn-cgi/image/${opts}/${src}`;
  }
  // Unsplash: gunakan parameter resize natif mereka (?w=N&q=75&auto=format)
  if (src.includes('images.unsplash.com')) {
    try {
      const u = new URL(src);
      u.searchParams.set('w', String(width));
      u.searchParams.set('q', '75');
      u.searchParams.set('auto', 'format');
      return u.toString();
    } catch { return src; }
  }
  return src;
}

/** srcset beberapa lebar — dipakai bersama atribut sizes. */
export function cfSrcSet(src: string, widths: number[]): string | undefined {
  if (!src || !ENABLED) return undefined;
  if (!src.startsWith('/') && !src.startsWith('https://images.salambumi.xyz/')) return undefined;
  return widths.map(w => `${cfImg(src, w)} ${w}w`).join(', ');
}

/** Dimensi kanonik og:image — rasio 1,91:1 yang diminta Open Graph & Twitter. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Varian og:image dengan dimensi PASTI 1200×630 (fit=cover memotong, tidak
 * menggepengkan). Dipisah dari cfImg karena tujuannya beda: cfImg menjaga rasio
 * asli untuk tampilan di halaman, sedangkan kartu share WAJIB rasio tetap.
 *
 * Alasan memaksa dimensi: `og:image:width`/`height` hanya boleh diemit kalau kita
 * benar-benar TAHU ukurannya. Dimensi asli foto tidak tersimpan di D1, dan menebak
 * lebih buruk daripada mengosongkan. Dengan memotong sendiri, angkanya jadi fakta.
 * Tanpa dimensi, sebagian klien (termasuk jalur share WhatsApp yang jadi kanal
 * utama SBP) merender kartu kecil alih-alih gambar besar.
 *
 * quality=70 (bukan 65 seperti cfImg): kartu share hanya dimuat sekali oleh
 * scraper, jadi tidak ada biaya bandwidth berulang seperti gambar di halaman.
 */
export function cfImgOg(src: string): string {
  if (!src || !ENABLED) return src;
  const opts = `width=${OG_IMAGE_WIDTH},height=${OG_IMAGE_HEIGHT},fit=cover,format=auto,quality=70`;
  if (src.startsWith('/')) {
    if (src.startsWith('/cdn-cgi/')) return src;
    return `/cdn-cgi/image/${opts}${src}`;
  }
  if (src.startsWith('https://images.salambumi.xyz/')) {
    return `/cdn-cgi/image/${opts}/${src}`;
  }
  return src;
}
