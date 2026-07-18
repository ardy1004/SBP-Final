// Sequence kode listing/perjanjian — SATU SUMBER KEBENARAN.
// Dipakai titip-jual.js (publik), admin properties/index.js, dan batch.js.
//
// Sequence = MAX(suffix numerik) + 1, BUKAN COUNT(*) — COUNT turun saat ada
// baris dihapus sehingga kode berikutnya menabrak kode lama (kolom UNIQUE).
// Race dua request paralel tetap mungkin dapat angka sama; pemanggil WAJIB
// retry INSERT dengan isUniqueErr() + sequence berikutnya.

export async function nextKodeSeq(db, table, kodeCol, prefix) {
  const row = await db
    .prepare(`SELECT MAX(CAST(SUBSTR(${kodeCol}, ?) AS INTEGER)) AS mx FROM ${table} WHERE ${kodeCol} LIKE ?`)
    .bind(prefix.length + 1, `${prefix}%`).first();
  return (row?.mx ?? 0) + 1;
}

export function fmtSeq(n) { return String(n).padStart(3, '0'); }

export function isUniqueErr(err) { return /UNIQUE constraint/i.test(err?.message ?? ''); }
