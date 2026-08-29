// POST /api/internal/viralframe/auto-schedule — kirim video ke Buffer/Zernio
// otomatis, untuk agent yang jam_auto-nya jatuh di slot 30 menit saat ini.
//
// PENTING soal istilah: yang otomatis di sini adalah MENGIRIM KE SCHEDULER.
// Buffer/Zernio yang kemudian menerbitkan ke medsos pada jam primetime. Jadi
// cron dini hari (01:00–04:00 WIB) cuma mengisi antrean; tayangnya tetap pagi,
// siang, dan malam.
//
// Dipanggil worker cron (workers/viralframe-purge-cron), BUKAN browser admin —
// makanya di luar /api/admin/* dan pakai secret header sendiri, pola yang sama
// dengan purge-trash.js.
//
// ?dry=1 → hitung dan laporkan jadwal yang AKAN dibuat tanpa memanggil
// Buffer/Zernio sama sekali. Dipakai admin untuk memeriksa sebelum menyalakan.
//
// Auth: header X-Purge-Secret == env.VIRALFRAME_PURGE_SECRET

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { getSetting, setSetting } from '../../../_lib/schedulerProviders.js';
import { resolveScheduler, resolveAkunTarget, getModeAkun } from '../../../_lib/agentAccounts.js';
import { jadwalkanVideo, kuotaAkun, slotTerpakaiHariIni, getJendela, slotDipakai, getPresetUtama } from '../../../_lib/jadwalOtomatis.js';
import { tanggalWib } from '../../../_lib/waktu.js';
import { logServerError } from '../../../_lib/logError.js';

// Jam WIB sekarang, dibulatkan ke bawah ke kelipatan 30 menit — dipakai
// mencocokkan jam_auto agent. Runtime Worker selalu UTC, WIB = UTC+7.
function slotJamWib(sekarang = Date.now()) {
  const wib = new Date(sekarang + 7 * 3600 * 1000);
  const jam = wib.getUTCHours();
  const menit = wib.getUTCMinutes() < 30 ? '00' : '30';
  return `${String(jam).padStart(2, '0')}:${menit}`;
}

export async function onRequestPost({ request, env }) {
  const secret = env.VIRALFRAME_PURGE_SECRET;
  const header = request.headers.get('X-Purge-Secret');
  if (!secret || header !== secret) return jsonError('Forbidden', 403);

  const dry = new URL(request.url).searchParams.get('dry') === '1';
  const paksaAgent = parseInt(new URL(request.url).searchParams.get('character_id') ?? '', 10);

  // Saklar induk. Dry-run boleh menembusnya — justru dipakai saat masih mati.
  const aktif = await getSetting(env, 'viralframe_auto_aktif');
  if (aktif !== '1' && !dry) return jsonOk({ dilewati: 'saklar auto mati' });

  const jamSlot = slotJamWib();
  const kandidat = await env.DB.prepare(
    `SELECT c.id, c.nama, a.auto_aktif, a.jam_auto
     FROM viralframe_characters c JOIN viralframe_agent_accounts a ON a.character_id = c.id
     WHERE ${Number.isInteger(paksaAgent) && paksaAgent > 0 ? 'c.id = ?' : 'a.jam_auto = ?'}`
  ).bind(Number.isInteger(paksaAgent) && paksaAgent > 0 ? paksaAgent : jamSlot).all().catch(() => null);

  const agents = kandidat?.results ?? [];
  if (agents.length === 0) return jsonOk({ jam_slot: jamSlot, dilewati: 'tidak ada agent pada jam ini' });

  const { utama } = await getModeAkun(env);
  const [jendela, preset] = await Promise.all([getJendela(env), getPresetUtama(env)]);
  const laporan = [];
  // Klaim slot dibagi PER AKUN TUJUAN, bukan per agent: di mode terpusat
  // beberapa agent bermuara ke akun yang sama, dan saat dry-run tidak ada baris
  // DB yang menahan mereka agar tidak memilih jendela yang sama.
  const klaimPerAkun = new Map();

  for (const ag of agents) {
    const hasilAgent = { agent: ag.nama, character_id: ag.id, terjadwal: 0, gagal: 0, detail: [] };

    if (!dry && ag.auto_aktif !== 1) { hasilAgent.alasan = 'auto agent ini dimatikan'; laporan.push(hasilAgent); continue; }

    const akun = await resolveScheduler(env, ag.id);
    if (!akun.bufferKey && !akun.zernioKey) { hasilAgent.alasan = 'belum ada kredensial scheduler'; laporan.push(hasilAgent); continue; }
    if (Object.keys(akun.channels).length === 0) { hasilAgent.alasan = 'belum ada channel sosmed'; laporan.push(hasilAgent); continue; }

    const { targetId } = await resolveAkunTarget(env, ag.id);
    const { kuota, hari } = await kuotaAkun(env, targetId, utama);
    const terpakai = await slotTerpakaiHariIni(env, targetId);
    if (!klaimPerAkun.has(targetId)) klaimPerAkun.set(targetId, await slotDipakai(env, targetId));
    const dipakai = klaimPerAkun.get(targetId);
    hasilAgent.kuota = kuota;
    hasilAgent.hari_nyata = hari;
    hasilAgent.sudah_terjadwal = terpakai;

    // Kekurangan, BUKAN kuota penuh — inilah yang membuat cron idempoten:
    // dijalankan dua kali, atau bercampur dengan klik manual, tidak pernah
    // melebihi kuota harian.
    const butuh = Math.max(0, kuota - terpakai);
    if (butuh === 0) { hasilAgent.alasan = 'kuota hari ini sudah penuh'; laporan.push(hasilAgent); continue; }

    // FIFO: video terlama yang diupload lebih dulu. hashtags WAJIB diikutkan —
    // tanpa ini hashtag tersimpan di DB tapi tidak pernah ikut terkirim ke
    // Buffer/Zernio (dilaporkan user 2026-08-15, sama seperti jalur manual).
    const antre = await env.DB.prepare(
      `SELECT id, cloudinary_url, caption, hashtags FROM viralframe_agent_videos
       WHERE character_id = ? AND trashed_at IS NULL AND cloudinary_url IS NOT NULL
       ORDER BY created_at ASC, id ASC LIMIT ?`
    ).bind(ag.id, butuh).all().catch(() => null);
    const videos = antre?.results ?? [];
    if (videos.length === 0) { hasilAgent.alasan = 'stok video habis'; laporan.push(hasilAgent); continue; }
    if (videos.length < butuh) hasilAgent.alasan = `stok kurang (${videos.length} dari ${butuh})`;

    for (let i = 0; i < videos.length; i++) {
      // ⚠️ try/catch WAJIB per video. Sebelumnya satu exception (mis. D1 menolak
      // INSERT) naik sampai ke sini dan mematikan SELURUH putaran — agent yang
      // antre di belakang tidak pernah diproses, tanpa jejak (audit 2026-08-29).
      try {
        const r = await jadwalkanVideo(env, {
          video: videos[i], akun, targetId, akunUtamaId: utama, kuota, jendela, preset, dipakai, dryRun: dry,
        });
        if (!r.ok) { hasilAgent.gagal++; hasilAgent.detail.push({ video_id: videos[i].id, alasan: r.alasan }); continue; }
        if (dry) { hasilAgent.detail.push({ video_id: videos[i].id, jendela: r.jendela, waktu: r.waktu }); hasilAgent.terjadwal++; continue; }
        const gagalPlatform = (r.rows ?? []).filter(x => !x.result.ok);
        if (r.adaSukses) hasilAgent.terjadwal++; else hasilAgent.gagal++;
        hasilAgent.detail.push({
          video_id: videos[i].id, jendela: r.jendela,
          gagal_platform: gagalPlatform.map(x => `${x.platform}: ${x.result.error}`),
        });
      } catch (err) {
        hasilAgent.gagal++;
        hasilAgent.detail.push({ video_id: videos[i].id, alasan: `error tak terduga: ${err.message}` });
        console.error('[auto-schedule] video', videos[i].id, err.message);
        await logServerError(env, {
          source: 'server',
          message: `[scheduler] error tak terduga saat menjadwalkan video ${videos[i].id} (agent ${ag.nama}): ${err.message}`,
          stack: err.stack,
          url: '/api/internal/viralframe/auto-schedule',
          context: { video_id: videos[i].id, character_id: ag.id, akun_id: targetId },
        });
      }
    }

    if (!dry) {
      await setStatusAgent(env, ag.id, hasilAgent);
    }
    laporan.push(hasilAgent);
  }

  if (!dry) await setSetting(env, 'viralframe_auto_terakhir', new Date().toISOString());
  return jsonOk({ jam_slot: jamSlot, dry, tanggal: tanggalWib(), laporan });
}

async function setStatusAgent(env, characterId, hasil) {
  const ringkas = JSON.stringify({
    terjadwal: hasil.terjadwal, gagal: hasil.gagal, alasan: hasil.alasan ?? null,
    kuota: hasil.kuota ?? null, hari_nyata: hasil.hari_nyata ?? null,
  });
  await env.DB.prepare(
    `UPDATE viralframe_agent_accounts SET auto_terakhir = ?, auto_hasil = ? WHERE character_id = ?`
  ).bind(new Date().toISOString(), ringkas, characterId).run().catch(err => {
    console.error('[auto-schedule] simpan status', err.message);
  });
}

export async function onRequestOptions() { return handleOptions(); }
