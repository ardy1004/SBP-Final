import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { encryptNIK } from '../_lib/crypto.js';
import { stripExif } from '../_lib/exif.js';
import { generateMetaSeo } from '../_lib/metaSeo.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { normalizeWA, isValidWA } from '../_lib/waUtils.js';
import { parseGmapsCoords } from '../_lib/parseGmapsCoords.js';
import { nextKodeSeq, fmtSeq, isUniqueErr } from '../_lib/kodeSeq.js';
import { normalisasiHarga } from '../_lib/hargaTanah.js';
import { logServerError } from '../_lib/logError.js';

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


function jenisTransaksi(tujuan) {
  return tujuan === 'disewa' ? 'sewa' : 'jual';
}

/**
 * Cari submit yang sudah pernah tersimpan dengan submit_id yang sama.
 *
 * Endpoint ini menulis property+owner+agreement DULU, foto belakangan, dan
 * payload-nya bisa 8–11 MB. Kalau koneksi putus setelah request sampai server
 * tapi sebelum response diterima, klien menampilkan "Koneksi ke server gagal"
 * padahal datanya sudah aman — lalu user menekan Kirim lagi dan lahirlah
 * listing kedua. Lihat migrations/0042_titipjual_submit_id.sql.
 *
 * Sengaja fail-open (return null saat query error): lebih baik menanggung
 * risiko duplikat yang bisa dihapus admin daripada menolak submit yang asli.
 */
async function cariSubmitLama(db, submit_id) {
  try {
    const row = await db.prepare(`
      SELECT p.id AS property_id, p.kode_listing,
             (SELECT id              FROM owners     WHERE property_id = p.id ORDER BY id ASC LIMIT 1) AS owner_id,
             (SELECT id              FROM agreements WHERE property_id = p.id ORDER BY id ASC LIMIT 1) AS agreement_id,
             (SELECT kode_perjanjian FROM agreements WHERE property_id = p.id ORDER BY id ASC LIMIT 1) AS kode_perjanjian,
             (SELECT COUNT(*)        FROM property_images WHERE property_id = p.id)                    AS photos_uploaded
        FROM properties p
       WHERE p.submit_id = ?
    `).bind(submit_id).first();
    if (!row) return null;
    return {
      kode_perjanjian: row.kode_perjanjian,
      kode_listing:    row.kode_listing,
      property_id:     row.property_id,
      owner_id:        row.owner_id,
      agreement_id:    row.agreement_id,
      photos_uploaded: row.photos_uploaded,
      photos_failed:   0,
      photos_warning:  null,
      status:          'draft',
      duplikat:        true,
      pesan: 'Data properti Anda sudah kami terima sebelumnya. Tim SBP akan menghubungi Anda via WhatsApp.',
    };
  } catch (err) {
    console.error('[titip-jual] cek submit_id gagal:', err.message);
    return null;
  }
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
  const captcha = await verifyTurnstile(body.cf_turnstile_token, env.TURNSTILE_SECRET, ip, new URL(request.url).hostname);
  if (!captcha.ok) {
    // ⚠️ WAJIB DICATAT. Sampai audit 12 Agu 2026, penolakan 403 dan 422 tidak
    // meninggalkan jejak APA PUN — hanya error 500 yang memanggil logServerError.
    // Akibatnya komplain klien "upload gagal" mustahil direproduksi: error_logs
    // kosong, D1 kosong, dan dari sisi server semuanya tampak sehat. Jangan
    // hapus dua blok waitUntil ini demi "menghemat baris".
    context.waitUntil(logServerError(env, {
      message: `[titip-jual] Ditolak Turnstile (403): ${captcha.error ?? 'tanpa-alasan'}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'turnstile-403', reason: captcha.error ?? null, ada_token: Boolean(body.cf_turnstile_token) },
    }));
    return jsonError('Verifikasi anti-bot gagal. Silakan muat ulang halaman dan coba lagi.', 403);
  }

  const errors = {};

  // ─── Owner fields ─────────────────────────────────────────────────────────
  // Form publik hanya mengumpulkan SATU nama ("Nama Lengkap Sesuai KTP"), jadi
  // nama_pemilik jatuh ke nama_ktp — simetris dengan fallback di baris berikutnya.
  // ⚠️ JANGAN kembalikan syarat `body.nama_pemilik` yang berdiri sendiri: form
  // tidak punya field itu sejak d54f117 (8 Jun 2026) dan validasinya sudah
  // disinkronkan di 1a8e43b hari yang sama. Commit hardening f7bc909 (18 Jul)
  // menghidupkannya kembali tanpa mengembalikan field-nya → SELURUH submit gagal
  // 422 selama ±3 minggu (submit sukses terakhir SBP-20260716-003, 16 Jul).
  const nama_pemilik    = sanitize(body.nama_pemilik ?? body.nama_ktp ?? '', 100);
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
  if (!nama_pemilik) errors.nama_pemilik = 'Nama pemilik wajib diisi';
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

  // Luas tanah diparse DI SINI (bukan bersama field opsional lain di bawah)
  // karena normalisasiHarga() membutuhkannya, dan hasilnya bisa menambah error
  // yang harus ikut terkumpul sebelum pemeriksaan 422.
  const luas_tanah = parseInt(body.luas_tanah, 10) || null;

  // Harga total ↔ per-m² untuk tanah. Endpoint ini dulu SAMA SEKALI tidak
  // mengisi harga_per_m2/harga_mode, sehingga tanah dari Titip Jual selalu lahir
  // tanpa per-m² sampai admin membuka & menyimpannya manual — bug yang identik
  // dengan yang sudah diperbaiki di endpoint create admin (lihat komentar di
  // functions/api/admin/properties/index.js). Pakai helper bersama, JANGAN tulis
  // rumus sendiri: kontraknya kolom `harga` SELALU total rupiah.
  const hrg = normalisasiHarga({
    jenis_properti,
    luas_tanah,
    harga,
    harga_per_m2: body.harga_per_m2,
    harga_mode: body.harga_mode,
  });
  if (!hrg.ok) errors.harga = hrg.error;

  // ─── Foto validation ──────────────────────────────────────────────────────
  // Total dibatasi 40MB (decoded) — client sudah downscale ke 1920px WebP, jadi
  // normalnya jauh di bawah ini. Tanpa batas total, 20 × 8MB = ~213MB base64
  // melebihi limit body request Cloudflare dan request ditolak di edge tanpa
  // pesan yang ramah.
  const MAX_TOTAL_PHOTO_BYTES = 40 * 1024 * 1024;
  const photos_raw = Array.isArray(body.photos) ? body.photos : [];
  if (photos_raw.length === 0) {
    errors.photos = 'Minimal 1 foto properti wajib diupload';
  } else if (photos_raw.length > 20) {
    errors.photos = `Terlalu banyak foto (maks 20)`;
  } else {
    let totalEst = 0;
    for (let i = 0; i < photos_raw.length; i++) {
      const p = photos_raw[i];
      if (typeof p !== 'string') { errors.photos = `Foto #${i + 1}: format tidak valid`; break; }
      if (!p.match(/^data:image\/(jpeg|jpg|webp|png);base64,/i)) {
        errors.photos = `Foto #${i + 1}: Format foto tidak valid`; break;
      }
      const sizeEst = Math.ceil(p.slice(p.indexOf(',') + 1).length * 3 / 4);
      if (sizeEst > 8 * 1024 * 1024) { errors.photos = `Foto #${i + 1}: ukuran melebihi 8MB`; break; }
      totalEst += sizeEst;
      if (totalEst > MAX_TOTAL_PHOTO_BYTES) {
        errors.photos = 'Total ukuran seluruh foto melebihi 40MB — kecilkan resolusi atau kurangi jumlah foto';
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    // Hanya NAMA field yang dicatat, TIDAK PERNAH nilainya — error_logs tidak
    // terenkripsi dan isian di sini memuat NIK, nama, dan nomor WA.
    context.waitUntil(logServerError(env, {
      message: `[titip-jual] Validasi gagal (422): ${Object.keys(errors).join(', ')}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'validasi-422', fields: Object.keys(errors) },
    }));
    return jsonError('Validasi gagal', 422, errors);
  }

  if (!env.NIK_ENC_KEY) {
    console.error('[titip-jual] NIK_ENC_KEY tidak terkonfigurasi');
    return jsonError('Konfigurasi server tidak lengkap', 503);
  }

  // ─── Idempotensi ──────────────────────────────────────────────────────────
  // Diperiksa sedini mungkin: sesudah ini ada enkripsi NIK, fetch ke Google Maps,
  // dan 3 INSERT — semuanya percuma bila submit ini sebenarnya percobaan ulang.
  const submit_id = sanitize(body.submit_id ?? '', 40) || null;
  if (submit_id) {
    const lama = await cariSubmitLama(env.DB, submit_id);
    if (lama) return jsonOk(lama, 200);
  }

  // ─── Optional property fields ─────────────────────────────────────────────
  const provinsi       = sanitize(body.provinsi ?? 'DI Yogyakarta', 100);
  const kabupaten      = sanitize(body.kabupaten ?? '', 100);
  // kecamatan_prop / kelurahan_prop = property location (step 2 cascade)
  const kecamatan_prop = sanitize(body.kecamatan_prop ?? '', 100);
  const kelurahan_prop = sanitize(body.kelurahan_prop ?? '', 100);
  const alamat_prop    = sanitize(body.alamat ?? '', 500) || null;
  // luas_tanah sudah diparse lebih awal (dibutuhkan normalisasiHarga)
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
    context.waitUntil(logServerError(env, { message: `[titip-jual] Enkripsi NIK gagal: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal memproses data. Silakan coba lagi.', 500);
  }

  // ─── Generate kode ────────────────────────────────────────────────────────
  const date8 = today8();
  let propSeqN, agrSeqN, slug;
  try {
    propSeqN = await nextKodeSeq(env.DB, 'properties', 'kode_listing', `SBP-${date8}-`);
    agrSeqN  = await nextKodeSeq(env.DB, 'agreements', 'kode_perjanjian', `SBP-AGR-${date8}-`);

    const title = title_raw || `${jenis_properti.charAt(0).toUpperCase() + jenis_properti.slice(1)} ${kecamatan_prop || kelurahan_owner}`;
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    slug = `${slugify(title)}-${suffix}`;
  } catch (err) {
    console.error('[titip-jual] Gagal generate kode:', err.message);
    context.waitUntil(logServerError(env, { message: `[titip-jual] Gagal generate kode: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }
  let kode_listing   = `SBP-${date8}-${fmtSeq(propSeqN)}`;
  let kode_perjanjian = `SBP-AGR-${date8}-${fmtSeq(agrSeqN)}`;

  const titleFinal = title_raw || `${jenis_properti.charAt(0).toUpperCase() + jenis_properti.slice(1)} ${kecamatan_prop || kelurahan_owner}`;

  const meta = generateMetaSeo({
    jenis_properti, tujuan,
    // Kolom `harga` = 0 untuk tujuan disewa murni — pakai harga_sewa_tahun supaya meta title/description tidak jatuh ke "Harga Nego".
    // ⚠️ hrg.harga (TOTAL), bukan `harga` mentah: pada mode per-m² nilai mentahnya
    // harga per meter, sehingga meta SEO akan mengiklankan harga yang salah.
    harga: tujuan === 'disewa' ? harga_sewa_tahun : hrg.harga,
    kelurahan: kelurahan_prop || kelurahan_owner,
    kecamatan: kecamatan_prop || kecamatan_owner,
    kabupaten, luas_tanah, luas_bangunan, nego,
  });

  // ─── K6: INSERT ke DB ─────────────────────────────────────────────────────
  let property_id, owner_id, agreement_id;
  try {
    // Retry saat tabrakan UNIQUE kode_listing (dua submit paralel dapat sequence sama)
    const insertProperty = () => env.DB.prepare(`
      INSERT INTO properties
        (kode_listing, title, slug, jenis_properti, tujuan, harga, harga_per_m2, harga_mode, harga_sewa_tahun,
         nego, nett,
         provinsi, kabupaten, kecamatan, kelurahan, alamat,
         luas_tanah, luas_bangunan, lebar_depan, lantai,
         jumlah_kamar_tidur, jumlah_kamar_mandi,
         legalitas, status_legalitas, bank_agunan, outstanding_bank,
         deskripsi, info_tambahan, alasan_dijual,
         gmaps_link, latitude, longitude, lebar_jalan_m,
         income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
         details, furnished,
         meta_title, meta_description, submit_id,
         status_publish, created_at, updated_at)
      VALUES
        (?,?,?,?,?,?,?,?,?,
         ?,?,
         ?,?,?,?,?,
         ?,?,?,?,
         ?,?,
         ?,?,?,?,
         ?,?,?,
         ?,?,?,?,
         ?,?,?,
         ?,?,
         ?,?,?,
         'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(
      kode_listing, titleFinal, slug, jenis_properti, tujuan, hrg.harga, hrg.harga_per_m2, hrg.harga_mode, harga_sewa_tahun,
      nego, nett,
      provinsi, kabupaten, kecamatan_prop, kelurahan_prop, alamat_prop,
      luas_tanah, luas_bangunan, lebar_depan, lantai,
      kt, km,
      legalitas, status_legalitas, bank_agunan, outstanding_bank,
      deskripsi, info_tambahan, alasan_dijual,
      gmaps_link, geo.latitude, geo.longitude, lebar_jalan_m,
      income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
      details, furnished,
      meta.meta_title, meta.meta_description, submit_id
    ).run();

    let propResult;
    for (let attempt = 0; ; attempt++) {
      try {
        propResult = await insertProperty();
        break;
      } catch (err) {
        if (!isUniqueErr(err) || attempt >= 3) throw err;
        kode_listing = `SBP-${date8}-${fmtSeq(propSeqN + attempt + 1)}`;
      }
    }
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

    const insertAgreement = () => env.DB.prepare(`
      INSERT INTO agreements
        (kode_perjanjian, property_id, owner_id,
         jenis_transaksi, jenis_listing, fee_persen,
         status, created_at, updated_at)
      VALUES (?,?,?,  ?,'open',3.0,  'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(kode_perjanjian, property_id, owner_id, jenisTransaksi(tujuan)).run();

    let agrResult;
    for (let attempt = 0; ; attempt++) {
      try {
        agrResult = await insertAgreement();
        break;
      } catch (err) {
        if (!isUniqueErr(err) || attempt >= 3) throw err;
        kode_perjanjian = `SBP-AGR-${date8}-${fmtSeq(agrSeqN + attempt + 1)}`;
      }
    }
    agreement_id = agrResult.meta?.last_row_id;
  } catch (err) {
    console.error('[titip-jual] INSERT error:', err.message);
    // Dua submit dengan submit_id sama berbalapan: yang kalah kena UNIQUE.
    // Datanya sudah tersimpan oleh yang menang — kembalikan itu, jangan 500.
    // (Retry loop di atas tidak bisa menolong: ia mengganti kode_listing,
    // sedangkan yang bentrok adalah submit_id.)
    if (submit_id) {
      const lama = await cariSubmitLama(env.DB, submit_id);
      if (lama) return jsonOk(lama, 200);
    }
    context.waitUntil(logServerError(env, { message: `[titip-jual] INSERT error: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  // ─── Tutup prospek Step 1 ─────────────────────────────────────────────────
  // Baris `leads` yang dibuat saat user menyelesaikan Step 1 (lihat
  // titip-jual-prospek.js) ditandai selesai + ditautkan ke properti yang lahir.
  // Tanpa ini admin akan menelepon orang yang justru sudah merampungkan formnya.
  // Best-effort di waitUntil: gagal menandai TIDAK BOLEH menggagalkan submit
  // yang datanya sudah aman tersimpan.
  const prospekLeadId = Number.isInteger(body.prospek_lead_id) && body.prospek_lead_id > 0
    ? body.prospek_lead_id
    : null;
  if (prospekLeadId) {
    context.waitUntil(
      env.DB.prepare(`
        UPDATE leads
           SET status_pipeline = 'closed', property_id = ?, pesan = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tipe_pengirim = 'penjual' AND source_page = '/titip-jual'
      `).bind(property_id, `Titip Jual SELESAI — listing ${kode_listing}.`, prospekLeadId).run()
        .catch(err => console.error('[titip-jual] tandai prospek selesai gagal:', err.message))
    );
  }

  // ─── Upload foto ke R2 + insert property_images ───────────────────────────
  // Paralel per batch 5 — upload sekuensial 20 foto berisiko mendekati
  // wall-clock 30 detik Workers.
  let photos_uploaded = 0;
  const uploadOne = async (p, i) => {
    const match = p.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
    const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
    const base64Data = p.slice(p.indexOf(',') + 1);
    const binaryStr = atob(base64Data);
    const rawBytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
    const bytes = stripExif(rawBytes);
    // WebP conversion dilakukan client-side (downscale 1920px); JPEG/PNG tetap diterima
    const r2Key = `property-photos/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(r2Key, bytes.buffer, { httpMetadata: { contentType: `image/${ext}` } });
    await env.DB.prepare(`
      INSERT INTO property_images (property_id, url_webp, alt_text, urutan, is_cover)
      VALUES (?,?,?,?,?)
    `).bind(property_id, r2Key, titleFinal, i, i === 0 ? 1 : 0).run();
  };
  for (let start = 0; start < photos_raw.length; start += 5) {
    const batch = photos_raw.slice(start, start + 5)
      .map((p, j) => uploadOne(p, start + j));
    const results = await Promise.allSettled(batch);
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') photos_uploaded++;
      else console.error(`[titip-jual] Upload foto #${start + j + 1} gagal:`, r.reason?.message);
    });
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
