// ViralFrame — konstanta & helper bersama (Fase 4, dedup).
//
// SATU sumber kebenaran untuk data yang dulu diduplikasi manual antara
// functions/api/admin/viralframe/ai-generate.js (backend) dan
// src/app/components/admin/viralframe/options.ts (frontend). Duplikasi itu
// sempat menyebabkan drift (lihat commit tempo dialog & ekspresi).
//
// Ditempatkan di functions/_lib/ (bukan src/app) supaya:
//   - backend Functions mengimpornya secara natif (../../../_lib/...)
//   - frontend Vite mengimpornya lintas-direktori (di-bundle dari root)
// File ini WAJIB plain JS tanpa React / API browser agar aman di Workers runtime.

// Tabel lipsync (PRD 3.8) — sinkronisasi durasi klip ↔ jumlah kata narasi.
export const LIPSYNC_TABLE = [
  { minSec: 2,  maxSec: 3,  maxWords: 8,   pace: 'ultra_fast',    instruksi: 'Ucapan sangat cepat, 1 kalimat pendek punchy, tanpa jeda.' },
  { minSec: 4,  maxSec: 5,  maxWords: 16,  pace: 'fast',          instruksi: 'Ucapan cepat, 1–2 kalimat ringkas, jeda minimal.' },
  { minSec: 6,  maxSec: 8,  maxWords: 26,  pace: 'normal',        instruksi: 'Tempo natural, 2 kalimat, jeda wajar antar frasa.' },
  { minSec: 9,  maxSec: 12, maxWords: 44,  pace: 'medium',        instruksi: 'Tempo sedang, 2–3 kalimat, ada penekanan kata kunci.' },
  { minSec: 13, maxSec: 20, maxWords: 72,  pace: 'relaxed',       instruksi: 'Tempo santai, 3–4 kalimat, ruang untuk storytelling.' },
  { minSec: 21, maxSec: 30, maxWords: 108, pace: 'slow_dramatic', instruksi: 'Tempo lambat dramatis, jeda sengaja untuk emosi.' },
];

export function getLipsync(durasiDetik) {
  const d = Math.max(2, Math.min(30, Math.round(durasiDetik || 0)));
  for (const row of LIPSYNC_TABLE) {
    if (d >= row.minSec && d <= row.maxSec) return row;
  }
  return d <= 3 ? LIPSYNC_TABLE[0] : LIPSYNC_TABLE[LIPSYNC_TABLE.length - 1];
}

export function getMaxWords(durasiDetik) {
  return getLipsync(durasiDetik).maxWords;
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIO NATIVE & BATAS KLIP PER TOOL (Tahap 1 — perbaikan audit 2026-07-26)
// ════════════════════════════════════════════════════════════════════════════

// Tool yang menghasilkan AUDIO NATIVE (dialog terucap + lip-sync) dari teks prompt.
// Untuk tool ini dialog WAJIB ditanam DI DALAM teks prompt video; menaruhnya di
// field terpisah = audionya tidak pernah dibuat dan videonya jadi bisu.
// Inilah temuan utama audit ViralFrame 2026-07-26: seluruh LIPSYNC_TABLE dihitung,
// ditegakkan, dan divalidasi — lalu dibuang di langkah terakhir karena README ZIP
// menyuruh user menempel field 'prompt' saja.
export const NATIVE_AUDIO_TOOLS = ['google_flow', 'veo3'];

export function isNativeAudioTool(toolId) {
  return NATIVE_AUDIO_TOOLS.includes(toolId);
}

// Batas panjang SATU klip per generate, dalam detik. Durasi lebih panjang harus
// disusun dari beberapa klip/Extend, bukan diminta sekaligus. Tool yang tidak
// terdaftar = tidak ada batas keras yang kita tegakkan (null).
//
// ⚠️ ANGKA INI BERUBAH SEIRING VERSI TOOL — jangan diisi dari asumsi.
// google_flow = 10 detik, diverifikasi langsung oleh pemilik akun di Google Flow
// (2026-07-28). Sebelumnya diisi 8 berdasarkan dugaan saya tentang Veo 3, dan itu
// SALAH: skema youtube-long.js aslinya sudah benar memakai 10, lalu saya turunkan
// ke 8 karena mengira ada kontradiksi. Kalau ragu, tanya — jangan tebak.
export const CLIP_MAX_SEC = {
  google_flow: 10,
  // Veo 3 standalone (labs.google/video) BELUM diverifikasi ulang — masih 8.
  // Kalau ternyata juga 10, cukup ubah angka ini: enam pemakainya membaca dari sini.
  veo3: 8,
};

export function getClipMaxSec(toolId) {
  return CLIP_MAX_SEC[toolId] ?? null;
}

// Negative prompt inti untuk video generator berbasis teks (Veo/Flow dan sejenis).
// BEDA dari NEG_CORE di submit-video.js yang khusus image-to-video SiliconFlow
// (fokus mencegah adegan berubah dari foto). Yang di sini fokus pada dua hal:
//   1. 'subtitles/captions/burned-in text' — Veo punya kebiasaan MEMBAKAR subtitle
//      ke frame begitu ada dialog di prompt. Tanpa ini, menanam dialog (perbaikan
//      di atas) justru menghasilkan video berteks acak yang tidak bisa dihapus.
//   2. artefak umum yang merusak kesan profesional.
export const NEGATIVE_PROMPT_VIDEO = 'subtitles, captions, burned-in text, on-screen text, watermark, logo, distorted hands, extra fingers, morphing, warping, deformed face, flickering, blurry, low quality, extra people';

/**
 * Nama berkas foto karakter di dalam ZIP Jalur C (AI Generate).
 *
 * Dipakai backend (`reference_image`/`character_reference`), entri ZIP, dan README —
 * ketiganya WAJIB memakai fungsi ini agar tidak pernah berbeda.
 *
 * Sebelumnya tiap tempat menulis `nama.replace(/\s+/g,'_')` sendiri, yang meloloskan
 * karakter apa pun selain spasi. Nama seperti "Ayu / Vina" menghasilkan
 * "Ayu_/_Vina.webp" — garis miring itu ditafsirkan JSZip sebagai pemisah folder,
 * sehingga fotonya mendarat di subfolder tak terduga dan tidak cocok lagi dengan
 * nama yang disebut di prompt. Nama normal tetap menghasilkan keluaran yang sama
 * persis seperti dulu, jadi ZIP lama tidak berubah bentuk.
 */
export function namaFileKarakter(nama) {
  const bersih = String(nama ?? '')
    .trim()
    .replace(/[^\w\s-]/g, '')  // buang '/', '\', ':', dsb yang merusak path ZIP
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  return `${bersih || 'karakter'}.webp`;
}

// Deskripsi ekspresi singkat English untuk injeksi ke prompt karakter (PRD 3.13/3.14).
export const EXPRESSION_EN = {
  auto:            'expression adapted to scene tone',
  excited_joyful:  'excited and joyful, big smile, high energy',
  confident_auth:  'confident and authoritative, assured',
  surprised_amazed: 'surprised and amazed, wide eyes',
  warm_friendly:   'warm and friendly, approachable',
  urgent_intense:  'urgent and intense, serious',
  empathetic:      'empathetic and relatable',
  playful_humor:   'playful and humorous, light-hearted',
  mysterious:      'mysterious and dramatic',
  curious_invest:  'curious and investigative',
};
