// PATCH  /api/admin/viralframe/badges/:id — update posisi/ukuran (x_pct, y_pct, width_pct — bebas, bukan preset)
// DELETE /api/admin/viralframe/badges/:id — hapus badge (video kembali tanpa overlay jenis ini)
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const sets = [], binds = [];
  if (body.x_pct != null && Number.isFinite(Number(body.x_pct))) { sets.push('x_pct = ?'); binds.push(Math.min(Math.max(Number(body.x_pct), 0), 1)); }
  if (body.y_pct != null && Number.isFinite(Number(body.y_pct))) { sets.push('y_pct = ?'); binds.push(Math.min(Math.max(Number(body.y_pct), 0), 1)); }
  if (body.width_pct != null && Number.isFinite(Number(body.width_pct))) { sets.push('width_pct = ?'); binds.push(Math.min(Math.max(Number(body.width_pct), 0.02), 1)); }
  if (sets.length === 0) return jsonError('Tidak ada field diupdate', 400);
  sets.push("updated_at = datetime('now')");

  try {
    await env.DB.prepare(`UPDATE viralframe_badge_assets SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
    return jsonOk({ updated: true });
  } catch (err) {
    console.error('[vf badges] PATCH', err.message);
    return jsonError('Gagal update badge', 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  try {
    await env.DB.prepare('DELETE FROM viralframe_badge_assets WHERE id = ?').bind(id).run();
    return jsonOk({ deleted: true });
  } catch (err) {
    console.error('[vf badges] DELETE', err.message);
    return jsonError('Gagal menghapus badge', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
