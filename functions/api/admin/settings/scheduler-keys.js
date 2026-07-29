// GET   /api/admin/settings/scheduler-keys — key ter-mask + status configured
// PATCH /api/admin/settings/scheduler-keys — simpan key Buffer/Zernio. Nilai kosong = hapus.
// Auth: _middleware.js
//
// Kloning pola functions/api/admin/settings/ai-keys.js — key disimpan di tabel
// settings D1, ditampilkan MASKED saja (nilai penuh tidak pernah ke client).

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { getSetting, setSetting } from '../../../_lib/schedulerProviders.js';
import { maskKey } from '../../../_lib/aiProviders.js';

const KEYS = { buffer: 'buffer_api_key', zernio: 'zernio_api_key' };

export async function onRequestGet({ env }) {
  const out = {};
  for (const [id, settingKey] of Object.entries(KEYS)) {
    const key = await getSetting(env, settingKey);
    out[id] = { configured: !!key, masked: key ? maskKey(key) : null };
  }
  return jsonOk(out);
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid', 400); }

  const ops = [];
  const updated = [];
  for (const [id, settingKey] of Object.entries(KEYS)) {
    if (!(id in body)) continue;
    const raw = body[id];
    if (typeof raw === 'string' && raw.includes('•')) continue; // masked, tidak diubah
    const value = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    ops.push(setSetting(env, settingKey, value));
    updated.push(id);
  }
  if (ops.length === 0) return jsonError('Tidak ada key yang diupdate', 400);

  try {
    await Promise.all(ops);
    return jsonOk({ updated });
  } catch (err) {
    console.error('[settings/scheduler-keys PATCH]', err.message);
    return jsonError('Gagal menyimpan API key', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
