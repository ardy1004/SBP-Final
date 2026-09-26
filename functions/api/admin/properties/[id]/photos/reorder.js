// PATCH /api/admin/properties/:id/photos/reorder
//   Body JSON: { order: number[] } — SELURUH id foto properti, urutan baru.
//   Posisi pertama otomatis jadi foto utama (lihat _lib/fotoUtama.js).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { stmtNormalisasiCover } from '../../../../../_lib/fotoUtama.js';

export async function onRequestPatch(context) {
  const { env, params, request } = context;

  const propertyId = parseInt(params.id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }

  const { order } = body ?? {};
  if (!Array.isArray(order) || order.length === 0) return jsonError('Field order harus berupa array ID', 400);
  if (!order.every(id => Number.isInteger(id) && id > 0)) return jsonError('Semua ID harus bilangan bulat positif', 400);

  const existing = await env.DB.prepare(
    'SELECT id FROM property_images WHERE property_id = ?'
  ).bind(propertyId).all();
  const ada = new Set((existing.results ?? []).map(r => r.id));

  // Wajib PERMUTASI PENUH. Versi lama menerima urutan parsial: foto yang tidak
  // dikirim mempertahankan urutan lamanya dan bisa bertabrakan dengan yang baru.
  const dikirim = new Set(order);
  const permutasi = order.length === ada.size && dikirim.size === ada.size && order.every(id => ada.has(id));
  if (!permutasi) return jsonError('Daftar foto tidak sinkron, muat ulang halaman', 422);

  try {
    // Satu batch = atomik. Versi lama memakai N .run() berurutan: gagal di tengah
    // meninggalkan foto setengah terurut dan cover di posisi sembarang.
    await env.DB.batch([
      ...order.map((id, i) => env.DB.prepare(
        'UPDATE property_images SET urutan = ? WHERE id = ? AND property_id = ?'
      ).bind(i, id, propertyId)),
      stmtNormalisasiCover(env.DB, propertyId),
    ]);

    const photos = await env.DB.prepare(
      'SELECT id, url_webp, alt_text, urutan, is_cover, label_ruangan FROM property_images WHERE property_id = ? ORDER BY urutan ASC, id ASC'
    ).bind(propertyId).all();

    return jsonOk({ images: photos.results ?? [] });
  } catch (err) {
    console.error('[admin photo reorder PATCH]', err.message);
    return jsonError('Gagal memperbarui urutan foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
