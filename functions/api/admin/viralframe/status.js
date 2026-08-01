// GET /api/admin/viralframe/status — properti mana yang sudah punya naskah/video.
// Untuk badge & KPI di list page ViralFrame. Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestGet({ env }) {
  try {
    // ⚠️ SUMBER VIDEO = `viralframe_agent_videos`, BUKAN `viralframe_videos`.
    // Sampai 2026-08-02 baris ini membaca `viralframe_videos` — tabel Content
    // Library yang berisi 0 baris sejak fitur Video VO dihapus (commit 1e3c17a).
    // Akibatnya `with_video` SELALU kosong, badge "🎬 Video" tidak pernah bisa
    // muncul, dan 21 properti yang video-nya sudah jadi tampil sebagai "📝 Naskah".
    // Tidak ada error apa pun — cuma cabang yang tak pernah tercapai.
    //
    // Video di Sampah SENGAJA ikut dihitung: `trashed_at` berarti "sudah selesai
    // dijadwalkan" (lihat migrasi 0023), jadi propertinya memang sudah punya video.
    // Memfilternya keluar akan mengulang bug yang sedang diperbaiki ini.
    const [gen, vid] = await Promise.all([
      env.DB.prepare('SELECT property_id, MAX(created_at) AS latest FROM viralframe_generations GROUP BY property_id').all(),
      env.DB.prepare('SELECT property_id, MAX(created_at) AS latest FROM viralframe_agent_videos GROUP BY property_id').all().catch(() => ({ results: [] })),
    ]);

    // latest_content_at: timestamp konten TERBARU (naskah ATAU video) per properti —
    // dipakai frontend membandingkan dengan viralframe_dismissed_at. Kalau properti
    // diproses ulang SETELAH admin klik Reset, overlay otomatis muncul lagi tanpa
    // perlu tiap endpoint AI (naskah manual/AI-generate/YouTube Long/video-VO) saling
    // tahu untuk me-reset dismissed_at secara eksplisit.
    const latestContentAt = {};
    for (const r of gen.results ?? []) {
      if (r.latest && (!latestContentAt[r.property_id] || r.latest > latestContentAt[r.property_id])) {
        latestContentAt[r.property_id] = r.latest;
      }
    }
    for (const r of vid.results ?? []) {
      if (r.latest && (!latestContentAt[r.property_id] || r.latest > latestContentAt[r.property_id])) {
        latestContentAt[r.property_id] = r.latest;
      }
    }

    return jsonOk({
      with_script: (gen.results ?? []).map(r => r.property_id),
      with_video:  (vid.results ?? []).map(r => r.property_id),
      latest_content_at: latestContentAt,
    });
  } catch (err) {
    console.error('[vf status]', err.message);
    return jsonError('Gagal mengambil status konten', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
