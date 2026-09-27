// POST /api/titip-jual-mulai — Publik, tanpa auth. Tahap 1 dari Titip Jual 2-tahap.
//
// LATAR BELAKANG
// Form Titip Jual dipecah jadi dua tahap: Tahap 1 (endpoint ini) hanya
// menangkap detail properti + nomor WA pemilik — TANPA KYC/NIK — dan langsung
// melahirkan baris `properties` (status draft) + baris `owners` RINGAN. Tahap 2
// (`titip-jual-lengkapi.js`, endpoint terpisah) baru melengkapi NIK/KYC dan
// membuat baris `agreements`, memakai `tiket_lanjut` (JWT) yang diterbitkan di
// sini sebagai bukti kepemilikan property_id/owner_id.
//
// Dengan ini, pengunjung yang mengisi detail properti lalu berhenti sebelum
// Tahap 2 tetap meninggalkan listing nyata + nomor WA yang bisa dihubungi admin
// — bukan hilang tanpa jejak seperti pola lama (lihat titip-jual-prospek.js).
//
// ⚠️ NIK TIDAK PERNAH DIKIRIM/DISIMPAN DI SINI. `env.NIK_ENC_KEY` tidak pernah
// disentuh — enkripsi NIK murni tanggung jawab Tahap 2.
//
// `functions/api/titip-jual.js` (submit tunggal lama) SENGAJA tidak diubah —
// tetap jadi fallback untuk bundle klien lama yang masih ter-cache.

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { signJWT } from './_shared/jwt.js';
import { stripExif } from '../_lib/exif.js';
import { generateMetaSeo } from '../_lib/metaSeo.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { normalizeWA, isValidWA } from '../_lib/waUtils.js';
import { parseGmapsCoords } from '../_lib/parseGmapsCoords.js';
import { nextKodeSeq, fmtSeq, isUniqueErr } from '../_lib/kodeSeq.js';
import { normalisasiHarga } from '../_lib/hargaTanah.js';
import { logServerError } from '../_lib/logError.js';
import { sendCapiEvent, extractMetaIdentity } from '../_lib/metaCapi.js';
import { stmtNormalisasiCover } from '../_lib/fotoUtama.js';

const TIKET_LANJUT_DETIK = 7 * 24 * 3600; // 7 hari — cukup untuk mengisi Tahap 2 tanpa terburu-buru

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

/**
 * Judul otomatis saat owner mengosongkan kolom Judul. HANYA lokasi PROPERTI —
 * lihat catatan panjang di titip-jual.js (owner boleh ber-KTP kota lain).
 */
function titleOtomatis(titleRaw, jenisProperti, kecamatanProp, kabupatenProp) {
  if (titleRaw) return titleRaw;
  const jenis = jenisProperti.charAt(0).toUpperCase() + jenisProperti.slice(1);
  const lokasi = kecamatanProp || kabupatenProp || '';
  return lokasi ? `${jenis} ${lokasi}` : jenis;
}

// Tiket JWT bukti kepemilikan property_id/owner_id untuk Tahap 2. Gagal terbit
// (secret hilang / signJWT error) TIDAK BOLEH menggagalkan submit — properti
// sudah tersimpan, itu prioritasnya. Klien tanpa tiket masih bisa dihubungi
// manual oleh admin lewat no_wa yang sudah tercatat.
async function terbitkanTiketLanjut(env, property_id, owner_id) {
  if (!env.JWT_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    return await signJWT(
      { scope: 'titipjual-lanjut', property_id, owner_id, iat: now, exp: now + TIKET_LANJUT_DETIK },
      env.JWT_SECRET
    );
  } catch {
    return null;
  }
}

/**
 * Cari submit Tahap 1 yang sudah pernah tersimpan dengan submit_id yang sama.
 * Varian titip-jual.js `cariSubmitLama()`, dipersempit ke properties+owners
 * saja — tidak ada agreements di tahap ini.
 *
 * Fail-open (return null saat query error): lebih baik menanggung risiko
 * duplikat (bisa dihapus admin) daripada menolak submit yang asli.
 */
async function cariSubmitLamaTahap1(env, submit_id) {
  try {
    const row = await env.DB.prepare(`
      SELECT p.id AS property_id, p.kode_listing,
             (SELECT id       FROM owners         WHERE property_id = p.id ORDER BY id ASC LIMIT 1) AS owner_id,
             (SELECT COUNT(*) FROM property_images WHERE property_id = p.id)                         AS photos_uploaded
        FROM properties p
       WHERE p.submit_id = ?
    `).bind(submit_id).first();
    if (!row) return null;
    return {
      kode_listing:    row.kode_listing,
      property_id:     row.property_id,
      owner_id:        row.owner_id,
      tiket_lanjut:    await terbitkanTiketLanjut(env, row.property_id, row.owner_id),
      photos_uploaded: row.photos_uploaded,
      photos_failed:   0,
      photos_warning:  null,
      status:          'draft',
      duplikat:        true,
      pesan: 'Properti Anda sudah tercatat. Tim SBP bisa menghubungi Anda via WhatsApp.',
    };
  } catch (err) {
    console.error('[titip-jual-mulai] cek submit_id gagal:', err.message);
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Ketiga jalur keluar paling awal WAJIB dicatat — pola yang sama dengan
  // titip-jual.js (lihat catatan panjang di sana): tanpa ini, submit yang mati
  // di 415/400/403 tidak meninggalkan jejak apa pun.
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-mulai] Content-Type ditolak (415): ${ct.slice(0, 60) || '(kosong)'}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'content-type-415', content_type: ct.slice(0, 60) },
    }));
    return jsonError('Content-Type harus application/json', 415);
  }

  // Body dibaca sebagai TEKS dulu, baru di-parse — membedakan koneksi putus vs
  // JSON rusak. JANGAN mencatat isi body: foto base64 + no_wa tidak boleh masuk
  // error_logs (tidak terenkripsi, terbaca di Admin).
  let body;
  let byteTerbaca = null;
  try {
    const mentah = await request.text();
    byteTerbaca = mentah.length;
    body = JSON.parse(mentah);
  } catch {
    const tahap = byteTerbaca === null ? 'baca' : 'parse';
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-mulai] Body tidak terbaca (400): gagal saat ${tahap}`
        + (tahap === 'baca' ? ' — koneksi putus di tengah unggahan?' : ' — body sampai utuh tapi JSON rusak'),
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: {
        kind: 'body-400',
        tahap,
        content_length: request.headers.get('content-length'),
        byte_terbaca: byteTerbaca,
      },
    }));
    return jsonError('Body JSON tidak valid', 400);
  }

  // ─── Anti-bot: verifikasi Turnstile sebelum proses berat (2 INSERT + upload R2) ──
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? null;
  const captcha = await verifyTurnstile(body.cf_turnstile_token, env.TURNSTILE_SECRET, ip, new URL(request.url).hostname);
  if (!captcha.ok) {
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-mulai] Ditolak Turnstile (403): ${captcha.error ?? 'tanpa-alasan'}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'turnstile-403', reason: captcha.error ?? null, ada_token: Boolean(body.cf_turnstile_token) },
    }));
    return jsonError('Verifikasi anti-bot gagal. Silakan muat ulang halaman dan coba lagi.', 403);
  }

  const errors = {};

  // ─── Kontak pemilik (WA saja — KYC menyusul di Tahap 2) ───────────────────
  const no_wa_raw   = sanitize(body.no_wa ?? '', 20);
  const no_wa_2_raw = sanitize(body.no_wa_2 ?? '', 20);
  if (!no_wa_raw) { errors.no_wa = 'Nomor WhatsApp wajib diisi'; }
  else if (!isValidWA(no_wa_raw)) { errors.no_wa = 'Nomor WhatsApp tidak valid'; }
  if (no_wa_2_raw && !isValidWA(no_wa_2_raw)) errors.no_wa_2 = 'Nomor WA kedua tidak valid';

  const gmaps_link = sanitize(body.gmaps_link ?? '', 500) || null;
  if (!gmaps_link) errors.gmaps_link = 'Link Google Maps wajib diisi';

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
    // Kolom `harga` = harga jual, tidak relevan untuk tujuan sewa murni
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

  // Luas tanah diparse di sini (dibutuhkan normalisasiHarga di bawah)
  const luas_tanah = parseInt(body.luas_tanah, 10) || null;

  // Harga total ↔ per-m² untuk tanah — kontraknya kolom `harga` SELALU total rupiah.
  const hrg = normalisasiHarga({
    jenis_properti,
    luas_tanah,
    harga,
    harga_per_m2: body.harga_per_m2,
    harga_mode: body.harga_mode,
  });
  if (!hrg.ok) errors.harga = hrg.error;

  // ─── Foto validation ──────────────────────────────────────────────────────
  const MAX_TOTAL_PHOTO_BYTES = 40 * 1024 * 1024;
  const photos_raw = Array.isArray(body.photos) ? body.photos : [];

  // Dua bentuk diterima: `photo_keys` (baru, sudah diunggah lewat endpoint
  // foto terpisah) dan `photos` base64 (lama). Lihat penjelasan panjang di
  // titip-jual.js — jangan hapus jalur lama tanpa bukti nol pemakaian.
  const photo_keys = Array.isArray(body.photo_keys) ? body.photo_keys : [];
  const pakaiKey = photo_keys.length > 0;

  if (pakaiKey) {
    if (photo_keys.length > 20) {
      errors.photos = 'Terlalu banyak foto (maks 20)';
    } else {
      for (let i = 0; i < photo_keys.length; i++) {
        const k = photo_keys[i];
        // Key datang dari klien, tidak tepercaya — pagar path traversal & signatures/ (NIK)
        if (typeof k !== 'string' || k.length > 200 ||
            !k.startsWith('property-photos/') || k.includes('..') || k.includes('//')) {
          errors.photos = `Referensi foto #${i + 1} tidak valid`;
          break;
        }
      }
    }
  } else if (photos_raw.length === 0) {
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
    // terenkripsi dan isian di sini memuat nomor WA.
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-mulai] Validasi gagal (422): ${Object.keys(errors).join(', ')}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'validasi-422', fields: Object.keys(errors) },
    }));
    return jsonError('Validasi gagal', 422, errors);
  }

  // ─── Idempotensi ──────────────────────────────────────────────────────────
  // Diperiksa sedini mungkin: sesudah ini ada fetch ke Google Maps dan 2 INSERT
  // — percuma bila submit ini sebenarnya percobaan ulang.
  const submitIdKlien = sanitize(body.submit_id ?? '', 40) || null;
  // Klien tanpa submit_id (bundle lama / WebView tanpa randomUUID) tetap
  // mendapat satu dari server: kolom ini juga PENANDA ASAL "dari Titip Jual"
  // bagi admin (SQL_DARI_TITIP_JUAL di functions/_lib/titipJualAdmin.js).
  // Idempotensi tetap hanya berlaku untuk id yang dikirim klien.
  const submit_id = submitIdKlien ?? crypto.randomUUID();
  if (submitIdKlien) {
    const lama = await cariSubmitLamaTahap1(env, submit_id);
    if (lama) {
      context.waitUntil(logServerError(env, {
        message: `[titip-jual-mulai] Submit idempoten (200) — listing lama ${lama.kode_listing} dikembalikan, TIDAK ada listing baru`,
        url: request.url,
        userAgent: request.headers.get('User-Agent') ?? undefined,
        context: { kind: 'idempoten-200', tahap: 'pra-insert', kode_listing: lama.kode_listing, property_id: lama.property_id },
      }));
      return jsonOk(lama, 200);
    }
  }

  // ─── Optional property fields ─────────────────────────────────────────────
  // `||`, BUKAN `??` — klien mengirim string kosong saat user melewati cascade
  // lokasi, dan `??` hanya menyala untuk null/undefined (lihat CLAUDE.md).
  const provinsi       = sanitize(body.provinsi ?? '', 100) || 'DI Yogyakarta';
  const kabupaten      = sanitize(body.kabupaten ?? '', 100);
  const kecamatan_prop = sanitize(body.kecamatan_prop ?? '', 100);
  const kelurahan_prop = sanitize(body.kelurahan_prop ?? '', 100);
  const alamat_prop    = sanitize(body.alamat ?? '', 500) || null;
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

  const income_per_bulan       = parseInt(body.income_per_bulan, 10) || null;
  const pengeluaran_per_bulan  = parseInt(body.pengeluaran_per_bulan, 10) || null;
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

  // Auto-ekstrak koordinat dari link Maps (sama seperti titip-jual.js / PATCH admin)
  const geo = await parseGmapsCoords(gmaps_link);

  // ─── Generate kode ────────────────────────────────────────────────────────
  const date8 = today8();
  let propSeqN, slug;
  try {
    propSeqN = await nextKodeSeq(env.DB, 'properties', 'kode_listing', `SBP-${date8}-`);
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    slug = `${slugify(titleOtomatis(title_raw, jenis_properti, kecamatan_prop, kabupaten))}-${suffix}`;
  } catch (err) {
    console.error('[titip-jual-mulai] Gagal generate kode:', err.message);
    context.waitUntil(logServerError(env, { message: `[titip-jual-mulai] Gagal generate kode: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }
  let kode_listing = `SBP-${date8}-${fmtSeq(propSeqN)}`;

  const titleFinal = titleOtomatis(title_raw, jenis_properti, kecamatan_prop, kabupaten);

  const meta = generateMetaSeo({
    jenis_properti, tujuan,
    harga: tujuan === 'disewa' ? harga_sewa_tahun : hrg.harga,
    kelurahan: kelurahan_prop,
    kecamatan: kecamatan_prop,
    kabupaten, luas_tanah, luas_bangunan, nego,
  });

  // ─── INSERT ke DB (properties + owners ringan, TANPA agreements) ─────────
  let property_id, owner_id;
  try {
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

    // Baris owners RINGAN — sama seperti pola PATCH admin (properti tanpa
    // owner). nik_encrypted/nama_ktp/alamat_ktp/dll tetap NULL; Tahap 2 mengisinya.
    const ownerResult = await env.DB.prepare(`
      INSERT INTO owners (no_wa_1, no_wa_2, property_id)
      VALUES (?, ?, ?)
    `).bind(no_wa_1, no_wa_2, property_id).run();
    owner_id = ownerResult.meta?.last_row_id;
  } catch (err) {
    console.error('[titip-jual-mulai] INSERT error:', err.message);
    // Dua submit dengan submit_id sama berbalapan — yang kalah kena UNIQUE.
    // Datanya sudah tersimpan oleh yang menang; kembalikan itu, jangan 500.
    // Hanya untuk id dari KLIEN — id buatan server tidak mungkin bentrok.
    if (submitIdKlien) {
      const lama = await cariSubmitLamaTahap1(env, submit_id);
      if (lama) {
        context.waitUntil(logServerError(env, {
          message: `[titip-jual-mulai] Submit idempoten (200) sesudah INSERT bentrok — listing lama ${lama.kode_listing} dikembalikan`,
          url: request.url,
          userAgent: request.headers.get('User-Agent') ?? undefined,
          context: { kind: 'idempoten-200', tahap: 'pasca-insert', kode_listing: lama.kode_listing, sebab: err.message?.slice(0, 120) },
        }));
        return jsonOk(lama, 200);
      }
    }
    context.waitUntil(logServerError(env, { message: `[titip-jual-mulai] INSERT error: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  const tiket_lanjut = await terbitkanTiketLanjut(env, property_id, owner_id);

  // ─── Upload foto ke R2 + insert property_images ───────────────────────────
  // Paralel per batch 5 — sama seperti titip-jual.js (menghindari mendekati
  // wall-clock 30 detik Workers pada 20 foto sekuensial).
  let photos_uploaded = 0;
  const totalFoto = pakaiKey ? photo_keys.length : photos_raw.length;

  const catatGambar = (key, i) => env.DB.prepare(`
    INSERT INTO property_images (property_id, url_webp, alt_text, urutan, is_cover)
    VALUES (?,?,?,?,?)
  `).bind(property_id, key, titleFinal, i, i === 0 ? 1 : 0).run();

  const uploadOne = async (p, i) => {
    const match = p.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
    const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
    const base64Data = p.slice(p.indexOf(',') + 1);
    const binaryStr = atob(base64Data);
    const rawBytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
    const bytes = stripExif(rawBytes);
    const r2Key = `property-photos/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(r2Key, bytes.buffer, { httpMetadata: { contentType: `image/${ext}` } });
    await catatGambar(r2Key, i);
  };

  if (pakaiKey) {
    // Bentuk BARU: byte-nya sudah ada di R2, di sini tinggal mencatatnya.
    // head() WAJIB sebelum INSERT — key datang dari klien, tanpa ini listing
    // bisa lahir dengan foto hantu.
    for (let i = 0; i < photo_keys.length; i++) {
      try {
        const ada = await env.MEDIA.head(photo_keys[i]);
        if (!ada) {
          console.error(`[titip-jual-mulai] key foto #${i + 1} tidak ada di R2:`, photo_keys[i]);
          continue;
        }
        await catatGambar(photo_keys[i], i);
        photos_uploaded++;
      } catch (err) {
        console.error(`[titip-jual-mulai] Catat foto #${i + 1} gagal:`, err?.message);
      }
    }
  } else {
    // Bentuk LAMA: base64 di dalam body ini. Paralel per batch 5.
    for (let start = 0; start < photos_raw.length; start += 5) {
      const batch = photos_raw.slice(start, start + 5)
        .map((p, j) => uploadOne(p, start + j));
      const results = await Promise.allSettled(batch);
      results.forEach((r, j) => {
        if (r.status === 'fulfilled') photos_uploaded++;
        else console.error(`[titip-jual-mulai] Upload foto #${start + j + 1} gagal:`, r.reason?.message);
      });
    }
  }

  // Foto #0 bisa gagal (key tak ada di R2 / upload ditolak) sehingga tak ada baris
  // is_cover=1. Normalisasi menjadikan foto terendah yang BERHASIL sebagai utama.
  // Properti sudah tercipta — kegagalan di sini tidak boleh menggagalkan lead.
  if (photos_uploaded > 0) {
    try { await stmtNormalisasiCover(env.DB, property_id).run(); }
    catch (err) { console.error('[titip-jual-mulai] normalisasi cover gagal:', err?.message); }
  }

  const photos_failed = totalFoto - photos_uploaded;
  if (photos_failed > 0) {
    console.error(`[titip-jual-mulai] ${photos_failed}/${totalFoto} foto gagal upload untuk property_id=${property_id}`);
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-mulai] ${photos_failed}/${totalFoto} foto gagal disimpan (listing ${kode_listing})`,
      url: request.url,
      context: { kind: 'foto-gagal', property_id, bentuk: pakaiKey ? 'photo_keys' : 'base64', gagal: photos_failed, total: totalFoto },
    }));
  }

  // ─── Meta CAPI: Lead (prospek PENJUAL, Tahap 1 belum lengkap) ─────────────
  // `Lead`, BUKAN `CompleteRegistration` — pola yang sama dengan
  // titip-jual-prospek.js: kontak sudah diserahkan tapi form belum tuntas
  // (KYC menyusul di Tahap 2). HANYA di jalur 201 ini — jalur idempoten 200 di
  // atas TIDAK boleh menembakkan event (percobaan ulang bukan konversi kedua).
  const leadEventId = `lead_${property_id}_${Date.now()}`;
  context.waitUntil((async () => {
    try {
      const pixelRes = await env.DB
        .prepare("SELECT pixel_id, capi_access_token, events_enabled FROM pixel_configs WHERE is_active = 1 AND capi_access_token IS NOT NULL AND capi_access_token != ''")
        .all();
      const capiPixels = (pixelRes.results ?? []).filter(px => {
        try { return JSON.parse(px.events_enabled ?? '[]').includes('Lead'); } catch { return false; }
      });
      if (capiPixels.length > 0) {
        await Promise.allSettled(capiPixels.map(px => sendCapiEvent(env, {
          pixelId:        px.pixel_id,
          accessToken:    px.capi_access_token,
          eventName:      'Lead',
          eventId:        leadEventId,
          eventSourceUrl: `${env.APP_URL ?? 'https://salambumi.xyz'}/titip-jual`,
          userData:       { ph: no_wa_1 },
          identity:       extractMetaIdentity(request),
          customData:     { content_ids: [kode_listing], content_category: 'titip_jual_prospek' },
        })));
      }
    } catch (err) {
      console.error('[titip-jual-mulai] CAPI dispatch error:', err?.message);
    }
  })());

  return jsonOk({
    kode_listing,
    property_id,
    owner_id,
    tiket_lanjut,
    photos_uploaded,
    photos_failed,
    photos_warning: photos_failed > 0
      ? (photos_uploaded === 0
          ? 'Seluruh foto gagal diproses — tim SBP akan menghubungi Anda untuk melengkapi foto.'
          : `${photos_failed} dari ${totalFoto} foto gagal diproses.`)
      : null,
    status: 'draft',
    event_id: leadEventId,
    pesan: 'Properti Anda sudah tercatat. Tim SBP bisa menghubungi Anda via WhatsApp.',
  }, 201);
}

export async function onRequestOptions() {
  return handleOptions();
}
