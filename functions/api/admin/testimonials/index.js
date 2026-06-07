// GET  /api/admin/testimonials — list semua testimoni (termasuk tampilkan=0)
// POST /api/admin/testimonials — tambah testimoni baru
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const result = await env.DB.prepare(`
      SELECT
        id, nama_klien, foto_url, lokasi, rating, isi_testimoni,
        jenis_transaksi, properti_terkait, tanggal,
        tampilkan, urutan, created_at
      FROM testimonials
      ORDER BY urutan ASC, id DESC
    `).all();

    return jsonOk({ items: result.results ?? [], total: (result.results ?? []).length });
  } catch (err) {
    console.error('[admin testimonials GET]', err.message);
    return jsonError('Gagal mengambil data testimoni', 500);
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

  const nama_klien    = sanitize(body.nama_klien ?? '', 200);
  const isi_testimoni = sanitize(body.isi_testimoni ?? '', 2000);
  const rating        = parseInt(body.rating, 10);

  if (!nama_klien)    return jsonError('nama_klien tidak boleh kosong', 422);
  if (!isi_testimoni) return jsonError('isi_testimoni tidak boleh kosong', 422);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonError('rating harus antara 1 sampai 5', 422);
  }

  const foto_url        = sanitize(body.foto_url ?? '', 500) || null;
  const lokasi          = sanitize(body.lokasi ?? '', 200) || null;
  const jenis_transaksi = sanitize(body.jenis_transaksi ?? '', 100) || null;
  const tampilkan       = body.tampilkan === false || body.tampilkan === 0 ? 0 : 1;
  const urutan          = Number.isInteger(body.urutan) ? body.urutan : 0;
  const properti_terkait = Number.isInteger(body.properti_terkait) ? body.properti_terkait : null;
  const tanggal         = typeof body.tanggal === 'string' ? body.tanggal.slice(0, 10) : null;

  try {
    const res = await env.DB.prepare(`
      INSERT INTO testimonials
        (nama_klien, foto_url, lokasi, rating, isi_testimoni,
         jenis_transaksi, properti_terkait, tanggal, tampilkan, urutan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      nama_klien, foto_url, lokasi, rating, isi_testimoni,
      jenis_transaksi, properti_terkait, tanggal, tampilkan, urutan
    ).run();

    const newRow = await env.DB
      .prepare('SELECT * FROM testimonials WHERE id = ?')
      .bind(res.meta.last_row_id)
      .first();

    return jsonOk({ pesan: 'Testimoni berhasil ditambahkan', testimoni: newRow }, 201);
  } catch (err) {
    console.error('[admin testimonials POST]', err.message);
    return jsonError('Gagal menyimpan testimoni', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
