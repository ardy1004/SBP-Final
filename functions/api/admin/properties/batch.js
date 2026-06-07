// POST /api/admin/properties/batch — import banyak properti sekaligus (partial insert)
// Auth: _middleware.js (otomatis)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

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

async function nextPropSeq(db, prefix) {
  const row = await db.prepare('SELECT COUNT(*) as cnt FROM properties WHERE kode_listing LIKE ?').bind(`${prefix}%`).first();
  return String((row?.cnt ?? 0) + 1).padStart(3, '0');
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
    const nego = r.nego == 1 || r.nego === '1' ? 1 : 0;
    const nett = r.nett == 1 || r.nett === '1' ? 1 : 0;

    // Generate kode_listing + slug (pola identik index.js)
    let kode_listing, slug;
    try {
      const seq = await nextPropSeq(db, prefix);
      kode_listing = `${prefix}${seq}`;
      const base = slugify(title);
      slug = base ? `${base}-${randHex3()}` : `properti-${randHex3()}`;
    } catch (err) {
      errors.push({ row: rowNum, field: 'internal', message: 'Gagal generate kode listing: ' + err.message });
      continue;
    }

    // INSERT — partial insert intentional, tidak pakai transaction
    try {
      await db.prepare(`
        INSERT INTO properties
          (kode_listing, title, slug, jenis_properti, tujuan, harga,
           provinsi, kabupaten, kecamatan, kelurahan, alamat,
           luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
           legalitas, deskripsi, nego, nett,
           status_publish, created_at, updated_at)
        VALUES (?,?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,  ?,?,?,?,  'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).bind(
        kode_listing, title, slug, jenis, tujuan, hargaRaw,
        provinsi, kabupaten, kecamatan, kelurahan, '',
        luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
        legalitas || null, deskripsi || null, nego, nett,
      ).run();
      inserted++;
    } catch (err) {
      const msg = err.message ?? '';
      const fieldHint = msg.includes('slug') ? 'slug' : msg.includes('kode_listing') ? 'kode_listing' : 'internal';
      errors.push({ row: rowNum, field: fieldHint, message: 'Gagal simpan ke DB: ' + msg });
    }
  }

  return jsonOk({ inserted, errors, total: rows.length });
}

export async function onRequestOptions() {
  return handleOptions();
}
