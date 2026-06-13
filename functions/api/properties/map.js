// GET /api/properties/map — data minimal untuk map pins (lat/lng included)
// Hanya properti published + punya koordinat. Static route prioritas di atas [slug].js.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const VALID_JENIS = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
const VALID_TUJUAN = ['dijual','disewa','dijual_disewa'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;

  const conditions = [
    "p.status_publish = 'published'",
    "p.latitude IS NOT NULL",
    "p.longitude IS NOT NULL",
  ];
  const bindings = [];

  const tujuan = q.get('tujuan');
  if (tujuan && VALID_TUJUAN.includes(tujuan)) {
    if (tujuan === 'dijual') {
      conditions.push("(p.tujuan = 'dijual' OR p.tujuan = 'dijual_disewa')");
    } else if (tujuan === 'disewa') {
      conditions.push("(p.tujuan = 'disewa' OR p.tujuan = 'dijual_disewa')");
    } else {
      conditions.push("p.tujuan = ?");
      bindings.push(tujuan);
    }
  }

  const jenis = q.get('jenis');
  if (jenis) {
    const list = jenis.split(',').map(j => j.trim()).filter(j => VALID_JENIS.includes(j));
    if (list.length > 0) {
      conditions.push(`p.jenis_properti IN (${list.map(() => '?').join(',')})`);
      bindings.push(...list);
    }
  }

  const kabupaten = q.get('kabupaten');
  if (kabupaten) { conditions.push('LOWER(p.kabupaten) = LOWER(?)'); bindings.push(kabupaten); }

  const where = conditions.join(' AND ');

  try {
    const result = await env.DB.prepare(`
      SELECT
        p.id, p.slug, p.title, p.tujuan, p.jenis_properti,
        p.harga, p.kecamatan, p.kabupaten,
        p.latitude, p.longitude,
        (SELECT url_webp FROM property_images
           WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url
      FROM properties p
      WHERE ${where}
      ORDER BY p.published_at DESC
      LIMIT 500
    `).bind(...bindings).all();

    return jsonOk({ items: result.results ?? [] });
  } catch (err) {
    console.error('[properties/map] DB error:', err.message);
    return jsonError('Gagal mengambil data peta', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
