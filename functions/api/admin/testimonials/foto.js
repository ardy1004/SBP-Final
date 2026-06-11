// POST /api/admin/testimonials/foto
// Upload satu foto klien (base64 WebP) ke R2 → kembalikan key R2.
// Key dipakai frontend untuk diisi ke kolom foto_url saat create/update testimoni.
// Tidak terikat id testimoni agar bisa dipakai pada form Tambah (record belum ada) maupun Edit.
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const WEBP_PREFIX = 'data:image/webp;base64,';

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body tidak valid (harus JSON)', 400); }

  const photo = body?.photo;
  if (typeof photo !== 'string' || !photo) {
    return jsonError('Field photo wajib diisi', 400);
  }
  if (!photo.startsWith(WEBP_PREFIX)) {
    return jsonError('Foto harus berformat WebP (data:image/webp;base64,...)', 400);
  }

  let uploadBuf;
  try {
    const binaryStr = atob(photo.slice(WEBP_PREFIX.length));
    uploadBuf = Uint8Array.from(binaryStr, c => c.charCodeAt(0)).buffer;
  } catch {
    return jsonError('Gagal decode base64', 400);
  }

  const r2Key = `testimonials/${crypto.randomUUID()}.webp`;

  try {
    await env.MEDIA.put(r2Key, uploadBuf, { httpMetadata: { contentType: 'image/webp' } });
    return jsonOk({ key: r2Key });
  } catch (err) {
    console.error('[admin testimoni foto POST]', err.message);
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal menyimpan foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
