// GET  /api/admin/viralframe/characters — list semua karakter (created_at DESC)
// POST /api/admin/viralframe/characters — tambah karakter baru
//   Body JSON: { nama, foto (data:image/webp;base64,...), gender?, usia?, etnik?, style?, ciri_fisik? }
//   Foto di-upload ke R2 dengan prefix 'viralframe-characters/'.
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../../_shared/response.js';

const WEBP_PREFIX = 'data:image/webp;base64,';

function sanitize(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const result = await env.DB.prepare(`
      SELECT id, nama, foto_url, gender, usia, etnik, style, ciri_fisik, created_at
      FROM viralframe_characters
      ORDER BY created_at DESC, id DESC
    `).all();

    return jsonOk({ items: result.results ?? [], total: (result.results ?? []).length });
  } catch (err) {
    console.error('[viralframe characters GET]', err.message);
    return jsonError('Gagal mengambil data karakter', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const nama = sanitize(body.nama ?? '', 120);
  if (!nama) return jsonError('nama tidak boleh kosong', 422);

  const photo = body?.foto;
  if (typeof photo !== 'string' || !photo) {
    return jsonError('Field foto wajib diisi', 422);
  }
  if (!photo.startsWith(WEBP_PREFIX)) {
    return jsonError('Foto harus berformat WebP (data:image/webp;base64,...)', 422);
  }

  let uploadBuf;
  try {
    const binaryStr = atob(photo.slice(WEBP_PREFIX.length));
    uploadBuf = Uint8Array.from(binaryStr, c => c.charCodeAt(0)).buffer;
  } catch {
    return jsonError('Gagal decode base64 foto', 400);
  }

  const gender     = sanitize(body.gender ?? '', 30) || null;
  const usia       = Number.isInteger(body.usia) ? body.usia : (parseInt(body.usia, 10) || null);
  const etnik      = sanitize(body.etnik ?? '', 60) || null;
  const style      = sanitize(body.style ?? '', 120) || null;
  const ciri_fisik = sanitize(body.ciri_fisik ?? '', 500) || null;

  const r2Key = `viralframe-characters/${crypto.randomUUID()}.webp`;

  try {
    await env.MEDIA.put(r2Key, uploadBuf, { httpMetadata: { contentType: 'image/webp' } });
  } catch (err) {
    console.error('[viralframe characters POST upload]', err.message);
    return jsonError('Gagal menyimpan foto', 500);
  }

  try {
    const res = await env.DB.prepare(`
      INSERT INTO viralframe_characters
        (nama, foto_url, gender, usia, etnik, style, ciri_fisik)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(nama, r2Key, gender, usia, etnik, style, ciri_fisik).run();

    const newRow = await env.DB
      .prepare('SELECT * FROM viralframe_characters WHERE id = ?')
      .bind(res.meta.last_row_id)
      .first();

    return jsonCreated({ pesan: 'Karakter berhasil ditambahkan', karakter: newRow });
  } catch (err) {
    console.error('[viralframe characters POST]', err.message);
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal menyimpan karakter', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
