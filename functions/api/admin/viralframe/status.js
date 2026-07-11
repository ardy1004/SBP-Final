// GET /api/admin/viralframe/status — properti mana yang sudah punya naskah/video.
// Untuk badge & KPI di list page ViralFrame. Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestGet({ env }) {
  try {
    const [gen, vid] = await Promise.all([
      env.DB.prepare('SELECT DISTINCT property_id FROM viralframe_generations').all(),
      env.DB.prepare('SELECT DISTINCT property_id FROM viralframe_videos').all().catch(() => ({ results: [] })),
    ]);
    return jsonOk({
      with_script: (gen.results ?? []).map(r => r.property_id),
      with_video:  (vid.results ?? []).map(r => r.property_id),
    });
  } catch (err) {
    console.error('[vf status]', err.message);
    return jsonError('Gagal mengambil status konten', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
