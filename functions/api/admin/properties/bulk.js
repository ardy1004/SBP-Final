// POST /api/admin/properties/bulk — publish massal atau hapus massal
// Auth: _middleware.js (otomatis)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

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
  if (action !== 'publish' && action !== 'delete') return jsonError('action harus "publish" atau "delete"', 400);

  const numericIds = ids.map(id => parseInt(String(id), 10)).filter(id => Number.isInteger(id) && id > 0);
  if (numericIds.length === 0) return jsonError('ids tidak mengandung ID valid', 400);

  const placeholders = numericIds.map(() => '?').join(',');

  try {
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

    // action === 'delete'
    const photos = await env.DB.prepare(
      `SELECT url_webp FROM property_images WHERE property_id IN (${placeholders})`
    ).bind(...numericIds).all();

    for (const photo of (photos.results ?? [])) {
      if (photo.url_webp) {
        try { await env.MEDIA.delete(photo.url_webp); } catch { /* abaikan R2 error */ }
      }
    }

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
