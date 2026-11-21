// PATCH  /api/admin/portfolio/:id — ubah sebagian field (kategori, keterangan,
//        lokasi, tanggal, kode_listing, aman_dikonfirmasi, tampil), dan/atau
//        GANTI FOTO (foto_key + thumb_key) — dipakai "Tutup bagian sensitif"
//        pada foto yang sudah tersimpan/tampil (2026-11-22).
// DELETE /api/admin/portfolio/:id — hapus baris + kedua objek R2.
// Auth: functions/api/admin/_middleware.js
//
// Ganti foto: browser memuat foto 1280 px yang tersimpan, admin menambah kotak
// penutup, hasilnya diunggah lewat POST /portfolio/foto (key BARU), lalu key
// baru itu dikirim ke sini. Key baru, bukan menimpa key lama, karena /api/media
// menyajikan `immutable, max-age=1 tahun` — menimpa objek yang sama membuat
// browser pengunjung terus memakai versi yang belum disensor. Objek LAMA
// langsung dihapus dari R2: /api/media tidak di-cache CDN (cf-cache-status
// DYNAMIC, diukur 2026-11-22), jadi URL lama langsung 404 di mana pun.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { siapkanIsian, keySah, KOLOM_ITEM } from '../../../_lib/portfolio.js';
import { buangCacheHalaman } from '../../../_lib/edgeCache.js';

const idSah = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };
const HALAMAN_PUBLIK = ['/', '/portfolio'];

/** Hapus objek R2 dengan satu kali coba ulang. @returns {Promise<boolean>} */
async function hapusR2(env, key, label) {
  for (let i = 0; i < 2; i++) {
    try { await env.MEDIA.delete(key); return true; }
    catch (err) { console.error(`[admin portfolio ${label}] R2 delete ${key}`, err?.message); }
  }
  return false;
}

/**
 * Validasi pasangan key foto baru. Pasangan wajib satu uuid (begitulah
 * POST /portfolio/foto membuatnya) — mencegah baris menunjuk foto milik baris
 * lain, yang akan ikut terhapus saat salah satunya dihapus.
 * @returns {Promise<{galat?: string, status?: number}>}
 */
async function periksaFotoBaru(env, id, lama, foto_key, thumb_key) {
  if (!keySah(foto_key) || !keySah(thumb_key) || foto_key.endsWith('-t.webp')
      || thumb_key !== foto_key.replace(/\.webp$/, '-t.webp')) {
    return { galat: 'Foto baru tidak sah (foto_key/thumb_key bukan pasangan hasil unggahan)', status: 400 };
  }
  if (foto_key === lama.foto_key) return { galat: 'Foto baru sama dengan foto lama', status: 400 };
  const dipakai = await env.DB.prepare(
    'SELECT id FROM portfolio_items WHERE (foto_key = ? OR thumb_key = ?) AND id != ?'
  ).bind(foto_key, thumb_key, id).first();
  if (dipakai) return { galat: 'Foto itu sudah dipakai item lain', status: 409 };
  const [a, b] = await Promise.all([env.MEDIA.head(foto_key), env.MEDIA.head(thumb_key)]);
  if (!a || !b) return { galat: 'Foto baru belum terunggah — ulangi', status: 400 };
  return {};
}

export async function onRequestPatch({ env, request, params }) {
  const id = idSah(params.id);
  if (!id) return jsonError('ID tidak valid', 400);
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid (harus JSON)', 400); }
  const lama = await env.DB.prepare('SELECT * FROM portfolio_items WHERE id = ?').bind(id).first();
  if (!lama) return jsonError('Item tidak ditemukan', 404);
  const { galat, isi } = await siapkanIsian(env, body, lama);
  if (galat) return jsonError(galat, 422);

  const gantiFoto = body && (Object.prototype.hasOwnProperty.call(body, 'foto_key') || Object.prototype.hasOwnProperty.call(body, 'thumb_key'));
  let foto_key = lama.foto_key, thumb_key = lama.thumb_key;
  if (gantiFoto) {
    const cek = await periksaFotoBaru(env, id, lama, body.foto_key, body.thumb_key);
    if (cek.galat) return jsonError(cek.galat, cek.status);
    ({ foto_key, thumb_key } = body);
  }

  // Saat ganti foto, guard `foto_key = lama`: dua tab admin yang mengganti foto
  // bersamaan — yang kalah tidak boleh menimpa (lalu menghapus) hasil yang menang.
  const r = await env.DB.prepare(
    `UPDATE portfolio_items SET kategori = ?, keterangan = ?, lokasi = ?, tanggal = ?, property_id = ?,
            tampil = ?, aman_dikonfirmasi = ?, foto_key = ?, thumb_key = ?, diubah_at = CURRENT_TIMESTAMP
      WHERE id = ?${gantiFoto ? ' AND foto_key = ?' : ''}`
  ).bind(isi.kategori, isi.keterangan, isi.lokasi, isi.tanggal, isi.property_id, isi.tampil, isi.aman_dikonfirmasi,
    foto_key, thumb_key, id, ...(gantiFoto ? [lama.foto_key] : [])).run();
  if (gantiFoto && (r.meta?.changes ?? 0) === 0) {
    await hapusR2(env, foto_key, 'PATCH kalah');
    await hapusR2(env, thumb_key, 'PATCH kalah');
    return jsonError('Foto item ini baru saja diganti dari tempat lain — muat ulang halaman lalu ulangi', 409);
  }

  const hasil = {};
  if (gantiFoto) {
    // Versi lama (belum disensor) dihapus SEKARANG — inilah inti fiturnya.
    const gagal = [];
    if (!(await hapusR2(env, lama.foto_key, 'PATCH'))) gagal.push(lama.foto_key);
    if (!(await hapusR2(env, lama.thumb_key, 'PATCH'))) gagal.push(lama.thumb_key);
    hasil.foto_lama_terhapus = gagal.length === 0;
    if (gagal.length) hasil.foto_lama_gagal = gagal;
  }
  if (lama.tampil === 1 || isi.tampil === 1) await buangCacheHalaman(request.url, HALAMAN_PUBLIK);

  const item = await env.DB.prepare(
    `SELECT ${KOLOM_ITEM} FROM portfolio_items pi LEFT JOIN properties p ON p.id = pi.property_id WHERE pi.id = ?`
  ).bind(id).first();
  return jsonOk({ item, ...hasil });
}

export async function onRequestDelete({ env, request, params }) {
  const id = idSah(params.id);
  if (!id) return jsonError('ID tidak valid', 400);
  const row = await env.DB.prepare('SELECT foto_key, thumb_key, tampil FROM portfolio_items WHERE id = ?').bind(id).first();
  if (!row) return jsonError('Item tidak ditemukan', 404);
  await env.DB.prepare('DELETE FROM portfolio_items WHERE id = ?').bind(id).run();
  // Baris dihapus DULU: objek R2 yatim jauh lebih ringan daripada baris yang
  // menunjuk foto yang sudah hilang (kotak rusak di beranda).
  await hapusR2(env, row.foto_key, 'DELETE');
  await hapusR2(env, row.thumb_key, 'DELETE');
  if (row.tampil === 1) await buangCacheHalaman(request.url, HALAMAN_PUBLIK);
  return jsonOk({ id, dihapus: true });
}

export async function onRequestOptions() { return handleOptions(); }
