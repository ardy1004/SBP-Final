// POST /api/admin/properties/:id/photos
// Upload satu foto (base64 WebP) per request → R2 + property_images
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;

  const propertyId = parseInt(params.id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);

  const property = await env.DB.prepare(
    'SELECT id FROM properties WHERE id = ?'
  ).bind(propertyId).first();
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }

  const { photo } = body ?? {};
  if (typeof photo !== 'string' || !photo) return jsonError('Field photo wajib diisi', 400);
  if (!photo.startsWith('data:image/webp;base64,')) return jsonError('Foto harus berformat WebP (data:image/webp;base64,...)', 400);

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM property_images WHERE property_id = ?'
  ).bind(propertyId).first();
  if ((countRow?.cnt ?? 0) >= 20) return jsonError('Maksimal 20 foto per properti', 400);

  const base64Data = photo.slice('data:image/webp;base64,'.length);
  let bytes;
  try {
    const binaryStr = atob(base64Data);
    bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
  } catch {
    return jsonError('Gagal decode base64', 400);
  }

  const r2Key = `property-photos/${crypto.randomUUID()}.webp`;

  try {
    await env.MEDIA.put(r2Key, bytes.buffer, { httpMetadata: { contentType: 'image/webp' } });

    const result = await env.DB.prepare(`
      INSERT INTO property_images (property_id, url_webp, urutan, is_cover)
      VALUES (?, ?, (SELECT COALESCE(MAX(urutan), 0) + 1 FROM property_images WHERE property_id = ?), 0)
    `).bind(propertyId, r2Key, propertyId).run();

    const imageId = result.meta?.last_row_id;
    const image = await env.DB.prepare(
      'SELECT id, url_webp, alt_text, urutan, is_cover FROM property_images WHERE id = ?'
    ).bind(imageId).first();

    return jsonOk({ image });
  } catch (err) {
    console.error('[admin photo POST]', err.message);
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal menyimpan foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
