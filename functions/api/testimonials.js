import { jsonOk, jsonError, handleOptions } from './_shared/response.js';

/**
 * GET /api/testimonials
 * Ambil testimoni yang aktif (tampilkan=1), diurutkan berdasarkan kolom urutan ASC.
 * Tidak butuh auth — data publik.
 */
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const result = await env.DB.prepare(`
      SELECT
        id,
        nama_klien,
        foto_url,
        lokasi,
        rating,
        isi_testimoni,
        jenis_transaksi,
        tanggal
      FROM testimonials
      WHERE tampilkan = 1
      ORDER BY urutan ASC
    `).all();

    return jsonOk({
      items: result.results,
      total: result.results.length,
    });
  } catch (err) {
    console.error('[testimonials] DB error:', err.message);
    return jsonError('Gagal mengambil data testimoni', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
