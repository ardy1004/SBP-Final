// POST /api/admin/viralframe/agent-videos/bulk — aksi massal untuk banyak video sekaligus
//   Body JSON: { ids: number[], action: 'trash' | 'restore' | 'delete' }
//   trash/restore -> toggle trashed_at (Sampah, reversible)
//   delete        -> hapus permanen (Cloudinary + D1), dipakai dari dalam halaman Sampah
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { destroyByCloudName } from '../../../../_lib/cloudinary.js';
import { logServerError } from '../../../../_lib/logError.js';

const VALID_ACTIONS = ['trash', 'restore', 'delete'];
const MAX_IDS = 100;

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!VALID_ACTIONS.includes(action)) return jsonError(`action wajib salah satu: ${VALID_ACTIONS.join(', ')}`, 422);

  const ids = Array.isArray(body.ids) ? body.ids.map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) return jsonError('ids wajib diisi', 422);
  if (ids.length > MAX_IDS) return jsonError(`Maksimal ${MAX_IDS} video per aksi massal`, 422);

  const placeholders = ids.map(() => '?').join(',');

  try {
    if (action === 'trash') {
      await env.DB.prepare(`UPDATE viralframe_agent_videos SET trashed_at = datetime('now') WHERE id IN (${placeholders})`).bind(...ids).run();
      return jsonOk({ affected: ids.length });
    }

    if (action === 'restore') {
      await env.DB.prepare(`UPDATE viralframe_agent_videos SET trashed_at = NULL WHERE id IN (${placeholders})`).bind(...ids).run();
      return jsonOk({ affected: ids.length });
    }

    // delete: HANYA video yang sudah di Sampah (trashed_at IS NOT NULL) — dulu
    // action 'delete' bisa menghapus permanen video AKTIF tanpa lewat Sampah dulu
    // (audit 2026-07-28), melewati safety net "trash dulu baru purge".
    const rows = await env.DB.prepare(
      `SELECT id, cloudinary_public_id, cloudinary_name, resource_type FROM viralframe_agent_videos WHERE id IN (${placeholders}) AND trashed_at IS NOT NULL`
    ).bind(...ids).all();
    const candidates = rows.results ?? [];
    const skippedNotTrashed = ids.length - candidates.length;

    // Hapus file Cloudinary tiap row dulu — HANYA row yang destroy-nya sukses (atau
    // tidak punya file untuk dihapus) yang lanjut dihapus dari D1. Sebelumnya
    // kegagalan Cloudinary ditelan lalu row D1 tetap dihapus tanpa syarat = asset
    // Cloudinary orphan permanen tanpa jejak untuk retry (audit 2026-07-28).
    const deletable = [];
    const failed = [];
    await Promise.all(candidates.map(async row => {
      if (!row.cloudinary_public_id) { deletable.push(row.id); return; }
      try {
        await destroyByCloudName(env, row.cloudinary_name, row.cloudinary_public_id, row.resource_type);
        deletable.push(row.id);
      } catch (err) {
        console.error('[vf agent-videos bulk] cloudinary destroy', row.id, err.message);
        failed.push(row.id);
        await logServerError(env, {
          message: `Gagal destroy Cloudinary asset saat bulk delete agent-video #${row.id}: ${err.message}`,
          source: 'server',
          context: { endpoint: 'agent-videos/bulk', id: row.id, cloudinary_public_id: row.cloudinary_public_id },
        });
      }
    }));

    if (deletable.length > 0) {
      const delPlaceholders = deletable.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM viralframe_agent_videos WHERE id IN (${delPlaceholders})`).bind(...deletable).run();
    }
    return jsonOk({ affected: deletable.length, failed, skipped_not_trashed: skippedNotTrashed });
  } catch (err) {
    console.error('[vf agent-videos bulk]', action, err.message);
    return jsonError('Gagal menjalankan aksi massal', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
