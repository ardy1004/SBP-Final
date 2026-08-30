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
import { getSetting, setSetting, TIMEOUT_POST_MS } from '../../../_lib/schedulerProviders.js';
import { resolveScheduler, resolveAkunTarget, getModeAkun } from '../../../_lib/agentAccounts.js';
import { jadwalkanVideo, kuotaAkun, slotTerpakaiHariIni, getJendela, slotDipakai, getPresetUtama, ulangiPlatformGagal } from '../../../_lib/jadwalOtomatis.js';
import { tanggalWib } from '../../../_lib/waktu.js';
import { logServerError } from '../../../_lib/logError.js';

// ⚠️ Anggaran wall-clock. Cloudflare membunuh Worker di 30 detik. Tiap video
// fan-out ke semua platform SECARA PARALEL, jadi biaya satu video ≈ platform
// paling lambat, yaitu TIMEOUT_POST_MS bila ada provider yang menggantung.
// Timeout Zernio bukan skenario hipotetis: sudah terjadi 2026-08-24, 08-28, dan
// 08-31.
//
// Dibunuh di tengah = setStatusAgent tidak pernah ditulis dan sebagian video
// terjadwal tanpa catatan. Berhenti lebih awal jauh lebih aman: kuota dihitung
// dari slotTerpakaiHariIni, jadi putaran berikutnya melanjutkan tanpa pernah
// melebihi kuota.
const ANGGARAN_MS = 24000;

// Sisihkan waktu untuk ekor putaran (setStatusAgent + setSetting + tulis daftar
// tertunda) sesudah video terakhir selesai.
const CADANGAN_EKOR_MS = 2000;

// ⚠️ Biaya TERBURUK satu video. Anggaran harus MENCADANGKAN sebanyak ini
// sebelum memulai video baru — bukan sekadar bertanya "sudah lewat anggaran?".
//
// Kenapa: pemeriksaan lama hanya membandingkan waktu berjalan dengan anggaran,
// sehingga sebuah video boleh DIMULAI di detik ke-19,9 lalu berjalan 20 detik
// lagi = 39,9 detik → Worker dibunuh di 30 detik, tepat pada bahaya yang
// diperingatkan di atas. Bahaya itu justru membesar kalau ANGGARAN_MS dinaikkan
// tanpa pencadangan ini. Dengan cadangan: video baru hanya dimulai bila benar-
// benar muat sampai selesai (24000 − 10000 − 2000 → mulai paling lambat di
// detik ke-12, selesai paling lambat detik ke-22, ekor sampai ~24).
const BIAYA_VIDEO_MS = TIMEOUT_POST_MS + CADANGAN_EKOR_MS;

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

  const mulai = Date.now();
  // Tidak cukup ruang untuk MENYELESAIKAN satu video lagi — lihat BIAYA_VIDEO_MS.
  const anggaranHabis = () => Date.now() - mulai > ANGGARAN_MS - BIAYA_VIDEO_MS;

  const dry = new URL(request.url).searchParams.get('dry') === '1';
  const paksaAgent = parseInt(new URL(request.url).searchParams.get('character_id') ?? '', 10);

  // Saklar induk. Dry-run boleh menembusnya — justru dipakai saat masih mati.
  const aktif = await getSetting(env, 'viralframe_auto_aktif');
  if (aktif !== '1' && !dry) return jsonOk({ dilewati: 'saklar auto mati' });

  const jamSlot = slotJamWib();
  const manual = Number.isInteger(paksaAgent) && paksaAgent > 0;

  // Agent yang putarannya TERPOTONG di tick sebelumnya, supaya sisanya diambil
  // tick berikutnya (cron jalan 8× semalam, tiap 30 menit) alih-alih menunggu
  // besok. Tanpa ini, putaran Monica yang terpotong 2026-08-31 membuat 4 dari 5
  // videonya tidak pernah terkirim sama sekali.
  //
  // Dibatasi tanggal WIB: daftar dari malam sebelumnya TIDAK boleh bocor ke hari
  // berikutnya — hari baru punya kuotanya sendiri dan slotnya sendiri.
  const tertundaLama = manual ? [] : await bacaTertunda(env);

  const kandidat = await env.DB.prepare(
    `SELECT c.id, c.nama, a.auto_aktif, a.jam_auto
     FROM viralframe_characters c JOIN viralframe_agent_accounts a ON a.character_id = c.id
     WHERE ${manual
       ? 'c.id = ?'
       : `(a.jam_auto = ?${tertundaLama.length > 0 ? ` OR c.id IN (${tertundaLama.map(() => '?').join(',')})` : ''})`}`
  ).bind(...(manual ? [paksaAgent] : [jamSlot, ...tertundaLama])).all().catch(() => null);

  const agents = kandidat?.results ?? [];
  if (agents.length === 0) {
    // Tetap tandai cron-nya JALAN. Dulu return ini melewati setSetting di ekor,
    // jadi 'viralframe_auto_terakhir' tidak bergerak di slot yang kebetulan
    // tidak ada agentnya — terbaca seolah cron mati padahal sehat.
    if (!dry) await setSetting(env, 'viralframe_auto_terakhir', new Date().toISOString());
    return jsonOk({ jam_slot: jamSlot, dilewati: 'tidak ada agent pada jam ini' });
  }

  const { utama } = await getModeAkun(env);
  const [jendela, preset] = await Promise.all([getJendela(env), getPresetUtama(env)]);
  const laporan = [];
  // Klaim slot dibagi PER AKUN TUJUAN, bukan per agent: di mode terpusat
  // beberapa agent bermuara ke akun yang sama, dan saat dry-run tidak ada baris
  // DB yang menahan mereka agar tidak memilih jendela yang sama.
  const klaimPerAkun = new Map();

  let terpotong = false;
  // Agent yang belum tuntas di putaran ini; dilanjutkan tick berikutnya.
  const tertundaBaru = new Set();

  for (const ag of agents) {
    const hasilAgent = { agent: ag.nama, character_id: ag.id, terjadwal: 0, gagal: 0, detail: [] };

    // Dry-run tidak menyentuh provider sama sekali, jadi tidak perlu dibatasi.
    if (!dry && anggaranHabis()) {
      terpotong = true;
      tertundaBaru.add(ag.id);
      hasilAgent.alasan = 'anggaran waktu habis — agent ini belum diproses';
      laporan.push(hasilAgent);
      continue;
    }
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
    if (butuh === 0) hasilAgent.alasan = 'kuota hari ini sudah penuh';

    // ⚠️ "kuota penuh" dan "stok habis" TIDAK lagi `continue` — keduanya justru
    // kondisi paling wajar untuk menjalankan ulangi-platform-gagal di bawah.
    // Dulu keduanya melompati sisa badan loop, jadi jalur pemulihan tidak akan
    // pernah jalan untuk agent yang stoknya habis.
    let videos = [];
    if (butuh > 0) {
      // FIFO: video terlama yang diupload lebih dulu. hashtags WAJIB diikutkan —
      // tanpa ini hashtag tersimpan di DB tapi tidak pernah ikut terkirim ke
      // Buffer/Zernio (dilaporkan user 2026-08-15, sama seperti jalur manual).
      const antre = await env.DB.prepare(
        `SELECT id, cloudinary_url, caption, hashtags FROM viralframe_agent_videos
         WHERE character_id = ? AND trashed_at IS NULL AND cloudinary_url IS NOT NULL
         ORDER BY created_at ASC, id ASC LIMIT ?`
      ).bind(ag.id, butuh).all().catch(() => null);
      videos = antre?.results ?? [];
      if (videos.length === 0) hasilAgent.alasan = 'stok video habis';
      else if (videos.length < butuh) hasilAgent.alasan = `stok kurang (${videos.length} dari ${butuh})`;
    }

    for (let i = 0; i < videos.length; i++) {
      if (!dry && anggaranHabis()) {
        terpotong = true;
        tertundaBaru.add(ag.id);
        hasilAgent.detail.push({ video_id: videos[i].id, alasan: 'anggaran waktu habis' });
        break;
      }
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

    // Pemulihan dijalankan SETELAH video baru, memakai Set klaim yang sama —
    // supaya retry tidak pernah merebut jendela yang sudah dipesan video baru
    // hari itu. Efek sampingnya (baris retry ikut terhitung di
    // slotTerpakaiHariIni besok) memang diinginkan: total post per hari tetap
    // terkurung kuota.
    if (!anggaranHabis()) {
      try {
        const ulang = await ulangiPlatformGagal(env, {
          akun, targetId, akunUtamaId: utama, kuota, jendela, preset, dipakai, dryRun: dry,
        });
        if (ulang.diulang > 0 || ulang.dilewati > 0) hasilAgent.ulangi = ulang;
      } catch (err) {
        console.error('[auto-schedule] ulangi', ag.id, err.message);
        await logServerError(env, {
          source: 'server',
          message: `[scheduler] error saat mengulang platform gagal untuk agent ${ag.nama}: ${err.message}`,
          stack: err.stack,
          url: '/api/internal/viralframe/auto-schedule',
          context: { character_id: ag.id, akun_id: targetId },
        });
      }
    }

    if (!dry) {
      await setStatusAgent(env, ag.id, hasilAgent);
    }
    laporan.push(hasilAgent);
  }

  if (!dry) {
    await setSetting(env, 'viralframe_auto_terakhir', new Date().toISOString());
    // Agent yang sudah tuntas dibuang dari daftar; yang terpotong masuk/bertahan.
    // Aman dijalankan berkali-kali: kuota harian (slotTerpakaiHariIni) membuat
    // putaran idempoten, jadi agent yang terlanjur penuh cuma akan melaporkan
    // "kuota hari ini sudah penuh" lalu keluar.
    if (!manual) await tulisTertunda(env, [...tertundaBaru]);
  }

  // Terpotong = putaran ini TIDAK menyelesaikan rencananya. Bukan error fatal
  // (sisanya aman diambil putaran berikutnya), tapi kalau sering muncul artinya
  // provider sedang lambat atau jumlah agent per slot sudah terlalu padat.
  if (terpotong) {
    await logServerError(env, {
      source: 'server',
      message: `[scheduler] putaran auto-schedule berhenti karena anggaran waktu ${ANGGARAN_MS} ms terlampaui — sebagian agent/video belum diproses`,
      url: '/api/internal/viralframe/auto-schedule',
      context: { jam_slot: jamSlot, durasi_ms: Date.now() - mulai, jumlah_agent: agents.length },
    });
  }

  return jsonOk({ jam_slot: jamSlot, dry, tanggal: tanggalWib(), durasi_ms: Date.now() - mulai, terpotong, laporan });
}

// Daftar agent yang putarannya terpotong, disimpan di `settings` supaya tidak
// perlu migrasi. Bentuk: {"tanggal":"2026-08-31","ids":[20,15]}.
const KUNCI_TERTUNDA = 'viralframe_auto_tertunda';

/** Kembalikan id agent tertunda, HANYA bila masih tanggal WIB yang sama. */
async function bacaTertunda(env) {
  try {
    const mentah = await getSetting(env, KUNCI_TERTUNDA);
    if (!mentah) return [];
    const isi = JSON.parse(mentah);
    // ⚠️ Nilai lintas hari dibuang: hari baru punya kuota & slotnya sendiri,
    // dan menyeret daftar kemarin berarti menjadwalkan agent di jam yang bukan
    // miliknya.
    if (isi?.tanggal !== tanggalWib()) return [];
    return Array.isArray(isi.ids) ? isi.ids.filter(n => Number.isInteger(n)).slice(0, 50) : [];
  } catch {
    return [];   // setting rusak = anggap tidak ada; jangan jatuhkan putaran
  }
}

async function tulisTertunda(env, ids) {
  try {
    await setSetting(env, KUNCI_TERTUNDA, JSON.stringify({ tanggal: tanggalWib(), ids }));
  } catch (err) {
    console.error('[auto-schedule] simpan tertunda', err.message);
  }
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
