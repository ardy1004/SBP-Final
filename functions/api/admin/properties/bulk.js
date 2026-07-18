// POST /api/admin/properties/bulk — publish massal atau hapus massal
// Auth: _middleware.js (otomatis)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { collectPropertyR2Keys, deleteR2Keys } from '../../../_lib/r2Cleanup.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const { action, ids } = body;

  if (!Array.isArray(ids)) return jsonError('ids harus berupa array', 400);
  if (ids.length === 0) return jsonError('ids tidak boleh kosong', 400);
  if (ids.length > 500) return jsonError('Maksimal 500 id per operasi', 400);
  const BADGE_COL = {
    premium:  'badge_premium',
    featured: 'badge_featured',
    hot:      'badge_hot',
    pilihan:  'properti_pilihan',
    verified: 'verified',
  };
  const VALID_ACTIONS = ['publish', 'delete', 'sold', 'set_location', ...Object.keys(BADGE_COL)];
  if (!VALID_ACTIONS.includes(action)) return jsonError(`action tidak valid: "${action}"`, 400);

  const numericIds = ids.map(id => parseInt(String(id), 10)).filter(id => Number.isInteger(id) && id > 0);
  if (numericIds.length === 0) return jsonError('ids tidak mengandung ID valid', 400);

  const placeholders = numericIds.map(() => '?').join(',');

  try {
    if (action === 'set_location') {
      // Overwrite kolom lokasi (NAMA TEXT) untuk semua id terpilih.
      const provinsi  = typeof body.provinsi  === 'string' ? body.provinsi.trim()  : '';
      const kabupaten = typeof body.kabupaten === 'string' ? body.kabupaten.trim() : '';
      const kecamatan = typeof body.kecamatan === 'string' ? body.kecamatan.trim() : '';
      if (!provinsi || !kabupaten || !kecamatan) {
        return jsonError('provinsi, kabupaten, dan kecamatan wajib diisi', 422);
      }
      const result = await env.DB.prepare(
        `UPDATE properties
         SET provinsi = ?, kabupaten = ?, kecamatan = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`
      ).bind(provinsi, kabupaten, kecamatan, ...numericIds).run();

      return jsonOk({ success: true, affected: result.meta?.changes ?? numericIds.length });
    }

    if (action === 'publish') {
      const result = await env.DB.prepare(
        `UPDATE properties
         SET status_publish = 'published',
             published_at   = COALESCE(published_at, CURRENT_TIMESTAMP),
             updated_at     = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`
      ).bind(...numericIds).run();

      return jsonOk({ success: true, affected: result.meta?.changes ?? numericIds.length });
    }

    if (BADGE_COL[action]) {
      const col = BADGE_COL[action];
      const result = await env.DB.prepare(
        `UPDATE properties
         SET ${col} = 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`
      ).bind(...numericIds).run();

      return jsonOk({ success: true, affected: result.meta?.changes ?? numericIds.length });
    }

    if (action === 'sold') {
      const result = await env.DB.prepare(
        `UPDATE properties
         SET status_sold = 1,
             status_publish = 'sold',
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`
      ).bind(...numericIds).run();

      return jsonOk({ success: true, affected: result.meta?.changes ?? numericIds.length });
    }

    // action === 'delete' — bersihkan SEMUA objek R2 (foto, video ViralFrame,
    // tanda tangan & PDF perjanjian) sebelum baris DB hilang via CASCADE.
    const r2Keys = await collectPropertyR2Keys(env.DB, numericIds);
    await deleteR2Keys(env.MEDIA, r2Keys);

    const result = await env.DB.prepare(
      `DELETE FROM properties WHERE id IN (${placeholders})`
    ).bind(...numericIds).run();

    return jsonOk({ success: true, affected: result.meta?.changes ?? numericIds.length });
  } catch (err) {
    console.error('[bulk properties]', err.message);
    return jsonError('Operasi gagal', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
