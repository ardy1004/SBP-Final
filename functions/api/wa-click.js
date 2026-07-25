// POST /api/wa-click — Publik, tanpa auth.
// Catat klik tombol WhatsApp yang TIDAK terikat properti tertentu (Footer, FAQ,
// Notaris, ChatWidget, halaman Kontak). Padanan non-properti dari
// /api/properties/:slug/wa-click.
//
// Latar belakang: sebelum endpoint ini ada, hanya sheet kontak di halaman detail
// properti yang tercatat. Semua pintu WA lain memakai <a href="https://wa.me/...">
// langsung sehingga tidak pernah menyentuh tabel leads maupun Meta CAPI — trafik
// konsultasi umum hilang total dari CRM.
//
// Dipanggil lewat navigator.sendBeacon (fire-and-forget). Klien TIDAK menunggu
// response: <a href> tetap apa adanya supaya link WA jalan walau endpoint ini
// gagal, dan supaya navigasi tidak pernah tertahan await (yang diblokir in-app
// browser Meta — lihat gotcha CLAUDE.md).

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { sendCapiEvent } from '../_lib/metaCapi.js';

// Lead quick_wa umum volumenya rendah. Cap ini jauh di atas trafik wajar tapi
// menutup skenario flood — endpoint publik tanpa CAPTCHA yang menulis ke leads.
const MAX_PER_MINUTE = 30;

// Whitelist source_page — mencegah tabel leads dikotori nilai sembarang dari
// klien, sekaligus menjaga laporan CRM tetap bisa dikelompokkan.
const VALID_SOURCES = new Set([
  'footer', 'faq', 'notaris', 'chat_widget', 'contact_page', 'about_agent', 'navbar',
]);

async function recentQuickWaCount(db) {
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM leads
                WHERE tipe_pengirim = 'quick_wa' AND property_id IS NULL
                  AND created_at > datetime('now', '-60 seconds')`)
      .first();
    return row?.cnt ?? 0;
  } catch {
    return 0; // fail-open: lebih baik kehilangan rem daripada membuang lead asli
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch { /* body opsional */ }

  const source = typeof body.source_page === 'string' ? body.source_page.trim() : '';
  if (!VALID_SOURCES.has(source)) {
    return jsonError('source_page tidak dikenal', 422);
  }

  if (!env.DB) return jsonError('Database tidak tersedia', 503);

  if ((await recentQuickWaCount(env.DB)) >= MAX_PER_MINUTE) {
    // 200, bukan 429 — ini beacon fire-and-forget, klien tidak menampilkan error.
    return jsonOk({ recorded: false, throttled: true });
  }

  let leadId = null;
  try {
    const result = await env.DB.prepare(`
      INSERT INTO leads
        (property_id, nama, no_wa, tipe_pengirim, source_page,
         wa_clicked_at, status_pipeline, notes, created_at, updated_at)
      VALUES
        (NULL, NULL, NULL, 'quick_wa', ?,
         CURRENT_TIMESTAMP, 'baru', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(source).run();
    leadId = result.meta?.last_row_id ?? null;
  } catch (err) {
    console.error('[wa-click generic] leads insert failed:', err.message);
    return jsonError('Gagal mencatat klik', 500);
  }

  const appUrl = env.APP_URL ?? 'https://salambumi.xyz';
  const eventId = `contact_generic_${leadId ?? 0}_${Date.now()}`;

  // CAPI Contact — best-effort, tidak memblokir response.
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
          eventId,
          eventSourceUrl: `${appUrl}/${source}`,
          userData:       {},
          customData:     { content_category: source },
        })));
      }
    } catch (err) {
      console.error('[wa-click generic] CAPI dispatch error:', err?.message);
    }
  })());

  return jsonOk({ recorded: true, event_id: eventId });
}

export async function onRequestOptions() { return handleOptions(); }
