// GET  /api/admin/settings/tracking — baca ga4_measurement_id, ga4_property_id, gtm_container_id, search_console_verification
// PATCH /api/admin/settings/tracking — simpan / hapus key-key tersebut
// Auth: dilindungi _middleware.js
//
// ga4_measurement_id (G-XXXXXXXXXX) dipakai untuk tracking snippet di root.tsx.
// ga4_property_id (angka saja, dari GA4 Admin > Property Settings) dipakai
// terpisah untuk narik laporan lewat GA4 Data API (widget Ringkasan) — dua ID
// yang berbeda dari GA4, jangan disamakan.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const TRACKING_KEYS = ['ga4_measurement_id', 'ga4_property_id', 'gtm_container_id', 'search_console_verification'];

export async function onRequestGet({ env }) {
  try {
    const placeholders = TRACKING_KEYS.map(() => '?').join(', ');
    const res = await env.DB
      .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
      .bind(...TRACKING_KEYS)
      .all();

    const result = Object.fromEntries(TRACKING_KEYS.map(k => [k, null]));
    for (const row of (res.results ?? [])) result[row.key] = row.value ?? null;
    return jsonOk(result);
  } catch (err) {
    console.error('[settings/tracking GET]', err.message);
    return jsonError('Gagal memuat tracking settings', 500);
  }
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid'); }

  const ops = [];
  for (const key of TRACKING_KEYS) {
    if (key in body) {
      const raw = body[key];
      const value = raw && typeof raw === 'string' ? raw.trim() || null : null;
      ops.push(env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run());
    }
  }
  if (ops.length === 0) return jsonError('Tidak ada field yang diupdate');

  try {
    await Promise.all(ops);
    return jsonOk({ updated: true });
  } catch (err) {
    console.error('[settings/tracking PATCH]', err.message);
    return jsonError('Gagal menyimpan tracking settings', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
