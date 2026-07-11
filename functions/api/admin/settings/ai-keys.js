// GET   /api/admin/settings/ai-keys — key ter-mask (4 digit akhir) + status configured
// PATCH /api/admin/settings/ai-keys — simpan key (per provider). Nilai kosong = hapus.
// Auth: _middleware.js
//
// Key disimpan di tabel settings D1 (key: <provider>_api_key). Ditampilkan MASKED
// saja — nilai penuh tidak pernah dikembalikan ke client.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, PROVIDER_IDS, getProviderKey, maskKey } from '../../../_lib/aiProviders.js';

export async function onRequestGet({ env }) {
  const out = {};
  for (const p of PROVIDER_IDS) {
    const key = await getProviderKey(env, p);
    out[p] = {
      configured: !!key,
      masked: key ? maskKey(key) : null,
      // dari secret (env) atau dari DB — informasi untuk UI
      source: key ? (await fromSettings(env, p) ? 'db' : 'secret') : null,
    };
  }
  return jsonOk(out);
}

async function fromSettings(env, provider) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
      .bind(PROVIDERS[provider].settingKey).first();
    return !!(row?.value && String(row.value).trim());
  } catch { return false; }
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid', 400); }

  const ops = [];
  const updated = [];
  for (const p of PROVIDER_IDS) {
    if (!(p in body)) continue;
    const raw = body[p];
    // Abaikan bila client mengirim nilai masked (mengandung •) — berarti tidak diubah.
    if (typeof raw === 'string' && raw.includes('•')) continue;
    const value = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    ops.push(env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(PROVIDERS[p].settingKey, value).run());
    updated.push(p);
  }
  if (ops.length === 0) return jsonError('Tidak ada key yang diupdate', 400);

  try {
    await Promise.all(ops);
    return jsonOk({ updated });
  } catch (err) {
    console.error('[settings/ai-keys PATCH]', err.message);
    return jsonError('Gagal menyimpan API key', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
