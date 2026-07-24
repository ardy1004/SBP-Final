// POST /api/admin/viralframe/agent-videos/bulk — aksi massal untuk banyak video sekaligus
//   Body JSON: { ids: number[], action: 'trash' | 'restore' | 'delete' }
//   trash/restore -> toggle trashed_at (Sampah, reversible)
//   delete        -> hapus permanen (Cloudinary + D1), dipakai dari dalam halaman Sampah
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { destroyCloudinaryAsset } from '../../../../_lib/cloudinary.js';

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

    // delete: hapus file Cloudinary tiap row dulu, baru hapus barisnya sekali di akhir
    const rows = await env.DB.prepare(`SELECT id, cloudinary_public_id, resource_type FROM viralframe_agent_videos WHERE id IN (${placeholders})`).bind(...ids).all();
    await Promise.all((rows.results ?? []).map(row =>
      destroyCloudinaryAsset(env, row.cloudinary_public_id, row.resource_type).catch(err =>
        console.error('[vf agent-videos bulk] cloudinary destroy', row.id, err.message)
      )
    ));
    await env.DB.prepare(`DELETE FROM viralframe_agent_videos WHERE id IN (${placeholders})`).bind(...ids).run();
    return jsonOk({ affected: ids.length });
  } catch (err) {
    console.error('[vf agent-videos bulk]', action, err.message);
    return jsonError('Gagal menjalankan aksi massal', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
