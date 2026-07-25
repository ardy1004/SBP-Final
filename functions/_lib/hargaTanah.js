/**
 * Harga tanah: konversi total ↔ per-m² dan mode tampilan.
 * SATU SUMBER untuk backend (functions/) dan frontend (src/ lewat Vite),
 * mengikuti pola waktu.js dan queryParams.js — lihat CLAUDE.md.
 *
 * KONTRAK YANG TIDAK BOLEH DILANGGAR
 *   harga        SELALU total rupiah. Dipakai filter, ORDER BY, dan seluruh
 *                query. JANGAN PERNAH diisi angka per-m².
 *   harga_per_m2 SELALU turunan dari harga ÷ luas_tanah. Dihitung ulang tiap simpan.
 *   harga_mode   HANYA memengaruhi cara mengetik di admin dan cara menampilkan
 *                di situs. Tidak pernah mengubah arti kolom harga.
 *
 * DUA BUG YANG DIPERBAIKI BERKAS INI (audit 2026-07-26)
 * 1. Form admin cuma punya satu kolom "Harga Penawaran", sedangkan tanah
 *    diiklankan per-m² (judul buatan agen sendiri: "Turun Harga Jadi 4,9
 *    Juta/m²!"). 39 listing tanah karena itu berisi harga per-m² di kolom
 *    total — lahan 2,7 ha tampil Rp 4,9 juta.
 * 2. `harga_per_m2` tidak pernah ditulis ulang oleh endpoint simpan mana pun;
 *    nilainya hanya berasal dari impor CSV lama. Mengubah harga lewat admin
 *    membuat per-m² di halaman detail memakai angka usang dan tidak konsisten
 *    dengan harga yang tertera di sebelahnya.
 */

export const HARGA_MODE_TOTAL = 'total';
export const HARGA_MODE_PER_M2 = 'per_m2';
export const HARGA_MODES = [HARGA_MODE_TOTAL, HARGA_MODE_PER_M2];

/** Hanya tanah yang boleh memakai mode per-m². Jenis lain dipaksa 'total'. */
export function modeHargaValid(mode, jenisProperti) {
  if (jenisProperti !== 'tanah') return HARGA_MODE_TOTAL;
  return HARGA_MODES.includes(mode) ? mode : HARGA_MODE_TOTAL;
}

/**
 * Hitung harga per-m². Selalu turunan — jangan pernah membaca kolom
 * harga_per_m2 yang tersimpan untuk keperluan hitung ulang.
 * @returns {number|null} null bila luas tidak diketahui
 */
export function hitungPerM2(hargaTotal, luasTanah) {
  const h = Number(hargaTotal);
  const l = Number(luasTanah);
  if (!Number.isFinite(h) || !Number.isFinite(l) || h <= 0 || l <= 0) return null;
  return Math.round(h / l);
}

/**
 * Ubah harga per-m² yang diketik agen menjadi total untuk disimpan.
 * @returns {number|null} null bila luas belum diisi — pemanggil WAJIB menolak
 *   simpan dan meminta luas_tanah lebih dulu, bukan menyimpan angka per-m²
 *   ke kolom total (persis kesalahan yang melahirkan 39 baris rusak).
 */
export function perM2KeTotal(hargaPerM2, luasTanah) {
  const p = Number(hargaPerM2);
  const l = Number(luasTanah);
  if (!Number.isFinite(p) || !Number.isFinite(l) || p <= 0 || l <= 0) return null;
  return Math.round(p * l);
}

/**
 * Normalisasi satu properti sebelum disimpan. Dipakai endpoint create MAUPUN
 * update supaya keduanya tidak bisa berbeda perilaku.
 *
 * @param {object} p
 * @param {string} p.jenis_properti
 * @param {number|null} p.luas_tanah
 * @param {number|null} p.harga        total, bila mode 'total'
 * @param {number|null} p.harga_per_m2 per-m², bila mode 'per_m2'
 * @param {string} p.harga_mode
 * @returns {{ ok: true, harga: number, harga_per_m2: number|null, harga_mode: string }
 *         | { ok: false, error: string }}
 */
export function normalisasiHarga({ jenis_properti, luas_tanah, harga, harga_per_m2, harga_mode }) {
  const mode = modeHargaValid(harga_mode, jenis_properti);

  if (mode === HARGA_MODE_PER_M2) {
    const total = perM2KeTotal(harga_per_m2, luas_tanah);
    if (total == null) {
      return {
        ok: false,
        error: 'Mode harga per m² membutuhkan Luas Tanah dan Harga per m² yang valid.',
      };
    }
    return { ok: true, harga: total, harga_per_m2: Math.round(Number(harga_per_m2)), harga_mode: mode };
  }

  const total = Number(harga) || 0;
  return { ok: true, harga: total, harga_per_m2: hitungPerM2(total, luas_tanah), harga_mode: mode };
}
