// PATCH /api/admin/properties/:id/photos/:imageId/cover
// Jadikan imageId sebagai cover foto, reset semua foto lain ke is_cover=0
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../../_shared/response.js';

export async function onRequestPatch(context) {
  const { env, params } = context;

  const propertyId = parseInt(params.id, 10);
  const imageId = parseInt(params.imageId, 10);

  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);
  if (!Number.isInteger(imageId) || imageId <= 0) return jsonError('ID foto tidak valid', 400);

  // Verifikasi foto milik properti ini
  const photo = await env.DB.prepare(
    'SELECT id FROM property_images WHERE id = ? AND property_id = ?'
  ).bind(imageId, propertyId).first();

  if (!photo) return jsonError('Foto tidak ditemukan untuk properti ini', 404);

  try {
    // Reset semua foto properti ini ke bukan cover, lalu set foto terpilih
    await env.DB.prepare(
      'UPDATE property_images SET is_cover = 0 WHERE property_id = ?'
    ).bind(propertyId).run();

    await env.DB.prepare(
      'UPDATE property_images SET is_cover = 1 WHERE id = ?'
    ).bind(imageId).run();

    const photos = await env.DB.prepare(
      'SELECT id, url_webp, alt_text, urutan, is_cover, label_ruangan FROM property_images WHERE property_id = ? ORDER BY urutan ASC, id ASC'
    ).bind(propertyId).all();

    return jsonOk({ pesan: 'Cover foto berhasil diubah', images: photos.results ?? [] });
  } catch (err) {
    console.error('[admin photo cover PATCH]', err.message);
    return jsonError('Gagal mengubah cover foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
