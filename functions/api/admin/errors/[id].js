// PATCH  /api/admin/errors/:id — tandai resolved (body: { resolved: boolean })
// DELETE /api/admin/errors/:id — hapus satu log
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }
  if (typeof body.resolved !== 'boolean') return jsonError('resolved (boolean) wajib diisi', 400);

  try {
    const result = await env.DB.prepare('UPDATE error_logs SET resolved = ? WHERE id = ?')
      .bind(body.resolved ? 1 : 0, id).run();
    if ((result.meta?.changes ?? 0) === 0) return jsonError('Error log tidak ditemukan', 404);
    return jsonOk({ success: true });
  } catch (err) {
    console.error('[admin error PATCH]', err.message);
    return jsonError('Gagal memperbarui error log', 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const result = await env.DB.prepare('DELETE FROM error_logs WHERE id = ?').bind(id).run();
    if ((result.meta?.changes ?? 0) === 0) return jsonError('Error log tidak ditemukan', 404);
    return jsonOk({ success: true });
  } catch (err) {
    console.error('[admin error DELETE]', err.message);
    return jsonError('Gagal menghapus error log', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
