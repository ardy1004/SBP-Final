// PATCH  /api/admin/testimonials/:id — update field testimoni (partial update)
// DELETE /api/admin/testimonials/:id — hapus testimoni
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

const PATCHABLE = new Set([
  'nama_klien', 'isi_testimoni', 'rating', 'lokasi',
  'foto_url', 'jenis_transaksi', 'tampilkan', 'urutan',
  'properti_terkait', 'tanggal',
]);

export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  // Validasi row exists
  const existing = await env.DB
    .prepare('SELECT id FROM testimonials WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return jsonError('Testimoni tidak ditemukan', 404);

  const setClauses = [];
  const values     = [];

  for (const key of PATCHABLE) {
    if (!(key in body)) continue;

    if (key === 'nama_klien') {
      const v = sanitize(body.nama_klien, 200);
      if (!v) return jsonError('nama_klien tidak boleh kosong', 422);
      setClauses.push('nama_klien = ?'); values.push(v);
    } else if (key === 'isi_testimoni') {
      const v = sanitize(body.isi_testimoni, 2000);
      if (!v) return jsonError('isi_testimoni tidak boleh kosong', 422);
      setClauses.push('isi_testimoni = ?'); values.push(v);
    } else if (key === 'rating') {
      const v = parseInt(body.rating, 10);
      if (!Number.isInteger(v) || v < 1 || v > 5) {
        return jsonError('rating harus antara 1 sampai 5', 422);
      }
      setClauses.push('rating = ?'); values.push(v);
    } else if (key === 'tampilkan') {
      const v = body.tampilkan === false || body.tampilkan === 0 ? 0 : 1;
      setClauses.push('tampilkan = ?'); values.push(v);
    } else if (key === 'urutan') {
      const v = Number.isInteger(body.urutan) ? body.urutan : 0;
      setClauses.push('urutan = ?'); values.push(v);
    } else if (key === 'properti_terkait') {
      const v = Number.isInteger(body.properti_terkait) ? body.properti_terkait : null;
      setClauses.push('properti_terkait = ?'); values.push(v);
    } else if (key === 'tanggal') {
      const v = typeof body.tanggal === 'string' ? body.tanggal.slice(0, 10) : null;
      setClauses.push('tanggal = ?'); values.push(v);
    } else {
      // lokasi, foto_url, jenis_transaksi — string atau null
      const maxLen = key === 'foto_url' ? 500 : 200;
      const v = sanitize(String(body[key] ?? ''), maxLen) || null;
      setClauses.push(`${key} = ?`); values.push(v);
    }
  }

  if (setClauses.length === 0) {
    return jsonError('Tidak ada field yang dapat diupdate', 422);
  }

  values.push(id);

  try {
    await env.DB
      .prepare(`UPDATE testimonials SET ${setClauses.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  } catch (err) {
    console.error('[admin testimonials PATCH]', err.message);
    return jsonError('Gagal menyimpan perubahan', 500);
  }

  const updated = await env.DB
    .prepare('SELECT * FROM testimonials WHERE id = ?')
    .bind(id)
    .first();

  return jsonOk({ pesan: 'Testimoni berhasil diperbarui', testimoni: updated });
}

export async function onRequestDelete(context) {
  const { env, params } = context;

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  const existing = await env.DB
    .prepare('SELECT id FROM testimonials WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return jsonError('Testimoni tidak ditemukan', 404);

  try {
    await env.DB
      .prepare('DELETE FROM testimonials WHERE id = ?')
      .bind(id)
      .run();

    return jsonOk({ success: true, pesan: 'Testimoni berhasil dihapus' });
  } catch (err) {
    console.error('[admin testimonials DELETE]', err.message);
    return jsonError('Gagal menghapus testimoni', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
