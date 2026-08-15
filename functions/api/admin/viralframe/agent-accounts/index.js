// GET /api/admin/viralframe/agent-accounts — kredensial storage & scheduler
// tiap agent (viralframe_characters LEFT JOIN viralframe_agent_accounts).
// Rahasia (api_secret, key Buffer/Zernio) hanya dikirim TER-MASK; nilai penuh
// tidak pernah keluar dari server. cloudinary_api_key ditampilkan apa adanya —
// nilai itu memang sudah dikirim ke browser tiap kali signed upload dibuat.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { maskKey } from '../../../../_lib/aiProviders.js';
import { parseSpesialis, parseChannels, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { setSetting, getSetting } from '../../../../_lib/schedulerProviders.js';
import { kuotaAkun } from '../../../../_lib/jadwalOtomatis.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare(`
      SELECT c.id AS character_id, c.nama,
             a.gmail, a.spesialis, a.cloudinary_name, a.cloudinary_api_key, a.cloudinary_api_secret,
             a.buffer_api_key, a.zernio_api_key, a.channels_json,
             a.jam_auto, a.auto_aktif, a.mulai_aktif, a.auto_terakhir, a.auto_hasil,
             (SELECT COUNT(*) FROM viralframe_agent_videos v WHERE v.character_id = c.id AND v.trashed_at IS NULL) AS video_aktif
      FROM viralframe_characters c
      LEFT JOIN viralframe_agent_accounts a ON a.character_id = c.id
      ORDER BY c.id
    `).all();

    const { utama } = await getModeAkun(env);
    const items = await Promise.all((res.results ?? []).map(async r => ({
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
      jam_auto: r.jam_auto ?? '',
      auto_aktif: r.auto_aktif === 1,
      mulai_aktif: r.mulai_aktif ?? null,
      auto_terakhir: r.auto_terakhir ?? null,
      // Ringkasan cron terakhir. Data lama/rusak tidak boleh meledakkan UI.
      auto_hasil: (() => { try { return r.auto_hasil ? JSON.parse(r.auto_hasil) : null; } catch { return null; } })(),
      ...(await kuotaAkun(env, r.character_id, utama)),
    })));

    return jsonOk({
      items,
      ...(await getModeAkun(env)),
      auto_aktif: (await getSetting(env, 'viralframe_auto_aktif')) === '1',
      auto_terakhir: await getSetting(env, 'viralframe_auto_terakhir'),
    });
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
  if ('auto_aktif' in body) {
    ops.push(setSetting(env, 'viralframe_auto_aktif', body.auto_aktif ? '1' : '0'));
  }
  if ('utama' in body) {
    const id = parseInt(body.utama, 10);
    if (!Number.isInteger(id) || id <= 0) return jsonError('utama harus id agent yang valid', 422);
    const ada = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(id).first().catch(() => null);
    if (!ada) return jsonError('Agent utama tidak ditemukan', 404);

    // Endpoint ini belum pernah dipanggil UI mana pun (satu-satunya jalur
    // memindah agent utama sekarang) — kalau dipanggil langsung (mis. lewat API
    // tool) tanpa peringatan, preset jam posting (5-slot) & kuota dinamisnya
    // ikut pindah diam-diam ke agent baru, karena keduanya dihitung murni dari
    // `akunId === akunUtamaId`, bukan milik agent tertentu (audit 2026-08-15).
    const { utama: utamaSekarang } = await getModeAkun(env);
    if (utamaSekarang && utamaSekarang !== id && body.confirm !== true) {
      const [presetTersimpan, videoRow] = await Promise.all([
        getSetting(env, 'viralframe_preset_utama'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL').bind(utamaSekarang).first().catch(() => null),
      ]);
      if (presetTersimpan || (videoRow?.n ?? 0) > 0) {
        return jsonError('Memindahkan agent utama akan ikut memindahkan preset jam posting (5-slot) dan kuota dinamisnya ke agent baru. Kirim ulang dengan { "confirm": true } untuk melanjutkan.', 422);
      }
    }
    ops.push(setSetting(env, 'viralframe_akun_utama', String(id)));
  }
  if (ops.length === 0) return jsonError('Tidak ada yang diubah', 400);

  try {
    await Promise.all(ops);
    return jsonOk({ ...(await getModeAkun(env)), auto_aktif: (await getSetting(env, 'viralframe_auto_aktif')) === '1' });
  } catch (err) {
    console.error('[vf agent-accounts] PATCH mode', err.message);
    return jsonError('Gagal menyimpan mode akun', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
