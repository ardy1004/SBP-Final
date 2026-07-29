// GET /api/admin/settings/scheduler-accounts — daftar channel Buffer & akun
// Zernio yang tertaut, dari API mereka langsung (pakai key yang sudah
// tersimpan). Channel/account ID tidak tampil di dashboard biasa — endpoint
// ini menghindarkan admin dari harus curl/GraphQL manual.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { getSetting, listBufferChannels, listZernioAccounts } from '../../../_lib/schedulerProviders.js';

export async function onRequestGet({ env }) {
  const [bufferKey, zernioKey] = await Promise.all([
    getSetting(env, 'buffer_api_key'),
    getSetting(env, 'zernio_api_key'),
  ]);
  const [buffer, zernio] = await Promise.all([
    listBufferChannels(bufferKey),
    listZernioAccounts(zernioKey),
  ]);
  return jsonOk({ buffer, zernio });
}

export async function onRequestOptions() { return handleOptions(); }
