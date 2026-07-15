// POST /api/admin/viralframe/generations — simpan riwayat generate Master Prompt
//   Body JSON: { property_id, params_json (string|object), master_prompt, result_json? }
// GET  /api/admin/viralframe/generations?property_id= — list riwayat (opsional filter)
// DELETE /api/admin/viralframe/generations?property_id= — hapus semua riwayat properti itu
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../../_shared/response.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pid = parseInt(url.searchParams.get('property_id') ?? '', 10);

  try {
    const stmt = Number.isInteger(pid) && pid > 0
      ? env.DB.prepare(`SELECT id, property_id, params_json, master_prompt, result_json, created_at
                        FROM viralframe_generations WHERE property_id = ?
                        ORDER BY created_at DESC, id DESC`).bind(pid)
      : env.DB.prepare(`SELECT id, property_id, params_json, master_prompt, result_json, created_at
                        FROM viralframe_generations ORDER BY created_at DESC, id DESC LIMIT 100`);
    const res = await stmt.all();
    return jsonOk({ items: res.results ?? [], total: (res.results ?? []).length });
  } catch (err) {
    console.error('[viralframe generations GET]', err.message);
    return jsonError('Gagal mengambil riwayat', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    return jsonError('property_id tidak valid', 422);
  }

  // params_json bisa dikirim sebagai string atau object — normalisasi ke string
  let paramsJson;
  if (typeof body.params_json === 'string') {
    paramsJson = body.params_json;
  } else if (body.params_json != null && typeof body.params_json === 'object') {
    try { paramsJson = JSON.stringify(body.params_json); }
    catch { return jsonError('params_json tidak bisa di-serialize', 422); }
  } else {
    return jsonError('params_json wajib diisi', 422);
  }

  const masterPrompt = typeof body.master_prompt === 'string' ? body.master_prompt : null;
  const resultJson = typeof body.result_json === 'string' ? body.result_json : null;

  try {
    // Pastikan properti ada (FK integrity + pesan jelas)
    const exists = await env.DB.prepare('SELECT id FROM properties WHERE id = ?').bind(propertyId).first();
    if (!exists) return jsonError('Properti tidak ditemukan', 404);

    const res = await env.DB.prepare(`
      INSERT INTO viralframe_generations (property_id, params_json, master_prompt, result_json)
      VALUES (?, ?, ?, ?)
    `).bind(propertyId, paramsJson, masterPrompt, resultJson).run();

    return jsonCreated({ id: res.meta?.last_row_id, pesan: 'Riwayat generate tersimpan' });
  } catch (err) {
    console.error('[viralframe generations POST]', err.message);
    return jsonError('Gagal menyimpan riwayat', 500, err.message);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pid = parseInt(url.searchParams.get('property_id') ?? '', 10);
  // property_id wajib — mencegah hapus seluruh tabel tanpa sengaja
  if (!Number.isInteger(pid) || pid <= 0) return jsonError('property_id wajib diisi', 422);

  try {
    const res = await env.DB
      .prepare('DELETE FROM viralframe_generations WHERE property_id = ?')
      .bind(pid)
      .run();
    return jsonOk({ deleted: res.meta?.changes ?? 0, pesan: 'Riwayat properti dihapus' });
  } catch (err) {
    console.error('[viralframe generations DELETE all]', err.message);
    return jsonError('Gagal menghapus riwayat', 500, err.message);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
