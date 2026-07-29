// POST /api/admin/viralframe/schedule/commit-agent — { video_id, caption? }
// Fan-out jadwal Konten Agent (viralframe_agent_videos, Cloudinary) ke 5 akun
// sosmed sekaligus. Beda dari commit.js: TIDAK butuh presign/upload dari
// browser sama sekali — video Konten Agent sudah punya cloudinary_url publik
// begitu diupload, jadi satu panggilan server saja cukup.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { scheduleFanOut, persistScheduleResult } from '../../../../_lib/schedulerProviders.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const videoId = parseInt(body.video_id, 10);
  if (!Number.isInteger(videoId) || videoId <= 0) return jsonError('video_id wajib', 422);
  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 2000) : '';

  const video = await env.DB.prepare('SELECT id, cloudinary_url, trashed_at FROM viralframe_agent_videos WHERE id = ?')
    .bind(videoId).first().catch(() => null);
  if (!video) return jsonError('Video tidak ditemukan', 404);
  if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);
  if (!video.cloudinary_url) return jsonError('Video belum punya URL Cloudinary', 422);

  const { slotIndex, rows } = await scheduleFanOut(env, { assetUrl: video.cloudinary_url, caption });

  let trashed;
  try {
    trashed = await persistScheduleResult(env, { videoId, videoType: 'agent', trashTable: 'viralframe_agent_videos', slotIndex, rows });
  } catch (err) {
    console.error('[vf schedule/commit-agent] persist', err.message);
    return jsonError('Gagal mencatat hasil scheduling', 500);
  }

  return jsonOk({
    slot_index: slotIndex,
    results: rows.map(r => ({ platform: r.platform, status: r.result.ok ? 'scheduled' : 'failed', error: r.result.ok ? null : r.result.error })),
    trashed,
  });
}

export async function onRequestOptions() { return handleOptions(); }
