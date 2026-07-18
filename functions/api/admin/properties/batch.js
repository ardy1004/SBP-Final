// POST /api/admin/properties/batch — import banyak properti sekaligus (partial insert)
// Auth: _middleware.js (otomatis)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { nextKodeSeq, fmtSeq, isUniqueErr } from '../../../_lib/kodeSeq.js';

const VALID_JENIS  = new Set(['apartment','rumah','tanah','kost','hotel','homestay','villa','ruko','gudang','komersial']);
const VALID_TUJUAN = new Set(['dijual','disewa','dijual_disewa']);

function sanitize(val, max = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, max);
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function today8() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
}

function randHex3() {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function toInt(val) {
  const n = parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const rows = body.rows;
  if (!Array.isArray(rows)) return jsonError('rows harus berupa array', 400);
  if (rows.length === 0)    return jsonError('rows tidak boleh kosong', 400);
  if (rows.length > 500)    return jsonError('Maksimal 500 baris per import', 400);

  const date8  = today8();
  const prefix = `SBP-${date8}-`;
  const db     = env.DB;

  let inserted = 0;
  const errors = [];
  const inserted_rows = [];

  // Sequence dihitung SEKALI lalu di-increment lokal per baris sukses —
  // query COUNT per baris rawan duplikat (COUNT turun saat ada baris terhapus).
  let seqN;
  try {
    seqN = await nextKodeSeq(db, 'properties', 'kode_listing', prefix);
  } catch (err) {
    console.error('[batch] gagal ambil sequence:', err.message);
    return jsonError('Gagal generate kode listing', 500);
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i];

    // Validasi wajib
    const title   = sanitize(r.title   ?? '', 200);
    const jenis   = sanitize(r.jenis_properti ?? '', 30);
    const tujuan  = sanitize(r.tujuan  ?? '', 20);
    const hargaRaw = toInt(r.harga);

    if (!title) {
      errors.push({ row: rowNum, field: 'title', message: 'Judul properti wajib diisi' });
      continue;
    }
    if (!VALID_JENIS.has(jenis)) {
      errors.push({ row: rowNum, field: 'jenis_properti', message: `Nilai tidak valid: "${jenis}". Gunakan: ${[...VALID_JENIS].join(', ')}` });
      continue;
    }
    if (!VALID_TUJUAN.has(tujuan)) {
      errors.push({ row: rowNum, field: 'tujuan', message: `Nilai tidak valid: "${tujuan}". Gunakan: dijual, disewa, dijual_disewa` });
      continue;
    }
    if (hargaRaw === null || hargaRaw < 0) {
      errors.push({ row: rowNum, field: 'harga', message: 'Harga harus angka non-negatif' });
      continue;
    }

    // Field opsional
    const provinsi  = sanitize(r.provinsi  ?? 'DI Yogyakarta', 100) || 'DI Yogyakarta';
    const kabupaten = sanitize(r.kabupaten ?? '', 100);
    const kecamatan = sanitize(r.kecamatan ?? '', 100);
    const kelurahan = sanitize(r.kelurahan ?? '', 100);
    const deskripsi = sanitize(r.deskripsi ?? '', 5000);
    const legalitas = sanitize(r.legalitas ?? '', 200);

    const luas_tanah          = toInt(r.luas_tanah)          ?? null;
    const luas_bangunan       = toInt(r.luas_bangunan)       ?? null;
    const jumlah_kamar_tidur  = toInt(r.jumlah_kamar_tidur)  ?? null;
    const jumlah_kamar_mandi  = toInt(r.jumlah_kamar_mandi)  ?? null;
    const nego          = r.nego          == 1 || r.nego          === '1' ? 1 : 0;
    const nett          = r.nett          == 1 || r.nett          === '1' ? 1 : 0;
    const badge_premium  = r.badge_premium  == 1 || r.badge_premium  === '1' ? 1 : 0;
    const badge_featured = r.badge_featured == 1 || r.badge_featured === '1' ? 1 : 0;
    const badge_hot      = r.badge_hot      == 1 || r.badge_hot      === '1' ? 1 : 0;
    const status_sold    = r.status_sold    == 1 || r.status_sold    === '1' ? 1 : 0;

    // Generate kode_listing + slug (pola identik index.js)
    let kode_listing = `${prefix}${fmtSeq(seqN)}`;
    const base = slugify(title);
    const slug = base ? `${base}-${randHex3()}` : `properti-${randHex3()}`;

    // INSERT — partial insert intentional, tidak pakai transaction
    let property_id = null;
    try {
      const insertRow = () => db.prepare(`
        INSERT INTO properties
          (kode_listing, title, slug, jenis_properti, tujuan, harga,
           provinsi, kabupaten, kecamatan, kelurahan, alamat,
           luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
           legalitas, deskripsi, nego, nett,
           badge_premium, badge_featured, badge_hot, status_sold,
           status_publish, created_at, updated_at)
        VALUES (?,?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,  ?,?,?,?,  ?,?,?,?,  'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).bind(
        kode_listing, title, slug, jenis, tujuan, hargaRaw,
        provinsi, kabupaten, kecamatan, kelurahan, '',
        luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
        legalitas || null, deskripsi || null, nego, nett,
        badge_premium, badge_featured, badge_hot, status_sold,
      ).run();

      // Retry saat tabrakan UNIQUE kode_listing (import paralel / race antar sesi)
      let result;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await insertRow();
          break;
        } catch (err) {
          if (!isUniqueErr(err) || !/kode_listing/i.test(err.message ?? '') || attempt >= 3) throw err;
          seqN++;
          kode_listing = `${prefix}${fmtSeq(seqN)}`;
        }
      }
      seqN++; // baris berikutnya pakai sequence selanjutnya

      property_id = result.meta?.last_row_id ?? null;
      inserted++;
      inserted_rows.push({
        id: property_id,
        kode_listing,
        image_urls: [1,2,3,4,5]
          .map(n => (r[`image_url${n}`] ?? '').trim())
          .filter(u => u.startsWith('http://') || u.startsWith('https://')),
      });
    } catch (err) {
      const msg = err.message ?? '';
      const fieldHint = msg.includes('slug') ? 'slug' : msg.includes('kode_listing') ? 'kode_listing' : 'internal';
      errors.push({ row: rowNum, field: fieldHint, message: 'Gagal simpan ke DB: ' + msg });
      continue;
    }
  }

  return jsonOk({ inserted, errors, total: rows.length, inserted_rows });
}

export async function onRequestOptions() {
  return handleOptions();
}
