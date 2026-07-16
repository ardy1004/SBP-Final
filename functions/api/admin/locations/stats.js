import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const rows = await env.DB.prepare(
      `SELECT tipe, COUNT(*) as cnt FROM locations GROUP BY tipe`
    ).all();

    const counts = { provinsi: 0, kabupaten: 0, kecamatan: 0, kelurahan: 0 };
    for (const row of (rows.results ?? [])) {
      if (row.tipe in counts) counts[row.tipe] = row.cnt;
    }
    return jsonOk(counts);
  } catch (err) {
    console.error('[locations/stats] error:', err.message);
    return jsonError('Gagal mengambil statistik lokasi', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
