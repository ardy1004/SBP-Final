// GET /api/admin/viralframe/status — listing mana yang sudah punya video, dan
// berapa pesanan yang sedang berjalan untuknya.
//
// ─── Ditulis ulang 2026-09-04 (ViralFrame dibangun ulang) ────────────────────
// Versi lama melaporkan dua hal: "punya naskah" (dari `viralframe_generations`)
// dan "punya video" (dari `viralframe_agent_videos`). Bagian NASKAH dibuang:
// mesin prompt lama sudah dihapus, jadi tabel itu tidak punya penulis lagi —
// menampilkan 316 baris warisannya sebagai status hidup hanya menyesatkan.
//
// Penggantinya bukan tebakan melainkan sesuatu yang benar-benar berjalan:
// PESANAN PRODUKSI (`viralframe_orders`, migrasi 0046).
//
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

// Sama dengan daftar di orders/index.js — status yang berarti "masih dikerjakan".
const STATUS_TERBUKA = ['baru', 'material', 'variasi', 'konsep', 'storyboard', 'menunggu_render'];

export async function onRequestGet({ env }) {
  try {
    // ⚠️ Video di Sampah SENGAJA ikut dihitung: `trashed_at` berarti "sudah
    // selesai dijadwalkan" (migrasi 0023), jadi listing-nya memang sudah punya
    // video. Memfilternya keluar mengulang bug lama yang membuat badge video
    // tidak pernah muncul.
    const [vid, ord] = await Promise.all([
      env.DB.prepare(
        'SELECT property_id, COUNT(*) AS n FROM viralframe_agent_videos GROUP BY property_id'
      ).all(),
      env.DB.prepare(
        `SELECT property_id, COUNT(*) AS n FROM viralframe_orders
          WHERE status IN (${STATUS_TERBUKA.map(() => '?').join(',')})
          GROUP BY property_id`
      ).bind(...STATUS_TERBUKA).all(),
    ]);

    const withVideo = {};
    for (const r of vid.results ?? []) {
      if (r.property_id != null) withVideo[r.property_id] = r.n;
    }
    const antre = {};
    for (const r of ord.results ?? []) {
      if (r.property_id != null) antre[r.property_id] = r.n;
    }

    return jsonOk({
      with_video: Object.keys(withVideo).map(Number),
      jumlah_video: withVideo,
      antre,
    });
  } catch (err) {
    console.error('[vf status]', err.message);
    return jsonError('Gagal mengambil status konten', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
