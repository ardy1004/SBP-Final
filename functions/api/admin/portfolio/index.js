// GET  /api/admin/portfolio — semua item portofolio (urut tampil), termasuk yang disembunyikan.
// POST /api/admin/portfolio — buat item dari foto yang SUDAH diunggah (POST /portfolio/foto).
//   Body: { foto_key, thumb_key, kategori, keterangan?, lokasi?, tanggal?, kode_listing?, aman_dikonfirmasi?, tampil? }
//
// Item baru ditaruh PALING DEPAN (urutan = min − 1). Aturan validasi & gerbang
// tampil: siapkanIsian() di functions/_lib/portfolio.js (migrasi 0062).
// Auth: functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { siapkanIsian, keySah, KOLOM_ITEM } from '../../../_lib/portfolio.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare(
      `SELECT ${KOLOM_ITEM} FROM portfolio_items pi LEFT JOIN properties p ON p.id = pi.property_id
        ORDER BY pi.urutan ASC, pi.id DESC`
    ).all();
    return jsonOk({ items: res.results ?? [] });
  } catch (err) {
    if (/no such table/i.test(err.message ?? '')) return jsonError('Portofolio belum tersedia: migrasi database 0062 belum diterapkan.', 503);
    console.error('[admin portfolio GET]', err.message);
    return jsonError('Gagal memuat portofolio', 500);
  }
}

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }
  if (!keySah(body?.foto_key) || !keySah(body?.thumb_key) || body.foto_key.endsWith('-t.webp') || !body.thumb_key.endsWith('-t.webp')) {
    return jsonError('Foto belum diunggah dengan benar (foto_key/thumb_key tidak sah)', 400);
  }
  const { galat, isi } = await siapkanIsian(env, body);
  if (galat) return jsonError(galat, 422);
  try {
    const r = await env.DB.prepare(
      `INSERT INTO portfolio_items (kategori, foto_key, thumb_key, keterangan, lokasi, tanggal, property_id, tampil, aman_dikonfirmasi, urutan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MIN(urutan), 0) - 1 FROM portfolio_items))`
    ).bind(isi.kategori, body.foto_key, body.thumb_key, isi.keterangan, isi.lokasi, isi.tanggal, isi.property_id, isi.tampil, isi.aman_dikonfirmasi).run();
    const item = await env.DB.prepare(
      `SELECT ${KOLOM_ITEM} FROM portfolio_items pi LEFT JOIN properties p ON p.id = pi.property_id WHERE pi.id = ?`
    ).bind(r.meta?.last_row_id).first();
    return jsonOk({ item }, 201);
  } catch (err) {
    console.error('[admin portfolio POST]', err.message);
    return jsonError('Gagal menyimpan item portofolio', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
