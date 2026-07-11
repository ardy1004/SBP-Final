// GET /api/admin/viralframe/analytics — agregasi performa per gaya kamera.
// Loop A/B: setelah metrik (views/likes) diisi di Library, tampilkan gaya "pemenang".
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare(`
      SELECT COALESCE(gaya, '(tanpa gaya)') AS gaya,
             COUNT(*) AS jumlah,
             AVG(COALESCE(views, 0)) AS avg_views,
             AVG(COALESCE(likes, 0)) AS avg_likes,
             SUM(COALESCE(views, 0)) AS total_views
      FROM viralframe_videos
      WHERE views IS NOT NULL AND views > 0
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
