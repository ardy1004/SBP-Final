// PATCH /api/admin/pixel-configs/:id — update label/pixel_id/is_active/events_enabled/capi_access_token
// DELETE /api/admin/pixel-configs/:id — hapus pixel config
// Auth: dilindungi _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestPatch({ env, request, params }) {
  const id = Number(params.id);
  if (!id || isNaN(id)) return jsonError('ID tidak valid');

  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid'); }

  const existing = await env.DB.prepare('SELECT id FROM pixel_configs WHERE id = ?').bind(id).first();
  if (!existing) return jsonError('Pixel config tidak ditemukan', 404);

  const setClauses = [];
  const values = [];

  if (body.label !== undefined) {
    const label = String(body.label).trim();
    if (!label) return jsonError('label tidak boleh kosong');
    setClauses.push('label = ?'); values.push(label);
  }
  if (body.pixel_id !== undefined) {
    const pixel_id = String(body.pixel_id).trim();
    if (!pixel_id) return jsonError('pixel_id tidak boleh kosong');
    setClauses.push('pixel_id = ?'); values.push(pixel_id);
  }
  if (body.is_active !== undefined) {
    setClauses.push('is_active = ?'); values.push(body.is_active ? 1 : 0);
  }
  if (body.events_enabled !== undefined) {
    setClauses.push('events_enabled = ?');
    values.push(JSON.stringify(Array.isArray(body.events_enabled) ? body.events_enabled : []));
  }
  // capi_access_token: '' atau null → hapus token; string non-kosong → simpan; undefined → tidak ubah
  if (body.capi_access_token !== undefined) {
    const token = (typeof body.capi_access_token === 'string' && body.capi_access_token.trim())
      ? body.capi_access_token.trim()
      : null;
    setClauses.push('capi_access_token = ?'); values.push(token);
  }

  if (setClauses.length === 0) return jsonError('Tidak ada field yang diupdate');

  values.push(id);
  try {
    const row = await env.DB
      .prepare(`UPDATE pixel_configs SET ${setClauses.join(', ')} WHERE id = ? RETURNING id, label, pixel_id, is_active, events_enabled, capi_access_token, created_at`)
      .bind(...values)
      .first();

    const hasCapiToken = (row.capi_access_token != null && row.capi_access_token !== '') ? 1 : 0;
    const { capi_access_token: _ct, ...safeRow } = row;
    return jsonOk({ pixel: { ...safeRow, has_capi_token: hasCapiToken } });
  } catch (err) {
    console.error('[pixel-configs PATCH]', err.message);
    return jsonError('Gagal mengupdate pixel config', 500);
  }
}

export async function onRequestDelete({ env, params }) {
  const id = Number(params.id);
  if (!id || isNaN(id)) return jsonError('ID tidak valid');

  const existing = await env.DB.prepare('SELECT id FROM pixel_configs WHERE id = ?').bind(id).first();
  if (!existing) return jsonError('Pixel config tidak ditemukan', 404);

  try {
    await env.DB.prepare('DELETE FROM pixel_configs WHERE id = ?').bind(id).run();
    return jsonOk({ deleted: true, id });
  } catch (err) {
    console.error('[pixel-configs DELETE]', err.message);
    return jsonError('Gagal menghapus pixel config', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
