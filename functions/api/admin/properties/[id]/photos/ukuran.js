// GET /api/admin/properties/:id/photos/ukuran
//   Foto mana yang BELUM punya varian ukuran (property-photos/<640|1280>/<nama>).
//   Balasan: { foto: [{ id, url_webp, kurang: [640, 1280] }] } — hanya yang kurang.
//   Dipakai PropertyPhotosCard untuk melengkapi varian di browser admin: foto
//   Titip Jual & impor CSV (photo_url) lahir tanpa varian karena tidak ada
//   browser admin yang membuatnya saat unggah. Lihat _lib/ukuranFoto.js.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { UKURAN, POLA_DASAR, kunciUkuran } from '../../../../../_lib/ukuranFoto.js';

export async function onRequestGet(context) {
  const { env, params } = context;

  const propertyId = parseInt(params.id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);

  const rows = await env.DB.prepare(
    'SELECT id, url_webp FROM property_images WHERE property_id = ? ORDER BY urutan ASC, id ASC'
  ).bind(propertyId).all();

  // ≤ 20 foto per properti → ≤ 40 head(), paralel.
  const foto = (await Promise.all((rows.results ?? [])
    .filter(r => POLA_DASAR.test(r.url_webp ?? ''))
    .map(async r => {
      const ada = await Promise.all(UKURAN.map(w => env.MEDIA.head(kunciUkuran(r.url_webp, w)).then(Boolean, () => false)));
      const kurang = UKURAN.filter((_, i) => !ada[i]);
      return kurang.length ? { id: r.id, url_webp: r.url_webp, kurang } : null;
    })))
    .filter(Boolean);

  return jsonOk({ foto });
}

export async function onRequestOptions() {
  return handleOptions();
}
