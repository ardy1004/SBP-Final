// POST /api/admin/portfolio/urutan — simpan urutan hasil seret.
// Body: { ids: number[] } urut dari kiri-atas. Tiap pernyataan hanya 2 parameter
// (di bawah batas 100 bound parameter D1); dijalankan dalam batch per 50.
// Auth: functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const MAKS_ID = 500;

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }
  const ids = Array.isArray(body?.ids) ? body.ids.map(n => parseInt(n, 10)) : null;
  if (!ids || ids.length === 0 || ids.length > MAKS_ID || ids.some(n => !Number.isInteger(n) || n <= 0) || new Set(ids).size !== ids.length) {
    return jsonError(`ids harus daftar 1–${MAKS_ID} id unik`, 400);
  }
  const stmts = ids.map((id, i) => env.DB.prepare('UPDATE portfolio_items SET urutan = ? WHERE id = ?').bind(i, id));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return jsonOk({ jumlah: ids.length });
}

export async function onRequestOptions() { return handleOptions(); }
