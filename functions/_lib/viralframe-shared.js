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
