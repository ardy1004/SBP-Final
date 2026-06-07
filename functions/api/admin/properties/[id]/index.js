// GET  /api/admin/properties/:id — detail lengkap + semua foto
// PATCH /api/admin/properties/:id — partial update field properti
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const VALID_JENIS = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
const VALID_TUJUAN = ['dijual','disewa','dijual_disewa'];
const VALID_FURNISHED = ['fully','semi','unfurnished'];
const VALID_STATUS_LEGALITAS = ['on_hand','on_bank'];

function sanitize(val, max = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, max);
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/properties/:id
// ═══════════════════════════════════════════════════════════════════
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const property = await env.DB.prepare(`
      SELECT
        id, kode_listing, title, slug,
        jenis_properti, tujuan,
        harga, harga_lama, harga_sewa_tahun, nego, nett, harga_per_m2,
        jumlah_kamar_tidur, jumlah_kamar_mandi,
        luas_tanah, luas_bangunan, lebar_depan, lantai,
        legalitas, status_legalitas, bank_agunan, outstanding_bank,
        jarak_sungai_m, jarak_makam_m, jarak_sutet_m, lebar_jalan_m,
        furnished,
        provinsi, kabupaten, kecamatan, kelurahan, alamat,
        latitude, longitude, gmaps_link,
        deskripsi, info_tambahan, alasan_dijual, video_youtube,
        income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
        badge_premium, badge_featured, badge_hot,
        status_sold, properti_pilihan, verified,
        views_count, status_publish,
        meta_title, meta_description,
        details,
        created_at, updated_at, published_at
      FROM properties
      WHERE id = ?
      LIMIT 1
    `).bind(id).first();

    if (!property) return jsonError('Properti tidak ditemukan', 404);

    const photosRes = await env.DB.prepare(`
      SELECT id, url_webp, alt_text, urutan, is_cover
      FROM property_images
      WHERE property_id = ?
      ORDER BY urutan ASC, id ASC
    `).bind(id).all();

    let detailsParsed = null;
    if (property.details) {
      try { detailsParsed = JSON.parse(property.details); }
      catch { detailsParsed = null; }
    }

    const { details: _d, ...propertyClean } = property;
    return jsonOk({
      ...propertyClean,
      details: detailsParsed,
      images: photosRes.results ?? [],
    });
  } catch (err) {
    console.error('[admin property GET]', err.message);
    return jsonError('Gagal mengambil detail properti', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/admin/properties/:id — partial update field properti
// ═══════════════════════════════════════════════════════════════════
export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const exists = await env.DB.prepare('SELECT id FROM properties WHERE id = ?').bind(id).first();
  if (!exists) return jsonError('Properti tidak ditemukan', 404);

  const errors = {};
  const pairs = [];

  // ─── Field validations ──────────────────────────────────────────
  if (body.title !== undefined) {
    const v = sanitize(String(body.title ?? ''), 200);
    if (!v) errors.title = 'Judul properti wajib diisi';
    else pairs.push({ col: 'title', val: v });
  }

  if (body.jenis_properti !== undefined) {
    const v = sanitize(body.jenis_properti, 30);
    if (!VALID_JENIS.includes(v)) errors.jenis_properti = 'jenis_properti tidak valid';
    else pairs.push({ col: 'jenis_properti', val: v });
  }

  if (body.tujuan !== undefined) {
    const v = sanitize(body.tujuan, 30);
    if (!VALID_TUJUAN.includes(v)) errors.tujuan = 'tujuan tidak valid';
    else pairs.push({ col: 'tujuan', val: v });
  }

  if (body.harga !== undefined && body.harga !== null) {
    const v = parseInt(String(body.harga), 10);
    if (!Number.isInteger(v) || v <= 0) errors.harga = 'Harga harus angka positif';
    else pairs.push({ col: 'harga', val: v });
  }

  if (body.harga_lama !== undefined) {
    const v = body.harga_lama === null ? null : parseInt(String(body.harga_lama), 10);
    if (v !== null && (!Number.isInteger(v) || v <= 0)) errors.harga_lama = 'Harga lama harus angka positif';
    else pairs.push({ col: 'harga_lama', val: v });
  }

  if (body.harga_sewa_tahun !== undefined) {
    const v = body.harga_sewa_tahun === null ? null : parseInt(String(body.harga_sewa_tahun), 10);
    if (v !== null && (!Number.isInteger(v) || v <= 0)) errors.harga_sewa_tahun = 'Harga sewa harus angka positif';
    else pairs.push({ col: 'harga_sewa_tahun', val: v });
  }

  if (body.nego !== undefined) pairs.push({ col: 'nego', val: body.nego ? 1 : 0 });
  if (body.nett !== undefined) pairs.push({ col: 'nett', val: body.nett ? 1 : 0 });

  const numericFields = [
    'luas_tanah','luas_bangunan','lebar_depan','lantai',
    'jumlah_kamar_tidur','jumlah_kamar_mandi',
    'outstanding_bank','jarak_sungai_m','jarak_makam_m','jarak_sutet_m','lebar_jalan_m',
    'income_per_bulan','pengeluaran_per_bulan','harga_sewa_kamar_bulan',
  ];
  for (const f of numericFields) {
    if (body[f] !== undefined) {
      const v = body[f] === null ? null : parseFloat(String(body[f]));
      if (v !== null && isNaN(v)) errors[f] = `${f} harus angka`;
      else pairs.push({ col: f, val: v });
    }
  }

  if (body.legalitas !== undefined) {
    const v = body.legalitas === null ? null : sanitize(body.legalitas, 30);
    pairs.push({ col: 'legalitas', val: v || null });
  }

  if (body.status_legalitas !== undefined) {
    const v = body.status_legalitas === null ? null : sanitize(body.status_legalitas, 30);
    if (v && !VALID_STATUS_LEGALITAS.includes(v)) errors.status_legalitas = `status_legalitas harus salah satu: ${VALID_STATUS_LEGALITAS.join(', ')}`;
    else pairs.push({ col: 'status_legalitas', val: v || null });
  }

  if (body.furnished !== undefined) {
    const v = body.furnished === null ? null : sanitize(body.furnished, 30);
    if (v && !VALID_FURNISHED.includes(v)) errors.furnished = `furnished harus salah satu: ${VALID_FURNISHED.join(', ')}`;
    else pairs.push({ col: 'furnished', val: v || null });
  }

  // NOT NULL TEXT cols (store '' not null when empty string sent)
  const notNullTextFields = ['provinsi','kabupaten','kecamatan','kelurahan'];
  // Nullable TEXT cols (empty string → null)
  const nullableTextFields = [
    'bank_agunan','alamat',
    'gmaps_link','deskripsi','info_tambahan','alasan_dijual','video_youtube',
    'meta_title','meta_description',
  ];
  for (const f of [...notNullTextFields, ...nullableTextFields]) {
    if (body[f] !== undefined) {
      const max = ['deskripsi','info_tambahan','alasan_dijual'].includes(f) ? 5000 : 500;
      const v = body[f] === null ? null : sanitize(String(body[f]), max);
      const nullable = nullableTextFields.includes(f);
      pairs.push({ col: f, val: (nullable ? (v || null) : (v ?? '')) });
    }
  }

  if (body.details !== undefined) {
    if (body.details === null) {
      pairs.push({ col: 'details', val: null });
    } else if (typeof body.details === 'object') {
      try {
        pairs.push({ col: 'details', val: JSON.stringify(body.details) });
      } catch {
        errors.details = 'details harus object JSON yang valid';
      }
    } else {
      errors.details = 'details harus object JSON atau null';
    }
  }

  const boolFields = ['badge_premium','badge_featured','badge_hot','properti_pilihan','verified','status_sold'];
  for (const f of boolFields) {
    if (body[f] !== undefined) pairs.push({ col: f, val: body[f] ? 1 : 0 });
  }

  if (Object.keys(errors).length > 0) return jsonError('Validasi gagal', 422, errors);
  if (pairs.length === 0) return jsonError('Tidak ada field yang dikirim', 400);

  try {
    const setClauses = pairs.map(p => `${p.col} = ?`).join(', ');
    const vals = pairs.map(p => p.val);
    await env.DB.prepare(
      `UPDATE properties SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(...vals, id).run();

    const updated = await env.DB.prepare('SELECT id, title, status_publish, updated_at FROM properties WHERE id = ?').bind(id).first();
    return jsonOk({ pesan: 'Properti berhasil diperbarui', properti: updated });
  } catch (err) {
    console.error('[admin property PATCH]', err.message);
    return jsonError('Gagal menyimpan perubahan', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
