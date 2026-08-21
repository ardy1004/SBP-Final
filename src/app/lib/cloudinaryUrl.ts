// Sisa transformasi Cloudinary yang masih dibutuhkan — HANYA untuk baris lama
// (`storage = 'cloudinary'`). Video baru mendarat di R2 dan tidak pernah lewat
// sini sama sekali (migrasi 0043).
//
// Riwayat yang penting supaya tidak dibangun ulang tanpa sadar:
//
// 1. `cloudinaryOverlay.ts` dihapus bersama fitur badge/logo video (2026-08-11).
//    Tiap overlay badge memaksa Cloudinary me-render ULANG video utuh (~4,1 MB
//    per salinan): 437 dari 464 derived resource berasal dari situ.
//
// 2. `toAttachmentUrl()` (`fl_attachment`) dihapus 2026-08-22. Tidak ada
//    padanannya di R2, dan memang tidak perlu — unduhan sekarang lewat blob di
//    `posterVideo.ts` (`unduhVideo`), yang bekerja untuk kedua backend.
//
// 3. `toImageThumbnailUrl()` di bawah adalah SEBAB kuota free tier jebol.
//    Komentar lama di sini menyebutnya "satu turunan per video, jadi jauh lebih
//    murah daripada overlay" — benar secara relatif, tapi menyesatkan: yang
//    menentukan harga bukan JUMLAH turunannya, melainkan DURASI video sumbernya.

/**
 * Ganti ekstensi video jadi `.jpg` — Cloudinary merender 1 frame video jadi
 * gambar statis, dipakai sebagai poster `<video>`.
 *
 * ⚠️ JANGAN dipakai untuk baris `storage = 'r2'`, dan jangan dipakai untuk apa
 * pun yang baru. Cloudinary menagih ini sebagai transformasi VIDEO **per detik
 * durasi sumber**, dikali bobot resolusi (SD ×2, HD ×4, 4K ×8 per detik) — bukan
 * satu transformasi gambar seperti yang terlihat dari bentuk URL-nya.
 *
 * Terukur ke akun produksi 2026-08-20:
 *   884 + 2900×2 (SD) + 202×4 (HD) + 905×8 (4K) = 14.732 unit
 * — identik dengan `transformations.usage` dari Admin API, alias **51,3% dari
 * seluruh kuota 25 credits**, hanya untuk 160 gambar sampul berukuran ~46 KB.
 *
 * Penggantinya untuk video baru: `buatPosterDariVideo()` di
 * `src/app/lib/posterVideo.ts` — dibuat di browser dengan `<canvas>`, nol biaya.
 */
export function toImageThumbnailUrl(videoUrl: string): string {
  return videoUrl.replace(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i, '.jpg$2');
}
