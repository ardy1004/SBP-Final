// Dua penyisip transformasi Cloudinary yang MURAH dan masih dipakai Konten Agent.
//
// Menggantikan cloudinaryOverlay.ts yang dihapus bersama fitur badge/logo video
// (2026-08-11). Alasan penghapusan, supaya tidak dibangun ulang tanpa sadar:
// tiap overlay badge memaksa Cloudinary me-render ULANG video utuh (~4,1 MB per
// salinan). Terukur di akun produksi: 437 dari 464 derived resource berasal dari
// overlay badge (0,64 GB), dan transformasi video ditagih menurut durasi —
// itulah yang membuat angka transformasi menembus 14.556 alias 62% dari kuota
// free tier, bukan storage-nya. Kalau suatu saat badge dibutuhkan lagi, bakar di
// hulu (Google Flow) atau di browser lewat ffmpeg.wasm seperti fitur Caption —
// dua-duanya nol biaya Cloudinary karena terjadi sebelum file diupload.

// Sisipkan fl_attachment supaya browser men-download file alih-alih memutarnya —
// atribut `download` pada <a> diabaikan untuk URL cross-origin (Cloudinary),
// jadi pemaksaan attachment harus dari sisi server Cloudinary via transformasi ini.
export function toAttachmentUrl(url: string): string {
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return url.slice(0, insertAt) + 'fl_attachment/' + url.slice(insertAt);
}

// Ganti ekstensi video jadi .jpg — Cloudinary otomatis render 1 frame video jadi
// gambar statis, dipakai sebagai poster <video> supaya kartu tidak perlu memuat
// videonya dulu. Satu turunan per video, bukan per kombinasi, jadi jauh lebih
// murah daripada overlay.
export function toImageThumbnailUrl(videoUrl: string): string {
  return videoUrl.replace(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i, '.jpg$2');
}
