// PUT /api/admin/properties/:id/photos/:imageId/ukuran
//   Body JSON: { "640": "data:image/webp;base64,…", "1280": "data:image/webp;base64,…" }
//   Simpan varian ukuran foto (dibuat di browser admin) ke
//   property-photos/<lebar>/<nama>. Boleh hanya sebagian lebar.
//   Lihat _lib/ukuranFoto.js untuk alasan & bentuk kunci.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../../_shared/response.js';
import { UKURAN, POLA_DASAR, MAKS_BYTE_VARIAN, kunciUkuran, jenisDariIsi } from '../../../../../../_lib/ukuranFoto.js';

export async function onRequestPut(context) {
  const { env, params, request } = context;

  const propertyId = parseInt(params.id, 10);
  const imageId = parseInt(params.imageId, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);
  if (!Number.isInteger(imageId) || imageId <= 0) return jsonError('ID foto tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }
  if (!body || typeof body !== 'object') return jsonError('Body tidak valid', 400);

  const foto = await env.DB.prepare(
    'SELECT url_webp FROM property_images WHERE id = ? AND property_id = ?'
  ).bind(imageId, propertyId).first();
  if (!foto) return jsonError('Foto tidak ditemukan untuk properti ini', 404);
  if (!POLA_DASAR.test(foto.url_webp ?? '')) return jsonError('Foto ini tidak disimpan di R2 — tidak bisa dibuatkan ukuran', 422);

  // Validasi SEMUA dulu, baru tulis — jangan ada varian setengah tersimpan
  // karena lebar kedua ternyata rusak.
  const siap = [];
  for (const lebar of UKURAN) {
    const isi = body[String(lebar)];
    if (isi == null) continue;
    if (typeof isi !== 'string') return jsonError(`Ukuran ${lebar} harus data URL`, 400);
    const m = /^data:image\/(webp|jpeg);base64,/.exec(isi);
    if (!m) return jsonError(`Ukuran ${lebar} harus WebP atau JPEG (data URL)`, 400);
    let bytes;
    try {
      const bin = atob(isi.slice(m[0].length));
      bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    } catch {
      return jsonError(`Ukuran ${lebar}: base64 rusak`, 400);
    }
    if (bytes.length === 0) return jsonError(`Ukuran ${lebar} kosong`, 400);
    if (bytes.length > MAKS_BYTE_VARIAN) return jsonError(`Ukuran ${lebar} melebihi 2 MB`, 413);
    // Jenis menurut ISI, bukan label data URL — byte apa pun yang tersimpan
    // tersaji publik lewat /api/media dengan cache 1 tahun.
    const jenis = jenisDariIsi(bytes);
    if (!jenis) return jsonError(`Ukuran ${lebar} bukan gambar WebP/JPEG`, 415);
    siap.push({ lebar, bytes, jenis });
  }
  if (siap.length === 0) return jsonError(`Kirim minimal satu ukuran (${UKURAN.join('/')})`, 400);

  try {
    await Promise.all(siap.map(v =>
      env.MEDIA.put(kunciUkuran(foto.url_webp, v.lebar), v.bytes, { httpMetadata: { contentType: `image/${v.jenis}` } })));
    return jsonOk({ tersimpan: siap.map(v => v.lebar) });
  } catch (err) {
    console.error('[admin photo ukuran PUT]', err.message);
    return jsonError('Gagal menyimpan ukuran foto', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
