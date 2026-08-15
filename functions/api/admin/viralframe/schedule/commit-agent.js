// POST /api/admin/viralframe/schedule/commit-agent — { video_id, caption? }
// Jalur MANUAL: tombol "Jadwalkan ke Sosmed". Memakai orkestrator yang sama
// dengan cron otomatis (functions/_lib/jadwalOtomatis.js) supaya keduanya
// mustahil berbeda perilaku.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { resolveScheduler, resolveAkunTarget, getModeAkun } from '../../../../_lib/agentAccounts.js';
import { jadwalkanVideo, kuotaAkun, slotTerpakaiHariIni, getJendela, slotDipakai, getPresetUtama } from '../../../../_lib/jadwalOtomatis.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const videoId = parseInt(body.video_id, 10);
  if (!Number.isInteger(videoId) || videoId <= 0) return jsonError('video_id wajib', 422);
  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 2000) : '';

  const video = await env.DB.prepare(
    `SELECT v.id, v.cloudinary_url, v.trashed_at, v.character_id, c.nama AS character_nama
     FROM viralframe_agent_videos v JOIN viralframe_characters c ON c.id = v.character_id
     WHERE v.id = ?`
  ).bind(videoId).first().catch(() => null);
  if (!video) return jsonError('Video tidak ditemukan', 404);
  if (video.trashed_at) return jsonError('Video sudah ada di Sampah', 409);
  if (!video.cloudinary_url) return jsonError('Video belum punya URL Cloudinary', 422);

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
