// Helper Cloudflare Image Transformations (/cdn-cgi/image/) — resize on-the-fly.
// Terverifikasi aktif di zone salambumi.xyz (testimoni 297KB → 4.8KB @width=96).
// Di dev (vite/wrangler dev) /cdn-cgi/image tidak tersedia → kembalikan src asli.
//
// 🔥 `onerror=redirect` WAJIB ada di setiap URL transformasi — JANGAN dibuang.
// Paket Free = 5.000 transformasi UNIK per bulan kalender, sedangkan 2.675 foto
// × 5–7 ukuran jauh di atas itu. Begitu kuota habis, setiap transformasi yang
// belum terhitung bulan itu dibalas `429 cf-resized: err=9422`. Terjadi 22 Nov
// 2026: foto galeri 88,8% gagal, og:image 546/579 properti. Selain itu ada
// galat internal CF `500 err=9532` yang menetap untuk 43 foto tertentu.
// Dengan `onerror=redirect`, CF membalas 307 ke foto ASLI (/api/media) untuk
// kedua galat itu, jadi situs turun mulus ke foto asli alih-alih ikon rusak.
// Ini juga menolong yang tak bisa ditolong `onError` di browser: Googlebot,
// scraper og:image WhatsApp/Facebook, dan gambar SSR yang gagal sebelum React
// hydrate (React 18 tidak memutar ulang event error itu). Diuji live 2026-11-24.
// Catatan: menambah/mengubah opsi = transformasi unik BARU (diukur: URL yang
// tadinya 200 jadi 307 saat kuota habis) — semuanya dihitung ulang tiap bulan
// kalender, jadi tidak ada biaya tambahan, hanya cache edge yang dingin sekali.
// Solusi permanen: ukuran dibuat saat unggah, bukan transformasi per permintaan.

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
  const opts = `width=${width},format=auto,quality=65,onerror=redirect`;
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

/**
 * Handler `onError` <img> yang AMAN: coba kandidat cadangan berurutan, masing-
 * masing SEKALI, lalu berhenti.
 *
 * ⚠️ JANGAN kembali ke pola `onError={e => (e.target).src = cadangan}`:
 * - Pada <img srcSet="… 1200w">, browser MENGABAIKAN `src` selama srcset ada,
 *   jadi cadangan tidak pernah tampil. Menyetel `src` justru memicu muat ulang
 *   URL rusak yang sama → error lagi → loop tanpa henti. Terukur 2026-11-24:
 *   7.488 permintaan dalam 5 detik di satu halaman; galeri tampil "berkedip
 *   seperti pecah" (kosong ↔ ikon rusak).
 * - Tanpa srcset pun, menyetel `src` ke nilai yang SAMA tetap memuat ulang
 *   (aturan HTML) — bila cadangannya sendiri gagal, loop yang sama terjadi.
 * Karena itu: srcset dibuang dulu, tiap kandidat dicoba satu kali (penghitung
 * di data-attribute), kandidat yang identik dengan URL yang baru gagal dilewati.
 * Kandidat habis → biarkan ikon rusak; itu jauh lebih baik daripada loop.
 */
export function pakaiCadangan(
  e: { currentTarget: HTMLImageElement },
  ...kandidat: Array<string | null | undefined>
): void {
  const img = e.currentTarget;
  const daftar = kandidat.filter((k): k is string => !!k);
  let ke = Number(img.dataset.cadanganKe ?? 0);
  const gagal = img.currentSrc || img.src;
  while (ke < daftar.length) {
    const url = daftar[ke++];
    let mutlak = url;
    try { mutlak = new URL(url, window.location.href).href; } catch { /* biarkan apa adanya */ }
    if (mutlak === gagal) continue;
    img.dataset.cadanganKe = String(ke);
    img.removeAttribute('srcset');
    img.src = url;
    return;
  }
  img.dataset.cadanganKe = String(ke);
}

// ─── Foto properti: ukuran TETAP di R2, bukan transformasi per permintaan ────
// Sejak 2026-11-25 tiap foto properti punya varian property-photos/<640|1280>/
// <nama> yang dibuat SEKALI (browser admin / skrip backfill) — lihat
// functions/_lib/ukuranFoto.js. Foto properti WAJIB lewat fotoUkuran/srcSetFoto,
// JANGAN kembali ke cfImg: itulah yang menghabiskan kuota 5.000 transformasi
// unik/bulan (2.675 foto × 5–7 ukuran) dan membuat galeri "berkedip pecah".
// Varian yang belum ada disajikan /api/media sebagai foto dasar (aman).
// og:image tetap cfImgOg — butuh crop 1,91:1 dan jumlah uniknya kecil.

export type LebarFoto = 640 | 1280;

/** URL foto properti DASAR keluaran normalizeProperty: /api/media?key=property-photos%2F<nama>. */
const POLA_FOTO_PROPERTI = /^\/api\/media\?key=property-photos%2F([^%?&#]+)$/;

/** URL varian ukuran foto properti; sumber lain jatuh ke cfImg. */
export function fotoUkuran(src: string, lebar: LebarFoto): string {
  const m = POLA_FOTO_PROPERTI.exec(src ?? '');
  if (!m) return cfImg(src, lebar);
  return `/api/media?key=property-photos%2F${lebar}%2F${m[1]}`;
}

/** srcset 640w/1280w dari varian; sumber lain jatuh ke cfSrcSet. */
export function srcSetFoto(src: string): string | undefined {
  if (!POLA_FOTO_PROPERTI.test(src ?? '')) return cfSrcSet(src, [640, 1280]);
  return `${fotoUkuran(src, 640)} 640w, ${fotoUkuran(src, 1280)} 1280w`;
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
 *
 * onerror=redirect: saat kuota transformasi habis, scraper menerima foto asli
 * (rasionya tak lagi 1200×630, tapi kartu share tetap bergambar) — lebih baik
 * daripada 429 yang membuat link WhatsApp tampil tanpa gambar sama sekali.
 */
export function cfImgOg(src: string): string {
  if (!src || !ENABLED) return src;
  const opts = `width=${OG_IMAGE_WIDTH},height=${OG_IMAGE_HEIGHT},fit=cover,format=auto,quality=70,onerror=redirect`;
  if (src.startsWith('/')) {
    if (src.startsWith('/cdn-cgi/')) return src;
    return `/cdn-cgi/image/${opts}${src}`;
  }
  if (src.startsWith('https://images.salambumi.xyz/')) {
    return `/cdn-cgi/image/${opts}/${src}`;
  }
  return src;
}
