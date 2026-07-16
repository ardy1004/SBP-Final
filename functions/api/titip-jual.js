import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { encryptNIK } from '../_lib/crypto.js';
import { stripExif } from '../_lib/exif.js';
import { generateMetaSeo } from '../_lib/metaSeo.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { normalizeWA, isValidWA } from '../_lib/waUtils.js';
import { parseGmapsCoords } from '../_lib/parseGmapsCoords.js';

function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function today8() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function nextSeq(db, table, kodeCol, prefix) {
  const row = await db
    .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${kodeCol} LIKE ?`)
    .bind(`${prefix}%`).first();
  return String((row?.cnt ?? 0) + 1).padStart(3, '0');
}

function jenisTransaksi(tujuan) {
  return tujuan === 'disewa' ? 'sewa' : 'jual';
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  // ─── Anti-bot: verifikasi Turnstile sebelum proses berat (3 INSERT + upload R2) ──
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? null;
  const captcha = await verifyTurnstile(body.cf_turnstile_token, env.TURNSTILE_SECRET, ip);
  if (!captcha.ok) {
    return jsonError('Verifikasi anti-bot gagal. Silakan muat ulang halaman dan coba lagi.', 403);
  }

  const errors = {};

  // ─── Owner fields ─────────────────────────────────────────────────────────
  const nama_pemilik    = sanitize(body.nama_pemilik ?? '', 100);
  const nama_ktp        = sanitize(body.nama_ktp ?? body.nama_pemilik ?? '', 100);
  const nik_raw         = sanitize(body.nik ?? '', 20);
  const alamat_ktp      = sanitize(body.alamat_ktp ?? '', 300);
  const rt_rw           = sanitize(body.rt_rw ?? '', 10);
  // kelurahan_owner / kecamatan_owner = KTP address (step 1); fall back to legacy body.kelurahan
  const kelurahan_owner = sanitize(body.kelurahan_owner ?? body.kelurahan ?? '', 100);
  const kecamatan_owner = sanitize(body.kecamatan_owner ?? body.kecamatan ?? '', 100);
  const bertindak       = sanitize(body.bertindak_sebagai ?? '', 30);
  const no_wa_raw       = sanitize(body.no_wa ?? '', 20);
  const no_wa_2_raw     = sanitize(body.no_wa_2 ?? '', 20);
  const gmaps_link      = sanitize(body.gmaps_link ?? '', 500) || null;
  if (!gmaps_link) errors.gmaps_link = 'Link Google Maps wajib diisi';

  let data_ahli_waris = null;
  if (body.data_ahli_waris && typeof body.data_ahli_waris === 'object') {
    data_ahli_waris = JSON.stringify(body.data_ahli_waris);
  } else if (typeof body.data_ahli_waris === 'string' && body.data_ahli_waris.trim()) {
    data_ahli_waris = body.data_ahli_waris.trim().slice(0, 2000);
  }

  if (!nik_raw) { errors.nik = 'NIK wajib diisi'; }
  else if (!/^\d{16}$/.test(nik_raw)) { errors.nik = 'NIK harus 16 digit angka'; }
  if (!nama_ktp) errors.nama_ktp = 'Nama KTP wajib diisi';
  if (!alamat_ktp) errors.alamat_ktp = 'Alamat KTP wajib diisi';
  if (!kelurahan_owner) errors.kelurahan = 'Kelurahan wajib diisi';
  if (!kecamatan_owner) errors.kecamatan = 'Kecamatan wajib diisi';

  const BERTINDAK_VALID = ['pemilik_sertifikat', 'suami_istri', 'ahli_waris', 'lainnya'];
  if (!BERTINDAK_VALID.includes(bertindak)) {
    errors.bertindak_sebagai = 'bertindak_sebagai harus: ' + BERTINDAK_VALID.join(', ');
  }
  if (!no_wa_raw) { errors.no_wa = 'Nomor WhatsApp wajib diisi'; }
  else if (!isValidWA(no_wa_raw)) { errors.no_wa = 'Nomor WhatsApp tidak valid'; }
  if (no_wa_2_raw && !isValidWA(no_wa_2_raw)) errors.no_wa_2 = 'Nomor WA kedua tidak valid';

  // ─── Property fields ──────────────────────────────────────────────────────
  const title_raw      = sanitize(body.title ?? '', 200);
  const jenis_properti = sanitize(body.jenis_properti ?? '', 30);
  const tujuan         = sanitize(body.tujuan ?? '', 20);

  const JENIS_VALID = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
  const TUJUAN_VALID = ['dijual','disewa','dijual_disewa'];
  if (!JENIS_VALID.includes(jenis_properti)) errors.jenis_properti = 'jenis_properti tidak valid';
  if (!TUJUAN_VALID.includes(tujuan)) errors.tujuan = 'tujuan harus: dijual, disewa, atau dijual_disewa';

  let harga = 0;
  if (tujuan === 'disewa') {
    // Kolom `harga` = harga jual, tidak relevan untuk tujuan sewa murni — abaikan body.harga apa pun isinya
    harga = 0;
  } else if (body.harga != null) {
    harga = parseInt(String(body.harga), 10);
    if (!Number.isInteger(harga) || harga < 0) errors.harga = 'Harga harus angka positif';
  }

  let harga_sewa_tahun = null;
  if (tujuan === 'disewa' || tujuan === 'dijual_disewa') {
    harga_sewa_tahun = parseInt(String(body.harga_sewa_tahun), 10);
    if (!Number.isInteger(harga_sewa_tahun) || harga_sewa_tahun <= 0) {
      errors.harga_sewa_tahun = 'Harga sewa/tahun wajib diisi untuk tujuan Disewakan atau Dijual & Disewakan';
    }
  }

  // ─── Foto validation ──────────────────────────────────────────────────────
  const photos_raw = Array.isArray(body.photos) ? body.photos : [];
  if (photos_raw.length === 0) {
    errors.photos = 'Minimal 1 foto properti wajib diupload';
  } else if (photos_raw.length > 20) {
    errors.photos = `Terlalu banyak foto (maks 20)`;
  } else {
    for (let i = 0; i < photos_raw.length; i++) {
      const p = photos_raw[i];
      if (typeof p !== 'string') { errors.photos = `Foto #${i + 1}: format tidak valid`; break; }
      if (!p.match(/^data:image\/(jpeg|jpg|webp|png);base64,/i)) {
        errors.photos = `Foto #${i + 1}: Format foto tidak valid`; break;
      }
      const sizeEst = Math.ceil(p.slice(p.indexOf(',') + 1).length * 3 / 4);
      if (sizeEst > 8 * 1024 * 1024) { errors.photos = `Foto #${i + 1}: ukuran melebihi 8MB`; break; }
    }
  }

  if (Object.keys(errors).length > 0) return jsonError('Validasi gagal', 422, errors);

  if (!env.NIK_ENC_KEY) {
    console.error('[titip-jual] NIK_ENC_KEY tidak terkonfigurasi');
    return jsonError('Konfigurasi server tidak lengkap', 503);
  }

  // ─── Optional property fields ─────────────────────────────────────────────
  const provinsi       = sanitize(body.provinsi ?? 'DI Yogyakarta', 100);
  const kabupaten      = sanitize(body.kabupaten ?? '', 100);
  // kecamatan_prop / kelurahan_prop = property location (step 2 cascade)
  const kecamatan_prop = sanitize(body.kecamatan_prop ?? '', 100);
  const kelurahan_prop = sanitize(body.kelurahan_prop ?? '', 100);
  const alamat_prop    = sanitize(body.alamat ?? '', 500) || null;
  const luas_tanah     = parseInt(body.luas_tanah, 10) || null;
  const luas_bangunan  = parseInt(body.luas_bangunan, 10) || null;
  const kt             = parseInt(body.jumlah_kamar_tidur, 10) || null;
  const km             = parseInt(body.jumlah_kamar_mandi, 10) || null;
  const lebar_depan    = parseFloat(body.lebar_depan) || null;
  const lantai         = parseInt(body.lantai, 10) || null;
  const lebar_jalan_m  = parseFloat(body.lebar_jalan_m) || null;
  const legalitas      = sanitize(body.legalitas ?? '', 100) || null;
  const deskripsi      = sanitize(body.deskripsi ?? '', 5000) || null;
  const info_tambahan  = sanitize(body.info_tambahan ?? '', 2000) || null;
  const alasan_dijual  = sanitize(body.alasan_dijual ?? '', 1000) || null;
  const nego           = body.nego ? 1 : 0;
  const nett           = body.nett ? 1 : 0;

  const STATUS_LEG_VALID = ['on_hand', 'on_bank'];
  const status_legalitas = STATUS_LEG_VALID.includes(body.status_legalitas) ? body.status_legalitas : 'on_hand';
  const bank_agunan      = status_legalitas === 'on_bank' ? sanitize(body.bank_agunan ?? '', 100) || null : null;
  const outstanding_bank = status_legalitas === 'on_bank' ? parseInt(body.outstanding_bank, 10) || null : null;

  const income_per_bulan      = parseInt(body.income_per_bulan, 10) || null;
  const pengeluaran_per_bulan = parseInt(body.pengeluaran_per_bulan, 10) || null;
  const harga_sewa_kamar_bulan = parseInt(body.harga_sewa_kamar_bulan, 10) || null;

  // details JSON: jenis-specific + lingkungan
  const LINGKUNGAN_VALID = ['jauh_dari_semuanya', 'dekat_sungai', 'dekat_makam', 'dekat_sutet'];
  const detailsObj = typeof body.details === 'object' && body.details !== null ? { ...body.details } : {};
  if (body.lingkungan && LINGKUNGAN_VALID.includes(body.lingkungan)) {
    detailsObj.lingkungan = body.lingkungan;
  }
  const details = Object.keys(detailsObj).length > 0 ? JSON.stringify(detailsObj) : null;
  const VALID_FURNISHED = ['fully', 'semi', 'unfurnished'];
  const furnished = VALID_FURNISHED.includes(detailsObj.kelengkapan) ? detailsObj.kelengkapan : null;

  const no_wa_1 = normalizeWA(no_wa_raw);
  const no_wa_2 = no_wa_2_raw ? normalizeWA(no_wa_2_raw) : null;

  // Auto-ekstrak koordinat dari link Maps (sama seperti PATCH admin) — sebelumnya
  // titip-jual TIDAK pernah memanggil ini, jadi latitude/longitude tetap NULL
  // sampai admin buka & simpan ulang properti secara manual.
  const geo = await parseGmapsCoords(gmaps_link);

  // ─── Enkripsi NIK ────────────────────────────────────────────────────────
  let nik_encrypted;
  try { nik_encrypted = await encryptNIK(nik_raw, env.NIK_ENC_KEY); }
  catch (err) {
    console.error('[titip-jual] Enkripsi NIK gagal:', err.message);
    return jsonError('Gagal memproses data. Silakan coba lagi.', 500);
  }

  // ─── Generate kode ────────────────────────────────────────────────────────
  const date8 = today8();
  let kode_listing, slug, kode_perjanjian;
  try {
    const propSeq = await nextSeq(env.DB, 'properties', 'kode_listing', `SBP-${date8}-`);
    kode_listing = `SBP-${date8}-${propSeq}`;

    const title = title_raw || `${jenis_properti.charAt(0).toUpperCase() + jenis_properti.slice(1)} ${kecamatan_prop || kelurahan_owner}`;
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    slug = `${slugify(title)}-${suffix}`;

    const agrSeq = await nextSeq(env.DB, 'agreements', 'kode_perjanjian', `SBP-AGR-${date8}-`);
    kode_perjanjian = `SBP-AGR-${date8}-${agrSeq}`;
  } catch (err) {
    console.error('[titip-jual] Gagal generate kode:', err.message);
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  const titleFinal = title_raw || `${jenis_properti.charAt(0).toUpperCase() + jenis_properti.slice(1)} ${kecamatan_prop || kelurahan_owner}`;

  const meta = generateMetaSeo({
    jenis_properti, tujuan,
    // Kolom `harga` = 0 untuk tujuan disewa murni — pakai harga_sewa_tahun supaya meta title/description tidak jatuh ke "Harga Nego"
    harga: tujuan === 'disewa' ? harga_sewa_tahun : harga,
    kecamatan: kecamatan_prop || kecamatan_owner,
    kabupaten, luas_tanah, luas_bangunan, nego,
  });

  // ─── K6: INSERT ke DB ─────────────────────────────────────────────────────
  let property_id, owner_id, agreement_id;
  try {
    const propResult = await env.DB.prepare(`
      INSERT INTO properties
        (kode_listing, title, slug, jenis_properti, tujuan, harga, harga_sewa_tahun,
         nego, nett,
         provinsi, kabupaten, kecamatan, kelurahan, alamat,
         luas_tanah, luas_bangunan, lebar_depan, lantai,
         jumlah_kamar_tidur, jumlah_kamar_mandi,
         legalitas, status_legalitas, bank_agunan, outstanding_bank,
         deskripsi, info_tambahan, alasan_dijual,
         gmaps_link, latitude, longitude, lebar_jalan_m,
         income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
         details, furnished,
         meta_title, meta_description,
         status_publish, created_at, updated_at)
      VALUES
        (?,?,?,?,?,?,?,
         ?,?,
         ?,?,?,?,?,
         ?,?,?,?,
         ?,?,
         ?,?,?,?,
         ?,?,?,
         ?,?,?,?,
         ?,?,?,
         ?,?,
         ?,?,
         'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(
      kode_listing, titleFinal, slug, jenis_properti, tujuan, harga, harga_sewa_tahun,
      nego, nett,
      provinsi, kabupaten, kecamatan_prop, kelurahan_prop, alamat_prop,
      luas_tanah, luas_bangunan, lebar_depan, lantai,
      kt, km,
      legalitas, status_legalitas, bank_agunan, outstanding_bank,
      deskripsi, info_tambahan, alasan_dijual,
      gmaps_link, geo.latitude, geo.longitude, lebar_jalan_m,
      income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
      details, furnished,
      meta.meta_title, meta.meta_description
    ).run();
    property_id = propResult.meta?.last_row_id;

    const ownerResult = await env.DB.prepare(`
      INSERT INTO owners
        (nama_pemilik, no_wa_1, no_wa_2, gmaps,
         nik_encrypted, nama_ktp, alamat_ktp, rt_rw, kelurahan, kecamatan,
         bertindak_sebagai, data_ahli_waris,
         property_id, created_at, updated_at)
      VALUES (?,?,?,?,  ?,?,?,?,?,?,  ?,?,  ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(
      nama_pemilik, no_wa_1, no_wa_2, gmaps_link,
      nik_encrypted, nama_ktp, alamat_ktp, rt_rw || null, kelurahan_owner, kecamatan_owner,
      bertindak, data_ahli_waris,
      property_id
    ).run();
    owner_id = ownerResult.meta?.last_row_id;

    const agrResult = await env.DB.prepare(`
      INSERT INTO agreements
        (kode_perjanjian, property_id, owner_id,
         jenis_transaksi, jenis_listing, fee_persen,
         status, created_at, updated_at)
      VALUES (?,?,?,  ?,'open',3.0,  'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(kode_perjanjian, property_id, owner_id, jenisTransaksi(tujuan)).run();
    agreement_id = agrResult.meta?.last_row_id;
  } catch (err) {
    console.error('[titip-jual] INSERT error:', err.message);
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  // ─── Upload foto ke R2 + insert property_images ───────────────────────────
  let photos_uploaded = 0;
  for (let i = 0; i < photos_raw.length; i++) {
    try {
      const p = photos_raw[i];
      const match = p.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
      const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
      const base64Data = p.slice(p.indexOf(',') + 1);
      const binaryStr = atob(base64Data);
      const rawBytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
      const bytes = stripExif(rawBytes);
      // WebP conversion dilakukan client-side di admin upload (G3b); titip-jual publik tetap JPEG-only
      const r2Key = `property-photos/${crypto.randomUUID()}.${ext}`;
      await env.MEDIA.put(r2Key, bytes.buffer, { httpMetadata: { contentType: `image/${ext}` } });
      await env.DB.prepare(`
        INSERT INTO property_images (property_id, url_webp, alt_text, urutan, is_cover)
        VALUES (?,?,?,?,?)
      `).bind(property_id, r2Key, titleFinal, i, i === 0 ? 1 : 0).run();
      photos_uploaded++;
    } catch (err) {
      console.error(`[titip-jual] Upload foto #${i + 1} gagal:`, err.message);
    }
  }

  const photos_failed = photos_raw.length - photos_uploaded;
  if (photos_failed > 0) {
    console.error(`[titip-jual] ${photos_failed}/${photos_raw.length} foto gagal upload untuk property_id=${property_id}`);
  }

  return jsonOk({
    kode_perjanjian,
    kode_listing,
    property_id,
    owner_id,
    agreement_id,
    photos_uploaded,
    photos_failed,
    // Beri tahu klien agar bisa menampilkan peringatan bila sebagian/seluruh foto gagal
    photos_warning: photos_failed > 0
      ? (photos_uploaded === 0
          ? 'Seluruh foto gagal diproses — tim SBP akan menghubungi Anda untuk melengkapi foto.'
          : `${photos_failed} dari ${photos_raw.length} foto gagal diproses.`)
      : null,
    status: 'draft',
    pesan: 'Data berhasil diterima. Tim SBP akan menghubungi Anda via WhatsApp untuk proses selanjutnya.',
  }, 201);
}

export async function onRequestOptions() {
  return handleOptions();
}
