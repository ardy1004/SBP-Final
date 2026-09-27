// GET /api/admin/agreements
// Returns list of agreements joined with owner + property info.
// No NIK returned. Optional filter: ?status=draft|menunggu_ttd|signed
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { perluVersiPerbaikan } from '../../../_lib/isiPerjanjian.js';

const VALID_STATUSES = new Set(['draft', 'opsi_dikonfigurasi', 'menunggu_ttd', 'signed', 'expired']);

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? '';

  let sql = `
    SELECT
      a.id,
      a.kode_perjanjian,
      a.status,
      a.jenis_listing,
      a.jenis_transaksi,
      a.fee_persen,
      a.created_at,
      a.signed_at,
      a.digantikan_oleh,
      o.nama_pemilik,
      o.bertindak_sebagai,
      p.tujuan,
      p.jenis_properti,
      p.kecamatan,
      p.kabupaten,
      p.harga
    FROM agreements a
    JOIN owners     o ON o.id = a.owner_id
    JOIN properties p ON p.id = a.property_id
  `;

  const bindings = [];
  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    sql += ' WHERE a.status = ?';
    bindings.push(statusFilter);
  }

  sql += ' ORDER BY a.created_at DESC LIMIT 500';

  try {
    const stmt = env.DB.prepare(sql);
    const result = bindings.length > 0
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    const agreements = (result.results ?? []).map(a => ({
      ...a,
      perlu_versi_perbaikan: perluVersiPerbaikan(a),
    }));
    return jsonOk({ agreements, total: agreements.length });
  } catch (err) {
    console.error('[admin agreements list]', err.message);
    return jsonError('Gagal mengambil data', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
