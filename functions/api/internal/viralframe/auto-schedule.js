// POST /api/internal/viralframe/auto-schedule — kirim video ke Buffer/Zernio
// otomatis. SETIAP putaran memproses SEMUA agent ber-auto aktif, yang paling
// sedikit terisi hari ini lebih dulu, sampai anggaran waktu habis; sisanya
// diambil putaran berikutnya (cron tiap 10 menit, 00:05–03:55 WIB).
//
// PENTING soal istilah: yang otomatis di sini adalah MENGIRIM KE SCHEDULER.
// Buffer/Zernio yang kemudian menerbitkan ke medsos pada jam tayang yang KITA
// hitung per agent (preset/jendela) dan ikut kita kirim. Jadi jam kirim bebas —
// asal sebelum jam tayang paling awal (JAM_PRESET_PALING_AWAL).
//
// ⚠️ Kenapa bukan lagi "satu agent satu slot jam_auto" (2026-11-21): satu
// putaran hanya muat ±2–3 video (batas Worker 30 dtk), 8 putaran semalam = ±20
// video untuk kebutuhan 40, dan sisa pekerjaan dulu diproses menurut urutan ID.
// Urutan jam kebetulan kebalikan urutan ID, sehingga Andi (ID tertinggi) tidak
// mendapat satu video pun sejak 16 Nov — tanpa error, statusnya hanya membeku.
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
import { getSetting, setSetting, TIMEOUT_POST_MS, STATUS_TERKIRIM_SQL } from '../../../_lib/schedulerProviders.js';
import { resolveScheduler, resolveAkunTarget, getModeAkun } from '../../../_lib/agentAccounts.js';
import {
  jadwalkanVideo, kuotaAkun, slotTerpakaiHariIni, videoBaruDicobaHariIni, hitungButuh,
  getJendela, slotDipakai, ulangiPlatformGagal, sqlBelumPernahDikirim,
} from '../../../_lib/jadwalOtomatis.js';
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

// Sisihkan waktu untuk ekor putaran (setStatusAgent + setSetting + log)
// sesudah video terakhir selesai.
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

// Jam WIB putaran terakhir jendela cron ("5,15,…,55 17-20 * * *" UTC =
// 00:05–03:55 WIB). Terpotong di putaran lebih awal itu NORMAL — sisanya
// diambil 10 menit kemudian. Terpotong di jam terakhir = kapasitas semalam
// benar-benar kurang → baru dicatat ke Error Logs.
const JAM_WIB_TERAKHIR = 3;

// Jam WIB sekarang, dibulatkan ke bawah ke kelipatan 30 menit — hanya untuk
// laporan & log (jam_auto tidak lagi memilih agent). Runtime Worker = UTC.
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

  // SEMUA agent ikut tiap putaran (2026-11-21), diurutkan PALING SEDIKIT video
  // terisi hari ini lebih dulu — itulah keadilannya: agent yang terlewat karena
  // anggaran habis otomatis berada di depan pada putaran berikutnya, dan agent
  // yang kuotanya sudah penuh jatuh ke belakang. Menggantikan daftar
  // `viralframe_auto_tertunda` + urutan ID yang membuat Andi kelaparan.
  // Seri diputus c.id. Penghitung ini sama dengan slotTerpakaiHariIni untuk
  // mode per_agent (akun_id = id agent); di mode terpusat semua agent bermuara
  // ke akun utama, jadi urutannya jatuh ke c.id — kuotanya tetap dijaga
  // slotTerpakaiHariIni akun utama.
  //
  // ⚠️ Tanpa .catch (2026-11-17). D1 error di sini = request gagal 500: worker
  // cron mencatatnya dan auto_terakhir tidak bergerak.
  const kandidat = await env.DB.prepare(
    `SELECT c.id, c.nama, a.auto_aktif,
            (SELECT COUNT(DISTINCT sp.video_id) FROM viralframe_scheduled_posts sp
              WHERE sp.akun_id = c.id AND sp.status IN ${STATUS_TERKIRIM_SQL}
                AND substr(sp.scheduled_at, 1, 10) = ?) AS terisi_hari_ini
       FROM viralframe_characters c JOIN viralframe_agent_accounts a ON a.character_id = c.id
      WHERE ${manual ? 'c.id = ?' : '(? = 1 OR a.auto_aktif = 1)'}
      ORDER BY terisi_hari_ini ASC, c.id ASC`
  ).bind(tanggalWib(), manual ? paksaAgent : (dry ? 1 : 0)).all();

  const agents = kandidat?.results ?? [];
  if (agents.length === 0) {
    // Tetap tandai cron-nya JALAN — tidak ada agent aktif bukan berarti cron mati.
    if (!dry) await setSetting(env, 'viralframe_auto_terakhir', new Date().toISOString());
    return jsonOk({ jam_slot: jamSlot, dilewati: 'tidak ada agent dengan auto aktif' });
  }

  const { utama } = await getModeAkun(env);
  // Preset TIDAK lagi diambil sekali untuk semua agent: sejak jadwal manual
  // per agent (2026-11-05) tiap akun punya presetnya sendiri (atau null =
  // mode jendela), dan satu-satunya sumbernya kuotaAkun() di bawah.
  const jendela = await getJendela(env);
  const laporan = [];
  // Klaim slot dibagi PER AKUN TUJUAN, bukan per agent: di mode terpusat
  // beberapa agent bermuara ke akun yang sama, dan saat dry-run tidak ada baris
  // DB yang menahan mereka agar tidak memilih jendela yang sama.
  const klaimPerAkun = new Map();

  let terpotong = false;

  for (const ag of agents) {
    const hasilAgent = { agent: ag.nama, character_id: ag.id, terisi_hari_ini: ag.terisi_hari_ini, terjadwal: 0, belum_pasti: 0, gagal: 0, detail: [] };

    // Dry-run tidak menyentuh provider sama sekali, jadi tidak perlu dibatasi.
    // Agent yang terlewat di sini TIDAK ditulis statusnya: auto_terakhir harus
    // tetap berarti "terakhir benar-benar diproses" (banner >26 jam bergantung
    // padanya). Ia otomatis di depan pada putaran berikutnya karena terisinya
    // tidak bertambah.
    if (!dry && anggaranHabis()) {
      terpotong = true;
      hasilAgent.alasan = 'anggaran waktu habis — agent ini belum diproses';
      hasilAgent.belum_tersentuh = true;
      laporan.push(hasilAgent);
      continue;
    }
    if (!dry && ag.auto_aktif !== 1) { hasilAgent.alasan = 'auto agent ini dimatikan'; laporan.push(hasilAgent); continue; }

    // ⚠️ try/catch PER AGENT (2026-11-17). Penjaga slot & kuota kini MELEMPAR
    // saat D1 error (gagal-tertutup) — dulu mereka diam-diam menganggap "kosong"
    // dan menjadwalkan di atas post yang sudah ada. Agent yang kena error
    // dilewati, dicatat, dan dicoba lagi di tick berikutnya; agent lain tetap
    // diproses.
    try {
      const akun = await resolveScheduler(env, ag.id);
      if (!akun.bufferKey && !akun.zernioKey) { hasilAgent.alasan = 'belum ada kredensial scheduler'; laporan.push(hasilAgent); continue; }
      if (Object.keys(akun.channels).length === 0) { hasilAgent.alasan = 'belum ada channel sosmed'; laporan.push(hasilAgent); continue; }

      const { targetId } = await resolveAkunTarget(env, ag.id);
      const { kuota, hari, preset, mode } = await kuotaAkun(env, targetId, utama);
      const terpakai = await slotTerpakaiHariIni(env, targetId);
      const dicoba = await videoBaruDicobaHariIni(env, targetId);
      if (!klaimPerAkun.has(targetId)) klaimPerAkun.set(targetId, await slotDipakai(env, targetId));
      const dipakai = klaimPerAkun.get(targetId);
      hasilAgent.kuota = kuota;
      hasilAgent.hari_nyata = hari;
      hasilAgent.mode_jadwal = mode;
      hasilAgent.sudah_terjadwal = terpakai;
      hasilAgent.dicoba_hari_ini = dicoba;

      // Kekurangan, BUKAN kuota penuh — inilah yang membuat cron idempoten:
      // dijalankan berkali-kali, atau bercampur dengan klik manual, tidak pernah
      // melebihi kuota harian. Dibatasi JUGA oleh video baru yang sudah dicoba
      // hari ini (lihat videoBaruDicobaHariIni) — tanpa itu agent yang semua
      // platformnya gagal menghabiskan stoknya dalam ±24 putaran semalam.
      const butuh = hitungButuh({ kuota, terpakai, dicoba });
      if (butuh === 0) {
        hasilAgent.alasan = terpakai >= kuota
          ? 'kuota hari ini sudah penuh'
          : `batas percobaan video baru hari ini tercapai (${dicoba} dicoba, ${terpakai} terjadwal) — cek kegagalan platform`;
      }

      // ⚠️ "kuota penuh" dan "stok habis" TIDAK lagi `continue` — keduanya justru
      // kondisi paling wajar untuk menjalankan ulangi-platform-gagal di bawah.
      // Dulu keduanya melompati sisa badan loop, jadi jalur pemulihan tidak akan
      // pernah jalan untuk agent yang stoknya habis.
      let videos = [];
      if (butuh > 0) {
        // Urutan kirim manual (drag & drop admin), bukan lagi FIFO created_at —
        // hashtags WAJIB diikutkan, tanpa ini hashtag tersimpan di DB tapi tidak
        // pernah ikut terkirim ke Buffer/Zernio (dilaporkan user 2026-08-15, sama
        // seperti jalur manual).
        //
        // ⚠️ Antrean = HANYA video yang belum pernah dikirim sama sekali
        // (sqlBelumPernahDikirim). trashed_at saja TIDAK cukup: video yang
        // dipulihkan dari Sampah sesudah tayang, dan video yang gagal total, dulu
        // dikirim ulang ke semua platform — video 1191 tayang dua kali (21 & 27
        // Okt 2026). Video berriwayat hanya lewat jalur Ulangi di bawah.
        const antre = await env.DB.prepare(
          `SELECT id, cloudinary_url, caption, hashtags FROM viralframe_agent_videos
           WHERE character_id = ? AND trashed_at IS NULL AND cloudinary_url IS NOT NULL
             AND ${sqlBelumPernahDikirim('viralframe_agent_videos.id')}
           ORDER BY urutan_kirim ASC, id ASC LIMIT ?`
        ).bind(ag.id, butuh).all(); // tanpa .catch: D1 error dulu terbaca "stok video habis"
        videos = antre?.results ?? [];
        if (videos.length === 0) hasilAgent.alasan = 'stok video habis';
        else if (videos.length < butuh) hasilAgent.alasan = `stok kurang (${videos.length} dari ${butuh})`;
      }

      for (let i = 0; i < videos.length; i++) {
        if (!dry && anggaranHabis()) {
          terpotong = true;
          hasilAgent.detail.push({ video_id: videos[i].id, alasan: 'anggaran waktu habis' });
          // Dulu alasan dibiarkan null di sini — status "0 terjadwal" tanpa
          // keterangan (Andi, 16 Nov). Sisanya diambil putaran berikutnya.
          hasilAgent.alasan ??= `anggaran waktu habis — ${videos.length - i} video dilanjutkan putaran berikutnya`;
          break;
        }
        // ⚠️ try/catch WAJIB per video. Sebelumnya satu exception (mis. D1 menolak
        // INSERT) naik sampai ke sini dan mematikan SELURUH putaran — agent yang
        // antre di belakang tidak pernah diproses, tanpa jejak (audit 2026-08-29).
        try {
          const r = await jadwalkanVideo(env, {
            video: videos[i], akun, targetId, kuota, jendela, preset, dipakai, dryRun: dry,
          });
          if (!r.ok) { hasilAgent.gagal++; hasilAgent.detail.push({ video_id: videos[i].id, alasan: r.alasan }); continue; }
          if (dry) { hasilAgent.detail.push({ video_id: videos[i].id, jendela: r.jendela, waktu: r.waktu }); hasilAgent.terjadwal++; continue; }
          const gagalPlatform = (r.rows ?? []).filter(x => !x.result.ok);
          // Belum pasti ≠ gagal: post-nya mungkin sudah ada. Dulu terhitung
          // `gagal` dan memicu banner "Gagal menjadwalkan" untuk video yang
          // ternyata sudah tayang (laporan user 2026-11-17).
          if (r.adaSukses) hasilAgent.terjadwal++;
          else if (r.belumPasti) hasilAgent.belum_pasti++;
          else hasilAgent.gagal++;
          hasilAgent.detail.push({
            video_id: videos[i].id, jendela: r.jendela,
            gagal_platform: gagalPlatform.map(x => `${x.platform}: ${x.result.error}${x.result.ambigu ? ' (belum pasti)' : ''}`),
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
            akun, targetId, kuota, jendela, preset, dipakai, dryRun: dry, anggaranHabis,
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
    } catch (err) {
      hasilAgent.alasan = `error database — agent dilewati putaran ini: ${err.message}`;
      // Dicoba lagi putaran berikutnya (semua agent ikut tiap putaran). Aman:
      // kuota harian membuat putaran idempoten.
      console.error('[auto-schedule] agent', ag.id, err.message);
      await logServerError(env, {
        source: 'server',
        message: `[scheduler] agent ${ag.nama} dilewati karena error database: ${err.message}`,
        stack: err.stack,
        url: '/api/internal/viralframe/auto-schedule',
        context: { character_id: ag.id },
      });
      if (!dry) await setStatusAgent(env, ag.id, hasilAgent);
      laporan.push(hasilAgent);
    }
  }

  if (!dry) await setSetting(env, 'viralframe_auto_terakhir', new Date().toISOString());

  // Terpotong = putaran ini TIDAK menyelesaikan rencananya. Di putaran awal itu
  // normal (sisanya diambil 10 menit kemudian) — dulu tiap putaran dicatat
  // sebagai error, ±8×/malam, sehingga sinyal kelaparan Andi tenggelam di
  // antara log yang selalu ada. Kini hanya putaran di JAM TERAKHIR jendela yang
  // dicatat: di sana terpotong berarti kapasitas semalam benar-benar kurang.
  if (terpotong) {
    const belumTersentuh = laporan.filter(x => x.belum_tersentuh).map(x => x.agent);
    const jamWib = Number(jamSlot.slice(0, 2));
    if (!dry && !manual && jamWib === JAM_WIB_TERAKHIR) {
      await logServerError(env, {
        source: 'server',
        message: `[scheduler] putaran jam terakhir masih terpotong (anggaran ${ANGGARAN_MS} ms) — kapasitas malam kurang${belumTersentuh.length ? `; belum tersentuh: ${belumTersentuh.join(', ')}` : ''}`,
        url: '/api/internal/viralframe/auto-schedule',
        context: {
          jam_slot: jamSlot, durasi_ms: Date.now() - mulai, jumlah_agent: agents.length,
          belum_tersentuh: belumTersentuh,
          terisi: laporan.map(x => ({ agent: x.agent, terisi: x.terisi_hari_ini, kuota: x.kuota ?? null })),
        },
      });
    } else {
      console.log('[auto-schedule] terpotong, dilanjutkan putaran berikutnya', jamSlot, belumTersentuh.join(','));
    }
  }

  return jsonOk({ jam_slot: jamSlot, dry, tanggal: tanggalWib(), durasi_ms: Date.now() - mulai, terpotong, laporan });
}

async function setStatusAgent(env, characterId, hasil) {
  const ringkas = JSON.stringify({
    terjadwal: hasil.terjadwal, belum_pasti: hasil.belum_pasti ?? 0, gagal: hasil.gagal, alasan: hasil.alasan ?? null,
    kuota: hasil.kuota ?? null, hari_nyata: hasil.hari_nyata ?? null,
  });
  await env.DB.prepare(
    `UPDATE viralframe_agent_accounts SET auto_terakhir = ?, auto_hasil = ? WHERE character_id = ?`
  ).bind(new Date().toISOString(), ringkas, characterId).run().catch(err => {
    console.error('[auto-schedule] simpan status', err.message);
  });
}

export async function onRequestOptions() { return handleOptions(); }
