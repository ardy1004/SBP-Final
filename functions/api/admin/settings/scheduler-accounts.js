// GET /api/admin/settings/scheduler-accounts?character_id= — daftar channel
// Buffer & akun Zernio yang tertaut pada AKUN AGENT tersebut, ditanyakan
// langsung ke API mereka pakai key yang sudah tersimpan. Channel/account ID
// tidak tampil di dashboard Buffer/Zernio biasa — endpoint ini yang
// menghindarkan admin dari harus curl/GraphQL manual.
//
// character_id WAJIB: sejak migrasi 0037 tidak ada lagi key global yang bisa
// ditanyakan — tiap agent punya akunnya sendiri.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { listBufferChannels, listZernioAccounts } from '../../../_lib/schedulerProviders.js';
import { resolveScheduler } from '../../../_lib/agentAccounts.js';

export async function onRequestGet({ env, request }) {
  const characterId = parseInt(new URL(request.url).searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 400);

  const akun = await resolveScheduler(env, characterId);
  const [buffer, zernio] = await Promise.all([
    listBufferChannels(akun.bufferKey),
    listZernioAccounts(akun.zernioKey),
  ]);
  return jsonOk({ buffer, zernio });
}

export async function onRequestOptions() { return handleOptions(); }
