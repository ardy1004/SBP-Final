// DELETE /api/admin/properties/:id/photos/:imageId
//   Hapus foto: baris DB + objek R2 (jika disimpan di R2)
//   Jika foto yang dihapus adalah cover, foto lain otomatis dijadikan cover
// PATCH  /api/admin/properties/:id/photos/:imageId
//   Set label ruangan foto ({ label_ruangan: "Dapur" | null })
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../../_shared/response.js';

const R2_PREFIXES = ['property-photos/', 'signatures/', 'agreements/'];

// Nilai label yang sah — DIIMPOR, bukan disalin.
//
// Dulu ini salinan manual dengan catatan "kalau daftar di options.ts bertambah,
// tambahkan juga di sini". Berkas itu sudah dihapus saat ViralFrame dibangun
// ulang, dan salinan yang menunjuk sumber yang tak ada adalah drift yang tinggal
// menunggu waktu: label baru akan ditolak 422 di sini tanpa alasan yang jelas.
// `functions/_lib/` memang boleh diimpor backend DAN frontend, jadi tidak ada
// lagi alasan menyalin.
// 6 level: [imageId] → photos → [id] → properties → admin → api → functions/
// (bandingkan `_shared` di atas yang cuma 5, karena letaknya di functions/api/).
import { PHOTO_LABELS } from '../../../../../../_lib/viralframe.js';
import { stmtNormalisasiCover } from '../../../../../../_lib/fotoUtama.js';

const LABEL_SAH = new Set(PHOTO_LABELS);

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
    // Hapus baris + normalisasi foto utama dalam SATU batch (atomik). Dulu tiga
    // langkah terpisah dengan logika cover tulisan tangan: gagal di tengah =
    // listing tanpa foto utama. Aturan tunggalnya ada di _lib/fotoUtama.js.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM property_images WHERE id = ?').bind(imageId),
      stmtNormalisasiCover(env.DB, propertyId),
    ]);

    // Hapus dari R2 SESUDAH D1 — kalau D1 gagal, foto tetap utuh. Aman dari
    // efek samping: UNIQUE(url_webp) (migrasi 0054) menjamin tidak ada baris
    // lain yang masih memakai objek ini.
    const key = photo.url_webp ?? '';
    if (R2_PREFIXES.some(p => key.startsWith(p))) {
      await env.MEDIA.delete(key).catch(err =>
        console.warn('[admin photo DELETE] R2 delete gagal:', err.message)
      );
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
