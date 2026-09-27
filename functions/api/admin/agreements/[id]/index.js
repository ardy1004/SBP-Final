// GET  /api/admin/agreements/:id — detail + NIK terdekripsi + foto
// PATCH /api/admin/agreements/:id — edit terbatas field kunci (owner + properti)
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { decryptNIK, encryptNIK } from '../../../../_lib/crypto.js';
import { normalisasiJenisIdentitas, validasiNomorIdentitas } from '../../../../_lib/identitas.js';
import { perluVersiPerbaikan, BERTINDAK_VALID } from '../../../../_lib/isiPerjanjian.js';
import { linkKedaluwarsa } from '../../../../_lib/titipJualAdmin.js';

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

/**
 * Catat akses nomor identitas (best-effort, lewat waitUntil). Gagal mencatat
 * tidak boleh menggagalkan permintaan admin — tapi WAJIB terlihat di log.
 */
function catatAksesIdentitas(env, adminId, agreementId, aksi) {
  if (!Number.isInteger(adminId)) return Promise.resolve();
  return env.DB.prepare('INSERT INTO log_akses_identitas (admin_id, agreement_id, aksi) VALUES (?, ?, ?)')
    .bind(adminId, agreementId, aksi).run()
    .catch(err => console.error('[admin agreement] catat akses identitas gagal:', err?.message));
}

async function fetchAgreementById(db, id) {
  return db.prepare(`
    SELECT
      a.id, a.kode_perjanjian, a.property_id, a.owner_id,
      a.jenis_transaksi, a.jenis_listing, a.durasi_kontrak, a.fee_persen,
      a.status, a.sign_token, a.token_expires_at, a.token_used,
      a.signed_at, a.pdf_url, a.link_opened_count, a.created_at, a.updated_at,
      a.digantikan_oleh,
      (SELECT kode_perjanjian FROM agreements x WHERE x.id = a.digantikan_oleh) AS digantikan_kode,
      (SELECT id FROM agreements x WHERE x.digantikan_oleh = a.id) AS menggantikan_id,
      (SELECT kode_perjanjian FROM agreements x WHERE x.digantikan_oleh = a.id) AS menggantikan_kode,
      o.id           AS o_id,
      o.nama_pemilik, o.nik_encrypted, o.nama_ktp, o.alamat_ktp,
      o.rt_rw,
      o.kelurahan    AS owner_kelurahan,
      o.kecamatan    AS owner_kecamatan,
      o.bertindak_sebagai, o.no_wa_1, o.no_wa_2, o.data_ahli_waris,
      o.jenis_identitas,
      p.id           AS p_id,
      p.kode_listing, p.title, p.slug, p.jenis_properti, p.tujuan,
      p.harga, p.harga_sewa_tahun, p.nego, p.nett,
      p.provinsi, p.kabupaten, p.kecamatan, p.kelurahan, p.alamat,
      p.luas_tanah, p.luas_bangunan, p.lebar_depan, p.lantai,
      p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
      p.legalitas, p.status_legalitas,
      p.deskripsi, p.info_tambahan,
      p.gmaps_link, p.lebar_jalan_m, p.details,
      p.status_publish, p.tanpa_captcha
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

  let agr, photosRes;
  try {
    agr = await fetchAgreementById(env.DB, id);
    if (!agr) return jsonError('Agreement tidak ditemukan', 404);

    photosRes = await env.DB.prepare(
      'SELECT id, url_webp, alt_text, urutan, is_cover FROM property_images WHERE property_id = ? ORDER BY urutan ASC'
    ).bind(agr.property_id).all();
  } catch (err) {
    console.error('[admin agreement GET] Query error:', err.message);
    return jsonError('Gagal memuat data agreement', 500);
  }

  // Admin authorized to see NIK
  let nik = null;
  if (agr.nik_encrypted && env.NIK_ENC_KEY) {
    try { nik = await decryptNIK(agr.nik_encrypted, env.NIK_ENC_KEY); }
    catch (err) { console.error('[admin agreement GET] Dekripsi NIK gagal:', err.message); }
  }

  // Jejak akses nomor identitas (migrasi 0056) — dicatat HANYA bila nomornya
  // benar-benar terdekripsi dan dikirim. Riwayat dibaca SEBELUM akses ini
  // tercatat, jadi daftarnya = akses-akses sebelumnya.
  const akses_terakhir = await env.DB.prepare(`
    SELECT l.aksi, l.created_at, COALESCE(ad.nama, ad.email, 'admin #' || l.admin_id) AS oleh
      FROM log_akses_identitas l LEFT JOIN admins ad ON ad.id = l.admin_id
     WHERE l.agreement_id = ? ORDER BY l.id DESC LIMIT 5
  `).bind(id).all().then(r => r.results ?? [], () => []);
  if (nik) context.waitUntil(catatAksesIdentitas(env, context.data?.admin?.sub, id, 'lihat'));

  return jsonOk({
    akses_terakhir,
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
    // Versi perbaikan (migrasi 0053) — lihat versi-perbaikan.js
    digantikan_oleh: agr.digantikan_oleh ?? null,
    digantikan_kode: agr.digantikan_kode ?? null,
    menggantikan_id: agr.menggantikan_id ?? null,
    menggantikan_kode: agr.menggantikan_kode ?? null,
    link_kedaluwarsa: linkKedaluwarsa(agr),
    perlu_versi_perbaikan: perluVersiPerbaikan({
      status: agr.status, digantikan_oleh: agr.digantikan_oleh, signed_at: agr.signed_at,
      bertindak_sebagai: agr.bertindak_sebagai, tujuan: agr.tujuan,
    }),
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
      jenis_identitas: normalisasiJenisIdentitas(agr.jenis_identitas),
    },
    properti: {
      id: agr.p_id,
      kode_listing: agr.kode_listing,
      title: agr.title,
      slug: agr.slug,
      jenis_properti: agr.jenis_properti,
      tujuan: agr.tujuan,
      harga: agr.harga,
      harga_sewa_tahun: agr.harga_sewa_tahun,
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
      tanpa_captcha: agr.tanpa_captcha === 1,
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

  let agr;
  try {
    agr = await env.DB.prepare(
      `SELECT a.id, a.status, a.owner_id, a.property_id, o.jenis_identitas, o.nik_encrypted
         FROM agreements a LEFT JOIN owners o ON o.id = a.owner_id WHERE a.id = ?`
    ).bind(id).first();
  } catch (err) {
    console.error('[admin patch] SELECT error:', err.message);
    return jsonError('Gagal memuat data agreement', 500);
  }

  if (!agr) return jsonError('Agreement tidak ditemukan', 404);
  if (!['draft', 'menunggu_ttd'].includes(agr.status)) {
    return jsonError('Agreement yang sudah signed tidak dapat diedit', 409);
  }

  // Data PROPERTI tidak lagi diedit dari sini. PATCH properti
  // (admin/properties/[id]) sudah menangani normalisasiHarga (harga per-m² tanah)
  // dan meta SEO; jalur lama di sini menulis `harga` mentah sehingga
  // harga_per_m2 & meta_title basi. Satu tempat edit = satu set aturan.
  const FIELD_PROPERTI = ['jenis_properti', 'harga', 'nego', 'nett', 'kecamatan', 'kabupaten'];
  if (FIELD_PROPERTI.some(k => body[k] !== undefined)) {
    return jsonError('Data properti diedit lewat halaman Properti (Admin → Properti), bukan dari halaman perjanjian.', 400);
  }

  const errors = {};
  const ownerPairs = []; // { col, val }
  let nikRaw = null;

  // ─── Owner fields ─────────────────────────────────────────────────
  if (body.nama_pemilik !== undefined) {
    const v = sanitize(body.nama_pemilik, 100);
    if (!v) errors.nama_pemilik = 'Nama pemilik tidak boleh kosong';
    else ownerPairs.push({ col: 'nama_pemilik', val: v });
  }

  // Kolom yang TERCETAK di kontrak (halaman /sign, PDF, hash audit). Dulu tidak
  // bisa diedit sama sekali — admin hanya bisa mengubah nama_pemilik, yang tidak
  // pernah tercetak di dokumen. Edit saat menunggu_ttd aman: pemilik yang sedang
  // membuka link akan diminta memuat ulang (versi_dokumen di sign/[token].js).
  const teksWajib = [
    ['nama_ktp', 100, 'Nama sesuai identitas tidak boleh kosong'],
    ['rt_rw', 10, 'RT/RW tidak boleh kosong'],
    ['kelurahan_owner', 100, 'Kelurahan tidak boleh kosong', 'kelurahan'],
    ['kecamatan_owner', 100, 'Kecamatan tidak boleh kosong', 'kecamatan'],
  ];
  for (const [kunci, maks, galat, kolom = kunci] of teksWajib) {
    if (body[kunci] === undefined) continue;
    const v = sanitize(body[kunci], maks);
    if (!v) errors[kunci] = galat;
    else ownerPairs.push({ col: kolom, val: v });
  }
  if (body.bertindak_sebagai !== undefined) {
    if (!BERTINDAK_VALID.includes(body.bertindak_sebagai)) errors.bertindak_sebagai = 'Pilihan "bertindak sebagai" tidak valid';
    else ownerPairs.push({ col: 'bertindak_sebagai', val: body.bertindak_sebagai });
  }

  // Jenis efektif = yang dikirim, atau yang tersimpan (UI admin lama tidak
  // mengirimnya). Nomor WAJIB divalidasi dengan jenis efektif: dulu selalu
  // /^\d{16}$/, dan karena UI selalu mengirim ulang nomornya, pemilik ber-SIM
  // 12/14 digit membuat SETIAP simpan — bahkan cuma ganti WA — ditolak 422.
  const jenisTersimpan = normalisasiJenisIdentitas(agr.jenis_identitas);
  const jenisBaru = body.jenis_identitas !== undefined
    ? normalisasiJenisIdentitas(body.jenis_identitas)
    : jenisTersimpan;
  if (jenisBaru !== jenisTersimpan) {
    // Nomor lama belum tentu sah untuk jenis baru (SIM 12 digit ≠ NIK).
    if (body.nik === undefined) errors.nik = 'Isi ulang nomor identitas saat mengganti jenisnya';
    ownerPairs.push({ col: 'jenis_identitas', val: jenisBaru });
  }

  if (body.nik !== undefined) {
    const v = sanitize(body.nik, 25).replace(/[\s-]/g, '');
    const galat = validasiNomorIdentitas(jenisBaru, v);
    if (galat) errors.nik = galat;
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

  if (Object.keys(errors).length > 0) return jsonError('Validasi gagal', 422, errors);

  // UI admin selalu mengirim ulang nomor yang sudah terisi. Nomor yang SAMA
  // dengan yang tersimpan bukan perubahan: jangan dienkripsi ulang dan jangan
  // dicatat sebagai 'ubah' di log akses.
  if (nikRaw && agr.nik_encrypted && env.NIK_ENC_KEY) {
    const lama = await decryptNIK(agr.nik_encrypted, env.NIK_ENC_KEY).catch(() => null);
    if (lama === nikRaw) nikRaw = null;
  }

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

  if (ownerPairs.length === 0) {
    return jsonError('Tidak ada field yang dikirim untuk diupdate', 400);
  }

  // ─── Build & run SQL (atomik: owner + penanda waktu perjanjian) ───
  // Nama kolom berasal dari daftar tetap di atas, bukan dari klien.
  try {
    const setClauses = ownerPairs.map(p => `${p.col} = ?`).join(', ');
    await env.DB.batch([
      env.DB.prepare(`UPDATE owners SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(...ownerPairs.map(p => p.val), agr.owner_id),
      env.DB.prepare('UPDATE agreements SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id),
    ]);
  } catch (err) {
    console.error('[admin patch] UPDATE error:', err.message);
    return jsonError('Gagal menyimpan perubahan', 500);
  }
  if (nikRaw) context.waitUntil(catatAksesIdentitas(env, context.data?.admin?.sub, id, 'ubah'));

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
      nama_ktp: updated?.nama_ktp,
      nik,
      alamat_ktp: updated?.alamat_ktp,
      rt_rw: updated?.rt_rw,
      kelurahan: updated?.owner_kelurahan,
      kecamatan: updated?.owner_kecamatan,
      bertindak_sebagai: updated?.bertindak_sebagai,
      no_wa_1: updated?.no_wa_1,
      jenis_identitas: normalisasiJenisIdentitas(updated?.jenis_identitas),
    },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
