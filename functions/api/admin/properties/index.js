// GET  /api/admin/properties — semua properti + cover image
// POST /api/admin/properties — buat properti baru (draft)
// Auth: _middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../_shared/response.js';
import { generateMetaSeo } from '../../../_lib/metaSeo.js';

const VALID_STATUSES = new Set(['draft', 'published', 'sold', 'archived']);
const VALID_JENIS = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
const VALID_TUJUAN = ['dijual','disewa','dijual_disewa'];

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

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? '';

  const conditions = [];
  const bindings = [];

  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    conditions.push('p.status_publish = ?');
    bindings.push(statusFilter);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      p.id, p.kode_listing, p.title, p.slug,
      p.jenis_properti, p.tujuan,
      p.harga, p.nego, p.nett,
      p.kecamatan, p.kabupaten, p.provinsi,
      p.status_publish,
      p.created_at, p.updated_at, p.published_at,
      (SELECT url_webp FROM property_images
         WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url,
      (SELECT COUNT(*) FROM property_images WHERE property_id = p.id) AS jumlah_foto
    FROM properties p
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 500
  `;

  try {
    const stmt = env.DB.prepare(sql);
    const result = bindings.length > 0
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    return jsonOk({
      properties: result.results ?? [],
      total: (result.results ?? []).length,
    });
  } catch (err) {
    console.error('[admin properties list]', err.message);
    return jsonError('Gagal mengambil data properti', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/properties — buat properti baru (draft)
// ═══════════════════════════════════════════════════════════════════
export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const title        = sanitize(body.title ?? '', 200);
  const jenis        = sanitize(body.jenis_properti ?? '', 30);
  const tujuan       = sanitize(body.tujuan ?? '', 20);
  const harga        = body.harga != null ? parseInt(String(body.harga), 10) : 0;
  const kecamatan    = sanitize(body.kecamatan ?? '', 100);
  const kabupaten    = sanitize(body.kabupaten ?? '', 100);
  const provinsi     = sanitize(body.provinsi ?? 'DI Yogyakarta', 100) || 'DI Yogyakarta';
  const luas_tanah   = parseInt(body.luas_tanah, 10) || null;
  const luas_bangunan = parseInt(body.luas_bangunan, 10) || null;
  const nego         = body.nego ? 1 : 0;

  const errors = {};
  if (!title)                    errors.title          = 'Judul properti wajib diisi';
  if (!VALID_JENIS.includes(jenis))  errors.jenis_properti = 'jenis_properti tidak valid';
  if (!VALID_TUJUAN.includes(tujuan)) errors.tujuan        = 'tujuan harus: dijual, disewa, atau dijual_disewa';
  if (!Number.isInteger(harga) || harga < 0) errors.harga  = 'Harga harus angka non-negatif';
  if (Object.keys(errors).length > 0) return jsonError('Validasi gagal', 422, errors);

  const date8  = today8();
  const prefix = `SBP-${date8}-`;

  let kode_listing, slug;
  try {
    const seq    = await nextPropSeq(env.DB, prefix);
    kode_listing = `${prefix}${seq}`;
    const rand   = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const base   = slugify(title);
    slug         = base ? `${base}-${rand}` : `properti-${rand}`;
  } catch (err) {
    console.error('[admin property POST] generate kode:', err.message);
    return jsonError('Gagal generate kode listing', 500);
  }

  let detailsVal = null;
  if (body.details != null && typeof body.details === 'object') {
    try { detailsVal = JSON.stringify(body.details); } catch { /* ignore */ }
  }

  const meta = !body.meta_title
    ? generateMetaSeo({ jenis_properti: jenis, tujuan, harga, kecamatan, kabupaten, luas_tanah, luas_bangunan, nego })
    : { meta_title: sanitize(body.meta_title, 60), meta_description: sanitize(body.meta_description ?? '', 155) };

  try {
    const result = await env.DB.prepare(`
      INSERT INTO properties
        (kode_listing, title, slug, jenis_properti, tujuan, harga,
         provinsi, kabupaten, kecamatan, kelurahan, alamat,
         details, meta_title, meta_description,
         status_publish, created_at, updated_at)
      VALUES (?,?,?,?,?,?,  ?,?,?,?,?,  ?, ?,?,  'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(kode_listing, title, slug, jenis, tujuan, harga,
            provinsi, kabupaten, kecamatan, '', '', detailsVal,
            meta.meta_title, meta.meta_description).run();

    const newId = result.meta?.last_row_id;
    return jsonCreated({ id: newId, kode_listing, slug });
  } catch (err) {
    console.error('[admin property POST]', err.message);
    return jsonError('Gagal menyimpan properti', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
