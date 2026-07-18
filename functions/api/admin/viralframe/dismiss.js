// POST /api/admin/viralframe/dismiss — body: { property_id }
// "Reset" tombol di card Viral Frame — sembunyikan overlay "sudah diproses" secara
// KOSMETIK saja. TIDAK menghapus naskah/video (viralframe_generations/videos tetap
// utuh untuk Content Library). Kalau properti diproses ulang setelah ini, overlay
// otomatis muncul lagi (lihat perbandingan timestamp di /viralframe/status).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id tidak valid', 400);

  try {
    const result = await env.DB.prepare(
      `UPDATE properties SET viralframe_dismissed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(propertyId).run();
    if ((result.meta?.changes ?? 0) === 0) return jsonError('Properti tidak ditemukan', 404);
    return jsonOk({ success: true });
  } catch (err) {
    console.error('[vf dismiss]', err.message);
    return jsonError('Gagal reset status proses', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
