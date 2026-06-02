// PATCH /api/admin/properties/:id/status — ubah status_publish
// Body: { "status": "draft" | "published" | "sold" | "archived" }
// "archived" = soft-delete (disembunyikan dari publik, baris tidak dihapus)
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const VALID_STATUSES = ['draft', 'published', 'sold', 'archived'];

export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const newStatus = body.status;
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return jsonError(`status harus salah satu: ${VALID_STATUSES.join(', ')}`, 422);
  }

  const existing = await env.DB.prepare('SELECT id, status_publish, published_at FROM properties WHERE id = ?').bind(id).first();
  if (!existing) return jsonError('Properti tidak ditemukan', 404);

  try {
    // Set published_at bila baru pertama kali dipublish
    const setPublishedAt = newStatus === 'published' && !existing.published_at
      ? ', published_at = CURRENT_TIMESTAMP'
      : '';

    await env.DB.prepare(
      `UPDATE properties SET status_publish = ?, updated_at = CURRENT_TIMESTAMP${setPublishedAt} WHERE id = ?`
    ).bind(newStatus, id).run();

    const updated = await env.DB.prepare(
      'SELECT id, status_publish, published_at, updated_at FROM properties WHERE id = ?'
    ).bind(id).first();

    return jsonOk({ pesan: 'Status berhasil diubah', properti: updated });
  } catch (err) {
    console.error('[admin property status PATCH]', err.message);
    return jsonError('Gagal mengubah status', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
