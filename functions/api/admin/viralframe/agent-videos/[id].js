// DELETE /api/admin/viralframe/agent-videos/:id — hapus video (Cloudinary + D1)
// PATCH  /api/admin/viralframe/agent-videos/:id — update caption/hashtags/post_url
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { hapusAsetVideo } from '../../../../_lib/videoStorage.js';
import { adaJadwalTertunda } from '../../../../_lib/schedulerProviders.js';

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  const row = await env.DB.prepare('SELECT storage, r2_key, cloudinary_public_id, cloudinary_name, resource_type FROM viralframe_agent_videos WHERE id = ?').bind(id).first().catch(() => null);
  if (!row) return jsonError('Video tidak ditemukan', 404);
  // Video yang masih ditunggu tayang Buffer/Zernio tidak boleh dihapus sekarang
  // — link medianya akan mati sebelum sempat tayang (audit 2026-08-15).
  if (await adaJadwalTertunda(env, id)) {
    return jsonError('Video ini masih ditunggu tayang dari jadwal sebelumnya — hapus setelah waktu tayangnya lewat.', 409);
  }

  // Hapus di tempat aset ini benar-benar tersimpan: bucket R2 (migrasi 0043)
  // atau cloud Cloudinary yang tercatat di barisnya — yang terakhir bisa berbeda
  // dari akun agent sekarang kalau agent-nya pernah pindah akun (migrasi 0037).
  try { await hapusAsetVideo(env, row); }
  catch (err) { console.error('[vf agent-videos] destroy aset', err.message); }

  try {
    await env.DB.prepare('DELETE FROM viralframe_agent_videos WHERE id = ?').bind(id).run();
  } catch (err) {
    console.error('[vf agent-videos] DB delete', err.message);
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

  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 1000) || null : undefined;
  const hashtags = typeof body.hashtags === 'string' ? body.hashtags.slice(0, 500) || null : undefined;
  const post_url = typeof body.post_url === 'string' ? body.post_url.slice(0, 500) || null : undefined;
  const trash = typeof body.trash === 'boolean' ? body.trash : undefined;

  // Metrik performa, diisi manual dari dashboard sosmed. Dibedakan tegas antara
  // "tidak dikirim" (undefined → jangan sentuh kolom), "dikosongkan" (null →
  // kembali ke belum-diisi) dan angka. Analitik memperlakukan NULL ≠ 0.
  const angkaMetrik = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n >= 0 ? n : undefined; // nilai ngawur diabaikan, bukan disimpan
  };
  const views = angkaMetrik(body.views);
  const likes = angkaMetrik(body.likes);

  const sets = [], binds = [];
  if (caption !== undefined) { sets.push('caption = ?'); binds.push(caption); }
  if (hashtags !== undefined) { sets.push('hashtags = ?'); binds.push(hashtags); }
  if (post_url !== undefined) { sets.push('post_url = ?'); binds.push(post_url); }
  if (views !== undefined) { sets.push('views = ?'); binds.push(views); }
  if (likes !== undefined) { sets.push('likes = ?'); binds.push(likes); }
  if (views !== undefined || likes !== undefined) sets.push("metrics_updated_at = datetime('now')");
  // trash: true -> pindah ke Sampah (soft-delete, dihapus permanen otomatis 30 hari
  // kemudian oleh worker cron); false -> pulihkan ke Aktif.
  if (trash === true) { sets.push("trashed_at = datetime('now')"); }
  else if (trash === false) { sets.push('trashed_at = NULL'); }
  if (sets.length === 0) return jsonError('Tidak ada field diupdate', 400);

  try {
    await env.DB.prepare(`UPDATE viralframe_agent_videos SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
    return jsonOk({ updated: true });
  } catch (err) {
    console.error('[vf agent-videos] PATCH', err.message);
    return jsonError('Gagal update video', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
