// GET /api/admin/pixel-configs  — list semua pixel configs
// POST /api/admin/pixel-configs — create pixel config baru
// Auth: dilindungi _middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../_shared/response.js';

const DEFAULT_EVENTS = ['PageView', 'ViewContent', 'Search', 'Contact', 'Lead'];

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB
      .prepare('SELECT id, label, pixel_id, is_active, events_enabled, created_at FROM pixel_configs ORDER BY id')
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

  const label = (body.label ?? '').trim();
  const pixel_id = (body.pixel_id ?? '').trim();
  if (!label) return jsonError('label wajib diisi');
  if (!pixel_id) return jsonError('pixel_id wajib diisi');

  const events = Array.isArray(body.events_enabled) ? body.events_enabled : DEFAULT_EVENTS;
  const eventsJson = JSON.stringify(events);

  try {
    const row = await env.DB
      .prepare('INSERT INTO pixel_configs (label, pixel_id, events_enabled) VALUES (?, ?, ?) RETURNING id, label, pixel_id, is_active, events_enabled, created_at')
      .bind(label, pixel_id, eventsJson)
      .first();
    return jsonCreated({ pixel: row });
  } catch (err) {
    console.error('[pixel-configs POST]', err.message);
    return jsonError('Gagal menyimpan pixel config', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
