// PATCH /api/admin/viralframe/generations/:id — update result_json (JSON scene tervalidasi)
//   Body JSON: { result_json (string|object) }
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  // result_json bisa string atau object — normalisasi ke string.
  let resultJson;
  if (typeof body.result_json === 'string') {
    resultJson = body.result_json;
  } else if (body.result_json != null && typeof body.result_json === 'object') {
    try { resultJson = JSON.stringify(body.result_json); }
    catch { return jsonError('result_json tidak bisa di-serialize', 422); }
  } else {
    return jsonError('result_json wajib diisi', 422);
  }

  try {
    const existing = await env.DB
      .prepare('SELECT id FROM viralframe_generations WHERE id = ?')
      .bind(id)
      .first();
    if (!existing) return jsonError('Riwayat tidak ditemukan', 404);

    await env.DB
      .prepare('UPDATE viralframe_generations SET result_json = ? WHERE id = ?')
      .bind(resultJson, id)
      .run();

    return jsonOk({ id, pesan: 'Hasil JSON tersimpan ke riwayat' });
  } catch (err) {
    console.error('[viralframe generations PATCH]', err.message);
    return jsonError('Gagal menyimpan hasil JSON', 500, err.message);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
