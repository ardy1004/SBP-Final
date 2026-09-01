// GET /api/admin/pixel-configs  — list semua pixel configs
// POST /api/admin/pixel-configs — create pixel config baru
// Auth: dilindungi _middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../_shared/response.js';
import { META_EVENTS as DEFAULT_EVENTS } from '../../../_lib/metaEvents.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB
      .prepare(`
        SELECT id, label, pixel_id, is_active, events_enabled, created_at,
               CASE WHEN capi_access_token IS NOT NULL AND capi_access_token != '' THEN 1 ELSE 0 END AS has_capi_token
        FROM pixel_configs ORDER BY id
      `)
      .all();
    return jsonOk({ pixels: res.results ?? [] });
  } catch (err) {
    console.error('[pixel-configs GET]', err.message);
    return jsonError('Gagal memuat pixel configs', 500);
  }
}

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid'); }

  const label    = (body.label    ?? '').trim();
  const pixel_id = (body.pixel_id ?? '').trim();
  if (!label)    return jsonError('label wajib diisi');
  if (!pixel_id) return jsonError('pixel_id wajib diisi');

  const events = Array.isArray(body.events_enabled) ? body.events_enabled : DEFAULT_EVENTS;
  const eventsJson = JSON.stringify(events);

  const capiToken = (typeof body.capi_access_token === 'string' && body.capi_access_token.trim())
    ? body.capi_access_token.trim()
    : null;

  try {
    const row = await env.DB
      .prepare('INSERT INTO pixel_configs (label, pixel_id, events_enabled, capi_access_token) VALUES (?, ?, ?, ?) RETURNING id, label, pixel_id, is_active, events_enabled, capi_access_token, created_at')
      .bind(label, pixel_id, eventsJson, capiToken)
      .first();

    const hasCapiToken = (row.capi_access_token != null && row.capi_access_token !== '') ? 1 : 0;
    const { capi_access_token: _ct, ...safeRow } = row;
    return jsonCreated({ pixel: { ...safeRow, has_capi_token: hasCapiToken } });
  } catch (err) {
    console.error('[pixel-configs POST]', err.message);
    return jsonError('Gagal menyimpan pixel config', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
