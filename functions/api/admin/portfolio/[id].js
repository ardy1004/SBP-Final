// PATCH  /api/admin/portfolio/:id — ubah sebagian field (kategori, keterangan,
//        lokasi, tanggal, kode_listing, aman_dikonfirmasi, tampil).
// DELETE /api/admin/portfolio/:id — hapus baris + kedua objek R2.
// Auth: functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { siapkanIsian, KOLOM_ITEM } from '../../../_lib/portfolio.js';

const idSah = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

export async function onRequestPatch({ env, request, params }) {
  const id = idSah(params.id);
  if (!id) return jsonError('ID tidak valid', 400);
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }
  const lama = await env.DB.prepare('SELECT * FROM portfolio_items WHERE id = ?').bind(id).first();
  if (!lama) return jsonError('Item tidak ditemukan', 404);
  const { galat, isi } = await siapkanIsian(env, body, lama);
  if (galat) return jsonError(galat, 422);
  await env.DB.prepare(
    `UPDATE portfolio_items SET kategori = ?, keterangan = ?, lokasi = ?, tanggal = ?, property_id = ?,
            tampil = ?, aman_dikonfirmasi = ?, diubah_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(isi.kategori, isi.keterangan, isi.lokasi, isi.tanggal, isi.property_id, isi.tampil, isi.aman_dikonfirmasi, id).run();
  const item = await env.DB.prepare(
    `SELECT ${KOLOM_ITEM} FROM portfolio_items pi LEFT JOIN properties p ON p.id = pi.property_id WHERE pi.id = ?`
  ).bind(id).first();
  return jsonOk({ item });
}

export async function onRequestDelete({ env, params }) {
  const id = idSah(params.id);
  if (!id) return jsonError('ID tidak valid', 400);
  const row = await env.DB.prepare('SELECT foto_key, thumb_key FROM portfolio_items WHERE id = ?').bind(id).first();
  if (!row) return jsonError('Item tidak ditemukan', 404);
  await env.DB.prepare('DELETE FROM portfolio_items WHERE id = ?').bind(id).run();
  // Baris dihapus DULU: objek R2 yatim jauh lebih ringan daripada baris yang
  // menunjuk foto yang sudah hilang (kotak rusak di beranda).
  await env.MEDIA.delete(row.foto_key).catch(err => console.error('[admin portfolio DELETE] R2', err?.message));
  await env.MEDIA.delete(row.thumb_key).catch(err => console.error('[admin portfolio DELETE] R2', err?.message));
  return jsonOk({ id, dihapus: true });
}

export async function onRequestOptions() { return handleOptions(); }
