import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

function slugify(nama) {
  return nama.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// POST /api/admin/locations/import — terima {rows:[{kode,nama}]}
// kode format Kemendagri: "11" (provinsi), "11.01" (kabupaten), "11.01.01"
// (kecamatan), "11.01.01.2001" (kelurahan/desa)
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return jsonError('rows kosong', 400);
  if (rows.length > 2000) return jsonError('Maksimal 2000 rows per request', 400);

  const stmts = [];
  for (const row of rows) {
    const kode = String(row.kode ?? '').trim();
    const nama = String(row.nama ?? '').trim();
    if (!kode || !nama) continue;

    const id = parseInt(kode.replace(/\./g, ''), 10);
    if (!Number.isInteger(id) || id <= 0) continue;

    const dotCount = (kode.match(/\./g) || []).length;
    const tipe = dotCount === 0 ? 'provinsi' : dotCount === 1 ? 'kabupaten' : dotCount === 2 ? 'kecamatan' : 'kelurahan';
    const parentKode = dotCount === 0 ? null : kode.split('.').slice(0, -1).join('.');
    const parent_id = parentKode ? parseInt(parentKode.replace(/\./g, ''), 10) : null;
    const slug = slugify(nama) || `lok-${id}`;

    stmts.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO locations (id, nama, tipe, parent_id, slug) VALUES (?,?,?,?,?)`
      ).bind(id, nama, tipe, parent_id, slug)
    );
  }

  if (stmts.length === 0) return jsonOk({ success: true, inserted: 0 });

  try {
    for (let i = 0; i < stmts.length; i += 100) {
      await env.DB.batch(stmts.slice(i, i + 100));
    }
  } catch (err) {
    console.error('[locations/import] batch error:', err.message);
    return jsonError('Gagal menyimpan data lokasi', 500);
  }

  return jsonOk({ success: true, inserted: stmts.length });
}

// DELETE /api/admin/locations/import — hapus semua data lokasi
export async function onRequestDelete(context) {
  const { env } = context;
  try {
    await env.DB.prepare('DELETE FROM locations').run();
    return jsonOk({ success: true, message: 'Reset selesai' });
  } catch (err) {
    console.error('[locations/import] DELETE error:', err.message);
    return jsonError('Gagal mereset data lokasi', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
