// GET /api/admin/viralframe/schedule/status?character_id= — status slot hari
// ini untuk SATU akun. Dipakai SlotIndicatorStrip.
//
// Sejak migrasi 0041 slot tidak lagi global dan tidak lagi berjam tetap: tiap
// akun punya kuota sendiri (agent utama 3, agent lain naik bertahap menurut
// hari nyata) dan jamnya diundi ber-seed di dalam jendela primetime. Slot
// dianggap terpakai hanya kalau ada baris SUKSES — percobaan gagal total tidak
// menutup slot, jadi bisa dicoba ulang.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { kuotaAkun, slotTersedia, pilihJendela, waktuPerPlatform, getJendela } from '../../../../_lib/jadwalOtomatis.js';
import { resolveAkunTarget, resolveScheduler, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { tanggalWib } from '../../../../_lib/waktu.js';

export async function onRequestGet({ env, request }) {
  const characterId = parseInt(new URL(request.url).searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 400);

  try {
    const { utama } = await getModeAkun(env);
    const { targetId } = await resolveAkunTarget(env, characterId);
    const [jendela, akun, { kuota, hari, utama: iaUtama }] = await Promise.all([
      getJendela(env),
      resolveScheduler(env, characterId),
      kuotaAkun(env, targetId, utama),
    ]);

    const platforms = Object.keys(akun.channels);
    const hariIni = tanggalWib();

    // Baris sukses hari ini, dikelompokkan per video (1 video = 1 slot).
    const res = await env.DB.prepare(
      `SELECT video_id, slot_index, platform, status, error_message, scheduled_at
       FROM viralframe_scheduled_posts
       WHERE akun_id = ? AND substr(scheduled_at,1,10) = ?`
    ).bind(targetId, hariIni).all();
    const baris = res.results ?? [];
    const videoSukses = new Set(baris.filter(b => b.status === 'scheduled').map(b => b.video_id));

    // Jam rencana hari ini menurut mesin — ditampilkan apa adanya supaya admin
    // bisa melihat jadwal SEBELUM apa pun dikirim.
    const rencana = pilihJendela(targetId, hariIni, kuota, jendela).map(j => ({
      nama: j.nama,
      waktu: platforms.length ? waktuPerPlatform(targetId, hariIni, j, platforms) : {},
    }));

    const terisi = videoSukses.size;
    return jsonOk({
      akun_id: targetId,
      kuota,
      hari_nyata: hari,
      akun_utama: iaUtama,
      terisi,
      sisa: Math.max(0, kuota - terisi),
      platform: platforms,
      rencana,
      tersedia: slotTersedia({ akunId: targetId, kuota, platforms, jendela }).length,
      gagal: baris.filter(b => b.status === 'failed').map(b => ({ platform: b.platform, error: b.error_message })),
    });
  } catch (err) {
    console.error('[vf schedule/status]', err.message);
    return jsonError('Gagal memuat status slot', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
