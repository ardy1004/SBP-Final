// Aturan identitas pemilik — SATU sumber untuk form Titip Jual, server, halaman
// tanda tangan, PDF perjanjian, dan admin. Sebelumnya regex 16 digit NIK ditulis
// ulang di 4 tempat.
//
// SIM 12-16 digit, bukan satu panjang: tiga generasi nomor SIM beredar bersamaan —
// 12 digit (SIM lama), 14 digit, dan 16 digit sejak Juli 2024 (identik dengan NIK).
// SIM lama baru berganti saat diperpanjang (5 tahun), jadi ketiganya masih dipakai
// sampai ~2029. Mematok satu panjang = menolak pemilik yang sah.
//
// `label` & `kartu` ikut tercetak di PDF (font WinAnsi pdf-lib) — WAJIB ASCII.

export const IDENTITAS = {
  ktp: {
    pilihan: 'NIK (KTP)', label: 'NIK', kartu: 'KTP', min: 16, max: 16,
    placeholder: '16 digit NIK',
    kosong: 'NIK wajib diisi', galat: 'NIK harus tepat 16 digit angka',
  },
  sim: {
    pilihan: 'No. SIM', label: 'No. SIM', kartu: 'SIM', min: 12, max: 16,
    placeholder: '12-16 digit No. SIM',
    kosong: 'No. SIM wajib diisi', galat: 'No. SIM harus 12-16 digit angka',
  },
};

// Apa pun selain 'sim' → 'ktp'. Klien lama (tab terbuka sebelum fitur ini) tidak
// mengirim jenis sama sekali dan memang selalu mengisi NIK — perilakunya tetap.
export function normalisasiJenisIdentitas(v) {
  return v === 'sim' ? 'sim' : 'ktp';
}

// Kembalikan pesan galat, atau null bila sah. `nomor` harus sudah berupa digit
// (pemanggil membuang spasi/tanda hubung lebih dulu).
export function validasiNomorIdentitas(jenis, nomor) {
  const aturan = IDENTITAS[normalisasiJenisIdentitas(jenis)];
  if (!nomor) return aturan.kosong;
  if (!/^\d+$/.test(nomor) || nomor.length < aturan.min || nomor.length > aturan.max) return aturan.galat;
  return null;
}
