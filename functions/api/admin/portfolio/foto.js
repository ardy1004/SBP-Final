// POST /api/admin/portfolio/foto — unggah SATU foto portofolio dalam dua ukuran.
// Body: { foto: 'data:image/webp;base64,…' (≤1280 px), thumb: 'data:image/webp;base64,…' (≤480 px) }
// → { foto_key, thumb_key }
//
// Kedua gambar SUDAH diproses di browser (AdminPortfolioPage): bagian sensitif
// ditutup permanen di <canvas>, lalu di-encode ulang ke WebP — re-encode itu
// juga membuang EXIF/GPS (foto survey dari HP menyimpan koordinat rumah).
// Pola sama dengan testimonials/foto.js: base64 WebP → R2, batas ukuran dicek
// SEBELUM atob().
//
// Auth: functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const WEBP_PREFIX = 'data:image/webp;base64,';
const MAKS_FOTO = 2 * 1024 * 1024;
const MAKS_THUMB = 512 * 1024;
const maksBase64 = (bytes) => Math.ceil(bytes * 4 / 3) + 128;

function dekode(dataUrl, maks, nama) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(WEBP_PREFIX)) return { galat: `${nama} harus WebP (data:image/webp;base64,…)` };
  if (dataUrl.length > maksBase64(maks)) return { galat: `${nama} melebihi ${Math.round(maks / 1024)} KB` };
  try {
    const bin = atob(dataUrl.slice(WEBP_PREFIX.length));
    return { buf: Uint8Array.from(bin, c => c.charCodeAt(0)).buffer };
  } catch {
    return { galat: `${nama}: base64 tidak sah` };
  }
}

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }

  const foto = dekode(body?.foto, MAKS_FOTO, 'Foto');
  if (foto.galat) return jsonError(foto.galat, foto.galat.includes('melebihi') ? 413 : 400);
  const thumb = dekode(body?.thumb, MAKS_THUMB, 'Thumbnail');
  if (thumb.galat) return jsonError(thumb.galat, thumb.galat.includes('melebihi') ? 413 : 400);

  const id = crypto.randomUUID();
  const foto_key = `portfolio/${id}.webp`;
  const thumb_key = `portfolio/${id}-t.webp`;
  const meta = { httpMetadata: { contentType: 'image/webp' } };
  try {
    await env.MEDIA.put(foto_key, foto.buf, meta);
    await env.MEDIA.put(thumb_key, thumb.buf, meta);
    return jsonOk({ foto_key, thumb_key }, 201);
  } catch (err) {
    console.error('[admin portfolio foto]', err.message);
    await env.MEDIA.delete(foto_key).catch(() => {});
    await env.MEDIA.delete(thumb_key).catch(() => {});
    return jsonError('Gagal menyimpan foto', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
