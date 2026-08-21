// Bikin poster (.jpg) + baca metadata video DI BROWSER, sebelum upload.
//
// Ini inti penghematan migrasi R2. Sebelumnya poster dibuat dengan mengubah URL
// video Cloudinary jadi `.jpg` — Cloudinary menagihnya sebagai transformasi
// VIDEO **per detik durasi sumber**, dikali bobot resolusi (SD ×2, HD ×4, 4K ×8
// per detik). Terukur di akun produksi 2026-08-20: 13.848 dari 14.732 unit
// transformasi berasal dari situ = 51% seluruh kuota free tier, hanya untuk
// gambar sampul 46 KB. Di sini ongkosnya nol.
//
// Canvas, bukan ffmpeg.wasm: ffmpeg sudah dipakai untuk backsound & caption
// (butuh transcode betulan), tapi untuk mengambil SATU frame, <video> + <canvas>
// jauh lebih ringan dan tidak menunggu WASM dimuat.
//
// Fungsi ini juga satu-satunya sumber width/height/duration sejak pindah ke R2 —
// dulu ketiganya datang dari respons upload Cloudinary. R2 tidak mengembalikan
// apa pun soal isi file, jadi tanpa ini filter rasio di Konten Agent kehilangan
// datanya dan semua video jatuh ke kelompok yang salah.

export interface PosterVideo {
  posterBlob: Blob;
  width: number;
  height: number;
  durationSec: number;
}

// Video 30 detik biasanya selesai <1 detik; 20 detik sudah sangat longgar dan
// mencegah tab menggantung selamanya kalau codec-nya tidak didukung browser.
const BATAS_MS = 20_000;

const KUALITAS_JPEG = 0.8;

export async function buatPosterDariVideo(sumber: Blob): Promise<PosterVideo> {
  const objectUrl = URL.createObjectURL(sumber);
  const video = document.createElement('video');

  try {
    return await new Promise<PosterVideo>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Gagal membaca video (timeout) — format mungkin tidak didukung browser')),
        BATAS_MS,
      );
      const selesai = (fn: () => void) => { clearTimeout(timer); fn(); };

      video.preload = 'auto';
      video.muted = true;
      // iOS Safari menolak memuat video tanpa ini walau tidak pernah diputar.
      video.playsInline = true;
      // Tidak perlu crossOrigin: sumbernya SELALU blob lokal (same-origin), jadi
      // canvas-nya tidak pernah ter-taint.

      video.onerror = () => selesai(() => reject(new Error('File video tidak bisa dibaca browser')));

      video.onloadeddata = () => {
        const durasi = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        // Frame pertama sering hitam/fade-in. Ambil detik ke-1, atau tengah klip
        // kalau videonya lebih pendek dari itu.
        const target = durasi > 0 ? Math.min(1, durasi / 2) : 0;

        const gambar = () => {
          try {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (!w || !h) { selesai(() => reject(new Error('Dimensi video tidak terbaca'))); return; }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { selesai(() => reject(new Error('Canvas 2D tidak tersedia'))); return; }
            ctx.drawImage(video, 0, 0, w, h);

            canvas.toBlob(
              (blob) => {
                if (!blob) { selesai(() => reject(new Error('Gagal membuat poster JPEG'))); return; }
                selesai(() => resolve({ posterBlob: blob, width: w, height: h, durationSec: durasi }));
              },
              'image/jpeg',
              KUALITAS_JPEG,
            );
          } catch (err) {
            selesai(() => reject(err instanceof Error ? err : new Error('Gagal menggambar poster')));
          }
        };

        // currentTime yang sudah pas (video sangat pendek) tidak memicu 'seeked'
        // sama sekali — tanpa cabang ini promise-nya menggantung sampai timeout.
        if (target <= 0 || Math.abs(video.currentTime - target) < 0.01) {
          gambar();
        } else {
          video.onseeked = gambar;
          video.currentTime = target;
        }
      };

      video.src = objectUrl;
    });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

// Unduh file lintas-origin dengan nama yang benar.
//
// Atribut `download` pada <a> DIABAIKAN untuk URL lintas-origin, dan
// media.salambumi.xyz tetap lintas-origin dari panel admin. Dulu ini diakali
// dengan `fl_attachment` Cloudinary (transformasi sisi server); di R2 tidak ada
// padanannya, jadi file diambil jadi blob dulu — blob URL selalu same-origin.
export async function unduhVideo(url: string, namaFile: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh video (HTTP ${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = namaFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Beri browser waktu memulai unduhan sebelum blob-nya dilepas.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}
