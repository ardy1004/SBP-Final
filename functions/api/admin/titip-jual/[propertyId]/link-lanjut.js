// POST /api/admin/titip-jual/:propertyId/link-lanjut — terbitkan ulang link
// Tahap 2 (lengkapi data diri) untuk pemilik yang berhenti setelah Tahap 1.
//
// KENAPA ADA. tiket_lanjut hanya hidup di localStorage perangkat pemilik dan
// kedaluwarsa 7 hari. Begitu hilang (ganti HP, bersihkan browser, lewat 7 hari),
// satu-satunya jalan adalah mengisi ulang seluruh form — yang melahirkan listing
// GANDA. Pesan galat kita ("admin akan menghubungi Anda") tidak bisa ditepati
// karena admin tidak punya alat apa pun. Endpoint ini alatnya.
//
// Tiketnya BENTUK YANG SAMA dengan yang diterbitkan titip-jual-mulai.js (scope
// 'titipjual-lanjut', property_id, owner_id) sehingga titip-jual-lengkapi.js
// tidak berubah. `kode_listing` ikut di payload hanya untuk tampilan halaman.
//
// Link-nya /titip-jual?lanjut=<tiket>. Root loader TIDAK memuat Meta Pixel/GA4
// untuk URL itu (tanpaPelacak() di src/app/root.tsx), dan halaman membuang
// parameternya dari address bar begitu dibaca.
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { signJWT } from '../../../_shared/jwt.js';

// Sama dengan TIKET_LANJUT_DETIK di titip-jual-mulai.js.
const TIKET_LANJUT_DETIK = 7 * 24 * 3600;

export async function onRequestPost(context) {
  const { env, params } = context;
  const propertyId = parseInt(params.propertyId, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('ID properti tidak valid', 400);
  if (!env.JWT_SECRET) return jsonError('Konfigurasi server tidak lengkap', 503);

  const row = await env.DB.prepare(`
    SELECT p.id, p.kode_listing, p.submit_id,
           o.id AS owner_id, o.no_wa_1, o.nik_encrypted,
           EXISTS (SELECT 1 FROM agreements a WHERE a.property_id = p.id) AS ada_perjanjian
      FROM properties p
      JOIN owners o ON o.id = (SELECT MIN(id) FROM owners WHERE property_id = p.id)
     WHERE p.id = ?
  `).bind(propertyId).first();

  if (!row) return jsonError('Properti atau data pemilik tidak ditemukan', 404);
  if (!row.submit_id) return jsonError('Properti ini bukan pengajuan Titip Jual', 409);
  if (row.nik_encrypted || row.ada_perjanjian) {
    return jsonError('Pemilik sudah melengkapi data diri — perjanjiannya ada di daftar Titip Jual.', 409);
  }

  const now = Math.floor(Date.now() / 1000);
  const tiket = await signJWT({
    scope: 'titipjual-lanjut',
    property_id: row.id,
    owner_id: row.owner_id,
    kode_listing: row.kode_listing,
    iat: now,
    exp: now + TIKET_LANJUT_DETIK,
  }, env.JWT_SECRET);

  const url = `${env.APP_URL ?? 'https://salambumi.xyz'}/titip-jual?lanjut=${encodeURIComponent(tiket)}`;
  const pesan = `Halo, kami dari Salam Bumi Property. Untuk melanjutkan titip jual properti Anda (kode ${row.kode_listing}), silakan lengkapi data diri pemilik lewat link berikut (berlaku 7 hari): ${url}`;
  return jsonOk({
    url,
    wa_url: row.no_wa_1 ? `https://wa.me/${row.no_wa_1}?text=${encodeURIComponent(pesan)}` : null,
    berlaku_sampai: new Date((now + TIKET_LANJUT_DETIK) * 1000).toISOString(),
  });
}

export async function onRequestOptions() { return handleOptions(); }
