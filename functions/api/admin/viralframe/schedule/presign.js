// POST /api/admin/viralframe/schedule/presign — { video_id }
// Minta presigned upload URL dari Zernio untuk video di Content Library.
// HANYA membuat URL (panggilan cepat) — transfer bytes video yang berat
// dilakukan LANGSUNG dari browser admin ke uploadUrl ini (bukan lewat Worker),
// supaya tidak kena limit wall-clock 30 detik Cloudflare (lihat CLAUDE.md).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { getSetting, zernioPresign } from '../../../../_lib/schedulerProviders.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const videoId = parseInt(body.video_id, 10);
  if (!Number.isInteger(videoId) || videoId <= 0) return jsonError('video_id wajib', 422);

  const video = await env.DB.prepare('SELECT id, r2_key, trashed_at FROM viralframe_videos WHERE id = ?')
    .bind(videoId).first().catch(() => null);
  if (!video) return jsonError('Video tidak ditemukan', 404);
  if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);

  const apiKey = await getSetting(env, 'zernio_api_key');
  if (!apiKey) return jsonError('Zernio API key belum diatur di Pengaturan', 422);

  const filename = video.r2_key.split('/').pop() || `${videoId}.mp4`;
  const result = await zernioPresign({ apiKey, filename, contentType: 'video/mp4' });
  if (!result.ok) return jsonError(result.error, 502);

  return jsonOk({ upload_url: result.uploadUrl, public_url: result.publicUrl });
}

export async function onRequestOptions() { return handleOptions(); }
