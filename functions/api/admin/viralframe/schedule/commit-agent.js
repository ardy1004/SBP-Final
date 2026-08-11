// POST /api/admin/viralframe/schedule/commit-agent — { video_id, caption? }
// Fan-out jadwal Konten Agent (viralframe_agent_videos, Cloudinary) ke 5 akun
// sosmed sekaligus. Beda dari commit.js: TIDAK butuh presign/upload dari
// browser sama sekali — video Konten Agent sudah punya cloudinary_url publik
// begitu diupload, jadi satu panggilan server saja cukup.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { scheduleFanOut, persistScheduleResult } from '../../../../_lib/schedulerProviders.js';
import { resolveScheduler } from '../../../../_lib/agentAccounts.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const videoId = parseInt(body.video_id, 10);
  if (!Number.isInteger(videoId) || videoId <= 0) return jsonError('video_id wajib', 422);
  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 2000) : '';
  // asset_url (opsional): URL "versi siap-post" dari browser (buildOverlayVideoUrl,
  // sudah ada badge SOLD/Hot/Featured) -- WAJIB dipakai kalau ada, supaya video yang
  // terpost ke sosmed konsisten dengan yang dipreview admin. Fallback ke
  // cloudinary_url mentah (tanpa badge) kalau browser tidak mengirimkannya.
  const assetUrlOverride = typeof body.asset_url === 'string' ? body.asset_url.trim() : '';

  const video = await env.DB.prepare(
    `SELECT v.id, v.cloudinary_url, v.trashed_at, v.character_id, c.nama AS character_nama
     FROM viralframe_agent_videos v JOIN viralframe_characters c ON c.id = v.character_id
     WHERE v.id = ?`
  ).bind(videoId).first().catch(() => null);
  if (!video) return jsonError('Video tidak ditemukan', 404);
  if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);
  if (!video.cloudinary_url) return jsonError('Video belum punya URL Cloudinary', 422);

  // Kredensial scheduler milik AGENT video ini — tanpa fallback ke akun global.
  // Fallback di sini artinya konten agent ini terbit di akun sosmed agent lain,
  // dan post yang sudah tayang tidak bisa ditarik (lihat agentAccounts.js).
  const akun = await resolveScheduler(env, video.character_id);
  if (!akun.bufferKey && !akun.zernioKey) {
    return jsonError(
      `Agent "${video.character_nama}" belum punya kredensial scheduler. Isi dulu di Admin → Pengaturan → Akun Agent.`,
      422
    );
  }
  // Key ada tapi belum ada satu pun channel = fan-out akan menghasilkan NOL
  // baris dan endpoint balas "sukses" yang tidak menjadwalkan apa pun. Tolak di
  // sini supaya kegagalannya terlihat, bukan tersamar jadi keberhasilan kosong.
  if (Object.keys(akun.channels).length === 0) {
    return jsonError(
      `Agent "${video.character_nama}" belum punya channel sosmed. Buka Pengaturan → Akun Agent → "Ambil dari API", lalu Simpan.`,
      422
    );
  }

  const { slotIndex, rows } = await scheduleFanOut(env, { assetUrl: assetUrlOverride || video.cloudinary_url, caption, akun });

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
