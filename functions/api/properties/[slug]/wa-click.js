// POST /api/properties/:slug/wa-click
// Publik — tanpa auth.
// Track klik tombol WA (sticky bar mobile) ke property_view_daily.
// Response: { success: true, wa_url: "https://wa.me/..." }

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') {
    return jsonError('Slug tidak valid', 400);
  }

  // Cari property_id — hanya properti published yang bisa di-track
  let propertyId;
  let propertyTitle;
  try {
    const row = await env.DB
      .prepare("SELECT id, title FROM properties WHERE slug = ? AND status_publish = 'published' LIMIT 1")
      .bind(slug)
      .first();
    if (!row) return jsonError('Properti tidak ditemukan', 404);
    propertyId    = row.id;
    propertyTitle = row.title;
  } catch (err) {
    console.error('[wa-click] lookup failed:', err.message);
    return jsonError('Gagal memproses permintaan', 500);
  }

  // Upsert wa_clicks — non-fatal jika gagal
  try {
    await env.DB.prepare(`
      INSERT INTO property_view_daily (property_id, tanggal, wa_clicks)
      VALUES (?, DATE('now','localtime'), 1)
      ON CONFLICT(property_id, tanggal) DO UPDATE SET wa_clicks = wa_clicks + 1
    `).bind(propertyId).run();
  } catch (err) {
    console.error('[wa-click] upsert failed:', err.message);
  }

  // Kembalikan wa_url agar frontend bisa langsung buka WA
  const waAdmin  = (env.WA_ADMIN ?? '6281391278889').replace(/\D/g, '');
  const appUrl   = env.APP_URL ?? 'https://salambumi.xyz';
  const waPesan  = `Halo, saya tertarik dengan properti:\n*${propertyTitle}*\n${appUrl}/properties/${slug}\n\nBisakah saya mendapatkan info lebih lanjut?`;
  const waUrl    = `https://wa.me/${waAdmin}?text=${encodeURIComponent(waPesan)}`;

  return jsonOk({ success: true, wa_url: waUrl });
}

export async function onRequestOptions() {
  return handleOptions();
}
