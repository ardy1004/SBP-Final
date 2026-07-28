// POST /api/admin/viralframe/backsounds?label=&duration=
//   Body = bytes audio mentah (audio/mpeg dll). Upload ke R2 + catat D1.
// GET  /api/admin/viralframe/backsounds  → list bank backsound (global, lintas properti).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — audio, jauh lebih kecil dari batas video (60MB)
const ALLOWED_CONTENT_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/aac'];

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return jsonError(`Content-Type harus salah satu: ${ALLOWED_CONTENT_TYPES.join(', ')}`, 415);
  }

  const declaredLen = parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isInteger(declaredLen) && declaredLen > MAX_BYTES) {
    return jsonError('Backsound terlalu besar (maks 15MB)', 413);
  }

  const label = (url.searchParams.get('label') ?? '').slice(0, 120) || 'Backsound';
  const duration = parseInt(url.searchParams.get('duration') ?? '', 10) || null;

  let buf;
  try { buf = await request.arrayBuffer(); }
  catch { return jsonError('Gagal membaca body backsound', 400); }
  if (!buf || buf.byteLength === 0) return jsonError('Body backsound kosong', 400);
  if (buf.byteLength > MAX_BYTES) return jsonError('Backsound terlalu besar (maks 15MB)', 413);

  const r2Key = `viralframe-backsound/${crypto.randomUUID()}.mp3`;
  try {
    await env.MEDIA.put(r2Key, buf, { httpMetadata: { contentType: 'audio/mpeg' } });
  } catch (err) {
    console.error('[vf backsounds] R2 put', err.message);
    return jsonError('Gagal menyimpan backsound ke storage', 500);
  }

  try {
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_backsounds (label, r2_key, duration_sec, size_bytes) VALUES (?,?,?,?)`
    ).bind(label, r2Key, duration, buf.byteLength).run();
    return jsonOk({ id: res.meta?.last_row_id, r2_key: r2Key }, 201);
  } catch (err) {
    console.error('[vf backsounds] insert', err.message);
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal mencatat backsound ke database', 500);
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const res = await env.DB.prepare(
      `SELECT id, label, r2_key, duration_sec, size_bytes, created_at
       FROM viralframe_backsounds ORDER BY created_at DESC, id DESC`
    ).all();
    return jsonOk({ items: res.results ?? [] });
  } catch (err) {
    console.error('[vf backsounds] GET', err.message);
    return jsonError('Gagal mengambil daftar backsound', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
