// POST /api/internal/viralframe/purge-trash — hapus permanen video di Sampah
//   yang sudah lewat 30 hari (Cloudinary + D1). Dipanggil oleh worker cron
//   terpisah (workers/viralframe-purge-cron/), BUKAN oleh browser admin —
//   makanya di luar /api/admin/* (tidak lewat middleware JWT cookie) dan
//   pakai secret header sendiri.
//
// Auth: header X-Purge-Secret harus sama persis dengan env.VIRALFRAME_PURGE_SECRET.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { destroyCloudinaryAsset } from '../../../_lib/cloudinary.js';

const PURGE_LIMIT_PER_RUN = 200; // pengaman batas subrequest Workers per eksekusi

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.VIRALFRAME_PURGE_SECRET;
  const header = request.headers.get('X-Purge-Secret');
  if (!secret || !header || header !== secret) return jsonError('Forbidden', 403);

  try {
    const res = await env.DB.prepare(
      `SELECT id, cloudinary_public_id, resource_type FROM viralframe_agent_videos
       WHERE trashed_at IS NOT NULL AND trashed_at <= datetime('now', '-30 days')
       LIMIT ?`
    ).bind(PURGE_LIMIT_PER_RUN).all();
    const rows = res.results ?? [];
    if (rows.length === 0) return jsonOk({ purged: 0 });

    await Promise.all(rows.map(row =>
      destroyCloudinaryAsset(env, row.cloudinary_public_id, row.resource_type).catch(err =>
        console.error('[purge-trash] cloudinary destroy', row.id, err.message)
      )
    ));

    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM viralframe_agent_videos WHERE id IN (${placeholders})`).bind(...ids).run();

    return jsonOk({ purged: ids.length });
  } catch (err) {
    console.error('[purge-trash]', err.message);
    return jsonError('Gagal purge sampah', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
