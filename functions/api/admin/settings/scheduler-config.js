// GET   /api/admin/settings/scheduler-config — channel/account ID + preset jam posting
// PATCH /api/admin/settings/scheduler-config — simpan / hapus field-field tersebut
// Auth: _middleware.js
//
// Kloning pola functions/api/admin/settings/tracking.js (plain value, bukan
// masked). viralframe_schedule_preset disimpan sebagai JSON string — lihat
// functions/_lib/schedulerProviders.js untuk bentuk & default-nya.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { getSetting, setSetting, getSchedulePreset } from '../../../_lib/schedulerProviders.js';

const PLAIN_KEYS = [
  'buffer_channel_id_youtube',
  'buffer_channel_id_tiktok',
  'buffer_channel_id_threads',
  'zernio_account_id_facebook',
  'zernio_account_id_instagram',
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidPreset(preset) {
  if (!Array.isArray(preset) || preset.length !== 5) return false;
  const slots = new Set();
  for (const row of preset) {
    if (!row || typeof row !== 'object') return false;
    if (!Number.isInteger(row.slot) || row.slot < 1 || row.slot > 5) return false;
    if (!TIME_RE.test(row.time)) return false;
    slots.add(row.slot);
  }
  return slots.size === 5;
}

export async function onRequestGet({ env }) {
  try {
    const values = await Promise.all(PLAIN_KEYS.map(k => getSetting(env, k)));
    const result = Object.fromEntries(PLAIN_KEYS.map((k, i) => [k, values[i]]));
    result.viralframe_schedule_preset = await getSchedulePreset(env);
    return jsonOk(result);
  } catch (err) {
    console.error('[settings/scheduler-config GET]', err.message);
    return jsonError('Gagal memuat konfigurasi scheduler', 500);
  }
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid', 400); }

  const ops = [];
  for (const key of PLAIN_KEYS) {
    if (key in body) {
      const raw = body[key];
      const value = raw && typeof raw === 'string' ? raw.trim() || null : null;
      ops.push(setSetting(env, key, value));
    }
  }
  if ('viralframe_schedule_preset' in body) {
    const preset = body.viralframe_schedule_preset;
    if (!isValidPreset(preset)) return jsonError('Preset jam posting tidak valid — butuh 5 slot dengan jam HH:MM', 422);
    ops.push(setSetting(env, 'viralframe_schedule_preset', JSON.stringify(preset)));
  }
  if (ops.length === 0) return jsonError('Tidak ada field yang diupdate', 400);

  try {
    await Promise.all(ops);
    return jsonOk({ updated: true });
  } catch (err) {
    console.error('[settings/scheduler-config PATCH]', err.message);
    return jsonError('Gagal menyimpan konfigurasi scheduler', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
