// Tata letak tanda tangan pemilik — SATU sumber untuk PDF perjanjian (pdf.js),
// pratinjau di halaman /sign (SignPage.tsx), dan pembuat PNG di popup
// (sign/PadTandaTangan.tsx). Pratinjau = PDF hanya bisa dijamin kalau ketiganya
// menghitung dengan rumus yang sama.
//
// Semua angka dalam pt, relatif terhadap slot gambar kolom Pihak Kedua di PDF
// (origin kiri-BAWAH, seperti pdf-lib). Tanda tangan diletakkan menyilang TEPI
// KANAN meterai: separuh kiri di atas meterai, separuh kanan di kertas.
//
// Sejarah: sampai 2026-09-27 kanvas 1400×440 ber-lineWidth 2,8 px dikecilkan ke
// slot ini → goresan 0,47 pt (TTD Ardy di sebelahnya ±1,76 pt), dan TTD dari HP
// tersimpan gepeng 2,27× karena kanvas ditarik tak proporsional. Sekarang PNG
// dirender ulang dari titik-titik goresan dengan tebal tetap TEBAL_PT.

export const SLOT_W = 232.5;       // = colW pdf.js (A4, margin 50, dua kolom)
export const SLOT_H = 90;          // = IMG_H pdf.js
export const METERAI_X = 10;       // jarak meterai dari kiri kolom
export const METERAI_RASIO = 404 / 288; // dimensi images.salambumi.xyz/materai/hg.png
export const TTD_MAKS_W = 190;     // 2 × ruang kanan meterai (±96) — separuh kanan selalu muat
export const TTD_MAKS_H = 62;
export const TEBAL_PT = 1.5;       // setara pulpen (±0,53 mm)
export const PX_PER_PT = 4;        // resolusi PNG keluaran

/** Posisi meterai di slot. `rasio` = lebar/tinggi gambar meterai sesungguhnya. */
export function letakMeterai(rasio = METERAI_RASIO) {
  return { x: METERAI_X, y: 0, w: SLOT_H * rasio, h: SLOT_H };
}

/**
 * Posisi & ukuran PNG tanda tangan di slot: di-fit ke TTD_MAKS_W × TTD_MAKS_H
 * (proporsi dipertahankan), titik tengahnya di tepi kanan meterai, tengah
 * vertikal slot. Berlaku juga untuk PNG format lama (1400×440) — hanya tebalnya
 * yang tidak dijamin.
 */
export function letakTtd(pngW, pngH, rasio = METERAI_RASIO) {
  if (!(pngW > 0) || !(pngH > 0)) return null;
  const s = Math.min(TTD_MAKS_W / pngW, TTD_MAKS_H / pngH);
  const w = pngW * s, h = pngH * s;
  const m = letakMeterai(rasio);
  const x = Math.max(0, Math.min(m.x + m.w - w / 2, SLOT_W - w));
  return { x, y: (SLOT_H - h) / 2, w, h };
}
// Ukuran PNG keluaran dihitung di sign/PadTandaTangan.tsx (ukuranKeluaran) dari
// konstanta di atas — sengaja tidak di sini: modul ini ikut chunk SSR utama.
