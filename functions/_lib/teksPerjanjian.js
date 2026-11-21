// Teks pasal Perjanjian Jasa Pemasaran (Titip Jual, /sign) — 2026-11-21, migrasi 0063.
//
// ─── Kenapa ada ─────────────────────────────────────────────────────────────
// Sampai 2026-11-21 ke-8 pasal ditulis langsung di buildPasalPasal() dan
// DISUSUN ULANG setiap kali dokumen dibuka. Dua cacat menghalangi admin
// mengedit isinya:
//   1. Teks tidak disimpan per perjanjian — mengubah kode/template akan ikut
//      mengubah perjanjian yang sedang menunggu tanda tangan.
//   2. audit_hash_dokumen tidak memuat pasal — tak bisa dibuktikan teks pasal
//      mana yang ditandatangani.
// Sekarang: saat link TTD dibuat (configure.js), blok pasal untuk varian
// perjanjian itu DIBEKUKAN ke `agreements.pasal_json`. Halaman /sign, PDF, dan
// hash membaca salinan itu (pasalDokumen). Perjanjian tanpa salinan (dibuat
// sebelum fitur ini) tetap memakai susunPasalLama() — teks & versi_dokumen
// mereka TIDAK berubah, jadi pemilik yang sedang membuka link tidak terkena 409.
//
// ─── Bentuk salinan (pasal_json) ────────────────────────────────────────────
// { versi: <versi template>, varian: { listing: 'open'|'exclusive',
//   tx: {kode,label,hasil,pihak} }, blok: [{ judul, isi }] }
// `isi` memakai PLACEHOLDER. Kata yang bergantung jenis transaksi ({hasil},
// {pihak}, {jenis_transaksi}) diambil dari `varian.tx` yang ikut dibekukan,
// sehingga mengubah tujuan properti sesudahnya tidak membuat blok "jual"
// tiba-tiba berbunyi "tersewa". Angka (fee, durasi, harga) dari data
// perjanjian/properti saat dibaca — dan dikunci versi_dokumen saat TTD.

import { jenisTransaksi, teksHargaPenawaran } from './isiPerjanjian.js';

/** Placeholder yang boleh dipakai di isi pasal (daftar putih). */
export const PLACEHOLDER = {
  jenis_listing: 'Open Listing / Exclusive Listing',
  jenis_properti: 'jenis properti (mis. Rumah)',
  alamat_properti: 'alamat lengkap properti',
  legalitas: 'legalitas (mis. SHM)',
  harga_penawaran: 'kalimat harga penawaran',
  durasi_kontrak: 'durasi kontrak (bulan)',
  fee_persen: 'persentase fee',
  jenis_transaksi: 'Jual Beli / Sewa Menyewa / …',
  hasil: 'terjual / tersewa / …',
  pihak: 'pembeli / penyewa / …',
};
const SEMUA_LISTING = ['open', 'exclusive'];
const SEMUA_TUJUAN = ['jual', 'sewa', 'jual_sewa'];

// Kalimat waktu bayar fee — disalin APA ADANYA dari buildPasalPasal().
const BAYAR_JUAL = 'paling lambat 3 (tiga) hari kerja setelah penandatanganan Akta Jual Beli (AJB), atau setelah pembayaran uang muka minimal 30% dari harga kesepakatan apabila pembayaran dilakukan secara tunai bertahap';
const BAYAR_SEWA = 'paling lambat 3 (tiga) hari kerja setelah Pihak Kedua menerima pembayaran sewa pertama dari penyewa';
const NILAI_SEWA = 'Untuk transaksi Sewa Menyewa, nilai transaksi adalah total nilai sewa untuk masa sewa yang disepakati dengan penyewa.';
const P3_AWAL = 'Pihak Kedua menyetujui fee pemasaran sebesar {fee_persen}% dari nilai transaksi {jenis_transaksi}. Fee menjadi hak Pihak Pertama apabila transaksi terjadi dengan {pihak} yang diperkenalkan, diperantarai, atau diperoleh melalui upaya pemasaran Pihak Pertama. ';
const P5_DASAR = 'Pihak Pertama berkewajiban: (a) memasarkan properti secara profesional dan aktif; (b) menjaga kerahasiaan data Pihak Kedua; (c) melaporkan perkembangan pemasaran secara berkala. Pihak Kedua berkewajiban: (a) memberikan informasi properti yang benar dan lengkap; (b) menyediakan akses untuk survei dan pemotretan; (c) memberitahukan kepada Pihak Pertama apabila properti telah {hasil} atau ditarik dari pemasaran';

/**
 * Template versi 1 = konversi PERSIS buildPasalPasal() (dibuktikan uji
 * kesetaraan byte-per-byte untuk 6 kombinasi varian). Blok dengan `berlaku`
 * berbeda untuk pasal yang sama = varian kalimat pasal itu.
 */
export const TEMPLATE_V1 = {
  versi: 1,
  blok: [
    { judul: 'OBJEK PERJANJIAN',
      isi: 'Pihak Pertama diberikan hak pemasaran {jenis_listing} atas properti: {jenis_properti}, berlokasi di {alamat_properti}. Legalitas: {legalitas}. {harga_penawaran}.',
      berlaku: { listing: SEMUA_LISTING, tujuan: SEMUA_TUJUAN } },
    { judul: 'JENIS LISTING & MASA KONTRAK',
      isi: 'Perjanjian ini bersifat Exclusive Listing dengan jangka waktu {durasi_kontrak} bulan terhitung sejak tanggal penandatanganan. Selama jangka waktu tersebut, Pihak Kedua memberikan hak pemasaran secara eksklusif kepada Pihak Pertama dan tidak menunjuk agen lain maupun memasarkan sendiri di luar koordinasi dengan Pihak Pertama.',
      berlaku: { listing: ['exclusive'], tujuan: SEMUA_TUJUAN } },
    { judul: 'JENIS LISTING & MASA KONTRAK',
      isi: 'Perjanjian ini bersifat Open Listing. Pihak Kedua berhak menunjuk agen pemasaran lain dan/atau memasarkan sendiri properti tersebut. Perjanjian berlaku sejak ditandatangani sampai properti {hasil} atau sampai diakhiri oleh salah satu Pihak sesuai Pasal 6.',
      berlaku: { listing: ['open'], tujuan: SEMUA_TUJUAN } },
    { judul: 'FEE PEMASARAN',
      isi: `${P3_AWAL}Fee dibayarkan ${BAYAR_JUAL}.`,
      berlaku: { listing: SEMUA_LISTING, tujuan: ['jual'] } },
    { judul: 'FEE PEMASARAN',
      isi: `${P3_AWAL}${NILAI_SEWA} Fee dibayarkan ${BAYAR_SEWA}.`,
      berlaku: { listing: SEMUA_LISTING, tujuan: ['sewa'] } },
    { judul: 'FEE PEMASARAN',
      isi: `${P3_AWAL}${NILAI_SEWA} Untuk transaksi Jual Beli, fee dibayarkan ${BAYAR_JUAL}; untuk transaksi Sewa Menyewa, fee dibayarkan ${BAYAR_SEWA}.`,
      berlaku: { listing: SEMUA_LISTING, tujuan: ['jual_sewa'] } },
    { judul: 'JENIS PEMASARAN',
      isi: 'Pihak Pertama memperoleh hak pemasaran tunggal (eksklusif) dan berhak memasarkan properti melalui seluruh kanal yang dimilikinya. Selama masa eksklusif, seluruh pemasaran properti dikoordinasikan melalui Pihak Pertama.',
      berlaku: { listing: ['exclusive'], tujuan: SEMUA_TUJUAN } },
    { judul: 'JENIS PEMASARAN',
      isi: 'Pihak Pertama berhak memasarkan properti melalui seluruh kanal yang dimilikinya tanpa pembatasan eksklusif. Pemasaran oleh Pihak Pertama tidak menghapus hak Pihak Kedua untuk memasarkan sendiri atau melalui pihak lain.',
      berlaku: { listing: ['open'], tujuan: SEMUA_TUJUAN } },
    { judul: 'KEWAJIBAN PARA PIHAK',
      isi: `${P5_DASAR}; (d) tidak memasarkan properti kepada pihak lain maupun menunjuk agen lain selama jangka waktu eksklusif berlangsung.`,
      berlaku: { listing: ['exclusive'], tujuan: SEMUA_TUJUAN } },
    { judul: 'KEWAJIBAN PARA PIHAK',
      isi: `${P5_DASAR}.`,
      berlaku: { listing: ['open'], tujuan: SEMUA_TUJUAN } },
    { judul: 'PENARIKAN PROPERTI & PENGAKHIRAN',
      isi: 'Salah satu Pihak dapat mengakhiri perjanjian ini dengan pemberitahuan tertulis kepada Pihak lain sekurang-kurangnya 14 (empat belas) hari sebelumnya. Apabila Pihak Kedua menarik properti dari pemasaran atau mengakhiri perjanjian setelah Pihak Pertama mengeluarkan biaya pemasaran yang nyata (antara lain biaya iklan, pemotretan, atau survei), Pihak Kedua mengganti biaya yang telah dikeluarkan tersebut secara wajar dan dapat dibuktikan. Apabila dalam jangka waktu 60 (enam puluh) hari setelah perjanjian berakhir properti {hasil} kepada {pihak} yang sebelumnya telah diperkenalkan atau diperantarai oleh Pihak Pertama, Pihak Pertama tetap berhak atas fee pemasaran sebagaimana diatur dalam Pasal 3.',
      berlaku: { listing: SEMUA_LISTING, tujuan: SEMUA_TUJUAN } },
    { judul: 'PENYELESAIAN SENGKETA',
      isi: 'Apabila timbul perselisihan dalam pelaksanaan perjanjian ini, Para Pihak sepakat menyelesaikannya secara musyawarah untuk mufakat. Apabila musyawarah tidak mencapai kesepakatan dalam 30 (tiga puluh) hari, Para Pihak sepakat menyelesaikannya melalui Pengadilan Negeri yang wilayah hukumnya meliputi lokasi properti objek perjanjian sebagaimana disebut dalam Pasal 1.',
      berlaku: { listing: SEMUA_LISTING, tujuan: SEMUA_TUJUAN } },
    { judul: 'LAIN-LAIN',
      isi: 'Perjanjian ini dibuat dan ditandatangani secara elektronik oleh Para Pihak dengan kesadaran penuh tanpa paksaan, dan memiliki kekuatan hukum yang sama dengan perjanjian tertulis sesuai UU ITE No. 11 Tahun 2008 dan perubahannya. Segala perubahan atas perjanjian ini hanya sah apabila dibuat secara tertulis dan disetujui oleh kedua belah pihak.',
      berlaku: { listing: SEMUA_LISTING, tujuan: SEMUA_TUJUAN } },
  ],
};

/** Varian perjanjian: listing + jenis transaksi (dari tujuan properti). */
export function varianDari(agr) {
  return {
    listing: agr?.jenis_listing === 'exclusive' ? 'exclusive' : 'open',
    tx: jenisTransaksi(agr?.tujuan),
  };
}

/** Blok template yang berlaku untuk varian ini, urutan template. */
export function pilihBlok(template, varian) {
  return template.blok
    .filter(b => b.berlaku.listing.includes(varian.listing) && b.berlaku.tujuan.includes(varian.tx.kode))
    .map(b => ({ judul: b.judul, isi: b.isi }));
}

/** Salinan beku untuk disimpan ke agreements.pasal_json saat link TTD dibuat. */
export function buatSnapshot(template, agr) {
  const varian = varianDari(agr);
  return { versi: template.versi, varian, blok: pilihBlok(template, varian) };
}

/**
 * Baca pasal_json. Kosong → null (perjanjian lama). Rusak → MELEMPAR:
 * diam-diam jatuh ke teks lama berarti menampilkan/menandatangani teks yang
 * berbeda dari yang dibekukan — lebih baik gagal tertutup dan tercatat.
 */
export function bacaSnapshot(raw) {
  if (raw == null || raw === '') return null;
  let v;
  try { v = JSON.parse(raw); } catch { throw new Error('pasal_json rusak (bukan JSON)'); }
  const sah = v && Array.isArray(v.blok) && v.blok.length > 0
    && v.blok.every(b => b && typeof b.judul === 'string' && typeof b.isi === 'string')
    && v.varian && ['open', 'exclusive'].includes(v.varian.listing) && v.varian.tx && typeof v.varian.tx.label === 'string';
  if (!sah) throw new Error('pasal_json rusak (bentuk tidak dikenal)');
  return v;
}

/** Nilai placeholder untuk satu perjanjian. Rumus SAMA dengan buildPasalPasal(). */
export function nilaiPlaceholder(agr, varian) {
  const alamatProperti = [agr.alamat, agr.kelurahan, agr.kecamatan, agr.kabupaten, agr.provinsi].filter(Boolean).join(', ');
  return {
    jenis_listing: varian.listing === 'exclusive' ? 'Exclusive Listing' : 'Open Listing',
    jenis_properti: `${agr.jenis_properti ?? 'Properti'}`,
    alamat_properti: alamatProperti || `${agr.kecamatan}, ${agr.kabupaten}`,
    legalitas: `${agr.legalitas ?? 'belum diverifikasi'}`,
    harga_penawaran: teksHargaPenawaran(agr),
    durasi_kontrak: `${agr.durasi_kontrak}`,
    fee_persen: `${agr.fee_persen}`,
    jenis_transaksi: varian.tx.label,
    hasil: varian.tx.hasil,
    pihak: varian.tx.pihak,
  };
}

/** Render salinan → [{pasal, judul, isi}] — urutan kunci SAMA dengan buildPasalPasal (versi_dokumen di-hash dari JSON). */
export function renderPasal(snapshot, agr) {
  const nilai = nilaiPlaceholder(agr, snapshot.varian);
  return snapshot.blok.map((b, i) => ({
    pasal: i + 1,
    judul: b.judul,
    isi: b.isi.replace(/\{([a-z_]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(nilai, k) ? nilai[k] : m)),
  }));
}

/** Placeholder di teks yang tidak dikenal (untuk validasi editor C2/C3). */
export function placeholderAsing(teks) {
  return [...String(teks ?? '').matchAll(/\{([^{}]*)\}/g)].map(m => m[1]).filter(k => !Object.prototype.hasOwnProperty.call(PLACEHOLDER, k));
}

// ─── Validasi editor (C2 per perjanjian, C3 template) ───────────────────────
export const MAKS_BLOK = 30;
export const MAKS_JUDUL = 120;
export const MAKS_ISI = 5000;

/**
 * Karakter yang TIDAK bisa dicetak font PDF (WinAnsi) dan akan menjadi "?"
 * di arsip PDF — lihat toWinAnsi() di functions/_lib/pdf.js. Tanda pisah,
 * kutip lengkung, elipsis, ≥ ≤ diganti padanan ASCII (bukan "?"), jadi tidak
 * dilaporkan. Dipakai editor untuk memperingatkan SEBELUM disimpan.
 */
const DIPETAKAN_PDF = new Set(['—', '–', '‘', '’', '“', '”', '…', '≥', '≤']);
export function karakterHilangDiPdf(teks) {
  return [...new Set([...String(teks ?? '')].filter(c => c.codePointAt(0) > 0xFF && !DIPETAKAN_PDF.has(c)))];
}

/**
 * Validasi daftar blok kiriman editor. Hanya {judul, isi} yang diambil
 * (field lain dibuang); spasi tepi dirapikan.
 * @returns {{galat: string} | {blok: {judul: string, isi: string}[]}}
 */
export function validasiBlok(blok) {
  if (!Array.isArray(blok) || blok.length === 0) return { galat: 'Minimal satu pasal' };
  if (blok.length > MAKS_BLOK) return { galat: `Maksimal ${MAKS_BLOK} pasal` };
  const bersih = [];
  for (let i = 0; i < blok.length; i++) {
    const b = blok[i];
    const judul = typeof b?.judul === 'string' ? b.judul.trim() : '';
    const isi = typeof b?.isi === 'string' ? b.isi.trim() : '';
    const no = `Pasal ${i + 1}`;
    if (!judul) return { galat: `${no}: judul wajib diisi` };
    if (!isi) return { galat: `${no}: isi wajib diisi` };
    if (judul.length > MAKS_JUDUL) return { galat: `${no}: judul maksimal ${MAKS_JUDUL} karakter` };
    if (isi.length > MAKS_ISI) return { galat: `${no}: isi maksimal ${MAKS_ISI} karakter` };
    const asing = [...placeholderAsing(judul), ...placeholderAsing(isi)];
    if (asing.length) return { galat: `${no}: placeholder tidak dikenal {${asing[0]}} — pakai tombol sisip data` };
    bersih.push({ judul, isi });
  }
  return { blok: bersih };
}

/** Pasal untuk ditampilkan/ditandatangani/dicetak: salinan bila ada, selain itu teks lama. */
export function pasalDokumen(agr) {
  const snap = bacaSnapshot(agr.pasal_json);
  return snap ? renderPasal(snap, agr) : susunPasalLama(agr);
}

// ─── Teks lama (sebelum 2026-11-21) — JANGAN DIUBAH ─────────────────────────
// Dipindahkan APA ADANYA dari functions/api/sign/[token].js. Dipakai perjanjian
// yang belum punya salinan (dibuat sebelum migrasi 0063): mengubah satu huruf
// di sini mengubah versi_dokumen mereka → pemilik yang sedang membuka link
// terkena 409 "dokumen berubah", dan isi yang mereka tanda tangani berbeda
// dari yang dulu dikirim. Juga patokan uji kesetaraan TEMPLATE_V1.
export function susunPasalLama(agr) {
  const isExclusive    = agr.jenis_listing === 'exclusive';
  const jenisListing   = isExclusive ? 'Exclusive Listing' : 'Open Listing';
  const tx             = jenisTransaksi(agr.tujuan);
  const alamatProperti = [agr.alamat, agr.kelurahan, agr.kecamatan, agr.kabupaten, agr.provinsi].filter(Boolean).join(', ');

  // Waktu pembayaran fee per jenis transaksi. Kalimat Jual Beli tidak berubah.
  const bayarJual = 'paling lambat 3 (tiga) hari kerja setelah penandatanganan Akta Jual Beli (AJB), atau setelah pembayaran uang muka minimal 30% dari harga kesepakatan apabila pembayaran dilakukan secara tunai bertahap';
  const bayarSewa = 'paling lambat 3 (tiga) hari kerja setelah Pihak Kedua menerima pembayaran sewa pertama dari penyewa';
  const nilaiSewa = 'Untuk transaksi Sewa Menyewa, nilai transaksi adalah total nilai sewa untuk masa sewa yang disepakati dengan penyewa.';
  const kalimatBayar = tx.kode === 'sewa'
    ? `${nilaiSewa} Fee dibayarkan ${bayarSewa}.`
    : tx.kode === 'jual_sewa'
      ? `${nilaiSewa} Untuk transaksi Jual Beli, fee dibayarkan ${bayarJual}; untuk transaksi Sewa Menyewa, fee dibayarkan ${bayarSewa}.`
      : `Fee dibayarkan ${bayarJual}.`;

  // Pasal 5 base — Pihak Kedua; huruf (d) hanya untuk Exclusive
  const p5Base = `Pihak Pertama berkewajiban: (a) memasarkan properti secara profesional dan aktif; (b) menjaga kerahasiaan data Pihak Kedua; (c) melaporkan perkembangan pemasaran secara berkala. Pihak Kedua berkewajiban: (a) memberikan informasi properti yang benar dan lengkap; (b) menyediakan akses untuk survei dan pemotretan; (c) memberitahukan kepada Pihak Pertama apabila properti telah ${tx.hasil} atau ditarik dari pemasaran.`;

  return [
    {
      pasal: 1,
      judul: 'OBJEK PERJANJIAN',
      isi: `Pihak Pertama diberikan hak pemasaran ${jenisListing} atas properti: ${agr.jenis_properti ?? 'Properti'}, berlokasi di ${alamatProperti || `${agr.kecamatan}, ${agr.kabupaten}`}. Legalitas: ${agr.legalitas ?? 'belum diverifikasi'}. ${teksHargaPenawaran(agr)}.`,
    },
    {
      pasal: 2,
      judul: 'JENIS LISTING & MASA KONTRAK',
      isi: isExclusive
        ? `Perjanjian ini bersifat Exclusive Listing dengan jangka waktu ${agr.durasi_kontrak} bulan terhitung sejak tanggal penandatanganan. Selama jangka waktu tersebut, Pihak Kedua memberikan hak pemasaran secara eksklusif kepada Pihak Pertama dan tidak menunjuk agen lain maupun memasarkan sendiri di luar koordinasi dengan Pihak Pertama.`
        : `Perjanjian ini bersifat Open Listing. Pihak Kedua berhak menunjuk agen pemasaran lain dan/atau memasarkan sendiri properti tersebut. Perjanjian berlaku sejak ditandatangani sampai properti ${tx.hasil} atau sampai diakhiri oleh salah satu Pihak sesuai Pasal 6.`,
    },
    {
      pasal: 3,
      judul: 'FEE PEMASARAN',
      isi: `Pihak Kedua menyetujui fee pemasaran sebesar ${agr.fee_persen}% dari nilai transaksi ${tx.label}. Fee menjadi hak Pihak Pertama apabila transaksi terjadi dengan ${tx.pihak} yang diperkenalkan, diperantarai, atau diperoleh melalui upaya pemasaran Pihak Pertama. ${kalimatBayar}`,
    },
    {
      pasal: 4,
      judul: 'JENIS PEMASARAN',
      isi: isExclusive
        ? `Pihak Pertama memperoleh hak pemasaran tunggal (eksklusif) dan berhak memasarkan properti melalui seluruh kanal yang dimilikinya. Selama masa eksklusif, seluruh pemasaran properti dikoordinasikan melalui Pihak Pertama.`
        : `Pihak Pertama berhak memasarkan properti melalui seluruh kanal yang dimilikinya tanpa pembatasan eksklusif. Pemasaran oleh Pihak Pertama tidak menghapus hak Pihak Kedua untuk memasarkan sendiri atau melalui pihak lain.`,
    },
    {
      pasal: 5,
      judul: 'KEWAJIBAN PARA PIHAK',
      isi: isExclusive
        ? p5Base.slice(0, -1) + '; (d) tidak memasarkan properti kepada pihak lain maupun menunjuk agen lain selama jangka waktu eksklusif berlangsung.'
        : p5Base,
    },
    {
      pasal: 6,
      judul: 'PENARIKAN PROPERTI & PENGAKHIRAN',
      isi: `Salah satu Pihak dapat mengakhiri perjanjian ini dengan pemberitahuan tertulis kepada Pihak lain sekurang-kurangnya 14 (empat belas) hari sebelumnya. Apabila Pihak Kedua menarik properti dari pemasaran atau mengakhiri perjanjian setelah Pihak Pertama mengeluarkan biaya pemasaran yang nyata (antara lain biaya iklan, pemotretan, atau survei), Pihak Kedua mengganti biaya yang telah dikeluarkan tersebut secara wajar dan dapat dibuktikan. Apabila dalam jangka waktu 60 (enam puluh) hari setelah perjanjian berakhir properti ${tx.hasil} kepada ${tx.pihak} yang sebelumnya telah diperkenalkan atau diperantarai oleh Pihak Pertama, Pihak Pertama tetap berhak atas fee pemasaran sebagaimana diatur dalam Pasal 3.`,
    },
    {
      pasal: 7,
      judul: 'PENYELESAIAN SENGKETA',
      isi: `Apabila timbul perselisihan dalam pelaksanaan perjanjian ini, Para Pihak sepakat menyelesaikannya secara musyawarah untuk mufakat. Apabila musyawarah tidak mencapai kesepakatan dalam 30 (tiga puluh) hari, Para Pihak sepakat menyelesaikannya melalui Pengadilan Negeri yang wilayah hukumnya meliputi lokasi properti objek perjanjian sebagaimana disebut dalam Pasal 1.`,
    },
    {
      pasal: 8,
      judul: 'LAIN-LAIN',
      isi: `Perjanjian ini dibuat dan ditandatangani secara elektronik oleh Para Pihak dengan kesadaran penuh tanpa paksaan, dan memiliki kekuatan hukum yang sama dengan perjanjian tertulis sesuai UU ITE No. 11 Tahun 2008 dan perubahannya. Segala perubahan atas perjanjian ini hanya sah apabila dibuat secara tertulis dan disetujui oleh kedua belah pihak.`,
    },
  ];
}
