// GET /api/admin/viralframe/agent-accounts — kredensial storage & scheduler
// tiap agent (viralframe_characters LEFT JOIN viralframe_agent_accounts).
// Rahasia (api_secret, key Buffer/Zernio) hanya dikirim TER-MASK; nilai penuh
// tidak pernah keluar dari server. cloudinary_api_key ditampilkan apa adanya —
// nilai itu memang sudah dikirim ke browser tiap kali signed upload dibuat.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { maskKey } from '../../../../_lib/aiProviders.js';
import { parseSpesialis, parseChannels, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { setSetting } from '../../../../_lib/schedulerProviders.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare(`
      SELECT c.id AS character_id, c.nama,
             a.gmail, a.spesialis, a.cloudinary_name, a.cloudinary_api_key, a.cloudinary_api_secret,
             a.buffer_api_key, a.zernio_api_key, a.channels_json,
             (SELECT COUNT(*) FROM viralframe_agent_videos v WHERE v.character_id = c.id AND v.trashed_at IS NULL) AS video_aktif
      FROM viralframe_characters c
      LEFT JOIN viralframe_agent_accounts a ON a.character_id = c.id
      ORDER BY c.id
    `).all();

    const items = (res.results ?? []).map(r => ({
      character_id: r.character_id,
      nama: r.nama,
      gmail: r.gmail ?? '',
      spesialis: parseSpesialis(r.spesialis),
      cloudinary_name: r.cloudinary_name ?? '',
      cloudinary_api_key: r.cloudinary_api_key ?? '',
      cloudinary_api_secret_masked: maskKey(r.cloudinary_api_secret),
      buffer_api_key_masked: maskKey(r.buffer_api_key),
      zernio_api_key_masked: maskKey(r.zernio_api_key),
      channels: parseChannels(r.channels_json),
      // Ringkasan kesiapan — dipakai badge status di UI supaya agent yang belum
      // lengkap (mis. Vina) kelihatan sebelum dipakai, bukan setelah gagal.
      storage_siap: !!(r.cloudinary_name && r.cloudinary_api_key && r.cloudinary_api_secret),
      // "Siap" = ada key DAN ada channel. Key saja tidak cukup: fan-out tanpa
      // channel menghasilkan nol baris, yang dulu terbaca seperti sukses.
      scheduler_siap: !!(r.buffer_api_key || r.zernio_api_key) && Object.keys(parseChannels(r.channels_json)).length > 0,
      video_aktif: r.video_aktif ?? 0,
    }));

    return jsonOk({ items, ...(await getModeAkun(env)) });
  } catch (err) {
    console.error('[vf agent-accounts] GET', err.message);
    return jsonError('Gagal memuat akun agent', 500);
  }
}

// PATCH /api/admin/viralframe/agent-accounts — mode akun global.
//   { mode?: 'terpusat'|'per_agent', utama?: number }
// Sengaja menumpang di endpoint koleksi, bukan file endpoint baru: anggaran
// bundle Functions sudah mepet dan ini cuma dua baris setting.
export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const ops = [];
  if (body.mode === 'terpusat' || body.mode === 'per_agent') {
    ops.push(setSetting(env, 'viralframe_akun_mode', body.mode));
  }
  if ('utama' in body) {
    const id = parseInt(body.utama, 10);
    if (!Number.isInteger(id) || id <= 0) return jsonError('utama harus id agent yang valid', 422);
    const ada = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(id).first().catch(() => null);
    if (!ada) return jsonError('Agent utama tidak ditemukan', 404);
    ops.push(setSetting(env, 'viralframe_akun_utama', String(id)));
  }
  if (ops.length === 0) return jsonError('Tidak ada yang diubah', 400);

  try {
    await Promise.all(ops);
    return jsonOk(await getModeAkun(env));
  } catch (err) {
    console.error('[vf agent-accounts] PATCH mode', err.message);
    return jsonError('Gagal menyimpan mode akun', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
