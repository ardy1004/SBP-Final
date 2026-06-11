// DELETE /api/admin/viralframe/characters/:id — hapus karakter + foto dari R2
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

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
