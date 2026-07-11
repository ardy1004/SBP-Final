// GET /api/admin/settings/ai-status — status kuota per provider (hijau/kuning/merah).
// Auth: _middleware.js. Dipanggil parallel oleh Settings panel & ViralFrame Step 4.

import { jsonOk, handleOptions } from '../../_shared/response.js';
import { PROVIDER_IDS, getProviderKey, getQuotaStatus } from '../../../_lib/aiProviders.js';

export async function onRequestGet({ env }) {
  const results = await Promise.all(PROVIDER_IDS.map(async p => {
    const key = await getProviderKey(env, p);
    if (!key) return [p, { color: 'red', detail: 'Key belum diatur', configured: false }];
    const st = await getQuotaStatus(p, key);
    return [p, { ...st, configured: true }];
  }));
  return jsonOk(Object.fromEntries(results));
}

export async function onRequestOptions() { return handleOptions(); }
