// POST /api/admin/viralframe/schedule/commit-agent — { video_id, caption? }
// Jalur MANUAL: tombol "Jadwalkan ke Sosmed". Memakai orkestrator yang sama
// dengan cron otomatis (functions/_lib/jadwalOtomatis.js) supaya keduanya
// mustahil berbeda perilaku.
//
// Dengan `platforms: string[]` → MODE ULANGI: kirim ulang video yang sudah
// pernah dijadwalkan, hanya ke platform yang gagal. Dipakai tombol "Ulangi
// platform gagal" di Konten Agent, terutama untuk kegagalan TIMEOUT yang
// sengaja tidak pernah diulang otomatis (lihat bolehDiulang di jadwalOtomatis).
//
// Dengan `konfirmasi: { platforms, hasil: 'tayang'|'tidak_ada' }` → MODE
// KONFIRMASI (2026-11-17): admin sudah memeriksa medsos / Buffer / Zernio dan
// mencatat kenyataannya. Lahir dari laporan user: video bertanda "gagal"
// ternyata sudah tayang (timeout — provider membuat post-nya, kita sudah
// memutus koneksi). Tidak memanggil provider sama sekali.
//   tayang    → baris TERBARU per platform ('failed'/'unconfirmed') jadi
//               'scheduled'; video Aktif pindah ke Sampah.
//   tidak_ada → baris 'unconfirmed' jadi 'failed' berawalan "Tidak ada di …",
//               yang membuka tombol Ulangi dan retry otomatis.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { resolveScheduler, resolveAkunTarget, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { jadwalkanVideo, ulangiPlatformVideo, kuotaAkun, slotTerpakaiHariIni, getJendela, slotDipakai, sqlBelumPernahDikirim } from '../../../../_lib/jadwalOtomatis.js';
import { statusBaris } from '../../../../_lib/schedulerProviders.js';

const PLATFORM_SAH = ['facebook', 'instagram', 'threads', 'tiktok', 'youtube'];
const NAMA_PROVIDER = { buffer: 'Buffer', zernio: 'Zernio' };

const ringkasHasil = (rows) => rows.map(r => ({
  platform: r.platform,
  status: statusBaris(r.result),
  error: r.result.ok ? null : r.result.error,
}));

async function konfirmasi(env, videoId, k) {
  const hasil = k?.hasil;
  if (hasil !== 'tayang' && hasil !== 'tidak_ada') return jsonError("konfirmasi.hasil harus 'tayang' atau 'tidak_ada'", 422);
  const platforms = Array.isArray(k.platforms)
    ? [...new Set(k.platforms.filter(p => typeof p === 'string' && PLATFORM_SAH.includes(p)))]
    : [];
  if (platforms.length === 0) return jsonError(`konfirmasi.platforms hanya boleh berisi: ${PLATFORM_SAH.join(', ')}`, 422);

  const ph = platforms.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT id, platform, provider, status FROM viralframe_scheduled_posts
      WHERE video_id = ? AND video_type = 'agent' AND platform IN (${ph})
      ORDER BY id DESC`
  ).bind(videoId, ...platforms).all();
  const baris = res.results ?? [];

  const cap = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const stmts = [];
  const diubah = [];
  const dilewati = [];
  for (const p of platforms) {
    const milik = baris.filter(b => b.platform === p);
    if (milik.some(b => b.status === 'scheduled')) { dilewati.push({ platform: p, alasan: 'sudah tercatat terjadwal' }); continue; }

    if (hasil === 'tayang') {
      const terbaru = milik.find(b => b.status === 'failed' || b.status === 'unconfirmed');
      if (!terbaru) { dilewati.push({ platform: p, alasan: 'tidak ada catatan gagal/belum pasti' }); continue; }
      stmts.push(env.DB.prepare(
        `UPDATE viralframe_scheduled_posts
            SET status = 'scheduled', error_message = substr(? || COALESCE(error_message, ''), 1, 500)
          WHERE id = ? AND status IN ('failed','unconfirmed')`
      ).bind(`Dikonfirmasi tayang oleh admin (${cap}); asal: `, terbaru.id));
    } else {
      const ragu = milik.filter(b => b.status === 'unconfirmed');
      if (ragu.length === 0) { dilewati.push({ platform: p, alasan: 'tidak berstatus belum pasti' }); continue; }
      // Awalan "Tidak ada di <Provider>" WAJIB persis — itu yang dibaca
      // bolehDiulang() untuk mengizinkan retry.
      for (const b of ragu) {
        stmts.push(env.DB.prepare(
          `UPDATE viralframe_scheduled_posts
              SET status = 'failed', error_message = substr(? || COALESCE(error_message, ''), 1, 500)
            WHERE id = ? AND status = 'unconfirmed'`
        ).bind(`Tidak ada di ${NAMA_PROVIDER[b.provider] ?? b.provider} (dicek admin ${cap}); asal: `, b.id));
      }
    }
    diubah.push(p);
  }

  // Tayang = video sudah dipakai → keluar dari antrean, sama seperti hasil
  // penjadwalan sukses. Syarat trashed_at IS NULL menjaga jam purge video yang
  // sudah di Sampah.
  if (hasil === 'tayang' && diubah.length > 0) {
    stmts.push(env.DB.prepare(
      `UPDATE viralframe_agent_videos SET trashed_at = datetime('now') WHERE id = ? AND trashed_at IS NULL`
    ).bind(videoId));
  }
  if (stmts.length > 0) await env.DB.batch(stmts);
  return jsonOk({ mode: 'konfirmasi', hasil, diubah, dilewati });
}

// Penjaga slot, kuota & riwayat MELEMPAR saat D1 error (gagal-tertutup,
// 2026-11-17). Semuanya dibaca SEBELUM fan-out ke provider, dan semua langkah
// sesudah fan-out (persistScheduleResult, logServerError) menangkap error-nya
// sendiri — jadi error yang sampai ke sini berarti belum ada yang terkirim.
export async function onRequestPost(context) {
  try {
    return await prosesPost(context);
  } catch (err) {
    console.error('[vf commit-agent]', err.message);
    return jsonError(`Database sedang bermasalah — belum ada yang dikirim ke Buffer/Zernio. Coba lagi sebentar lagi. (${err.message})`, 503);
  }
}

async function prosesPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const videoId = parseInt(body.video_id, 10);
  if (!Number.isInteger(videoId) || videoId <= 0) return jsonError('video_id wajib', 422);
  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 2000) : '';

  // Mode ULANGI bila `platforms` dikirim. Divalidasi ketat: nilai asing tidak
  // boleh menembus ke pembangun channel di bawah.
  const mintaUlang = Array.isArray(body.platforms) && body.platforms.length > 0;
  const platforms = mintaUlang
    ? body.platforms.filter(p => typeof p === 'string' && PLATFORM_SAH.includes(p))
    : [];
  if (mintaUlang && platforms.length === 0) {
    return jsonError(`platforms hanya boleh berisi: ${PLATFORM_SAH.join(', ')}`, 422);
  }

  // v.hashtags WAJIB diikutkan — tanpa ini hashtag tersimpan di DB tapi tidak
  // pernah ikut terkirim ke Buffer/Zernio (dilaporkan user 2026-08-15).
  const video = await env.DB.prepare(
    `SELECT v.id, v.cloudinary_url, v.trashed_at, v.character_id, v.hashtags, c.nama AS character_nama
     FROM viralframe_agent_videos v JOIN viralframe_characters c ON c.id = v.character_id
     WHERE v.id = ?`
  ).bind(videoId).first().catch(() => null);
  if (!video) return jsonError('Video tidak ditemukan', 404);

  // Konfirmasi tidak memanggil provider — tidak butuh URL, kredensial, kuota.
  if (body.konfirmasi != null) {
    try {
      return await konfirmasi(env, videoId, body.konfirmasi);
    } catch (err) {
      console.error('[vf commit-agent] konfirmasi', err.message);
      return jsonError('Gagal menyimpan konfirmasi', 500);
    }
  }

  if (!video.cloudinary_url) return jsonError('Video belum punya URL Cloudinary', 422);

  // ⚠️ Kedua penjaga di bawah HANYA untuk penjadwalan baru, dan sengaja
  // dilewati di mode ULANGI — video yang diulang memang SUDAH di Sampah dan
  // memang SUDAH punya baris tertunda (platform yang berhasil). Penjaga
  // anti-dobelnya tidak hilang, cuma pindah ke tempat yang lebih tepat:
  // ulangiPlatformVideo() menolak platform yang sudah punya baris 'scheduled'.
  if (!mintaUlang) {
    if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);
    // Jadwalkan = HANYA untuk video yang belum pernah dikirim sama sekali —
    // syarat yang sama dengan antrean cron. Dulu cuma adaJadwalTertunda()
    // (jadwal yang MASIH di depan), jadi video yang sudah tayang lalu
    // dipulihkan tetap bisa dikirim lagi. Video berriwayat dikirim lewat
    // Ulangi (platform gagal) atau dicatat lewat konfirmasi.
    const riwayat = await env.DB.prepare(
      `SELECT 1 AS ada FROM viralframe_agent_videos WHERE id = ? AND NOT ${sqlBelumPernahDikirim('viralframe_agent_videos.id')}`
    ).bind(videoId).first();
    if (riwayat) {
      return jsonError('Video ini sudah pernah dikirim ke scheduler — mengirimnya lagi bisa membuatnya tayang dua kali. Pakai "Ulangi platform gagal" atau konfirmasi status "Belum pasti".', 409);
    }
  }

  const akun = await resolveScheduler(env, video.character_id);
  const { targetId } = await resolveAkunTarget(env, video.character_id);
  // Saat mode Terpusat, akun yang dipakai bisa MILIK AGENT LAIN — sebut itu di
  // pesan error, kalau tidak admin mencari kesalahan di agent yang salah.
  const namaAkun = targetId === video.character_id ? `Agent "${video.character_nama}"` : 'Agent utama (mode Terpusat)';

  if (!akun.bufferKey && !akun.zernioKey) {
    return jsonError(`${namaAkun} belum punya kredensial scheduler. Isi dulu di Admin → Konten Agent → Akun Agent.`, 422);
  }
  if (Object.keys(akun.channels).length === 0) {
    return jsonError(`${namaAkun} belum punya channel sosmed. Buka Konten Agent → Akun Agent → "Ambil dari API", lalu Simpan.`, 422);
  }

  // Kuota dihitung pada AKUN TUJUAN, bukan agent asal — di mode Terpusat semua
  // agent bermuara ke satu akun, dan menghitung per agent membuat akun itu
  // diam-diam melewati batas hariannya.
  const { utama } = await getModeAkun(env);
  // `preset` WAJIB dari kuotaAkun untuk akun yang sama — null = mode jendela,
  // selain itu preset agent utama atau jadwal manual agent itu.
  const [{ kuota, preset }, terpakai, jendela, dipakai] = await Promise.all([
    kuotaAkun(env, targetId, utama),
    slotTerpakaiHariIni(env, targetId),
    getJendela(env),
    slotDipakai(env, targetId),
  ]);
  // Mode ULANGI tidak menagih kuota harian: ia memulihkan kiriman yang slotnya
  // SUDAH terpakai, bukan menambah konten baru. Menagihnya berarti pemulihan
  // justru mustahil di hari yang kuotanya sudah penuh — padahal hari seperti
  // itulah yang paling mungkin menyisakan kegagalan.
  if (mintaUlang) {
    const hasil = await ulangiPlatformVideo(env, {
      video: { ...video, caption }, akun, targetId, kuota, jendela, preset, platforms,
    });
    if (!hasil.ok) return jsonError(`Gagal mengulang: ${hasil.alasan}`, 422);
    return jsonOk({
      mode: 'ulangi',
      jendela: hasil.jendela,
      tanggal: hasil.tanggal,
      waktu: hasil.waktu,
      dilewati: hasil.dilewati,
      results: ringkasHasil(hasil.rows),
    });
  }

  if (terpakai >= kuota) {
    return jsonError(`Kuota harian ${namaAkun} sudah penuh (${terpakai}/${kuota}). Coba lagi besok.`, 409);
  }

  // Slot ditentukan oleh jendela mana yang MASIH KOSONG (dipakai), bukan oleh
  // posisi ke-`terpakai` — lihat catatan di slotTersedia(). `preset` dari
  // kuotaAkun memilih mode preset (agent utama / jadwal manual) vs mode jendela.
  const hasil = await jadwalkanVideo(env, {
    video: { ...video, caption }, akun, targetId, kuota, jendela, preset, dipakai,
  });
  if (!hasil.ok) return jsonError(`Gagal menjadwalkan: ${hasil.alasan}`, 422);

  return jsonOk({
    jendela: hasil.jendela,
    tanggal: hasil.tanggal,
    waktu: hasil.waktu,
    results: ringkasHasil(hasil.rows),
    trashed: hasil.adaSukses || hasil.belumPasti,
  });
}

export async function onRequestOptions() { return handleOptions(); }
