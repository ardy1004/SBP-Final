// DELETE /api/admin/viralframe/videos/:id — hapus video (R2 + D1)
// PATCH  /api/admin/viralframe/videos/:id — update analitik (post_url, views, likes) [Tahap 6]
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  const row = await env.DB.prepare('SELECT r2_key FROM viralframe_videos WHERE id = ?').bind(id).first().catch(() => null);
  if (!row) return jsonError('Video tidak ditemukan', 404);

  try { await env.MEDIA.delete(row.r2_key); } catch (err) { console.error('[vf videos] R2 delete', err.message); }
  try {
    await env.DB.prepare('DELETE FROM viralframe_videos WHERE id = ?').bind(id).run();
  } catch (err) {
    console.error('[vf videos] DB delete', err.message);
    return jsonError('Gagal menghapus catatan video', 500);
  }
  return jsonOk({ deleted: true });
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const post_url = typeof body.post_url === 'string' ? body.post_url.slice(0, 500) || null : undefined;
  const views = body.views != null ? (parseInt(body.views, 10) || 0) : undefined;
  const likes = body.likes != null ? (parseInt(body.likes, 10) || 0) : undefined;
  const trash = typeof body.trash === 'boolean' ? body.trash : undefined;

  const sets = [], binds = [];
  if (post_url !== undefined) { sets.push('post_url = ?'); binds.push(post_url); }
  if (views !== undefined)    { sets.push('views = ?');    binds.push(views); }
  if (likes !== undefined)    { sets.push('likes = ?');    binds.push(likes); }
  // trash: true -> pindah ke Sampah (soft-delete, dihapus permanen otomatis 30 hari
  // kemudian oleh worker cron, lihat purge-trash.js); false -> pulihkan ke Aktif.
  if (trash === true) { sets.push("trashed_at = datetime('now')"); }
  else if (trash === false) { sets.push('trashed_at = NULL'); }
  if (sets.length === 0) return jsonError('Tidak ada field diupdate', 400);

  try {
    const res = await env.DB.prepare(`UPDATE viralframe_videos SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
    // meta.changes = 0 = id tidak ada — dulu tetap dibalas {updated:true} (audit 2026-07-28).
    if (!res.meta?.changes) return jsonError('Video tidak ditemukan', 404);
    return jsonOk({ updated: true });
  } catch (err) {
    console.error('[vf videos] PATCH', err.message);
    return jsonError('Gagal update video', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
