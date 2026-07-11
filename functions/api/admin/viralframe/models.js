// GET /api/admin/viralframe/models?provider=gemini — daftar model tersedia provider.
// Auth: _middleware.js. Untuk dropdown model di ViralFrame Step 4.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, listModels } from '../../../_lib/aiProviders.js';

export async function onRequestGet({ env, request }) {
  const provider = new URL(request.url).searchParams.get('provider') ?? '';
  const cfg = PROVIDERS[provider];
  if (!cfg) return jsonError('provider tidak valid', 400);

  const key = await getProviderKey(env, provider);
  if (!key) return jsonError(`API key ${cfg.label} belum diatur`, 400);

  const models = await listModels(provider, key);
  // Selalu sertakan default model di depan (kalau list gagal / kosong).
  const ordered = [cfg.defaultModel, ...models.filter(m => m !== cfg.defaultModel)];
  return jsonOk({ provider, default: cfg.defaultModel, models: ordered });
}

export async function onRequestOptions() { return handleOptions(); }
