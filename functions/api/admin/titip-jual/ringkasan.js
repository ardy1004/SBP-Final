// GET /api/admin/titip-jual/ringkasan — berapa pengajuan Titip Jual yang
// menunggu tindakan admin. Dipakai badge sidebar "Titip Jual" (AdminLayout,
// dulu hardcoded 0) dan kartu di Ringkasan.
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { SQL_TAHAP1_TERTUNDA } from '../../../_lib/titipJualAdmin.js';
import { perluVersiPerbaikan } from '../../../_lib/isiPerjanjian.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const [tertunda, draft, kedaluwarsa, signed] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(DISTINCT p.id) AS n
          FROM properties p JOIN owners o ON o.property_id = p.id
         WHERE ${SQL_TAHAP1_TERTUNDA}
      `).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM agreements WHERE status = 'draft'`).first(),
      // token_expires_at ditulis configure.js sebagai ISO UTC → aman dibandingkan
      // sebagai teks dengan format yang sama.
      env.DB.prepare(`
        SELECT COUNT(*) AS n FROM agreements
         WHERE status = 'menunggu_ttd' AND token_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `).first(),
      // Aturan "perlu versi perbaikan" hanya ada di satu tempat (isiPerjanjian.js)
      // — ambil kandidatnya lalu saring di sini, jangan tulis ulang di SQL.
      env.DB.prepare(`
        SELECT a.status, a.digantikan_oleh, a.signed_at, o.bertindak_sebagai, p.tujuan
          FROM agreements a
          JOIN owners o     ON o.id = a.owner_id
          JOIN properties p ON p.id = a.property_id
         WHERE a.status = 'signed' AND a.digantikan_oleh IS NULL
      `).all(),
    ]);

    const hasil = {
      tahap1_tertunda:   tertunda?.n ?? 0,
      perlu_konfigurasi: draft?.n ?? 0,
      link_kedaluwarsa:  kedaluwarsa?.n ?? 0,
      perlu_versi_perbaikan: (signed.results ?? []).filter(perluVersiPerbaikan).length,
    };
    return jsonOk({ ...hasil, total: Object.values(hasil).reduce((s, v) => s + v, 0) });
  } catch (err) {
    console.error('[admin titip-jual ringkasan]', err?.message);
    return jsonError('Gagal memuat ringkasan Titip Jual', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
