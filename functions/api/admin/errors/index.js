// GET    /api/admin/errors?source=&resolved=&page=&limit= — daftar error log
// DELETE /api/admin/errors?older_than_days=30 — housekeeping (hapus log lama)
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { sqlInApp } from '../../../_lib/inAppBrowser.js';

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
  // JavaScript oleh in-app browser Meta (Facebook/Instagram/Threads). Pernah 34
  // baris masuk dalam 8 jam dan menenggelamkan 2 baris [scheduler] yang justru
  // menandakan kehilangan 4 video.
  //
  // Barisnya TIDAK dihapus, hanya bisa disembunyikan — kalau polanya berubah
  // atau menyebar ke browser lain, kita masih harus bisa melihatnya.
  //
  // Daftar penanda + alasan COALESCE ada di functions/_lib/inAppBrowser.js,
  // yang juga dipakai klien. Dulu daftarnya ditulis dua kali dan menyimpang:
  // Threads lolos filter selama berhari-hari (2026-09-01).
  const IN_APP = sqlInApp();

  // Penghitung "disembunyikan" dihitung atas kondisi source+resolved SAJA,
  // tanpa `jenis` — itulah yang membuat lonjakan kebisingan tetap terlihat
  // walau filternya sedang menyembunyikannya. Snapshot diambil SEBELUM `jenis`
  // ikut didorong ke `conditions`.
  const kondisiDasar = [...conditions];

  const jenis = q.get('jenis');
  if (jenis === 'app') {
    conditions.push(`NOT ${IN_APP}`);
  } else if (jenis === 'in_app') {
    conditions.push(IN_APP);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const whereDasar = kondisiDasar.length > 0 ? `WHERE ${kondisiDasar.join(' AND ')}` : '';

  let page = Math.max(1, parseInt(q.get('page') ?? '1', 10) || 1);
  let limit = parseInt(q.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) limit = DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  try {
    const [rows, hitung] = await Promise.all([
      env.DB.prepare(`
        SELECT id, source, message, stack, url, user_agent, context, resolved, created_at
        FROM error_logs ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `).bind(...bindings, limit, offset).all(),
      // Agregasi kondisional: satu query menggantikan satu query, jadi
      // penghitung "disembunyikan" TIDAK menambah round-trip D1.
      env.DB.prepare(`
        SELECT SUM(CASE WHEN ${IN_APP} THEN 0 ELSE 1 END) AS n_app,
               SUM(CASE WHEN ${IN_APP} THEN 1 ELSE 0 END) AS n_in_app
        FROM error_logs ${whereDasar}
      `).bind(...bindings).first(),
    ]);

    // SUM() atas NOL baris mengembalikan NULL, bukan 0.
    const nApp = hitung?.n_app ?? 0;
    const nInApp = hitung?.n_in_app ?? 0;

    return jsonOk({
      items: rows.results ?? [],
      total: jenis === 'app' ? nApp : jenis === 'in_app' ? nInApp : nApp + nInApp,
      // Berapa yang sedang disembunyikan filter. Dikirim selalu, ditampilkan UI
      // hanya saat jenis=app: tanpa angka ini, lonjakan kebisingan tidak
      // terlihat sebagai lonjakan — persis yang membuat 44 baris Threads luput
      // berhari-hari sementara layar tetap menunjukkan angka kecil.
      tersembunyi: nInApp,
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
