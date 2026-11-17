// GET /api/admin/viralframe/schedule/status?character_id= — status slot hari
// ini untuk SATU akun. Dipakai SlotIndicatorStrip.
//
// Sejak migrasi 0041 slot tidak lagi global. Akun utama (2026-08-15) dan agent
// ber-jadwal MANUAL (2026-11-05, migrasi 0057): kuota = jumlah jam yang diatur
// admin, jam PERSIS + drift linear. Agent mode otomatis: kuota naik bertahap
// menurut hari nyata, jam diundi ber-seed di dalam jendela primetime.
// `mode_jadwal` di respons = 'utama' | 'manual' | 'otomatis'. Slot dianggap terpakai kalau ada baris
// SUKSES atau BELUM PASTI ('unconfirmed' — post-nya mungkin ada); percobaan
// yang ditolak provider tidak menutup slot, jadi bisa dicoba ulang.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { kuotaAkun, slotTersedia, pilihJendela, waktuPerPlatform, getJendela, slotDipakai, slotPresetHariIni } from '../../../../_lib/jadwalOtomatis.js';
import { resolveAkunTarget, resolveScheduler, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { tanggalWib } from '../../../../_lib/waktu.js';

export async function onRequestGet({ env, request }) {
  const characterId = parseInt(new URL(request.url).searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 400);

  try {
    const { utama } = await getModeAkun(env);
    const { targetId } = await resolveAkunTarget(env, characterId);
    const [jendela, akun, { kuota, hari, utama: iaUtama, mode, preset }, dipakai] = await Promise.all([
      getJendela(env),
      resolveScheduler(env, characterId),
      kuotaAkun(env, targetId, utama),
      slotDipakai(env, targetId),
    ]);

    const platforms = Object.keys(akun.channels);
    const hariIni = tanggalWib();

    // Baris hari ini, dikelompokkan per video (1 video = 1 slot). `pulih` =
    // pasangan (video, platform) itu sudah punya pengganti di tanggal MANA PUN
    // (retry bisa mendarat besok) — kegagalan yang sudah pulih tidak boleh
    // tampil sebagai "Gagal hari ini".
    const res = await env.DB.prepare(
      `SELECT sp.video_id, sp.slot_index, sp.platform, sp.status, sp.error_message, sp.scheduled_at,
              EXISTS (SELECT 1 FROM viralframe_scheduled_posts s2
                       WHERE s2.video_id = sp.video_id AND s2.platform = sp.platform AND s2.id <> sp.id
                         AND s2.status = 'scheduled') AS pulih,
              EXISTS (SELECT 1 FROM viralframe_scheduled_posts s3
                       WHERE s3.video_id = sp.video_id AND s3.platform = sp.platform AND s3.id <> sp.id
                         AND s3.status = 'unconfirmed') AS ada_ragu
       FROM viralframe_scheduled_posts sp
       WHERE sp.akun_id = ? AND substr(sp.scheduled_at,1,10) = ?`
    ).bind(targetId, hariIni).all();
    const baris = res.results ?? [];
    // 'unconfirmed' ikut terhitung terisi — sama dengan slotTerpakaiHariIni.
    const videoSukses = new Set(baris.filter(b => b.status === 'scheduled' || b.status === 'unconfirmed').map(b => b.video_id));

    // Jam rencana hari ini menurut mesin — ditampilkan apa adanya supaya admin
    // bisa melihat jadwal SEBELUM apa pun dikirim.
    //
    // `terpakai` dihitung PER JENDELA/SLOT, bukan "n pertama sudah terisi".
    // Yang terisi tidak selalu berurutan: penjadwalan siang hari melewatkan
    // slot pagi, dan baris lama memakai penomoran slot preset 5-jam.
    //
    // Mode PRESET (N slot tetap + drift, lihat slotPresetHariIni) dipakai akun
    // utama DAN agent ber-jadwal manual; selebihnya mode jendela. Keputusannya
    // dari `preset` milik kuotaAkun — sumber yang sama dengan cron & tombol
    // Jadwalkan, jadi rencana di layar mustahil berbeda dari yang dikirim.
    const rencana = preset
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
      mode_jadwal: mode,
      terisi,
      sisa: Math.max(0, kuota - terisi),
      platform: platforms,
      rencana,
      // `dipakai` wajib ikut: tanpa itu angka ini menghitung jendela yang
      // sebenarnya sudah terisi, jadi UI menjanjikan slot yang akan ditolak.
      tersedia: slotTersedia({ akunId: targetId, kuota, platforms, jendela, preset, dipakai }).length,
      // Gagal DEFINITIF yang belum pulih. Hasil ambigu dipisah ke `belum_pasti`
      // — dulu keduanya tampil sebagai "Gagal hari ini", termasuk video yang
      // ternyata sudah tayang (laporan user 2026-11-17).
      gagal: baris
        .filter(b => b.status === 'failed' && !b.pulih && !b.ada_ragu)
        .map(b => ({ platform: b.platform, error: b.error_message })),
      belum_pasti: baris
        .filter(b => b.status === 'unconfirmed' && !b.pulih)
        .map(b => ({ platform: b.platform, error: b.error_message })),
    });
  } catch (err) {
    console.error('[vf schedule/status]', err.message);
    return jsonError('Gagal memuat status slot', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
