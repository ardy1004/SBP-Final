// GET /api/admin/properties — semua properti semua status + cover image
// ?status=draft|published|sold|archived  (opsional)
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const VALID_STATUSES = new Set(['draft', 'published', 'sold', 'archived']);

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? '';

  const conditions = [];
  const bindings = [];

  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    conditions.push('p.status_publish = ?');
    bindings.push(statusFilter);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      p.id, p.kode_listing, p.title, p.slug,
      p.jenis_properti, p.tujuan,
      p.harga, p.nego, p.nett,
      p.kecamatan, p.kabupaten, p.provinsi,
      p.status_publish,
      p.created_at, p.updated_at, p.published_at,
      (SELECT url_webp FROM property_images
         WHERE property_id = p.id AND is_cover = 1 LIMIT 1) AS cover_url,
      (SELECT COUNT(*) FROM property_images WHERE property_id = p.id) AS jumlah_foto
    FROM properties p
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 500
  `;

  try {
    const stmt = env.DB.prepare(sql);
    const result = bindings.length > 0
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    return jsonOk({
      properties: result.results ?? [],
      total: (result.results ?? []).length,
    });
  } catch (err) {
    console.error('[admin properties list]', err.message);
    return jsonError('Gagal mengambil data properti', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
