// DELETE /api/admin/viralframe/backsounds/:id — hapus backsound (R2 + D1)
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  const row = await env.DB.prepare('SELECT r2_key FROM viralframe_backsounds WHERE id = ?').bind(id).first().catch(() => null);
  if (!row) return jsonError('Backsound tidak ditemukan', 404);

  try { await env.MEDIA.delete(row.r2_key); } catch (err) { console.error('[vf backsounds] R2 delete', err.message); }
  try {
    await env.DB.prepare('DELETE FROM viralframe_backsounds WHERE id = ?').bind(id).run();
  } catch (err) {
    console.error('[vf backsounds] DB delete', err.message);
    return jsonError('Gagal menghapus catatan backsound', 500);
  }
  return jsonOk({ deleted: true });
}

export async function onRequestOptions() { return handleOptions(); }
