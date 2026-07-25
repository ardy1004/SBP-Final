// Waktu Indonesia Barat (WIB) — SATU SUMBER KEBENARAN untuk bucket harian.
//
// MASALAH YANG DIPERBAIKI:
// Kode lama memakai DATE('now','localtime') di SQLite/D1. Namanya menyesatkan:
// runtime Cloudflare selalu UTC, jadi 'localtime' menghasilkan tanggal UTC, BUKAN
// waktu Yogyakarta. Diverifikasi langsung ke D1 produksi — DATE('now') dan
// DATE('now','localtime') mengembalikan nilai yang persis sama.
//
// Akibatnya "hari ini" di dashboard berjalan dari 07:00 WIB sampai 07:00 WIB
// keesokan harinya: KPI kontak WA hari ini mereset pagi hari alih-alih tengah
// malam, dan setiap aktivitas antara 00:00–07:00 WIB masuk ke bucket kemarin.
//
// WIB = UTC+7 tetap sepanjang tahun (Indonesia tidak menerapkan DST), jadi
// offset konstan sudah benar dan tidak perlu library timezone.
//
// CATATAN DATA LAMA: baris property_view_daily yang ditulis SEBELUM perbaikan ini
// memakai tanggal UTC. Riwayat lama TIDAK ditulis ulang — pergeserannya 7 jam dan
// menulis ulang justru berisiko merusak data asli. Jadi bucket harian di sekitar
// tanggal deploy bisa sedikit tumpang tindih; data setelahnya sudah benar.

const WIB_OFFSET = '+7 hours';

/** Ekspresi SQL untuk tanggal WIB hari ini (YYYY-MM-DD). Pakai di INSERT/WHERE. */
export const SQL_TANGGAL_WIB = `DATE('now','${WIB_OFFSET}')`;

/** Ekspresi SQL untuk tanggal WIB N hari lalu. */
export function sqlTanggalWibMinus(hari) {
  return `DATE('now','-${hari} days','${WIB_OFFSET}')`;
}

/**
 * Tanggal WIB (YYYY-MM-DD) dari sisi JavaScript, untuk mengisi hari kosong pada
 * grafik. WAJIB dipakai alih-alih toISOString() — toISOString() memberi tanggal
 * UTC sehingga label grafik bisa meleset satu hari dari bucket di database.
 * @param {Date} [dasar] - titik acuan (default: sekarang)
 * @param {number} [geserHari] - offset hari terhadap dasar
 */
export function tanggalWib(dasar = new Date(), geserHari = 0) {
  const ms = dasar.getTime() + 7 * 60 * 60 * 1000 + geserHari * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
