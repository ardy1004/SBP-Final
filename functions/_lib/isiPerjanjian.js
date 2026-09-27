// Isi perjanjian titip jual yang dilihat & ditandatangani pemilik — SATU SUMBER.
// Diimpor backend secara natif (sign/[token].js, pdf.js, titip-jual-lengkapi.js,
// admin agreements) DAN frontend lewat Vite (SignPage, AdminAgreementDetailPage)
// — pola yang sama dengan identitas.js / hargaTampil.js.
//
// KENAPA ADA (audit 2026-09-27). Tiga salinan pemetaan "bertindak sebagai"
// (pdf.js, SignPage.tsx, AdminAgreementDetailPage.tsx) hanya mengenal
// `ahli_waris` dan nilai `kuasa` yang tidak pernah ada — `suami_istri` dan
// `lainnya` jatuh ke else "Pemilik Langsung". Akibatnya 6 perjanjian yang SUDAH
// ditandatangani menyatakan pemilik bertindak sebagai "Pemilik Langsung" padahal
// ia suami/istri pemilik sertifikat atau pihak lain. Dokumen hukum menaikkan
// kewenangan penandatangan tanpa sepengetahuannya.
//
// Pada perjanjian yang sama: listing sewa tercetak "Harga negosiasi" (kolom
// `harga` = harga JUAL, 0 untuk sewa — lihat hargaTampil.js), jenis transaksi
// dipatok "Jual Beli" untuk `dijual_disewa`, dan alamat pemilik tercetak ganda
// (alamat_ktp dari form sudah memuat kelurahan/kecamatan/RT-RW).
//
// ⚠️ Semua teks yang bisa masuk PDF WAJIB ASCII/WinAnsi (pdf-lib StandardFonts).

import { hargaTampil } from './hargaTampil.js';

/** Nilai `owners.bertindak_sebagai` yang sah untuk DITULIS (form & admin). */
export const BERTINDAK_VALID = ['pemilik_sertifikat', 'suami_istri', 'ahli_waris', 'lainnya'];

/**
 * Label tiap nilai. `kuasa` hanya untuk MEMBACA data lama — tidak ada form yang
 * pernah menulisnya, tapi label yang benar lebih baik daripada menebak.
 */
export const LABEL_BERTINDAK = {
  pemilik_sertifikat: 'Pemilik Sertifikat',
  suami_istri:        'Suami/Istri Pemilik Sertifikat',
  ahli_waris:         'Ahli Waris',
  lainnya:            'Pihak Lain (Bukan Pemilik Sertifikat)',
  kuasa:              'Pemegang Kuasa',
};

/** Nilai tak dikenal/kosong → "-", BUKAN label kewenangan tertinggi. */
export function labelBertindak(kode) {
  return LABEL_BERTINDAK[kode] ?? '-';
}

const berisi = v => typeof v === 'string' && v.trim() !== '';

/**
 * Alamat pemilik untuk dokumen. `alamat_ktp` dari form Titip Jual sudah berbentuk
 * "Kel. X, Kec. Y, Kab, Prov (RT/RW z)", sedangkan data lama/admin bisa berupa
 * alamat jalan polos. Bagian RT/RW, kelurahan, dan kecamatan hanya ditambahkan
 * bila BELUM tertulis di alamat_ktp — tanpa menebak format mana yang dipakai.
 *
 * @param {{alamat_ktp?: string|null, rt_rw?: string|null, kelurahan?: string|null, kecamatan?: string|null}} o
 */
export function susunAlamatPemilik(o) {
  const alamat = berisi(o?.alamat_ktp) ? o.alamat_ktp.trim() : '';
  const kecil = alamat.toLowerCase();
  const belumAda = v => berisi(v) && !kecil.includes(v.trim().toLowerCase());
  const bagian = [alamat];
  if (belumAda(o?.rt_rw)) bagian.push(`RT/RW ${o.rt_rw.trim()}`);
  if (belumAda(o?.kelurahan)) bagian.push(o.kelurahan.trim());
  if (belumAda(o?.kecamatan)) bagian.push(o.kecamatan.trim());
  return bagian.filter(Boolean).join(', ');
}

/**
 * Jenis transaksi dibaca dari `properties.tujuan` SAAT dokumen disusun — bukan
 * dari `agreements.jenis_transaksi`. Kolom itu dibatasi CHECK('jual','sewa')
 * sehingga `dijual_disewa` tersimpan sebagai 'jual', dan tidak ikut berubah
 * bila admin mengganti tujuan listing. Mengubah CHECK butuh membangun ulang
 * tabel (pola migrasi 0022 yang nyaris menghapus data) — sengaja tidak.
 *
 * @returns {{kode: 'jual'|'sewa'|'jual_sewa', label: string, hasil: string, pihak: string}}
 *   `hasil` = kata kerja hasil ("terjual"); `pihak` = lawan transaksi ("pembeli").
 */
export function jenisTransaksi(tujuan) {
  if (tujuan === 'disewa') {
    return { kode: 'sewa', label: 'Sewa Menyewa', hasil: 'tersewa', pihak: 'penyewa' };
  }
  if (tujuan === 'dijual_disewa') {
    return { kode: 'jual_sewa', label: 'Jual Beli dan/atau Sewa Menyewa', hasil: 'terjual atau tersewa', pihak: 'pembeli atau penyewa' };
  }
  return { kode: 'jual', label: 'Jual Beli', hasil: 'terjual', pihak: 'pembeli' };
}

/**
 * Batas waktu perbaikan isi kontrak. Perjanjian yang ditandatangani SEBELUM ini
 * dicetak oleh kode lama (label kewenangan, harga sewa, jenis transaksi keliru).
 * Sengaja dibulatkan ke atas dari waktu deploy — false positive (banner muncul
 * pada dokumen yang sebenarnya sudah benar) jauh lebih murah daripada dokumen
 * keliru yang tidak ditandai.
 */
export const BATAS_CETAK_KELIRU = '2026-09-27T12:00:00.000Z';

/**
 * Apakah perjanjian signed ini tercetak keliru dan belum punya versi perbaikan?
 * Hanya kondisi yang BENAR-BENAR mengubah isi dokumen: kewenangan suami/istri
 * atau pihak lain (dulu tercetak "Pemilik Langsung"), dan listing yang
 * melibatkan sewa (harga "negosiasi" / fee hanya untuk jual beli).
 *
 * @param {{status?: string, digantikan_oleh?: number|null, signed_at?: string|null, bertindak_sebagai?: string|null, tujuan?: string|null}} a
 */
export function perluVersiPerbaikan(a) {
  if (a?.status !== 'signed' || a.digantikan_oleh) return false;
  const t = Date.parse(a.signed_at ?? '');
  if (!Number.isFinite(t) || t >= Date.parse(BATAS_CETAK_KELIRU)) return false;
  return a.bertindak_sebagai === 'suami_istri' || a.bertindak_sebagai === 'lainnya'
    || a.tujuan === 'disewa' || a.tujuan === 'dijual_disewa';
}

function rupiah(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

/**
 * Kalimat harga penawaran di Pasal 1 (tanpa titik akhir).
 * `nego`/`nett` adalah pilihan pemilik di form (saling eksklusif); keterangan
 * hanya ditulis bila memang dipilih — dulu "(dapat dinegosiasikan)" selalu
 * tercetak, termasuk untuk pemilik yang memilih harga nett.
 *
 * @param {{tujuan?: string, harga?: number|null, harga_sewa_tahun?: number|null, nego?: number|boolean|null, nett?: number|boolean|null}} p
 */
export function teksHargaPenawaran(p) {
  const h = hargaTampil(p);
  const ket = p?.nett ? ' (harga nett)' : p?.nego ? ' (dapat dinegosiasikan)' : '';
  const jual = h.jual ? rupiah(h.jual) : null;
  const sewa = h.sewa ? `${rupiah(h.sewa)} per tahun` : null;

  if (p?.tujuan === 'disewa') {
    return sewa ? `Harga sewa penawaran: ${sewa}${ket}` : 'Harga sewa penawaran: akan disepakati Para Pihak';
  }
  if (p?.tujuan === 'dijual_disewa') {
    return `Harga penawaran jual: ${jual ?? 'akan disepakati Para Pihak'}; harga sewa penawaran: ${sewa ?? 'akan disepakati Para Pihak'}${ket}`;
  }
  return jual ? `Harga penawaran: ${jual}${ket}` : 'Harga penawaran: akan disepakati Para Pihak';
}
