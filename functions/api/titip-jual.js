import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { encryptNIK } from '../_lib/crypto.js';

// ─── Sanitasi ─────────────────────────────────────────────────────────────────
function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

// ─── Normalisasi & validasi nomor WA ─────────────────────────────────────────
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

// ─── Slugify judul properti ───────────────────────────────────────────────────
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Generate kode referensi ──────────────────────────────────────────────────
function today8() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function nextSeq(db, table, kodeCol, prefix) {
  const like = `${prefix}%`;
  const row = await db
    .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${kodeCol} LIKE ?`)
    .bind(like)
    .first();
  return String((row?.cnt ?? 0) + 1).padStart(3, '0');
}

// ─── Deriving jenis_transaksi dari tujuan ────────────────────────────────────
function jenisTransaksi(tujuan) {
  if (tujuan === 'disewa') return 'sewa';
  return 'jual'; // dijual / dijual_disewa → jual
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Body JSON tidak valid', 400);
  }

  // ─── Validasi field owner ─────────────────────────────────────────────────
  const errors = {};

  const nama_pemilik  = sanitize(body.nama_pemilik ?? '', 100);
  const nik_raw       = sanitize(body.nik ?? '', 20);
  const nama_ktp      = sanitize(body.nama_ktp ?? '', 100);
  const alamat_ktp    = sanitize(body.alamat_ktp ?? '', 300);
  const rt_rw         = sanitize(body.rt_rw ?? '', 10);
  const kelurahan_owner = sanitize(body.kelurahan ?? '', 100);
  const kecamatan_owner = sanitize(body.kecamatan ?? '', 100);
  const bertindak     = sanitize(body.bertindak_sebagai ?? '', 30);
  const no_wa_raw     = sanitize(body.no_wa ?? '', 20);
  const no_wa_2_raw   = sanitize(body.no_wa_2 ?? '', 20);

  if (!nama_pemilik) errors.nama_pemilik = 'Nama pemilik wajib diisi';
  if (!nik_raw) {
    errors.nik = 'NIK wajib diisi';
  } else if (!/^\d{16}$/.test(nik_raw)) {
    errors.nik = 'NIK harus 16 digit angka';
  }
  if (!nama_ktp) errors.nama_ktp = 'Nama sesuai KTP wajib diisi';
  if (!alamat_ktp) errors.alamat_ktp = 'Alamat KTP wajib diisi';
  if (!kelurahan_owner) errors.kelurahan = 'Kelurahan wajib diisi';
  if (!kecamatan_owner) errors.kecamatan = 'Kecamatan wajib diisi';

  const BERTINDAK_VALID = ['owner_sah', 'pasangan', 'ahli_waris', 'lainnya'];
  if (!BERTINDAK_VALID.includes(bertindak)) {
    errors.bertindak_sebagai = 'bertindak_sebagai harus salah satu dari: ' + BERTINDAK_VALID.join(', ');
  }

  if (!no_wa_raw) {
    errors.no_wa = 'Nomor WhatsApp pemilik wajib diisi';
  } else if (!isValidWA(no_wa_raw)) {
    errors.no_wa = 'Nomor WhatsApp tidak valid (format: 08xx atau +628xx)';
  }
  if (no_wa_2_raw && !isValidWA(no_wa_2_raw)) {
    errors.no_wa_2 = 'Nomor WA kedua tidak valid';
  }

  // ─── Validasi field properti ──────────────────────────────────────────────
  const title_raw    = sanitize(body.title ?? '', 200);
  const jenis_properti = sanitize(body.jenis_properti ?? '', 30);
  const tujuan       = sanitize(body.tujuan ?? '', 20);
  const harga_raw    = body.harga;

  const JENIS_VALID = ['rumah','tanah','kost','hotel','homestay','villa','apartment','gudang','komersial'];
  const TUJUAN_VALID = ['dijual','disewa','dijual_disewa'];

  if (!jenis_properti || !JENIS_VALID.includes(jenis_properti)) {
    errors.jenis_properti = 'jenis_properti tidak valid (pilih: ' + JENIS_VALID.join(', ') + ')';
  }
  if (!tujuan || !TUJUAN_VALID.includes(tujuan)) {
    errors.tujuan = 'tujuan harus: dijual, disewa, atau dijual_disewa';
  }

  let harga = 0;
  if (harga_raw !== undefined && harga_raw !== null) {
    harga = parseInt(String(harga_raw), 10);
    if (!Number.isInteger(harga) || harga < 0) errors.harga = 'Harga harus angka positif';
  }

  if (Object.keys(errors).length > 0) {
    return jsonError('Validasi gagal', 422, errors);
  }

  // ─── Cek NIK_ENC_KEY tersedia ─────────────────────────────────────────────
  if (!env.NIK_ENC_KEY) {
    console.error('[titip-jual] NIK_ENC_KEY tidak terkonfigurasi');
    return jsonError('Konfigurasi server tidak lengkap', 503);
  }

  // ─── Field opsional properti ──────────────────────────────────────────────
  const provinsi       = sanitize(body.provinsi ?? 'DI Yogyakarta', 100);
  const kabupaten      = sanitize(body.kabupaten ?? '', 100);
  const kecamatan_prop = sanitize(body.kecamatan ?? '', 100);
  const kelurahan_prop = sanitize(body.kelurahan ?? '', 100);
  const alamat_prop    = sanitize(body.alamat ?? '', 500) || null;
  const luas_tanah     = parseInt(String(body.luas_tanah ?? ''), 10) || null;
  const luas_bangunan  = parseInt(String(body.luas_bangunan ?? ''), 10) || null;
  const kt             = parseInt(String(body.jumlah_kamar_tidur ?? ''), 10) || null;
  const km             = parseInt(String(body.jumlah_kamar_mandi ?? ''), 10) || null;
  const legalitas      = sanitize(body.legalitas ?? '', 100) || null;
  const deskripsi      = sanitize(body.deskripsi ?? '', 5000) || null;
  const gmaps_link     = sanitize(body.gmaps_link ?? '', 500) || null;

  const ahli_waris_raw = body.data_ahli_waris;
  let data_ahli_waris = null;
  if (ahli_waris_raw && typeof ahli_waris_raw === 'object') {
    data_ahli_waris = JSON.stringify(ahli_waris_raw);
  } else if (typeof ahli_waris_raw === 'string' && ahli_waris_raw.trim()) {
    data_ahli_waris = ahli_waris_raw.trim().slice(0, 2000);
  }

  const no_wa_1 = normalizeWA(no_wa_raw);
  const no_wa_2 = no_wa_2_raw ? normalizeWA(no_wa_2_raw) : null;

  // ─── Enkripsi NIK (spec K7) SEBELUM INSERT ───────────────────────────────
  let nik_encrypted;
  try {
    nik_encrypted = await encryptNIK(nik_raw, env.NIK_ENC_KEY);
  } catch (err) {
    console.error('[titip-jual] Enkripsi NIK gagal:', err.message);
    return jsonError('Gagal memproses data. Silakan coba lagi.', 500);
  }

  // ─── K6: simpan ke DB sebelum apa pun ─────────────────────────────────────
  const date8 = today8();

  // Generate kode_listing: SBP-{YYYYMMDD}-{seq}
  let kode_listing, slug, kode_perjanjian;
  try {
    const propSeq = await nextSeq(env.DB, 'properties', 'kode_listing', `SBP-${date8}-`);
    kode_listing = `SBP-${date8}-${propSeq}`;

    const title = title_raw || `${jenis_properti.charAt(0).toUpperCase() + jenis_properti.slice(1)} ${kecamatan_prop || kelurahan_owner}`;
    const baseSlug = slugify(title);
    // 6-char hex suffix to avoid collision
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    slug = `${baseSlug}-${suffix}`;

    const agrSeq = await nextSeq(env.DB, 'agreements', 'kode_perjanjian', `SBP-AGR-${date8}-`);
    kode_perjanjian = `SBP-AGR-${date8}-${agrSeq}`;
  } catch (err) {
    console.error('[titip-jual] Gagal generate kode:', err.message);
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  const titleFinal = title_raw || `${jenis_properti.charAt(0).toUpperCase() + jenis_properti.slice(1)} ${kecamatan_prop || kelurahan_owner}`;

  let property_id, owner_id, agreement_id;
  try {
    // [1/3] Insert properti sebagai draft
    const propResult = await env.DB.prepare(`
      INSERT INTO properties
        (kode_listing, title, slug, jenis_properti, tujuan, harga,
         provinsi, kabupaten, kecamatan, kelurahan, alamat,
         luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
         legalitas, deskripsi, gmaps_link,
         status_publish, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?,
         'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      kode_listing, titleFinal, slug, jenis_properti, tujuan, harga,
      provinsi, kabupaten, kecamatan_prop, kelurahan_prop, alamat_prop,
      luas_tanah, luas_bangunan, kt, km,
      legalitas, deskripsi, gmaps_link
    ).run();
    property_id = propResult.meta?.last_row_id;

    // [2/3] Insert owner dengan NIK terenkripsi
    const ownerResult = await env.DB.prepare(`
      INSERT INTO owners
        (nama_pemilik, no_wa_1, no_wa_2, gmaps,
         nik_encrypted, nama_ktp, alamat_ktp, rt_rw, kelurahan, kecamatan,
         bertindak_sebagai, data_ahli_waris,
         property_id, created_at, updated_at)
      VALUES
        (?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?,
         ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      nama_pemilik, no_wa_1, no_wa_2, gmaps_link,
      nik_encrypted, nama_ktp, alamat_ktp, rt_rw || null, kelurahan_owner, kecamatan_owner,
      bertindak, data_ahli_waris,
      property_id
    ).run();
    owner_id = ownerResult.meta?.last_row_id;

    // [3/3] Insert agreement dengan status draft
    const agrResult = await env.DB.prepare(`
      INSERT INTO agreements
        (kode_perjanjian, property_id, owner_id,
         jenis_transaksi, jenis_listing, fee_persen,
         status, created_at, updated_at)
      VALUES
        (?, ?, ?,
         ?, 'open', 3.0,
         'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      kode_perjanjian, property_id, owner_id,
      jenisTransaksi(tujuan)
    ).run();
    agreement_id = agrResult.meta?.last_row_id;
  } catch (err) {
    console.error('[titip-jual] INSERT error:', err.message);
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  return jsonOk({
    kode_perjanjian,
    kode_listing,
    property_id,
    owner_id,
    agreement_id,
    status: 'draft',
    pesan: 'Data berhasil diterima. Tim SBP akan menghubungi Anda untuk evaluasi dan negosiasi fee.',
  }, 201);
}

export async function onRequestOptions() {
  return handleOptions();
}
