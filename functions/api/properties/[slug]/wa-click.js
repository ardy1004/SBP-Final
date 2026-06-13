// POST /api/properties/:slug/wa-click
// Publik — tanpa auth.
// Track klik tombol WA (sticky bar mobile) + simpan lead minimal ke DB.
// Response: { success: true, wa_url: "https://wa.me/..." }

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { buildPropertyUrl } from '../../../_lib/propertyUrl.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') {
    return jsonError('Slug tidak valid', 400);
  }

  // Cari property_id — hanya properti published yang bisa di-track
  let propertyId;
  let propertyTitle;
  let propertyRow;
  try {
    const row = await env.DB
      .prepare("SELECT id, title, slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan FROM properties WHERE slug = ? AND status_publish = 'published' LIMIT 1")
      .bind(slug)
      .first();
    if (!row) return jsonError('Properti tidak ditemukan', 404);
    propertyId    = row.id;
    propertyTitle = row.title;
    propertyRow   = row;
  } catch (err) {
    console.error('[wa-click] lookup failed:', err.message);
    return jsonError('Gagal memproses permintaan', 500);
  }

  const waAdmin  = (env.WA_ADMIN ?? '6281391278889').replace(/\D/g, '');
  const appUrl   = env.APP_URL ?? 'https://salambumi.xyz';
  const propUrl  = buildPropertyUrl(propertyRow, appUrl);
  const waPesan  = `Halo, saya tertarik dengan properti:\n*${propertyTitle}*\n${propUrl}\n\nBisakah saya mendapatkan info lebih lanjut?`;
  const waUrl    = `https://wa.me/${waAdmin}?text=${encodeURIComponent(waPesan)}`;

  // Jalankan keduanya paralel — wa_clicks analytics + leads insert
  // Promise.allSettled agar satu gagal tidak blokir yang lain
  const [clickResult, leadResult] = await Promise.allSettled([
    env.DB.prepare(`
      INSERT INTO property_view_daily (property_id, tanggal, wa_clicks)
      VALUES (?, DATE('now','localtime'), 1)
      ON CONFLICT(property_id, tanggal) DO UPDATE SET wa_clicks = wa_clicks + 1
    `).bind(propertyId).run(),

    env.DB.prepare(`
      INSERT INTO leads
        (property_id, nama, no_wa, tipe_pengirim, source_page,
         wa_clicked_at, status_pipeline, notes, created_at, updated_at)
      VALUES
        (?, NULL, NULL, 'quick_wa', ?,
         CURRENT_TIMESTAMP, 'baru', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(propertyId, propUrl).run(),
  ]);

  if (clickResult.status === 'rejected') {
    console.error('[wa-click] view_daily upsert failed:', clickResult.reason?.message);
  }
  if (leadResult.status === 'rejected') {
    console.error('[wa-click] leads insert failed:', leadResult.reason?.message);
  }

  return jsonOk({ success: true, wa_url: waUrl });
}

export async function onRequestOptions() {
  return handleOptions();
}
