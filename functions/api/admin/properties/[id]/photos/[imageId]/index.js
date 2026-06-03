// DELETE /api/admin/properties/:id/photos/:imageId
// Hapus foto: baris DB + objek R2 (jika disimpan di R2)
// Jika foto yang dihapus adalah cover, foto lain otomatis dijadikan cover
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../../_shared/response.js';

const R2_PREFIXES = ['property-photos/', 'signatures/', 'agreements/'];

export async function onRequestDelete(context) {
  const { env, params } = context;

  const propertyId = parseInt(params.id, 10);
  const imageId = parseInt(params.imageId, 10);

  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);
  if (!Number.isInteger(imageId) || imageId <= 0) return jsonError('ID foto tidak valid', 400);

  const photo = await env.DB.prepare(
    'SELECT id, url_webp, is_cover FROM property_images WHERE id = ? AND property_id = ?'
  ).bind(imageId, propertyId).first();

  if (!photo) return jsonError('Foto tidak ditemukan untuk properti ini', 404);

  try {
    // Hapus baris DB
    await env.DB.prepare('DELETE FROM property_images WHERE id = ?').bind(imageId).run();

    // Hapus dari R2 jika url_webp adalah R2 key
    const key = photo.url_webp ?? '';
    if (R2_PREFIXES.some(p => key.startsWith(p))) {
      await env.MEDIA.delete(key).catch(err =>
        console.warn('[admin photo DELETE] R2 delete gagal:', err.message)
      );
    }

    // Jika foto yang dihapus adalah cover, set foto lain sebagai cover otomatis
    if (photo.is_cover) {
      const nextPhoto = await env.DB.prepare(
        'SELECT id FROM property_images WHERE property_id = ? ORDER BY urutan ASC, id ASC LIMIT 1'
      ).bind(propertyId).first();

      if (nextPhoto) {
        await env.DB.prepare('UPDATE property_images SET is_cover = 1 WHERE id = ?').bind(nextPhoto.id).run();
      }
    }

    const remaining = await env.DB.prepare(
      'SELECT id, url_webp, alt_text, urutan, is_cover FROM property_images WHERE property_id = ? ORDER BY urutan ASC, id ASC'
    ).bind(propertyId).all();

    return jsonOk({ pesan: 'Foto berhasil dihapus', images: remaining.results ?? [] });
  } catch (err) {
    console.error('[admin photo DELETE]', err.message);
    return jsonError('Gagal menghapus foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
