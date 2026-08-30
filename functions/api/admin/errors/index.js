// GET    /api/admin/errors?source=&resolved=&page=&limit= — daftar error log
// DELETE /api/admin/errors?older_than_days=30 — housekeeping (hapus log lama)
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;

  const conditions = [];
  const bindings = [];

  const source = q.get('source');
  if (source === 'client' || source === 'server') {
    conditions.push('source = ?');
    bindings.push(source);
  }

  const resolved = q.get('resolved');
  if (resolved === '0' || resolved === '1') {
    conditions.push('resolved = ?');
    bindings.push(Number(resolved));
  }

  // Kebisingan yang TIDAK bisa kita perbaiki: hydration #418 yang dipicu injeksi
  // JavaScript oleh in-app browser Facebook/Instagram (lihat browserInApp() di
  // src/app/entry.client.tsx). Pernah 34 baris masuk dalam 8 jam dan menenggelamkan
  // 2 baris [scheduler] yang justru menandakan kehilangan 4 video.
  //
  // Barisnya TIDAK dihapus, hanya bisa disembunyikan — kalau polanya berubah
  // atau menyebar ke browser lain, kita masih harus bisa melihatnya.
  const jenis = q.get('jenis');
  if (jenis === 'app') {
    conditions.push("(context IS NULL OR context NOT LIKE '%\"in_app\":true%')");
  } else if (jenis === 'in_app') {
    conditions.push("context LIKE '%\"in_app\":true%'");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let page = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  let limit = parseInt(q.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) limit = DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  try {
    const [rows, countRow] = await Promise.all([
      env.DB.prepare(`
        SELECT id, source, message, stack, url, user_agent, context, resolved, created_at
        FROM error_logs ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `).bind(...bindings, limit, offset).all(),
      env.DB.prepare(`SELECT COUNT(*) AS cnt FROM error_logs ${where}`).bind(...bindings).first(),
    ]);

    return jsonOk({
      items: rows.results ?? [],
      total: countRow?.cnt ?? 0,
      page, limit,
    });
  } catch (err) {
    console.error('[admin errors GET]', err.message);
    return jsonError('Gagal mengambil error logs', 500);
  }
}

// Housekeeping — buang log lama supaya tabel tidak tumbuh tanpa batas
export async function onRequestDelete(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;
  const days = parseInt(q.get('older_than_days') ?? '30', 10);
  if (!Number.isInteger(days) || days < 1) return jsonError('older_than_days harus integer >= 1', 400);

  try {
    const result = await env.DB.prepare(
      `DELETE FROM error_logs WHERE created_at < datetime('now', ?)`
    ).bind(`-${days} days`).run();
    return jsonOk({ deleted: result.meta?.changes ?? 0 });
  } catch (err) {
    console.error('[admin errors DELETE]', err.message);
    return jsonError('Gagal menghapus error logs', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
