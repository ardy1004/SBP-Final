// PATCH  /api/admin/viralframe/characters/:id — update data/foto karakter TANPA
//   menghapus baris (character_id tetap sama) — supaya video & badge/logo yang
//   sudah terhubung ke karakter ini (FK ON DELETE CASCADE) tidak ikut hilang.
//   Body JSON (semua field opsional, partial update):
//     { nama?, foto? (data:image/webp;base64,...), gender?, usia?, etnik?, style?, ciri_fisik? }
// DELETE /api/admin/viralframe/characters/:id — hapus karakter + foto dari R2
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const WEBP_PREFIX = 'data:image/webp;base64,';

function sanitize(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const existing = await env.DB.prepare('SELECT id, foto_url FROM viralframe_characters WHERE id = ?').bind(id).first();
  if (!existing) return jsonError('Karakter tidak ditemukan', 404);

  const sets = [];
  const binds = [];

  if (body.nama != null) {
    const nama = sanitize(body.nama, 120);
    if (!nama) return jsonError('nama tidak boleh kosong', 422);
    sets.push('nama = ?'); binds.push(nama);
  }
  if (body.gender != null) { sets.push('gender = ?'); binds.push(sanitize(body.gender, 30) || null); }
  if (body.usia != null) { sets.push('usia = ?'); binds.push(Number.isInteger(body.usia) ? body.usia : (parseInt(body.usia, 10) || null)); }
  if (body.etnik != null) { sets.push('etnik = ?'); binds.push(sanitize(body.etnik, 60) || null); }
  if (body.style != null) { sets.push('style = ?'); binds.push(sanitize(body.style, 120) || null); }
  if (body.ciri_fisik != null) { sets.push('ciri_fisik = ?'); binds.push(sanitize(body.ciri_fisik, 500) || null); }

  // Foto baru: upload dulu ke R2 key BARU (jangan timpa key lama) — supaya kalau
  // ada kegagalan di tengah jalan, foto lama yang masih dipakai tidak rusak/hilang.
  let newR2Key = null;
  if (typeof body.foto === 'string' && body.foto) {
    if (!body.foto.startsWith(WEBP_PREFIX)) return jsonError('Foto harus berformat WebP (data:image/webp;base64,...)', 422);
    let uploadBuf;
    try {
      const binaryStr = atob(body.foto.slice(WEBP_PREFIX.length));
      uploadBuf = Uint8Array.from(binaryStr, c => c.charCodeAt(0)).buffer;
    } catch { return jsonError('Gagal decode base64 foto', 400); }

    newR2Key = `viralframe-characters/${crypto.randomUUID()}.webp`;
    try {
      await env.MEDIA.put(newR2Key, uploadBuf, { httpMetadata: { contentType: 'image/webp' } });
    } catch (err) {
      console.error('[viralframe characters PATCH upload]', err.message);
      return jsonError('Gagal menyimpan foto baru', 500);
    }
    sets.push('foto_url = ?'); binds.push(newR2Key);
  }

  if (sets.length === 0) return jsonError('Tidak ada field diupdate', 400);

  try {
    await env.DB.prepare(`UPDATE viralframe_characters SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  } catch (err) {
    console.error('[viralframe characters PATCH]', err.message);
    if (newR2Key) await env.MEDIA.delete(newR2Key).catch(() => {}); // rollback foto baru, foto lama tetap aman
    return jsonError('Gagal menyimpan perubahan', 500);
  }

  // Baru hapus foto LAMA setelah DB berhasil update ke foto baru — urutan ini
  // memastikan tidak pernah ada momen karakter tanpa foto valid sama sekali.
  if (newR2Key && existing.foto_url) {
    await env.MEDIA.delete(existing.foto_url).catch(() => {});
  }

  const updated = await env.DB.prepare('SELECT * FROM viralframe_characters WHERE id = ?').bind(id).first();
  return jsonOk({ pesan: 'Karakter berhasil diperbarui', karakter: updated });
}

export async function onRequestDelete(context) {
  const { env, params } = context;

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const existing = await env.DB
      .prepare('SELECT id, foto_url FROM viralframe_characters WHERE id = ?')
      .bind(id)
      .first();
    if (!existing) return jsonError('Karakter tidak ditemukan', 404);

    await env.DB
      .prepare('DELETE FROM viralframe_characters WHERE id = ?')
      .bind(id)
      .run();

    if (existing.foto_url) {
      await env.MEDIA.delete(existing.foto_url).catch(() => {});
    }

    return jsonOk({ success: true, pesan: 'Karakter berhasil dihapus' });
  } catch (err) {
    console.error('[viralframe characters DELETE]', err.message);
    return jsonError('Gagal menghapus karakter', 500, err.message);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
