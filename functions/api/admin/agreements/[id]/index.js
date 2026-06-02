// GET  /api/admin/agreements/:id — detail + NIK terdekripsi + foto
// PATCH /api/admin/agreements/:id — edit terbatas field kunci (owner + properti)
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { decryptNIK, encryptNIK } from '../../../../_lib/crypto.js';

function sanitize(val, max = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, max);
}

function normalizeWA(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('62')) return d;
  if (d.startsWith('0'))  return '62' + d.slice(1);
  if (d.startsWith('8'))  return '62' + d;
  return d;
}

function isValidWA(raw) {
  return /^628[0-9]{8,12}$/.test(normalizeWA(raw));
}

async function fetchAgreementById(db, id) {
  return db.prepare(`
    SELECT
      a.id, a.kode_perjanjian, a.property_id, a.owner_id,
      a.jenis_transaksi, a.jenis_listing, a.durasi_kontrak, a.fee_persen,
      a.status, a.sign_token, a.token_expires_at, a.token_used,
      a.signed_at, a.pdf_url, a.link_opened_count, a.created_at, a.updated_at,
      o.id           AS o_id,
      o.nama_pemilik, o.nik_encrypted, o.nama_ktp, o.alamat_ktp,
      o.rt_rw,
      o.kelurahan    AS owner_kelurahan,
      o.kecamatan    AS owner_kecamatan,
      o.bertindak_sebagai, o.no_wa_1, o.no_wa_2, o.data_ahli_waris,
      p.id           AS p_id,
      p.kode_listing, p.title, p.slug, p.jenis_properti, p.tujuan,
      p.harga, p.nego, p.nett,
      p.provinsi, p.kabupaten, p.kecamatan, p.kelurahan, p.alamat,
      p.luas_tanah, p.luas_bangunan, p.lebar_depan, p.lantai,
      p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
      p.legalitas, p.status_legalitas,
      p.deskripsi, p.info_tambahan,
      p.gmaps_link, p.lebar_jalan_m, p.details,
      p.status_publish
    FROM agreements a
    JOIN owners     o ON o.id = a.owner_id
    JOIN properties p ON p.id = a.property_id
    WHERE a.id = ?
  `).bind(id).first();
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/agreements/:id
// ═══════════════════════════════════════════════════════════════════
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  const agr = await fetchAgreementById(env.DB, id);
  if (!agr) return jsonError('Agreement tidak ditemukan', 404);

  // Admin authorized to see NIK
  let nik = null;
  if (agr.nik_encrypted && env.NIK_ENC_KEY) {
    try { nik = await decryptNIK(agr.nik_encrypted, env.NIK_ENC_KEY); }
    catch (err) { console.error('[admin agreement GET] Dekripsi NIK gagal:', err.message); }
  }

  const photosRes = await env.DB.prepare(
    'SELECT id, url_webp, alt_text, urutan, is_cover FROM property_images WHERE property_id = ? ORDER BY urutan ASC'
  ).bind(agr.property_id).all();

  return jsonOk({
    id: agr.id,
    kode_perjanjian: agr.kode_perjanjian,
    status: agr.status,
    jenis_transaksi: agr.jenis_transaksi,
    jenis_listing: agr.jenis_listing,
    durasi_kontrak: agr.durasi_kontrak,
    fee_persen: agr.fee_persen,
    sign_token: agr.sign_token,
    token_expires_at: agr.token_expires_at,
    token_used: agr.token_used,
    signed_at: agr.signed_at,
    pdf_url: agr.pdf_url,
    link_opened_count: agr.link_opened_count,
    created_at: agr.created_at,
    owner: {
      id: agr.o_id,
      nama_pemilik: agr.nama_pemilik,
      nik,
      nama_ktp: agr.nama_ktp,
      alamat_ktp: agr.alamat_ktp,
      rt_rw: agr.rt_rw,
      kelurahan: agr.owner_kelurahan,
      kecamatan: agr.owner_kecamatan,
      bertindak_sebagai: agr.bertindak_sebagai,
      no_wa_1: agr.no_wa_1,
      no_wa_2: agr.no_wa_2,
      data_ahli_waris: agr.data_ahli_waris,
    },
    properti: {
      id: agr.p_id,
      kode_listing: agr.kode_listing,
      title: agr.title,
      slug: agr.slug,
      jenis_properti: agr.jenis_properti,
      tujuan: agr.tujuan,
      harga: agr.harga,
      nego: agr.nego,
      nett: agr.nett,
      provinsi: agr.provinsi,
      kabupaten: agr.kabupaten,
      kecamatan: agr.kecamatan,
      kelurahan: agr.kelurahan,
      alamat: agr.alamat,
      luas_tanah: agr.luas_tanah,
      luas_bangunan: agr.luas_bangunan,
      lebar_depan: agr.lebar_depan,
      lantai: agr.lantai,
      jumlah_kamar_tidur: agr.jumlah_kamar_tidur,
      jumlah_kamar_mandi: agr.jumlah_kamar_mandi,
      legalitas: agr.legalitas,
      status_legalitas: agr.status_legalitas,
      deskripsi: agr.deskripsi,
      gmaps_link: agr.gmaps_link,
      lebar_jalan_m: agr.lebar_jalan_m,
      details: agr.details,
      status_publish: agr.status_publish,
    },
    foto: photosRes.results ?? [],
  });
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/admin/agreements/:id — edit terbatas
// ═══════════════════════════════════════════════════════════════════
export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const agr = await env.DB.prepare(
    'SELECT id, status, owner_id, property_id FROM agreements WHERE id = ?'
  ).bind(id).first();

  if (!agr) return jsonError('Agreement tidak ditemukan', 404);
  if (!['draft', 'menunggu_ttd'].includes(agr.status)) {
    return jsonError('Agreement yang sudah signed tidak dapat diedit', 409);
  }

  const errors = {};
  const ownerPairs = []; // { col, val }
  const propPairs  = [];
  let nikRaw = null;

  // ─── Owner fields ─────────────────────────────────────────────────
  if (body.nama_pemilik !== undefined) {
    const v = sanitize(body.nama_pemilik, 100);
    if (!v) errors.nama_pemilik = 'Nama pemilik tidak boleh kosong';
    else ownerPairs.push({ col: 'nama_pemilik', val: v });
  }

  if (body.nik !== undefined) {
    const v = sanitize(body.nik, 20);
    if (!v)              errors.nik = 'NIK tidak boleh kosong';
    else if (!/^\d{16}$/.test(v)) errors.nik = 'NIK harus 16 digit angka';
    else nikRaw = v;
  }

  if (body.alamat_ktp !== undefined) {
    const v = sanitize(body.alamat_ktp, 300);
    if (!v) errors.alamat_ktp = 'Alamat KTP tidak boleh kosong';
    else ownerPairs.push({ col: 'alamat_ktp', val: v });
  }

  if (body.no_wa !== undefined) {
    const v = sanitize(body.no_wa, 20);
    if (!v)          errors.no_wa = 'Nomor WA tidak boleh kosong';
    else if (!isValidWA(v)) errors.no_wa = 'Nomor WA tidak valid';
    else ownerPairs.push({ col: 'no_wa_1', val: normalizeWA(v) });
  }

  // ─── Property fields ──────────────────────────────────────────────
  if (body.jenis_properti !== undefined) {
    const VALID = ['rumah','tanah','kost','hotel','homestay','villa','apartment','gudang','komersial'];
    const v = sanitize(body.jenis_properti, 30);
    if (!VALID.includes(v)) errors.jenis_properti = 'jenis_properti tidak valid';
    else propPairs.push({ col: 'jenis_properti', val: v });
  }

  if (body.harga !== undefined && body.harga !== null) {
    const v = parseInt(String(body.harga), 10);
    if (!Number.isInteger(v) || v <= 0) errors.harga = 'Harga harus angka positif';
    else propPairs.push({ col: 'harga', val: v });
  }

  if (body.nego !== undefined) propPairs.push({ col: 'nego', val: body.nego ? 1 : 0 });
  if (body.nett !== undefined) propPairs.push({ col: 'nett', val: body.nett ? 1 : 0 });

  if (body.kecamatan !== undefined) {
    const v = sanitize(body.kecamatan, 100);
    if (v) propPairs.push({ col: 'kecamatan', val: v });
  }

  if (body.kabupaten !== undefined) {
    const v = sanitize(body.kabupaten, 100);
    if (v) propPairs.push({ col: 'kabupaten', val: v });
  }

  if (Object.keys(errors).length > 0) return jsonError('Validasi gagal', 422, errors);

  // ─── Encrypt NIK jika diubah ──────────────────────────────────────
  if (nikRaw) {
    if (!env.NIK_ENC_KEY) return jsonError('NIK_ENC_KEY tidak terkonfigurasi', 503);
    try {
      const encrypted = await encryptNIK(nikRaw, env.NIK_ENC_KEY);
      ownerPairs.push({ col: 'nik_encrypted', val: encrypted });
    } catch (err) {
      console.error('[admin patch] Enkripsi NIK gagal:', err.message);
      return jsonError('Gagal memproses NIK', 500);
    }
  }

  if (ownerPairs.length === 0 && propPairs.length === 0) {
    return jsonError('Tidak ada field yang dikirim untuk diupdate', 400);
  }

  // ─── Build & run SQL ──────────────────────────────────────────────
  try {
    if (ownerPairs.length > 0) {
      const setClauses = ownerPairs.map(p => `${p.col} = ?`).join(', ');
      const vals = ownerPairs.map(p => p.val);
      await env.DB.prepare(
        `UPDATE owners SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(...vals, agr.owner_id).run();
    }

    if (propPairs.length > 0) {
      const setClauses = propPairs.map(p => `${p.col} = ?`).join(', ');
      const vals = propPairs.map(p => p.val);
      await env.DB.prepare(
        `UPDATE properties SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(...vals, agr.property_id).run();
    }

    await env.DB.prepare(
      'UPDATE agreements SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run();

  } catch (err) {
    console.error('[admin patch] UPDATE error:', err.message);
    return jsonError('Gagal menyimpan perubahan', 500);
  }

  // Return refreshed data
  const updated = await fetchAgreementById(env.DB, id);
  let nik = null;
  if (updated?.nik_encrypted && env.NIK_ENC_KEY) {
    try { nik = await decryptNIK(updated.nik_encrypted, env.NIK_ENC_KEY); }
    catch {}
  }

  return jsonOk({
    pesan: 'Data berhasil diperbarui',
    owner: {
      nama_pemilik: updated?.nama_pemilik,
      nik,
      alamat_ktp: updated?.alamat_ktp,
      no_wa_1: updated?.no_wa_1,
    },
    properti: {
      jenis_properti: updated?.jenis_properti,
      harga: updated?.harga,
      nego: updated?.nego,
      nett: updated?.nett,
      kecamatan: updated?.kecamatan,
      kabupaten: updated?.kabupaten,
    },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
