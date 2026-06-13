// GET /api/tracking-config — publik, tanpa auth
// Return: { pixels: [{pixel_id, events_enabled}] (is_active=1 saja), ga4_measurement_id, gtm_container_id }
// capi_access_token TIDAK diekspos ke publik.

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';

export async function onRequestGet({ env }) {
  const fallback = { pixels: [], ga4_measurement_id: null, gtm_container_id: null, search_console_verification: null };
  try {
    const [pixelRes, settingRes] = await Promise.all([
      env.DB.prepare("SELECT pixel_id, events_enabled FROM pixel_configs WHERE is_active = 1 ORDER BY id").all(),
      env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('ga4_measurement_id','gtm_container_id','search_console_verification')").all(),
    ]);

    const pixels = (pixelRes.results ?? []).map(r => ({
      pixel_id: r.pixel_id,
      events_enabled: (() => { try { return JSON.parse(r.events_enabled ?? '[]'); } catch { return []; } })(),
    }));

    const sm = Object.fromEntries((settingRes.results ?? []).map(r => [r.key, r.value ?? null]));

    return jsonOk({
      pixels,
      ga4_measurement_id:          sm.ga4_measurement_id          ?? null,
      gtm_container_id:            sm.gtm_container_id            ?? null,
      search_console_verification: sm.search_console_verification ?? null,
    });
  } catch (err) {
    console.error('[tracking-config GET]', err.message);
    return jsonOk(fallback); // graceful — jangan return error ke publik
  }
}

export async function onRequestOptions() { return handleOptions(); }
