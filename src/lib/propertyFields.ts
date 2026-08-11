// Aturan "field apa muncul untuk jenis properti apa" + opsi dropdown bersama.
//
// SATU SUMBER KEBENARAN untuk kedua form yang menulis ke tabel `properties`:
//   - src/app/components/admin/AdminPropertyDetailPage.tsx  (form admin)
//   - src/app/components/TitipJualPage.tsx                   (form publik owner)
//
// ⚠️ Sebelum berkas ini ada, aturannya ditulis DUA KALI dengan bentuk berbeda
// (`SHOW_*` Set di admin vs fungsi `showLT()`/`showKTKM()` di titip jual) tanpa
// apa pun yang menjaga keduanya sinkron — dan keduanya memang sudah melenceng
// (audit 2026-08-10):
//   · Kelengkapan Furnitur tidak pernah muncul untuk `kost` di titip jual,
//     padahal kost inventori terbesar (184 listing) dan kolom `furnished`
//     dipakai ViralFrame untuk mendeskripsikan fasilitas.
//   · Harga Sewa Kamar/Bulan hanya untuk `kost` di titip jual, admin juga
//     memberikannya ke hotel/homestay/villa.
//   · Jumlah Lantai & KT/KM justru TERLALU longgar di titip jual (muncul untuk
//     gudang/komersial/ruko yang admin sendiri anggap tidak relevan).
//
// Nilai di bawah diambil dari form admin sebagai kebenaran — aturannya lebih
// ketat dan sudah teruji pada 533 listing produksi.
//
// Ditaruh di `src/lib/` (bukan `functions/_lib/`) karena kedua konsumennya
// frontend TypeScript, jadi ikut terjaring `npm run typecheck`. Pola sama
// dengan propertyTypes.ts di sebelahnya.

/** Luas Tanah — semua kecuali apartment (unit vertikal tidak punya tanah). */
export const SHOW_LUAS_TANAH    = new Set(['rumah','tanah','kost','hotel','homestay','villa','gudang','komersial','ruko']);
/** Luas Bangunan — semua kecuali tanah kosong. */
export const SHOW_LUAS_BANGUNAN = new Set(['rumah','kost','hotel','homestay','villa','apartment','gudang','komersial','ruko']);
/** Lebar Depan (muka jalan) — tidak relevan untuk apartment. */
export const SHOW_LEBAR_DEPAN   = new Set(['rumah','tanah','kost','hotel','homestay','villa','gudang','komersial','ruko']);
/** Jumlah Lantai — bangunan bertingkat; gudang & komersial dikelola per-unit. */
export const SHOW_LANTAI        = new Set(['rumah','kost','hotel','homestay','villa','apartment','ruko']);
/** Kamar Tidur / Kamar Mandi — hanya hunian. */
export const SHOW_KT_KM         = new Set(['rumah','kost','hotel','homestay','villa','apartment']);
/** Kelengkapan Furnitur (kolom `furnished`) — properti yang dihuni/disewakan. */
export const SHOW_FURNISHED     = new Set(['kost','hotel','homestay','villa','apartment']);
/** Harga Sewa per Kamar per Bulan — properti berbasis kamar. */
export const SHOW_SEWA_KAMAR    = new Set(['kost','hotel','homestay','villa']);
// Income & Pengeluaran per bulan — properti penghasil pendapatan.
// 'kost' WAJIB ada di sini. Kost di SBP dijual utuh sebagai aset investasi
// (Rp 850 juta - Rp 25 miliar), dan Investment Intelligence — yield, cap rate,
// payback, skor 1-5 — dihitung dari income_per_bulan. Tanpa 'kost' di daftar
// ini, field-nya tersembunyi di form sehingga admin TIDAK BISA mengisinya sama
// sekali; per audit 2026-07-26 seluruh 184 kost berakhir dengan income kosong
// dan blok investasinya padam justru di listing yang dijual sebagai investasi.
export const SHOW_INCOME        = new Set(['kost','hotel','homestay','villa']);
export const SHOW_PENGELUARAN   = new Set(['kost','hotel','homestay','villa']);

/** Mode harga per-m² hanya sah untuk tanah — lihat functions/_lib/hargaTanah.js. */
export const SHOW_HARGA_PER_M2  = new Set(['tanah']);

// ─── Opsi dropdown bersama ────────────────────────────────────────────────────
// Sebelumnya terduplikasi identik di kedua form. Nilainya masuk ke DB apa adanya
// (kolom `legalitas` TEXT bebas), jadi perbedaan satu karakter pun akan
// memecah pengelompokan data — justru itu alasan disatukan di sini.

export const LEGALITAS_OPTIONS = [
  'SHM & IMB/PBG Lengkap', 'SHGB & IMB/PBG Lengkap',
  'SHM Pekarangan Tanpa IMB/PBG', 'SHM Sawah/Tegalan',
  'SHGB Tanpa IMB/PBG', 'Girik/Letter C/PPJB/dll', 'Izin Usaha',
] as const;

/** Nilai WAJIB cocok CHECK constraint kolom `furnished` di D1. */
export const FURNISHED_OPTS = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi',        label: 'Semi Furnished' },
  { value: 'fully',       label: 'Fully Furnished' },
] as const;

/** details.jenis_kost */
export const JENIS_KOST_OPTS = ['putra', 'putri', 'campur'] as const;

/** details.jenis_hotel */
export const JENIS_HOTEL_OPTS = [
  'budget', 'bintang1', 'bintang2', 'bintang3', 'bintang4', 'bintang5', 'boutique',
] as const;

export function labelJenisHotel(v: string): string {
  return v.startsWith('bintang') ? `Bintang ${v.slice(-1)}` : v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * details.lingkungan — kategori kasar yang diisi owner di Titip Jual.
 * Admin memakai jarak meter presisi (jarak_sungai_m dkk) dan SUDAH punya
 * penanganan khusus untuk membaca kategori ini; perbedaan bentuk itu DISENGAJA
 * (owner awam tidak bisa mengukur meter) — jangan "diseragamkan".
 */
export const LINGKUNGAN_OPTIONS = [
  { value: 'jauh_dari_semuanya', label: 'Jauh dari Semuanya' },
  { value: 'dekat_sungai',       label: 'Dekat Sungai' },
  { value: 'dekat_makam',        label: 'Dekat Makam' },
  { value: 'dekat_sutet',        label: 'Dekat Sutet' },
] as const;
