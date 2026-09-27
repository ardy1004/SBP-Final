// POST /api/titip-jual-lengkapi — Publik, tanpa auth langsung (dilindungi tiket JWT).
// Titip Jual TAHAP 2: KYC (NIK/nama KTP/alamat KTP/dst) yang menyelesaikan properti
// + owner ringan yang lahir di /api/titip-jual-mulai (Tahap 1). Lihat
// PLAN-TITIP-JUAL-PROPERTI-DULU.md §2.1/§2.3 untuk rancangan lengkap.
//
// `functions/api/titip-jual.js` (submit atomik lama, sekali jalan dgn KYC)
// SENGAJA TIDAK disentuh — jaring pengaman untuk tab/bundle lama yang belum reload.

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { verifyJWT } from './_shared/jwt.js';
import { encryptNIK } from '../_lib/crypto.js';
import { normalisasiJenisIdentitas, validasiNomorIdentitas, IDENTITAS } from '../_lib/identitas.js';
import { BERTINDAK_VALID } from '../_lib/isiPerjanjian.js';
import { nextKodeSeq, fmtSeq, isUniqueErr } from '../_lib/kodeSeq.js';
import { logServerError } from '../_lib/logError.js';
import { sendCapiEvent, extractMetaIdentity } from '../_lib/metaCapi.js';

function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

function today8() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function jenisTransaksi(tujuan) {
  return tujuan === 'disewa' ? 'sewa' : 'jual';
}

// Pesan tunggal untuk SEMUA kegagalan tiket (hilang/tidak sah/scope salah/kedaluwarsa/
// JWT_SECRET hilang) — pengunjung tidak perlu tahu bedanya, admin sudah punya jejaknya
// lewat logServerError di tiap cabang.
const PESAN_TIKET_GAGAL = 'Sesi kedaluwarsa — admin kami akan menghubungi Anda via WhatsApp untuk melanjutkan proses';

/**
 * Ambil perjanjian yang SUDAH selesai KYC untuk sebuah properti — dipakai jalur
 * idempoten (owner sudah pernah menuntaskan Tahap 2, atau kalah race UPDATE).
 * Fail-open (null saat query error), sama seperti cariSubmitLama() di titip-jual.js.
 */
async function ambilAgreementSelesai(db, property_id) {
  try {
    const row = await db.prepare(`
      SELECT a.id AS agreement_id, a.kode_perjanjian, a.owner_id, a.status,
             p.kode_listing
        FROM agreements a
        JOIN properties p ON p.id = a.property_id
       WHERE a.property_id = ?
       ORDER BY a.id ASC LIMIT 1
    `).bind(property_id).first();
    if (!row) return null;
    return {
      kode_perjanjian: row.kode_perjanjian,
      kode_listing: row.kode_listing,
      property_id,
      owner_id: row.owner_id,
      agreement_id: row.agreement_id,
      status: row.status,
      duplikat: true,
      pesan: 'Data diri berhasil disimpan. Perjanjian Anda sedang diproses tim SBP.',
    };
  } catch (err) {
    console.error('[titip-jual-lengkapi] cek agreement selesai gagal:', err.message);
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-lengkapi] Content-Type ditolak (415): ${ct.slice(0, 60) || '(kosong)'}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'content-type-415', content_type: ct.slice(0, 60) },
    }));
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] Body tidak terbaca (400)',
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'body-400' },
    }));
    return jsonError('Body JSON tidak valid', 400);
  }

  // ─── Verifikasi tiket ────────────────────────────────────────────────────
  // property_id/owner_id DATANG HANYA DARI TOKEN, tidak pernah dari body —
  // kalau dipercaya dari body, siapa pun bisa mengirim owner_id orang lain dan
  // menimpa data KYC-nya (IDOR). Tiket ini diterbitkan titip-jual-mulai.js
  // setelah Turnstile lolos di Tahap 1, jadi endpoint ini SENGAJA tidak
  // memverifikasi Turnstile lagi — sama seperti titip-jual-foto.js.
  if (!env.JWT_SECRET) {
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] JWT_SECRET tidak terkonfigurasi (403) — tiket tidak bisa diverifikasi',
      url: request.url,
      context: { kind: 'config-403' },
    }));
    return jsonError(PESAN_TIKET_GAGAL, 403);
  }

  const tiket = await verifyJWT(body.tiket_lanjut, env.JWT_SECRET, 'titipjual-lanjut');
  if (!tiket || !Number.isInteger(tiket.property_id) || !Number.isInteger(tiket.owner_id)) {
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] Tiket tidak sah (403)',
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'tiket-403', ada_tiket: Boolean(body.tiket_lanjut) },
    }));
    return jsonError(PESAN_TIKET_GAGAL, 403);
  }
  const { property_id, owner_id } = tiket;

  const ownerRow = await env.DB.prepare(`
    SELECT id, nik_encrypted, no_wa_1 FROM owners WHERE id = ? AND property_id = ?
  `).bind(owner_id, property_id).first();

  if (!ownerRow) {
    // Properti/owner sudah dihapus admin di antara Tahap 1 dan Tahap 2 (tiket
    // berumur sampai 7 hari — lihat titip-jual-mulai.js). Datanya memang tidak
    // ada lagi, bukan kesalahan pengunjung.
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] Owner/properti tidak ditemukan (404) — mungkin sudah dihapus',
      url: request.url,
      context: { kind: 'owner-404', property_id, owner_id },
    }));
    return jsonError('Data properti tidak ditemukan. Admin kami akan menghubungi Anda via WhatsApp.', 404);
  }

  // ─── Idempotensi: Tahap 2 sudah pernah dituntaskan untuk owner ini ───────
  if (ownerRow.nik_encrypted) {
    const hasil = await ambilAgreementSelesai(env.DB, property_id);
    if (hasil) return jsonOk(hasil, 200);
    // nik_encrypted terisi tapi agreement tidak ketemu — data tidak konsisten,
    // jangan menebak dengan membuat agreement baru di atasnya.
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] owner sudah KYC tapi agreement tidak ditemukan (500)',
      url: request.url,
      context: { kind: 'inkonsisten-500', property_id, owner_id },
    }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }

  // ─── Validasi field KYC ───────────────────────────────────────────────────
  const errors = {};
  const nama_ktp        = sanitize(body.nama_ktp ?? '', 100);
  // 'ktp' | 'sim'. Klien lama tidak mengirimnya → 'ktp' + aturan 16 digit, persis
  // seperti sebelum fitur SIM ada. Nomornya (NIK maupun SIM) tetap di field `nik`.
  const jenis_identitas  = normalisasiJenisIdentitas(body.jenis_identitas);
  // Nomor SIM lazim tertulis dengan tanda hubung/spasi di kartunya.
  const nik_raw          = sanitize(body.nik ?? '', 25).replace(/[\s-]/g, '');
  const alamat_ktp       = sanitize(body.alamat_ktp ?? '', 300);
  const rt_rw            = sanitize(body.rt_rw ?? '', 10);
  const kelurahan_owner  = sanitize(body.kelurahan_owner ?? '', 100);
  const kecamatan_owner  = sanitize(body.kecamatan_owner ?? '', 100);
  const bertindak        = sanitize(body.bertindak_sebagai ?? '', 30);

  let data_ahli_waris = null;
  if (body.data_ahli_waris && typeof body.data_ahli_waris === 'object') {
    // Bentuk objek dulu disimpan tanpa batas (form normal < 150 B).
    data_ahli_waris = JSON.stringify(body.data_ahli_waris);
    if (data_ahli_waris.length > 2000) errors.data_ahli_waris = 'Data ahli waris terlalu besar';
  } else if (typeof body.data_ahli_waris === 'string' && body.data_ahli_waris.trim()) {
    data_ahli_waris = body.data_ahli_waris.trim().slice(0, 2000);
  }

  const galatNomor = validasiNomorIdentitas(jenis_identitas, nik_raw);
  if (galatNomor) errors.nik = galatNomor; // kunci tetap `nik`: pemetaan 422 di klien tak berubah
  const kartu = IDENTITAS[jenis_identitas].kartu;
  if (!nama_ktp) errors.nama_ktp = `Nama sesuai ${kartu} wajib diisi`;
  if (!alamat_ktp) errors.alamat_ktp = `Alamat sesuai ${kartu} wajib diisi`;
  if (!rt_rw) errors.rt_rw = 'RT/RW wajib diisi';
  if (!kelurahan_owner) errors.kelurahan = 'Kelurahan wajib diisi';
  if (!kecamatan_owner) errors.kecamatan = 'Kecamatan wajib diisi';

  if (!BERTINDAK_VALID.includes(bertindak)) {
    errors.bertindak_sebagai = 'bertindak_sebagai harus: ' + BERTINDAK_VALID.join(', ');
  }

  if (Object.keys(errors).length > 0) {
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-lengkapi] Validasi gagal (422): ${Object.keys(errors).join(', ')}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'validasi-422', fields: Object.keys(errors) },
    }));
    return jsonError('Validasi gagal', 422, errors);
  }

  if (!env.NIK_ENC_KEY) {
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] Konfigurasi enkripsi tidak lengkap (503) — submit ditolak',
      url: request.url,
      context: { kind: 'config-503' },
    }));
    return jsonError('Konfigurasi server tidak lengkap', 503);
  }

  let nik_encrypted;
  try {
    nik_encrypted = await encryptNIK(nik_raw, env.NIK_ENC_KEY);
  } catch (err) {
    console.error('[titip-jual-lengkapi] Enkripsi NIK gagal:', err.message);
    context.waitUntil(logServerError(env, { message: `[titip-jual-lengkapi] Enkripsi NIK gagal: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal memproses data. Silakan coba lagi.', 500);
  }

  const propRow = await env.DB.prepare('SELECT tujuan, kode_listing FROM properties WHERE id = ?').bind(property_id).first();
  if (!propRow) {
    // Mustahil dalam kondisi normal (owner/properti sudah dicek di atas), tapi
    // owners.property_id pakai ON DELETE SET NULL — jaga-jaga bila properti
    // dihapus admin di antara SELECT tadi dan sekarang.
    context.waitUntil(logServerError(env, { message: '[titip-jual-lengkapi] Properti tidak ditemukan (404)', url: request.url, context: { kind: 'property-404', property_id } }));
    return jsonError('Data properti tidak ditemukan. Admin kami akan menghubungi Anda via WhatsApp.', 404);
  }

  const date8 = today8();
  let agrSeqN;
  try {
    agrSeqN = await nextKodeSeq(env.DB, 'agreements', 'kode_perjanjian', `SBP-AGR-${date8}-`);
  } catch (err) {
    console.error('[titip-jual-lengkapi] Gagal generate kode:', err.message);
    context.waitUntil(logServerError(env, { message: `[titip-jual-lengkapi] Gagal generate kode: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }
  let kode_perjanjian = `SBP-AGR-${date8}-${fmtSeq(agrSeqN)}`;

  // ─── KYC + perjanjian dalam SATU transaksi (DB.batch) ─────────────────────
  // ⚠️ Dulu dua langkah terpisah: UPDATE owners (NIK) lalu INSERT agreements.
  // Kegagalan apa pun di antaranya (galat D1, bentrok kode, Worker dibunuh)
  // meninggalkan owner ber-NIK TANPA perjanjian — dan setiap percobaan ulang
  // membentur jalur "inkonsisten" 500 SELAMANYA, tanpa satu pun jalan perbaikan.
  // Dalam batch, keduanya jadi atau tidak sama sekali.
  //
  // - UPDATE dijaga `nik_encrypted IS NULL`: dua tab/ketukan paralel diserialkan
  //   D1; yang kalah melihat 0 baris berubah → jalur idempoten di bawah, yang
  //   kini PASTI menemukan perjanjian milik pemenang (dulu bisa belum ada →
  //   galat palsu "coba lagi" padahal data tersimpan).
  // - INSERT hanya terjadi bila owner kini memegang ciphertext milik REQUEST INI
  //   (IV acak → ciphertext unik), jadi yang kalah tidak ikut menyisipkan.
  const jalankan = kode => env.DB.batch([
    env.DB.prepare(`
      UPDATE owners SET
        nama_pemilik = ?, nik_encrypted = ?, nama_ktp = ?, alamat_ktp = ?, rt_rw = ?,
        kelurahan = ?, kecamatan = ?, bertindak_sebagai = ?, data_ahli_waris = ?,
        jenis_identitas = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND nik_encrypted IS NULL
    `).bind(
      nama_ktp, nik_encrypted, nama_ktp, alamat_ktp, rt_rw,
      kelurahan_owner, kecamatan_owner, bertindak, data_ahli_waris,
      jenis_identitas, owner_id
    ),
    env.DB.prepare(`
      INSERT INTO agreements
        (kode_perjanjian, property_id, owner_id,
         jenis_transaksi, jenis_listing, fee_persen,
         status, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'open', 3.0, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       WHERE EXISTS (SELECT 1 FROM owners WHERE id = ? AND nik_encrypted = ?)
    `).bind(kode, property_id, owner_id, jenisTransaksi(propRow.tujuan), owner_id, nik_encrypted),
  ]);

  let hasilBatch;
  for (let attempt = 0; ; attempt++) {
    try {
      hasilBatch = await jalankan(kode_perjanjian);
      break;
    } catch (err) {
      if (isUniqueErr(err) && attempt < 3) {
        kode_perjanjian = `SBP-AGR-${date8}-${fmtSeq(agrSeqN + attempt + 1)}`;
        continue;
      }
      console.error('[titip-jual-lengkapi] Batch KYC+perjanjian gagal:', err.message);
      context.waitUntil(logServerError(env, { message: `[titip-jual-lengkapi] Batch KYC+perjanjian gagal (500): ${err.message}`, stack: err.stack, url: request.url }));
      return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
    }
  }

  if ((hasilBatch[0]?.meta?.changes ?? 0) === 0) {
    const hasil = await ambilAgreementSelesai(env.DB, property_id);
    if (hasil) {
      context.waitUntil(logServerError(env, {
        message: '[titip-jual-lengkapi] Race terdeteksi (200) — owner sudah dituntaskan request paralel',
        url: request.url,
        context: { kind: 'race-200', property_id, owner_id },
      }));
      return jsonOk(hasil, 200);
    }
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-lengkapi] UPDATE owners 0 baris tapi tidak ada agreement — data tidak konsisten (500)',
      url: request.url,
      context: { kind: 'race-inkonsisten-500', property_id, owner_id },
    }));
    return jsonError('Gagal menyimpan data. Silakan coba lagi.', 500);
  }
  const agreement_id = hasilBatch[1]?.meta?.last_row_id;

  // ─── Meta CAPI: CompleteRegistration (KYC penjual tuntas) ─────────────────
  // Event yang sama dengan titip-jual.js (jalur lama sekali-submit) — sengaja
  // `CompleteRegistration`, TANPA `value`, HANYA di jalur sukses ini (bukan di
  // dua jalur idempoten di atas, supaya browser tidak menembak Pixel dua kali).
  const regEventId = `reg_${agreement_id}_${Date.now()}`;
  context.waitUntil((async () => {
    try {
      const pixelRes = await env.DB
        .prepare("SELECT pixel_id, capi_access_token, events_enabled FROM pixel_configs WHERE is_active = 1 AND capi_access_token IS NOT NULL AND capi_access_token != ''")
        .all();
      const capiPixels = (pixelRes.results ?? []).filter(px => {
        try { return JSON.parse(px.events_enabled ?? '[]').includes('CompleteRegistration'); } catch { return false; }
      });
      if (capiPixels.length > 0) {
        await Promise.allSettled(capiPixels.map(px => sendCapiEvent(env, {
          pixelId:        px.pixel_id,
          accessToken:    px.capi_access_token,
          eventName:      'CompleteRegistration',
          eventId:        regEventId,
          eventSourceUrl: `${env.APP_URL ?? 'https://salambumi.xyz'}/titip-jual`,
          userData:       ownerRow.no_wa_1 ? { ph: ownerRow.no_wa_1 } : {},
          identity:       extractMetaIdentity(request),
          customData:     { content_ids: [propRow.kode_listing], content_category: 'titip_jual' },
        })));
      }
    } catch (err) {
      console.error('[titip-jual-lengkapi] CAPI dispatch error:', err?.message);
    }
  })());

  return jsonOk({
    kode_perjanjian,
    kode_listing: propRow.kode_listing,
    property_id,
    owner_id,
    agreement_id,
    event_id: regEventId,
    status: 'draft',
    pesan: 'Data diri berhasil disimpan. Perjanjian Anda sedang diproses tim SBP.',
  }, 200);
}

export async function onRequestOptions() {
  return handleOptions();
}
