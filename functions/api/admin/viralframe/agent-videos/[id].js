// DELETE /api/admin/viralframe/agent-videos/:id — hapus video (Cloudinary + D1)
// PATCH  /api/admin/viralframe/agent-videos/:id — update caption/hashtags/post_url
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

async function sha1Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function destroyCloudinaryAsset(env, publicId, resourceType) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary belum dikonfigurasi');

  const timestamp = Math.floor(Date.now() / 1000);
  const paramString = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramString + apiSecret);

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', apiKey);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType || 'video'}/destroy`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary destroy gagal: ${res.status}`);
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id tidak valid', 400);

  const row = await env.DB.prepare('SELECT cloudinary_public_id, resource_type FROM viralframe_agent_videos WHERE id = ?').bind(id).first().catch(() => null);
  if (!row) return jsonError('Video tidak ditemukan', 404);

  try { await destroyCloudinaryAsset(env, row.cloudinary_public_id, row.resource_type); }
  catch (err) { console.error('[vf agent-videos] cloudinary destroy', err.message); }

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

  const sets = [], binds = [];
  if (caption !== undefined) { sets.push('caption = ?'); binds.push(caption); }
  if (hashtags !== undefined) { sets.push('hashtags = ?'); binds.push(hashtags); }
  if (post_url !== undefined) { sets.push('post_url = ?'); binds.push(post_url); }
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
