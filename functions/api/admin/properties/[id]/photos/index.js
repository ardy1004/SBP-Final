// POST /api/admin/properties/:id/photos
// Upload satu foto (base64 WebP) per request → R2 + property_images
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;

  const propertyId = parseInt(params.id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);

  const property = await env.DB.prepare(
    'SELECT id FROM properties WHERE id = ?'
  ).bind(propertyId).first();
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM property_images WHERE property_id = ?'
  ).bind(propertyId).first();
  if ((countRow?.cnt ?? 0) >= 20) return jsonError('Maksimal 20 foto per properti', 400);

  const r2Key = `property-photos/${crypto.randomUUID()}.webp`;
  let uploadBuf, contentType;

  // Mode 1: photo_url — fetch dari URL, simpan as-is
  if (body?.photo_url) {
    const photoUrl = String(body.photo_url).trim();
    if (!photoUrl.startsWith('http://') && !photoUrl.startsWith('https://')) {
      return jsonError('photo_url harus berupa URL http/https', 400);
    }
    let imgRes;
    try {
      imgRes = await fetch(photoUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    } catch (err) {
      return jsonError(`Gagal fetch foto: ${err.message}`, 400);
    }
    contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    // Hanya terima gambar — tanpa cek ini, HTML/file arbitrer bisa tersimpan ke R2
    if (!/^image\//i.test(contentType)) {
      return jsonError(`URL bukan gambar (content-type: ${contentType})`, 400);
    }
    uploadBuf = await imgRes.arrayBuffer();
    if (uploadBuf.byteLength > 10 * 1024 * 1024) {
      return jsonError('Foto dari URL melebihi 10MB', 413);
    }
    if (uploadBuf.byteLength === 0) {
      return jsonError('Foto dari URL kosong', 400);
    }

  // Mode 2: photo base64 (existing)
  } else {
    const { photo } = body ?? {};
    if (typeof photo !== 'string' || !photo) return jsonError('Field photo atau photo_url wajib diisi', 400);
    if (!photo.startsWith('data:image/webp;base64,')) return jsonError('Foto harus berformat WebP (data:image/webp;base64,...)', 400);
    contentType = 'image/webp';
    const base64Data = photo.slice('data:image/webp;base64,'.length);
    try {
      const binaryStr = atob(base64Data);
      uploadBuf = Uint8Array.from(binaryStr, c => c.charCodeAt(0)).buffer;
    } catch {
      return jsonError('Gagal decode base64', 400);
    }
  }

  try {
    await env.MEDIA.put(r2Key, uploadBuf, { httpMetadata: { contentType } });

    const result = await env.DB.prepare(`
      INSERT INTO property_images (property_id, url_webp, urutan, is_cover)
      VALUES (?, ?, (SELECT COALESCE(MAX(urutan), 0) + 1 FROM property_images WHERE property_id = ?), 0)
    `).bind(propertyId, r2Key, propertyId).run();

    const imageId = result.meta?.last_row_id;
    const image = await env.DB.prepare(
      'SELECT id, url_webp, alt_text, urutan, is_cover, label_ruangan FROM property_images WHERE id = ?'
    ).bind(imageId).first();

    return jsonOk({ image });
  } catch (err) {
    console.error('[admin photo POST]', err.message);
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal menyimpan foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
