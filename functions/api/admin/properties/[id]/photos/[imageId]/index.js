// DELETE /api/admin/properties/:id/photos/:imageId
//   Hapus foto: baris DB + objek R2 (jika disimpan di R2)
//   Jika foto yang dihapus adalah cover, foto lain otomatis dijadikan cover
// PATCH  /api/admin/properties/:id/photos/:imageId
//   Set label ruangan foto ({ label_ruangan: "Dapur" | null })
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../../_shared/response.js';

const R2_PREFIXES = ['property-photos/', 'signatures/', 'agreements/'];

// Nilai label yang sah — SALINAN PHOTO_LABELS di
// src/app/components/admin/viralframe/options.ts. Sengaja tidak diimpor dari sana:
// aturan CLAUDE.md melarang functions/ mengimpor src/app/. Kalau daftar di sana
// bertambah, tambahkan juga di sini (kalau tidak, label baru ditolak 422).
const LABEL_SAH = new Set([
  'Fasad', 'Foyer/Lobby', 'Ruang Tamu', 'Ruang Keluarga', 'Ruang Makan',
  'Kamar Tidur', 'Walk-in Closet', 'Kamar Mandi', 'Dapur', 'Ruang Cuci/Jemur',
  'Ruang Kerja/Study', 'Gym/Fitness', 'Koridor/Tangga', 'Void/Plafon Tinggi',
  'Taman/Halaman', 'Carport/Garasi', 'Balkon/Teras', 'Rooftop', 'Kolam Renang',
  'Musholla', 'Gudang', 'Ruang Usaha', 'Tampak Lokasi/Lingkungan', 'Lainnya',
]);

export async function onRequestPatch(context) {
  const { env, params, request } = context;

  const propertyId = parseInt(params.id, 10);
  const imageId = parseInt(params.imageId, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);
  if (!Number.isInteger(imageId) || imageId <= 0) return jsonError('ID foto tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }

  // null / string kosong = hapus label (kembali ke "belum berlabel").
  const raw = body?.label_ruangan;
  let label = null;
  if (typeof raw === 'string' && raw.trim()) {
    label = raw.trim();
    if (!LABEL_SAH.has(label)) return jsonError(`Label "${label}" tidak dikenal`, 422);
  } else if (raw != null && typeof raw !== 'string') {
    return jsonError('label_ruangan harus string atau null', 422);
  }

  // Pastikan foto benar milik properti ini — pola sama dengan photos/reorder.js.
  const photo = await env.DB.prepare(
    'SELECT id FROM property_images WHERE id = ? AND property_id = ?'
  ).bind(imageId, propertyId).first();
  if (!photo) return jsonError('Foto tidak ditemukan untuk properti ini', 404);

  try {
    await env.DB.prepare(
      'UPDATE property_images SET label_ruangan = ? WHERE id = ? AND property_id = ?'
    ).bind(label, imageId, propertyId).run();
    return jsonOk({ id: imageId, label_ruangan: label });
  } catch (err) {
    console.error('[admin photo PATCH label]', err.message);
    return jsonError('Gagal menyimpan label foto', 500);
  }
}

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
      'SELECT id, url_webp, alt_text, urutan, is_cover, label_ruangan FROM property_images WHERE property_id = ? ORDER BY urutan ASC, id ASC'
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
