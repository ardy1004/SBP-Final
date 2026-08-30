// POST /api/admin/viralframe/schedule/commit-agent — { video_id, caption? }
// Jalur MANUAL: tombol "Jadwalkan ke Sosmed". Memakai orkestrator yang sama
// dengan cron otomatis (functions/_lib/jadwalOtomatis.js) supaya keduanya
// mustahil berbeda perilaku.
//
// Dengan `platforms: string[]` → MODE ULANGI: kirim ulang video yang sudah
// pernah dijadwalkan, hanya ke platform yang gagal. Dipakai tombol "Ulangi
// platform gagal" di Konten Agent, terutama untuk kegagalan TIMEOUT yang
// sengaja tidak pernah diulang otomatis (lihat bolehDiulang di jadwalOtomatis).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { resolveScheduler, resolveAkunTarget, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { jadwalkanVideo, ulangiPlatformVideo, kuotaAkun, slotTerpakaiHariIni, getJendela, slotDipakai, getPresetUtama } from '../../../../_lib/jadwalOtomatis.js';
import { adaJadwalTertunda } from '../../../../_lib/schedulerProviders.js';

const PLATFORM_SAH = ['facebook', 'instagram', 'threads', 'tiktok', 'youtube'];

export async function onRequestPost(context) {
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
  if (!video.cloudinary_url) return jsonError('Video belum punya URL Cloudinary', 422);

  // ⚠️ Kedua penjaga di bawah HANYA untuk penjadwalan baru, dan sengaja
  // dilewati di mode ULANGI — video yang diulang memang SUDAH di Sampah dan
  // memang SUDAH punya baris tertunda (platform yang berhasil). Penjaga
  // anti-dobelnya tidak hilang, cuma pindah ke tempat yang lebih tepat:
  // ulangiPlatformVideo() menolak platform yang sudah punya baris 'scheduled'.
  if (!mintaUlang) {
    if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);
    // Video yang berhasil dijadwalkan otomatis masuk Sampah (persistScheduleResult),
    // tapi kalau di-restore lalu diklik lagi, cek trashed_at di atas tidak lagi
    // menangkapnya — tanpa ini video bisa terkirim DUA KALI ke Buffer/Zernio
    // (audit 2026-08-15).
    if (await adaJadwalTertunda(env, videoId)) {
      return jsonError('Video ini masih ditunggu tayang dari jadwal sebelumnya — menjadwalkan lagi akan membuatnya posting dua kali.', 409);
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
  const [{ kuota }, terpakai, jendela, dipakai, preset] = await Promise.all([
    kuotaAkun(env, targetId, utama),
    slotTerpakaiHariIni(env, targetId),
    getJendela(env),
    slotDipakai(env, targetId),
    getPresetUtama(env),
  ]);
  // Mode ULANGI tidak menagih kuota harian: ia memulihkan kiriman yang slotnya
  // SUDAH terpakai, bukan menambah konten baru. Menagihnya berarti pemulihan
  // justru mustahil di hari yang kuotanya sudah penuh — padahal hari seperti
  // itulah yang paling mungkin menyisakan kegagalan.
  if (mintaUlang) {
    const hasil = await ulangiPlatformVideo(env, {
      video: { ...video, caption }, akun, targetId, akunUtamaId: utama, kuota, jendela, preset, platforms,
    });
    if (!hasil.ok) return jsonError(`Gagal mengulang: ${hasil.alasan}`, 422);
    return jsonOk({
      mode: 'ulangi',
      jendela: hasil.jendela,
      tanggal: hasil.tanggal,
      waktu: hasil.waktu,
      dilewati: hasil.dilewati,
      results: hasil.rows.map(r => ({ platform: r.platform, status: r.result.ok ? 'scheduled' : 'failed', error: r.result.ok ? null : r.result.error })),
    });
  }

  if (terpakai >= kuota) {
    return jsonError(`Kuota harian ${namaAkun} sudah penuh (${terpakai}/${kuota}). Coba lagi besok.`, 409);
  }

  // Slot ditentukan oleh jendela mana yang MASIH KOSONG (dipakai), bukan oleh
  // posisi ke-`terpakai` — lihat catatan di slotTersedia(). akunUtamaId+preset
  // dipakai jadwalkanVideo untuk memilih mode preset (khusus akun utama) vs
  // mode jendela (agent lain).
  const hasil = await jadwalkanVideo(env, {
    video: { ...video, caption }, akun, targetId, akunUtamaId: utama, kuota, jendela, preset, dipakai,
  });
  if (!hasil.ok) return jsonError(`Gagal menjadwalkan: ${hasil.alasan}`, 422);

  return jsonOk({
    jendela: hasil.jendela,
    tanggal: hasil.tanggal,
    waktu: hasil.waktu,
    results: hasil.rows.map(r => ({ platform: r.platform, status: r.result.ok ? 'scheduled' : 'failed', error: r.result.ok ? null : r.result.error })),
    trashed: hasil.adaSukses,
  });
}

export async function onRequestOptions() { return handleOptions(); }
