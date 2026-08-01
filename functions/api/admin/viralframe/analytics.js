// GET /api/admin/viralframe/analytics — agregasi performa per gaya kamera.
// Loop A/B: setelah metrik (views/likes) diisi, tampilkan gaya "pemenang".
//
// ⚠️ MEMBACA DUA TABEL, dan itu disengaja. Dulu endpoint ini hanya membaca
// `viralframe_videos` (Content Library / hasil SiliconFlow ke R2) — yang di
// produksi berisi 0 baris. Alur yang benar-benar dipakai admin adalah upload
// manual ke Cloudinary → `viralframe_agent_videos`. Akibatnya analitik ini
// permanen kosong sejak dibuat, tanpa error apa pun. Jangan "rapikan" jadi satu
// tabel saja tanpa memeriksa dulu tabel mana yang benar-benar terisi.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestGet({ env }) {
  try {
    // views > 0 = sudah diisi admin. NULL/0 sengaja tidak ikut: "belum diisi"
    // bukan "0 views", dan mencampurnya akan menyeret rata-rata ke bawah.
    // Video di Sampah tetap dihitung — performanya sudah terjadi, dan
    // memindahkannya ke Sampah adalah aksi kebersihan storage, bukan koreksi data.
    const res = await env.DB.prepare(`
      SELECT COALESCE(gaya, '(tanpa gaya)') AS gaya,
             COUNT(*) AS jumlah,
             AVG(views) AS avg_views,
             AVG(COALESCE(likes, 0)) AS avg_likes,
             SUM(views) AS total_views
      FROM (
        SELECT gaya, views, likes FROM viralframe_agent_videos WHERE views IS NOT NULL AND views > 0
        UNION ALL
        SELECT gaya, views, likes FROM viralframe_videos       WHERE views IS NOT NULL AND views > 0
      )
      GROUP BY gaya
      ORDER BY avg_views DESC
    `).all();
    const rows = (res.results ?? []).map(r => ({
      gaya: r.gaya,
      jumlah: r.jumlah,
      avg_views: Math.round(r.avg_views || 0),
      avg_likes: Math.round(r.avg_likes || 0),
      total_views: r.total_views || 0,
    }));
    return jsonOk({ items: rows });
  } catch (err) {
    console.error('[vf analytics]', err.message);
    return jsonError('Gagal mengambil analitik', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
