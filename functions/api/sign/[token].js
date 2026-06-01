// GET  /api/sign/:token — Ambil data dokumen perjanjian untuk ditampilkan ke owner
// POST /api/sign/:token — Submit tanda tangan digital owner
//
// Endpoint ini PUBLIK (tidak memerlukan admin auth).
// NIK di-dekripsi dan dikembalikan HANYA untuk token valid (owner menandatangani dokumennya sendiri).
// Ref: spec 12.6 — Pihak Kedua menampilkan NIK di halaman sign.

import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';
import { decryptNIK } from '../../_lib/crypto.js';

// ─── Ambil & validasi agreement dari token ────────────────────────────────────
async function getAgreementByToken(db, token) {
  return db.prepare(`
    SELECT
      a.id, a.kode_perjanjian, a.property_id, a.owner_id,
      a.jenis_transaksi, a.jenis_listing, a.durasi_kontrak, a.fee_persen,
      a.status, a.sign_token, a.token_expires_at, a.token_used,
      a.link_opened_count,
      p.title, p.slug, p.jenis_properti, p.tujuan,
      p.harga, p.luas_tanah, p.luas_bangunan,
      p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
      p.provinsi, p.kabupaten, p.kecamatan, p.kelurahan, p.alamat,
      p.legalitas, p.deskripsi,
      o.nama_pemilik, o.nik_encrypted, o.nama_ktp, o.alamat_ktp,
      o.rt_rw, o.kelurahan AS owner_kelurahan, o.kecamatan AS owner_kecamatan,
      o.bertindak_sebagai, o.no_wa_1
    FROM agreements a
    JOIN properties p ON p.id = a.property_id
    JOIN owners     o ON o.id = a.owner_id
    WHERE a.sign_token = ?
  `).bind(token).first();
}

// ─── Hash SHA-256 konten dokumen (untuk audit_hash_dokumen) ──────────────────
async function hashDokumen(agr, nikPlain, signedAt) {
  const doc = [
    `PERJANJIAN PEMASARAN PROPERTI`,
    `Kode: ${agr.kode_perjanjian}`,
    `Tanggal TTD: ${signedAt}`,
    `Pihak Pertama: PT Salam Bumi Property`,
    `Pihak Kedua: ${agr.nama_ktp} (NIK: ${nikPlain})`,
    `Alamat KTP: ${agr.alamat_ktp}, ${agr.owner_kelurahan}, ${agr.owner_kecamatan}`,
    `Bertindak sebagai: ${agr.bertindak_sebagai}`,
    `Properti: ${agr.title} | ${agr.kode_perjanjian}`,
    `Jenis Transaksi: ${agr.jenis_transaksi}`,
    `Jenis Listing: ${agr.jenis_listing}`,
    `Durasi Kontrak: ${agr.durasi_kontrak ?? '-'} bulan`,
    `Fee Pemasaran: ${agr.fee_persen}%`,
    `Harga: ${agr.harga}`,
  ].join('\n');

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(doc));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Pasal-pasal perjanjian (spec 12.6, untuk render di frontend) ─────────────
function buildPasalPasal(agr) {
  const durasiLabel = agr.durasi_kontrak ? `${agr.durasi_kontrak} bulan` : 'tidak terbatas (open listing)';
  return [
    {
      pasal: 1,
      judul: 'PARA PIHAK',
      isi: `Perjanjian ini dibuat antara PT Salam Bumi Property (Pihak Pertama / Agen) dan ${agr.nama_ktp} (Pihak Kedua / Pemilik Properti).`,
    },
    {
      pasal: 2,
      judul: 'OBYEK PERJANJIAN',
      isi: `Properti yang dipasarkan: ${agr.title}, berlokasi di ${agr.kecamatan}, ${agr.kabupaten}. Legalitas: ${agr.legalitas ?? 'belum diverifikasi'}.`,
    },
    {
      pasal: 3,
      judul: 'JANGKA WAKTU',
      isi: `Jenis listing: ${agr.jenis_listing === 'exclusive' ? 'Exclusive' : 'Open'}. Durasi: ${durasiLabel}.`,
    },
    {
      pasal: 4,
      judul: 'FEE PEMASARAN',
      isi: `Pihak Kedua menyetujui fee pemasaran sebesar ${agr.fee_persen}% dari harga transaksi ${agr.jenis_transaksi === 'jual' ? 'jual beli' : 'sewa menyewa'}.`,
    },
    {
      pasal: 5,
      judul: 'KEWAJIBAN AGEN',
      isi: 'Pihak Pertama berkewajiban memasarkan properti secara profesional, menjaga kerahasiaan data pemilik, dan melaporkan perkembangan pemasaran secara berkala.',
    },
    {
      pasal: 6,
      judul: 'KEWAJIBAN PEMILIK',
      isi: 'Pihak Kedua berkewajiban memberikan informasi yang benar dan lengkap, menyediakan akses untuk survei, dan tidak memasarkan secara eksklusif kepada pihak lain selama masa perjanjian (bila exclusive).',
    },
    {
      pasal: 7,
      judul: 'PERSETUJUAN DIGITAL',
      isi: 'Penandatanganan digital ini memiliki kekuatan hukum yang sama dengan tanda tangan basah sesuai UU ITE No. 11 Tahun 2008 dan perubahannya. Audit hash dokumen dicatat untuk keperluan pembuktian.',
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/sign/:token
// ═════════════════════════════════════════════════════════════════════════════
export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.token?.trim();

  if (!token) {
    return jsonError('Token tidak disertakan', 400);
  }

  const agr = await getAgreementByToken(env.DB, token);

  // [a] Token tidak ada
  if (!agr) {
    return jsonError('Link tidak valid', 404);
  }

  // [b] Sudah ditandatangani
  if (agr.token_used === 1) {
    return jsonOk({
      status: 'sudah_ditandatangani',
      slug_properti: agr.slug,
      kode_perjanjian: agr.kode_perjanjian,
    });
  }

  // [c] Kedaluwarsa
  if (agr.token_expires_at && new Date(agr.token_expires_at) < new Date()) {
    return jsonOk({ status: 'kedaluwarsa' });
  }

  // [d] Agreement bukan dalam status menunggu_ttd
  if (agr.status !== 'menunggu_ttd') {
    return jsonOk({ status: 'belum_dikonfigurasi' });
  }

  // Increment link_opened_count (best-effort, tidak blokir response)
  env.DB.prepare('UPDATE agreements SET link_opened_count = link_opened_count + 1 WHERE sign_token = ?')
    .bind(token).run().catch(() => {});

  // Dekripsi NIK untuk ditampilkan di dokumen (by-design: owner menandatangani dokumen sendiri)
  let nik_owner = null;
  if (agr.nik_encrypted && env.NIK_ENC_KEY) {
    try {
      nik_owner = await decryptNIK(agr.nik_encrypted, env.NIK_ENC_KEY);
    } catch (err) {
      console.error('[sign GET] Dekripsi NIK gagal:', err.message);
      // Tetap lanjut — dokumen bisa ditampilkan, NIK dikosongi
    }
  }

  return jsonOk({
    status: 'valid',
    kode_perjanjian: agr.kode_perjanjian,
    token_expires_at: agr.token_expires_at,
    // Data owner (untuk Pihak Kedua di dokumen)
    owner: {
      nama_pemilik: agr.nama_pemilik,
      nama_ktp: agr.nama_ktp,
      nik: nik_owner,            // by-design: diperlukan untuk dokumen TTD
      alamat_ktp: agr.alamat_ktp,
      rt_rw: agr.rt_rw,
      kelurahan: agr.owner_kelurahan,
      kecamatan: agr.owner_kecamatan,
      bertindak_sebagai: agr.bertindak_sebagai,
    },
    // Data properti
    properti: {
      title: agr.title,
      slug: agr.slug,
      jenis_properti: agr.jenis_properti,
      tujuan: agr.tujuan,
      harga: agr.harga,
      luas_tanah: agr.luas_tanah,
      luas_bangunan: agr.luas_bangunan,
      jumlah_kamar_tidur: agr.jumlah_kamar_tidur,
      jumlah_kamar_mandi: agr.jumlah_kamar_mandi,
      provinsi: agr.provinsi,
      kabupaten: agr.kabupaten,
      kecamatan: agr.kecamatan,
      kelurahan: agr.kelurahan,
      legalitas: agr.legalitas,
    },
    // Syarat perjanjian
    jenis_transaksi: agr.jenis_transaksi,
    jenis_listing: agr.jenis_listing,
    durasi_kontrak: agr.durasi_kontrak,
    fee_persen: agr.fee_persen,
    // Pasal-pasal dokumen (spec 12.6)
    pasal: buildPasalPasal(agr),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/sign/:token — Submit tanda tangan
// ═════════════════════════════════════════════════════════════════════════════
export async function onRequestPost(context) {
  const { request, env, params } = context;
  const token = params.token?.trim();

  if (!token) {
    return jsonError('Token tidak disertakan', 400);
  }

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

  // Persetujuan wajib true
  if (body.persetujuan !== true) {
    return jsonError('Persetujuan wajib dicentang sebelum menandatangani', 422);
  }

  // Validasi signature ada dan format benar
  const signatureDataUrl = body.signature ?? '';
  if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
    return jsonError('Tanda tangan harus berformat PNG base64 (data:image/png;base64,...)', 422);
  }

  // ─── Validasi token (server-side, jangan percaya client) ─────────────────
  const agr = await getAgreementByToken(env.DB, token);

  if (!agr) {
    return jsonError('Link tidak valid', 404);
  }
  if (agr.token_used === 1) {
    return jsonError('Link tanda tangan sudah digunakan sebelumnya', 409);
  }
  if (agr.token_expires_at && new Date(agr.token_expires_at) < new Date()) {
    return jsonError('Link tanda tangan sudah kedaluwarsa', 410);
  }
  if (agr.status !== 'menunggu_ttd') {
    return jsonError('Perjanjian belum siap untuk ditandatangani', 409);
  }

  // ─── Decode signature PNG ─────────────────────────────────────────────────
  const base64Sig = signatureDataUrl.slice('data:image/png;base64,'.length);
  let sigBytes;
  try {
    const binaryStr = atob(base64Sig);
    sigBytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
  } catch {
    return jsonError('Data tanda tangan tidak valid (base64 rusak)', 422);
  }

  // Validasi ukuran: maks 2MB
  if (sigBytes.length > 2 * 1024 * 1024) {
    return jsonError('Ukuran tanda tangan terlalu besar (maks 2MB)', 413);
  }

  // ─── [1] Upload signature ke R2 ───────────────────────────────────────────
  const r2Key = `signatures/${agr.kode_perjanjian}-${crypto.randomUUID()}.png`;
  let signature_image_url;
  try {
    await env.MEDIA.put(r2Key, sigBytes.buffer, {
      httpMetadata: { contentType: 'image/png' },
    });
    signature_image_url = r2Key;
  } catch (err) {
    console.error('[sign POST] Upload R2 gagal:', err.message);
    // Jika R2 gagal, JANGAN set token_used — tolak request
    return jsonError('Gagal menyimpan tanda tangan. Silakan coba lagi.', 500);
  }

  // ─── [2] Dekripsi NIK untuk hash dokumen ─────────────────────────────────
  let nikPlain = '(terenkripsi)';
  if (agr.nik_encrypted && env.NIK_ENC_KEY) {
    try {
      nikPlain = await decryptNIK(agr.nik_encrypted, env.NIK_ENC_KEY);
    } catch (err) {
      console.error('[sign POST] Dekripsi NIK untuk hash gagal:', err.message);
    }
  }

  // ─── [3] Hitung audit hash dokumen ───────────────────────────────────────
  const signedAt = new Date().toISOString();
  const audit_hash_dokumen = await hashDokumen(agr, nikPlain, signedAt);

  // ─── [4] Rekam audit info dari request ───────────────────────────────────
  const audit_ip = request.headers.get('CF-Connecting-IP')
    ?? request.headers.get('X-Forwarded-For')
    ?? 'unknown';
  const audit_user_agent = (request.headers.get('User-Agent') ?? '').slice(0, 500);

  // ─── [5] Atomic update: set token_used=1, status=signed, audit ───────────
  try {
    await env.DB.prepare(`
      UPDATE agreements
      SET token_used          = 1,
          status              = 'signed',
          signature_image_url = ?,
          signed_at           = ?,
          audit_ip            = ?,
          audit_user_agent    = ?,
          audit_hash_dokumen  = ?,
          updated_at          = CURRENT_TIMESTAMP
      WHERE sign_token = ? AND token_used = 0
    `).bind(
      signature_image_url,
      signedAt,
      audit_ip,
      audit_user_agent,
      audit_hash_dokumen,
      token
    ).run();
  } catch (err) {
    console.error('[sign POST] UPDATE agreements gagal:', err.message);
    return jsonError('Gagal merekam tanda tangan. Silakan coba lagi.', 500);
  }

  // ─── [6] Auto-publish properti ────────────────────────────────────────────
  try {
    await env.DB.prepare(`
      UPDATE properties
      SET status_publish = 'published',
          published_at   = ?,
          updated_at     = CURRENT_TIMESTAMP
      WHERE id = ? AND status_publish = 'draft'
    `).bind(signedAt, agr.property_id).run();
  } catch (err) {
    // Non-fatal: agreement sudah signed, log saja
    console.error('[sign POST] Auto-publish properti gagal:', err.message);
  }

  // TODO F4: generate PDF arsip dan simpan ke pdf_url. Untuk sekarang pdf_url = null.

  return jsonOk({
    status: 'signed',
    kode_perjanjian: agr.kode_perjanjian,
    slug_properti: agr.slug,
    signed_at: signedAt,
    audit_hash_dokumen,
    pesan: 'Tanda tangan berhasil. Properti Anda telah dipublikasikan di platform SBP.',
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
