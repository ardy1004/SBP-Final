// GET /api/admin/titip-jual/tertunda — pemilik yang berhenti setelah Tahap 1:
// properti + nomor WA sudah tercatat, tapi data diri (Tahap 2) belum dilengkapi
// sehingga perjanjian belum ada. Tanpa daftar ini mereka tak terlihat di mana
// pun — listing-nya tampak seperti draft buatan admin.
// Tidak ada NIK di sini (memang belum ada).
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { SQL_TAHAP1_TERTUNDA } from '../../../_lib/titipJualAdmin.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const res = await env.DB.prepare(`
      SELECT p.id AS property_id, p.kode_listing, p.title, p.jenis_properti, p.tujuan,
             p.kecamatan, p.kabupaten, p.status_publish, p.created_at,
             o.id AS owner_id, o.no_wa_1, o.no_wa_2,
             (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) AS jumlah_foto
        FROM properties p
        JOIN owners o ON o.id = (SELECT MIN(id) FROM owners WHERE property_id = p.id)
       WHERE ${SQL_TAHAP1_TERTUNDA}
       ORDER BY p.created_at DESC
       LIMIT 200
    `).all();
    const pengajuan = res.results ?? [];
    return jsonOk({ pengajuan, total: pengajuan.length });
  } catch (err) {
    console.error('[admin titip-jual tertunda]', err?.message);
    return jsonError('Gagal memuat pengajuan tertunda', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
