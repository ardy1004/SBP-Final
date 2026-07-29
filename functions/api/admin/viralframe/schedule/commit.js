// POST /api/admin/viralframe/schedule/commit — { video_id, public_url, caption? }
// Fan-out jadwal ke 5 akun sosmed sekaligus (Buffer x3 + Zernio x1 gabungan
// FB+IG), pakai slot primetime berikutnya yang masih kosong hari ini (WIB).
// Video otomatis pindah ke Sampah begitu MINIMAL 1 platform sukses — supaya
// tidak ke-post dobel kalau tombol "Jadwalkan" diklik ulang.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import {
  getSetting, getSchedulePreset, pickNextSlot, buildSlotTimes,
  callBufferCreatePost, callZernioCreatePost,
} from '../../../../_lib/schedulerProviders.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const videoId = parseInt(body.video_id, 10);
  if (!Number.isInteger(videoId) || videoId <= 0) return jsonError('video_id wajib', 422);
  const publicUrl = typeof body.public_url === 'string' ? body.public_url.trim() : '';
  if (!publicUrl) return jsonError('public_url wajib (hasil upload ke Zernio)', 422);
  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 2000) : '';

  const video = await env.DB.prepare('SELECT id, trashed_at FROM viralframe_videos WHERE id = ?')
    .bind(videoId).first().catch(() => null);
  if (!video) return jsonError('Video tidak ditemukan', 404);
  if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);

  const [bufferKey, zernioKey, ytChannel, tiktokChannel, threadsChannel, fbAccount, igAccount] = await Promise.all([
    getSetting(env, 'buffer_api_key'),
    getSetting(env, 'zernio_api_key'),
    getSetting(env, 'buffer_channel_id_youtube'),
    getSetting(env, 'buffer_channel_id_tiktok'),
    getSetting(env, 'buffer_channel_id_threads'),
    getSetting(env, 'zernio_account_id_facebook'),
    getSetting(env, 'zernio_account_id_instagram'),
  ]);

  const preset = await getSchedulePreset(env);
  const { slotIndex, dateWib } = await pickNextSlot(env);
  const presetRow = preset.find(p => p.slot === slotIndex) ?? preset[0];
  const times = buildSlotTimes(dateWib, presetRow);

  const zernioPlatforms = [];
  if (fbAccount) zernioPlatforms.push({ platform: 'facebook', accountId: fbAccount });
  if (igAccount) zernioPlatforms.push({ platform: 'instagram', accountId: igAccount });

  const jobs = [
    { platform: 'youtube', provider: 'buffer', scheduledAt: times.youtube,
      run: () => callBufferCreatePost({ apiKey: bufferKey, channelId: ytChannel, assetUrl: publicUrl, dueAt: times.youtube, caption }) },
    { platform: 'tiktok', provider: 'buffer', scheduledAt: times.tiktok,
      run: () => callBufferCreatePost({ apiKey: bufferKey, channelId: tiktokChannel, assetUrl: publicUrl, dueAt: times.tiktok, caption }) },
    { platform: 'threads', provider: 'buffer', scheduledAt: times.fbIgThreads,
      run: () => callBufferCreatePost({ apiKey: bufferKey, channelId: threadsChannel, assetUrl: publicUrl, dueAt: times.fbIgThreads, caption }) },
  ];

  // Satu panggilan Zernio menjadwalkan FB+IG sekaligus (jam sama, grup fb_ig_threads).
  // Sukses/gagalnya atomik untuk kedua platform — respons Zernio tidak
  // memisahkan status per-platform dalam satu request.
  const zernioJob = zernioPlatforms.length > 0
    ? () => callZernioCreatePost({
        apiKey: zernioKey, content: caption, scheduledFor: times.fbIgThreads,
        timezone: 'Asia/Jakarta', platforms: zernioPlatforms, mediaUrl: publicUrl,
      })
    : () => Promise.resolve({ ok: false, error: 'Akun Facebook/Instagram belum dikonfigurasi' });

  const [ytRes, tiktokRes, threadsRes, zernioRes] = await Promise.all([
    jobs[0].run(), jobs[1].run(), jobs[2].run(), zernioJob(),
  ]);

  const rows = [
    { platform: 'youtube', provider: 'buffer', scheduledAt: times.youtube, result: ytRes },
    { platform: 'tiktok', provider: 'buffer', scheduledAt: times.tiktok, result: tiktokRes },
    { platform: 'threads', provider: 'buffer', scheduledAt: times.fbIgThreads, result: threadsRes },
    ...(zernioPlatforms.some(p => p.platform === 'facebook')
      ? [{ platform: 'facebook', provider: 'zernio', scheduledAt: times.fbIgThreads, result: zernioRes }] : []),
    ...(zernioPlatforms.some(p => p.platform === 'instagram')
      ? [{ platform: 'instagram', provider: 'zernio', scheduledAt: times.fbIgThreads, result: zernioRes }] : []),
  ];

  try {
    await Promise.all(rows.map(r => env.DB.prepare(
      `INSERT INTO viralframe_scheduled_posts (video_id, provider, platform, slot_index, scheduled_at, status, remote_post_id, error_message)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      videoId, r.provider, r.platform, slotIndex, r.scheduledAt,
      r.result.ok ? 'scheduled' : 'failed',
      r.result.ok ? (r.result.remoteId ?? null) : null,
      r.result.ok ? null : (r.result.error ?? 'Gagal tanpa keterangan').slice(0, 500),
    ).run()));
  } catch (err) {
    console.error('[vf schedule/commit] insert scheduled_posts', err.message);
    return jsonError('Gagal mencatat hasil scheduling', 500);
  }

  const anySuccess = rows.some(r => r.result.ok);
  if (anySuccess) {
    try {
      await env.DB.prepare("UPDATE viralframe_videos SET trashed_at = datetime('now') WHERE id = ?").bind(videoId).run();
    } catch (err) {
      console.error('[vf schedule/commit] trash video', err.message);
    }
  }

  return jsonOk({
    slot_index: slotIndex,
    results: rows.map(r => ({ platform: r.platform, status: r.result.ok ? 'scheduled' : 'failed', error: r.result.ok ? null : r.result.error })),
    trashed: anySuccess,
  });
}

export async function onRequestOptions() { return handleOptions(); }
