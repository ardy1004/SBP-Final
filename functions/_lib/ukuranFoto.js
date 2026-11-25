// Ukuran tetap foto properti (2026-11-25) — satu sumber aturan kunci varian.
//
// KENAPA ADA. Foto properti dulu dikecilkan per permintaan lewat /cdn-cgi/image
// (Cloudflare Image Transformations). Paket Free = 5.000 transformasi UNIK per
// bulan kalender; 2.675 foto × 5–7 ukuran jauh di atasnya, kuota habis 22 Nov
// 2026 dan galeri "berkedip seperti pecah". Sekarang tiap foto punya 2 ukuran
// tetap di R2 yang dibuat SEKALI (di browser admin atau skrip backfill), dan
// halaman memakainya langsung — tanpa transformasi, tanpa kuota.
//
// Bentuk kunci:
//   dasar  : property-photos/<nama>          (yang tercatat di property_images.url_webp)
//   varian : property-photos/<lebar>/<nama>   lebar ∈ UKURAN
// <nama> dipakai apa adanya (ekstensi dasar ikut), jadi dasar selalu bisa
// diturunkan pasti dari varian. Isi varian = WebP (atau JPEG bila browser
// pembuatnya tak bisa WebP) — Content-Type tersimpan di httpMetadata, ekstensi
// nama tidak dipakai untuk menyajikan.
//
// ⚠️ purge-trash.js menghapus objek property-photos/ yang tidak tercatat di
// property_images. Varian TIDAK pernah tercatat, jadi sapuan itu WAJIB menilai
// varian lewat kunciDasar() — tanpa itu seluruh varian terhapus semalam.

export const UKURAN = [640, 1280];

/** Kunci dasar yang sah: tepat satu segmen di bawah property-photos/. */
export const POLA_DASAR = /^property-photos\/[^/]+$/;

/** Kunci varian: property-photos/<640|1280>/<nama>. */
export const POLA_VARIAN = /^property-photos\/(640|1280)\/([^/]+)$/;

/** Batas ukuran satu varian yang diterima dari browser admin. */
export const MAKS_BYTE_VARIAN = 2 * 1024 * 1024;

export function kunciUkuran(dasar, lebar) {
  if (!POLA_DASAR.test(dasar) || !UKURAN.includes(Number(lebar))) return null;
  return `property-photos/${lebar}/${dasar.slice('property-photos/'.length)}`;
}

/** Varian → kunci dasarnya; kunci lain dikembalikan apa adanya. */
export function kunciDasar(key) {
  const m = POLA_VARIAN.exec(key);
  return m ? `property-photos/${m[2]}` : key;
}

/** Semua kunci varian milik satu kunci dasar (untuk dihapus bersama dasarnya). */
export function semuaKunciUkuran(dasar) {
  return UKURAN.map(w => kunciUkuran(dasar, w)).filter(Boolean);
}

/**
 * Jenis gambar menurut ISI (magic bytes), bukan label data-URL. Hanya webp/jpeg
 * — dua format yang bisa dibuat kanvas browser & sharp untuk varian.
 */
export function jenisDariIsi(b) {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}
