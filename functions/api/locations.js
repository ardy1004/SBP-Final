import { jsonOk, jsonError, handleOptions } from './_shared/response.js';

/**
 * GET /api/locations?parent_id=
 *
 * parent_id kosong  → kembalikan semua provinsi (parent_id IS NULL)
 * parent_id terisi  → kembalikan children dari parent tersebut
 *
 * Response item: { id, nama, tipe, slug, parent_id, latitude, longitude }
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const parentIdRaw = url.searchParams.get('parent_id');
  const wantAll = url.searchParams.get('all');

  // all=1 → kembalikan SEMUA lokasi (semua level) untuk index parser/typeahead client.
  if (wantAll === '1' || wantAll === 'true') {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, nama, tipe, slug, parent_id, latitude, longitude
           FROM locations ORDER BY nama ASC`
      ).all();
      return jsonOk({ items: rows.results, total: rows.results.length });
    } catch (err) {
      console.error('[locations all] DB error:', err.message);
      return jsonError('Gagal mengambil data lokasi', 500);
    }
  }

  // Validasi: parent_id harus integer positif jika disertakan
  if (parentIdRaw !== null && parentIdRaw !== '') {
    const parsed = parseInt(parentIdRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return jsonError('parent_id harus berupa integer positif', 400);
    }
  }

  try {
    let stmt;
    let rows;

    if (!parentIdRaw || parentIdRaw === '') {
      // Ambil provinsi (root) — parent_id IS NULL
      stmt = env.DB.prepare(
        `SELECT id, nama, tipe, slug, parent_id, latitude, longitude
           FROM locations
          WHERE parent_id IS NULL
          ORDER BY nama ASC`
      );
      rows = await stmt.all();
    } else {
      const parentId = parseInt(parentIdRaw, 10);

      // Pastikan parent ada terlebih dahulu
      const parent = await env.DB
        .prepare('SELECT id, nama, tipe FROM locations WHERE id = ?')
        .bind(parentId)
        .first();

      if (!parent) {
        return jsonError(`Lokasi dengan id ${parentId} tidak ditemukan`, 404);
      }

      stmt = env.DB.prepare(
        `SELECT id, nama, tipe, slug, parent_id, latitude, longitude
           FROM locations
          WHERE parent_id = ?
          ORDER BY nama ASC`
      );
      rows = await stmt.bind(parentId).all();
    }

    return jsonOk({
      items: rows.results,
      total: rows.results.length,
    });
  } catch (err) {
    console.error('[locations] DB error:', err.message);
    return jsonError('Gagal mengambil data lokasi', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
