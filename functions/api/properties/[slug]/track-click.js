// POST /api/properties/:slug/track-click
// Publik — tanpa auth. Dipicu navigator.sendBeacon() saat kartu properti
// diklik di halaman listing/beranda (sebelum navigasi ke halaman detail).
// Catat click_type='wa_click' ditangani terpisah di wa-click.js — endpoint ini
// khusus 'card_click'. Lihat migrasi 0036_property_click_geo.sql.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { extractGeo } from '../../../_lib/geoRequest.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') {
    return jsonError('Slug tidak valid', 400);
  }

  try {
    const row = await env.DB
      .prepare("SELECT id FROM properties WHERE slug = ? AND status_publish = 'published' LIMIT 1")
      .bind(slug)
      .first();
    // sendBeacon adalah fire-and-forget dari sisi pengunjung — 404 di sini tidak
    // pernah dilihat siapa pun, tapi tetap balas 200 supaya tidak ada percobaan
    // retry otomatis browser untuk properti yang memang sudah tidak publish.
    if (!row) return jsonOk({ tercatat: false });

    const geo = extractGeo(request);
    await env.DB.prepare(`
      INSERT INTO property_click_geo (property_id, click_type, city, region, country)
      VALUES (?, 'card_click', ?, ?, ?)
    `).bind(row.id, geo.city, geo.region, geo.country).run();

    return jsonOk({ tercatat: true });
  } catch (err) {
    console.error('[track-click]', err.message);
    // Tracking gagal tidak boleh terlihat sebagai error oleh pengunjung.
    return jsonOk({ tercatat: false });
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
