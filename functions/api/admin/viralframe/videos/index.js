// POST /api/admin/viralframe/videos?property_id=&label=&gaya=&rasio=&duration=
//   Body = bytes video mentah (video/mp4). Upload ke R2 + catat D1.
// GET  /api/admin/viralframe/videos?property_id=  → list Content Library.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const MAX_BYTES = 60 * 1024 * 1024; // 60MB
// Content-Type diterima dari browser (VideoVOTab selalu kirim 'video/mp4', lihat
// AdminViralFrameWorkspacePage.tsx) — dulu TIDAK divalidasi sama sekali (audit
// 2026-07-28), bytes apa pun (HTML, EXE) diterima dan dipaksa disimpan sebagai
// 'video/mp4'. Whitelist longgar (bukan cuma mp4 persis) karena browser/proxy
// beda-beda menuliskan charset/codec di header.
const ALLOWED_CONTENT_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const propertyId = parseInt(url.searchParams.get('property_id') ?? '', 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return jsonError(`Content-Type harus salah satu: ${ALLOWED_CONTENT_TYPES.join(', ')}`, 415);
  }

  // Tolak berdasar Content-Length SEBELUM membaca body penuh ke memori kalau
  // klien sudah menyebutkannya — dulu cek ukuran baru terjadi SETELAH
  // arrayBuffer() selesai membuffer semuanya (audit 2026-07-28). Content-Length
  // bisa absen/salah (chunked encoding) jadi cek ukuran final di bawah tetap ada.
  const declaredLen = parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isInteger(declaredLen) && declaredLen > MAX_BYTES) {
    return jsonError('Video terlalu besar (maks 60MB)', 413);
  }

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
    // Rollback R2 — dulu dibiarkan orphan permanen kalau insert D1 gagal (audit
    // 2026-07-28), kontras dengan characters/index.js yang sudah benar.
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal mencatat video ke database', 500);
  }
}

const SELECT_COLS = 'id, property_id, r2_key, label, gaya, rasio, duration_sec, size_bytes, post_url, views, likes, trashed_at, created_at';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pid = parseInt(url.searchParams.get('property_id') ?? '', 10);
  const view = url.searchParams.get('view') === 'trash' ? 'trash' : 'active';
  const trashCond = view === 'trash' ? 'trashed_at IS NOT NULL' : 'trashed_at IS NULL';
  const orderBy = view === 'trash' ? 'trashed_at DESC, id DESC' : 'created_at DESC, id DESC';
  try {
    const stmt = Number.isInteger(pid) && pid > 0
      ? env.DB.prepare(`SELECT ${SELECT_COLS} FROM viralframe_videos WHERE property_id = ? AND ${trashCond} ORDER BY ${orderBy}`).bind(pid)
      : env.DB.prepare(`SELECT ${SELECT_COLS} FROM viralframe_videos WHERE ${trashCond} ORDER BY ${orderBy} LIMIT 200`);
    const res = await stmt.all();
    return jsonOk({ items: res.results ?? [] });
  } catch (err) {
    console.error('[vf videos] GET', err.message);
    return jsonError('Gagal mengambil daftar video', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
