// PATCH /api/admin/properties/:id/photos/reorder
// Ubah urutan foto berdasarkan array ID
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';

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
  const validIds = new Set((existing.results ?? []).map(r => r.id));
  const invalid = order.find(id => !validIds.has(id));
  if (invalid !== undefined) return jsonError(`ID foto ${invalid} tidak milik properti ini`, 400);

  try {
    for (let i = 0; i < order.length; i++) {
      await env.DB.prepare(
        'UPDATE property_images SET urutan = ? WHERE id = ? AND property_id = ?'
      ).bind(i, order[i], propertyId).run();
    }
    return jsonOk({ pesan: 'Urutan foto berhasil diperbarui' });
  } catch (err) {
    console.error('[admin photo reorder PATCH]', err.message);
    return jsonError('Gagal memperbarui urutan foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
