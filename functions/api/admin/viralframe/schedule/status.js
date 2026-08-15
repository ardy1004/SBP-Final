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
import { kuotaAkun, slotTersedia, pilihJendela, waktuPerPlatform, getJendela, slotDipakai, getPresetUtama, slotPresetHariIni } from '../../../../_lib/jadwalOtomatis.js';
import { resolveAkunTarget, resolveScheduler, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { tanggalWib } from '../../../../_lib/waktu.js';

export async function onRequestGet({ env, request }) {
  const characterId = parseInt(new URL(request.url).searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 400);

  try {
    const { utama } = await getModeAkun(env);
    const { targetId } = await resolveAkunTarget(env, characterId);
    const [jendela, preset, akun, { kuota, hari, utama: iaUtama }, dipakai] = await Promise.all([
      getJendela(env),
      getPresetUtama(env),
      resolveScheduler(env, characterId),
      kuotaAkun(env, targetId, utama),
      slotDipakai(env, targetId),
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
    //
    // `terpakai` dihitung PER JENDELA/SLOT, bukan "n pertama sudah terisi".
    // Yang terisi tidak selalu berurutan: penjadwalan siang hari melewatkan
    // slot pagi, dan baris lama memakai penomoran slot preset 5-jam.
    //
    // Akun utama pakai mode PRESET (N slot tetap + drift) — lihat
    // slotPresetHariIni; agent lain tetap mode jendela seperti sebelumnya.
    const rencana = iaUtama
      ? slotPresetHariIni(targetId, hariIni, preset, platforms).map(s => ({
          nama: s.nama,
          terpakai: dipakai.has(`${hariIni}|${s.index + 1}`),
          waktu: s.waktu,
        }))
      : pilihJendela(targetId, hariIni, kuota, jendela).map(j => ({
          nama: j.nama,
          terpakai: dipakai.has(`${hariIni}|${j.index + 1}`),
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
      // `dipakai` wajib ikut: tanpa itu angka ini menghitung jendela yang
      // sebenarnya sudah terisi, jadi UI menjanjikan slot yang akan ditolak.
      tersedia: slotTersedia({ akunId: targetId, akunUtamaId: utama, kuota, platforms, jendela, preset, dipakai }).length,
      gagal: baris.filter(b => b.status === 'failed').map(b => ({ platform: b.platform, error: b.error_message })),
    });
  } catch (err) {
    console.error('[vf schedule/status]', err.message);
    return jsonError('Gagal memuat status slot', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
