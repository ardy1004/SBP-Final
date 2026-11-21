// Portofolio "bukti kerja" (2026-11-21, migrasi 0062) — aturan bersama
// backend ↔ admin ↔ loader SSR. Satu sumber: endpoint admin memvalidasi dengan
// fungsi yang sama yang dipakai form admin untuk peringatan dini.

import { buildPropertyUrl } from './propertyUrl.js';

export const KATEGORI_PORTFOLIO = [
  { id: 'ajb', label: 'AJB' },
  { id: 'survey', label: 'Survey lokasi' },
  { id: 'serah_terima', label: 'Serah terima kunci' },
  { id: 'lainnya', label: 'Lainnya' },
];
export const KATEGORI_SAH = KATEGORI_PORTFOLIO.map(k => k.id);
export const labelKategori = (id) => KATEGORI_PORTFOLIO.find(k => k.id === id)?.label ?? 'Lainnya';

export const MAKS_KETERANGAN = 140;
export const MAKS_LOKASI = 80;
// Strip beranda baru tampil bila foto yang tampil sudah cukup — 1–3 kotak yang
// bergulir terlihat sepi dan justru menurunkan kesan kredibel.
export const MIN_TAMPIL_BERANDA = 4;

// 16 digit beruntun (boleh dipisah spasi/titik/strip) = pola NIK. Keterangan
// publik tidak boleh memuatnya — NIK pemilik pernah bocor lewat jalur lain
// (lihat CLAUDE.md, scope JWT); di sini dicegah sejak input.
const POLA_NIK = /(?:\d[\s.\-]?){15}\d/;

/** @returns {string|null} pesan galat, atau null bila sah. */
export function periksaKeterangan(teks) {
  const t = String(teks ?? '');
  if (t.length > MAKS_KETERANGAN) return `Keterangan maksimal ${MAKS_KETERANGAN} karakter`;
  if (POLA_NIK.test(t)) return 'Keterangan tidak boleh memuat nomor 16 digit (pola NIK) — ini tampil publik';
  return null;
}

/** Tanggal opsional "YYYY-MM-DD"; kosong = null. */
export function normalTanggal(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined; // undefined = tidak sah
}

/**
 * Item publik untuk loader SSR (beranda & /portfolio). Disaring GANDA
 * (`tampil = 1 AND aman_dikonfirmasi = 1`) — gerbang server sudah menjaga
 * keduanya, tapi halaman publik tidak boleh bergantung pada satu lapis saja.
 * Tautan listing hanya untuk listing yang masih tayang.
 * D1 error MELEMPAR — pemanggil wajib menangkapnya sendiri (lihat home.tsx).
 */
export async function ambilPortfolioPublik(db, batas = 24) {
  const res = await db.prepare(
    `SELECT pi.id, pi.kategori, pi.foto_key, pi.thumb_key, pi.keterangan, pi.lokasi, pi.tanggal,
            p.slug, p.jenis_properti, p.tujuan, p.provinsi, p.kabupaten, p.kecamatan, p.status_publish
       FROM portfolio_items pi LEFT JOIN properties p ON p.id = pi.property_id
      WHERE pi.tampil = 1 AND pi.aman_dikonfirmasi = 1
      ORDER BY pi.urutan ASC, pi.id DESC
      LIMIT ?`
  ).bind(batas).all();
  return (res.results ?? []).map(r => ({
    id: r.id,
    kategori: r.kategori,
    foto_key: r.foto_key,
    thumb_key: r.thumb_key,
    keterangan: r.keterangan ?? '',
    lokasi: r.lokasi ?? null,
    tanggal: r.tanggal ?? null,
    url_listing: r.slug && r.status_publish === 'published' ? buildPropertyUrl(r, '') : null,
  }));
}

/** Kolom item untuk admin (alias pi = portfolio_items, p = properties). */
export const KOLOM_ITEM = `pi.id, pi.kategori, pi.foto_key, pi.thumb_key, pi.keterangan, pi.lokasi, pi.tanggal,
  pi.property_id, p.kode_listing, pi.tampil, pi.aman_dikonfirmasi, pi.urutan, pi.dibuat_at, pi.diubah_at`;

/** Key R2 portofolio yang sah (hasil POST /admin/portfolio/foto). */
export const keySah = (k) => typeof k === 'string' && /^portfolio\/[0-9a-f-]{36}(-t)?\.webp$/.test(k);

/**
 * Gabungkan isian baru dengan baris lama (PATCH) atau kosong (POST), lalu
 * validasi. Hanya field yang DIKIRIM yang berubah. Kode listing (opsional)
 * diterjemahkan ke property_id; kode tak dikenal = galat, bukan diam-diam null.
 *
 * Aturan tampil: `tampil=1` WAJIB `aman_dikonfirmasi=1`. Mencabut konfirmasi
 * aman otomatis menurunkan tampil — foto yang belum dinyatakan aman tidak
 * pernah boleh tetap publik.
 *
 * @returns {Promise<{galat?: string, isi?: object}>}
 */
export async function siapkanIsian(env, body, lama = null) {
  const b = body ?? {};
  const ada = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const isi = {
    kategori: lama?.kategori ?? 'survey',
    keterangan: lama?.keterangan ?? '',
    lokasi: lama?.lokasi ?? null,
    tanggal: lama?.tanggal ?? null,
    property_id: lama?.property_id ?? null,
    aman_dikonfirmasi: lama?.aman_dikonfirmasi ?? 0,
    tampil: lama?.tampil ?? 0,
  };
  if (ada('kategori')) {
    if (!KATEGORI_SAH.includes(b.kategori)) return { galat: 'Kategori tidak dikenal' };
    isi.kategori = b.kategori;
  }
  if (ada('keterangan')) {
    const t = String(b.keterangan ?? '').trim();
    const g = periksaKeterangan(t);
    if (g) return { galat: g };
    isi.keterangan = t;
  }
  if (ada('lokasi')) {
    const l = String(b.lokasi ?? '').trim();
    if (l.length > MAKS_LOKASI) return { galat: `Lokasi maksimal ${MAKS_LOKASI} karakter` };
    isi.lokasi = l || null;
  }
  if (ada('tanggal')) {
    const t = normalTanggal(b.tanggal);
    if (t === undefined) return { galat: 'Tanggal harus berformat YYYY-MM-DD' };
    isi.tanggal = t;
  }
  if (ada('kode_listing')) {
    const kode = String(b.kode_listing ?? '').trim();
    if (!kode) isi.property_id = null;
    else {
      const p = await env.DB.prepare('SELECT id FROM properties WHERE kode_listing = ?').bind(kode).first();
      if (!p) return { galat: `Kode listing "${kode}" tidak ditemukan` };
      isi.property_id = p.id;
    }
  }
  if (ada('aman_dikonfirmasi')) isi.aman_dikonfirmasi = b.aman_dikonfirmasi ? 1 : 0;
  if (ada('tampil')) isi.tampil = b.tampil ? 1 : 0;
  if (isi.aman_dikonfirmasi === 0) {
    if (ada('tampil') && isi.tampil === 1) return { galat: 'Centang "sudah aman ditampilkan" dulu sebelum menampilkan foto' };
    isi.tampil = 0;
  }
  return { isi };
}
