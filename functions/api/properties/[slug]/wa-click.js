// POST /api/properties/:slug/wa-click
// Publik — tanpa auth.
// Track klik tombol WA (sticky bar mobile) + simpan lead minimal ke DB.
// Response: { success: true, wa_url, event_id }

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { buildPropertyUrl } from '../../../_lib/propertyUrl.js';
import { sendCapiEvent } from '../../../_lib/metaCapi.js';
import { SQL_TANGGAL_WIB } from '../../../_lib/waktu.js';
import { extractGeo } from '../../../_lib/geoRequest.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') {
    return jsonError('Slug tidak valid', 400);
  }

  // Cari property — tambahkan harga & kode_listing untuk CAPI customData
  let propertyId, propertyTitle, propertyRow, propertyHarga = 0, propertyKode = '';
  try {
    const row = await env.DB
      .prepare("SELECT id, title, slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan, harga, kode_listing FROM properties WHERE slug = ? AND status_publish = 'published' LIMIT 1")
      .bind(slug)
      .first();
    if (!row) return jsonError('Properti tidak ditemukan', 404);
    propertyId    = row.id;
    propertyTitle = row.title;
    propertyRow   = row;
    propertyHarga = row.harga  ?? 0;
    propertyKode  = row.kode_listing ?? '';
  } catch (err) {
    console.error('[wa-click] lookup failed:', err.message);
    return jsonError('Gagal memproses permintaan', 500);
  }

  const waAdmin = (env.WA_ADMIN ?? '6281391278889').replace(/\D/g, '');
  const appUrl  = env.APP_URL ?? 'https://salambumi.xyz';
  const propUrl = buildPropertyUrl(propertyRow, appUrl);
  const waPesan = `Halo, saya tertarik dengan properti:\n*${propertyTitle}*\n${propUrl}\n\nBisakah saya mendapatkan info lebih lanjut?`;
  const waUrl   = `https://wa.me/${waAdmin}?text=${encodeURIComponent(waPesan)}`;

  const timestamp = Date.now();

  const geo = extractGeo(request);

  // Jalankan ketiganya paralel
  const [clickResult, leadResult, geoResult] = await Promise.allSettled([
    env.DB.prepare(`
      INSERT INTO property_view_daily (property_id, tanggal, wa_clicks)
      VALUES (?, ${SQL_TANGGAL_WIB}, 1)
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

    env.DB.prepare(`
      INSERT INTO property_click_geo (property_id, click_type, city, region, country)
      VALUES (?, 'wa_click', ?, ?, ?)
    `).bind(propertyId, geo.city, geo.region, geo.country).run(),
  ]);

  if (clickResult.status === 'rejected') {
    console.error('[wa-click] view_daily upsert failed:', clickResult.reason?.message);
  }
  if (leadResult.status === 'rejected') {
    console.error('[wa-click] leads insert failed:', leadResult.reason?.message);
  }
  if (geoResult.status === 'rejected') {
    console.error('[wa-click] click_geo insert failed:', geoResult.reason?.message);
  }

  const leadId = leadResult.status === 'fulfilled' ? leadResult.value?.meta?.last_row_id : null;
  const contactEventId = `contact_${leadId ?? 0}_${timestamp}`;

  // CAPI Contact — fire best-effort via waitUntil (tidak blocking response)
  context.waitUntil((async () => {
    try {
      const pixelRes = await env.DB
        .prepare("SELECT pixel_id, capi_access_token, events_enabled FROM pixel_configs WHERE is_active = 1 AND capi_access_token IS NOT NULL AND capi_access_token != ''")
        .all();
      const capiPixels = (pixelRes.results ?? []).filter(px => {
        try { return JSON.parse(px.events_enabled ?? '[]').includes('Contact'); } catch { return false; }
      });
      if (capiPixels.length > 0) {
        await Promise.allSettled(capiPixels.map(px => sendCapiEvent(env, {
          pixelId:        px.pixel_id,
          accessToken:    px.capi_access_token,
          eventName:      'Contact',
          eventId:        contactEventId,
          eventSourceUrl: propUrl,
          userData:       {},
          customData:     { content_ids: [propertyKode], value: propertyHarga, currency: 'IDR' },
        })));
      }
    } catch (err) {
      console.error('[wa-click] CAPI dispatch error:', err?.message);
    }
  })());

  return jsonOk({ success: true, wa_url: waUrl, event_id: contactEventId });
}

export async function onRequestOptions() {
  return handleOptions();
}
