// POST /api/admin/viralframe/videos?property_id=&label=&gaya=&rasio=&duration=
//   Body = bytes video mentah (video/mp4). Upload ke R2 + catat D1.
// GET  /api/admin/viralframe/videos?property_id=  → list Content Library.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const MAX_BYTES = 60 * 1024 * 1024; // 60MB

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const propertyId = parseInt(url.searchParams.get('property_id') ?? '', 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);

  const label    = (url.searchParams.get('label') ?? '').slice(0, 120) || null;
  const gaya     = (url.searchParams.get('gaya') ?? '').slice(0, 60) || null;
  const rasio    = (url.searchParams.get('rasio') ?? '').slice(0, 20) || null;
  const duration = parseInt(url.searchParams.get('duration') ?? '', 10) || null;

  let buf;
  try { buf = await request.arrayBuffer(); }
  catch { return jsonError('Gagal membaca body video', 400); }
  if (!buf || buf.byteLength === 0) return jsonError('Body video kosong', 400);
  if (buf.byteLength > MAX_BYTES) return jsonError('Video terlalu besar (maks 60MB)', 413);

  const r2Key = `viralframe-videos/${crypto.randomUUID()}.mp4`;
  try {
    await env.MEDIA.put(r2Key, buf, { httpMetadata: { contentType: 'video/mp4' } });
  } catch (err) {
    console.error('[vf videos] R2 put', err.message);
    return jsonError('Gagal menyimpan video ke storage', 500);
  }

  try {
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_videos (property_id, r2_key, label, gaya, rasio, duration_sec, size_bytes)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(propertyId, r2Key, label, gaya, rasio, duration, buf.byteLength).run();
    return jsonOk({ id: res.meta?.last_row_id, r2_key: r2Key }, 201);
  } catch (err) {
    console.error('[vf videos] insert', err.message);
    // R2 sudah terisi; catat error tapi jangan gagal total upload
    return jsonError('Video tersimpan di storage tapi gagal dicatat DB', 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const pid = parseInt(new URL(request.url).searchParams.get('property_id') ?? '', 10);
  try {
    const stmt = Number.isInteger(pid) && pid > 0
      ? env.DB.prepare(`SELECT id, property_id, r2_key, label, gaya, rasio, duration_sec, size_bytes, post_url, views, likes, created_at
                        FROM viralframe_videos WHERE property_id = ? ORDER BY created_at DESC, id DESC`).bind(pid)
      : env.DB.prepare(`SELECT id, property_id, r2_key, label, gaya, rasio, duration_sec, size_bytes, post_url, views, likes, created_at
                        FROM viralframe_videos ORDER BY created_at DESC, id DESC LIMIT 200`);
    const res = await stmt.all();
    return jsonOk({ items: res.results ?? [] });
  } catch (err) {
    console.error('[vf videos] GET', err.message);
    return jsonError('Gagal mengambil daftar video', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
