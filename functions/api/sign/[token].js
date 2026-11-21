// GET  /api/sign/:token — Ambil data dokumen perjanjian untuk ditampilkan ke owner
// POST /api/sign/:token — Submit tanda tangan digital owner
//
// Endpoint ini PUBLIK (tidak memerlukan admin auth).
// NIK di-dekripsi dan dikembalikan HANYA untuk token valid (owner menandatangani dokumennya sendiri).
// Ref: spec 12.6 — Pihak Kedua menampilkan NIK di halaman sign.

import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';
import { decryptNIK } from '../../_lib/crypto.js';
import { IDENTITAS, normalisasiJenisIdentitas } from '../../_lib/identitas.js';
import { labelBertindak, susunAlamatPemilik, jenisTransaksi, teksHargaPenawaran } from '../../_lib/isiPerjanjian.js';
import { generateAgreementPDF } from '../../_lib/pdf.js';
import { pasalDokumen } from '../../_lib/teksPerjanjian.js';
import { logServerError } from '../../_lib/logError.js';
import { redaksiUrl } from '../../_lib/redaksiUrl.js';

// ─── Ambil & validasi agreement dari token ────────────────────────────────────
async function getAgreementByToken(db, token) {
  return db.prepare(`
    SELECT
      a.id, a.kode_perjanjian, a.property_id, a.owner_id,
      a.jenis_transaksi, a.jenis_listing, a.durasi_kontrak, a.fee_persen,
      a.status, a.sign_token, a.token_expires_at, a.token_used,
      a.link_opened_count, a.digantikan_oleh, a.pasal_json,
      p.kode_listing,
      p.title, p.slug, p.jenis_properti, p.tujuan,
      p.harga, p.harga_sewa_tahun, p.nego, p.nett, p.luas_tanah, p.luas_bangunan,
      p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
      p.provinsi, p.kabupaten, p.kecamatan, p.kelurahan, p.alamat,
      p.legalitas, p.deskripsi,
      o.nama_pemilik, o.nik_encrypted, o.nama_ktp, o.alamat_ktp,
      o.rt_rw, o.kelurahan AS owner_kelurahan, o.kecamatan AS owner_kecamatan,
      o.bertindak_sebagai, o.no_wa_1, o.jenis_identitas
    FROM agreements a
    JOIN properties p ON p.id = a.property_id
    JOIN owners     o ON o.id = a.owner_id
    WHERE a.sign_token = ?
  `).bind(token).first();
}

/**
 * Versi TERBARU dalam rantai versi perbaikan (`digantikan_oleh`), maks 5 lompatan.
 *
 * SENGAJA tanpa sign_token: link lama dari sebelum 2026-09-27 mungkin pernah
 * terbaca Meta Pixel/GA4 (lihat tanpaPelacak di root.tsx), jadi pemegang link lama
 * tidak boleh mendapat jalan ke dokumen ber-NIK versi baru. Cukup memberi tahu
 * bahwa versi baru ADA, nomornya, dan statusnya — link baru dikirim admin.
 * Gagal baca → null (pemanggil jatuh ke "sudah ditandatangani" seperti dulu).
 */
async function ambilPengganti(db, id) {
  try {
    let terakhir = null;
    for (let i = 0; i < 5 && id; i++) {
      const row = await db.prepare(
        'SELECT id, kode_perjanjian, status, token_expires_at, digantikan_oleh FROM agreements WHERE id = ?'
      ).bind(id).first();
      if (!row) break;
      terakhir = row;
      id = row.digantikan_oleh;
    }
    if (!terakhir) return null;
    const kedaluwarsa = terakhir.status === 'menunggu_ttd'
      && !!terakhir.token_expires_at && new Date(terakhir.token_expires_at) < new Date();
    return { kode_perjanjian: terakhir.kode_perjanjian, status: terakhir.status, link_kedaluwarsa: kedaluwarsa };
  } catch (err) {
    console.error('[sign GET] baca pengganti gagal:', err?.message);
    return null;
  }
}

// ─── Hash SHA-256 konten dokumen (untuk audit_hash_dokumen) ──────────────────
// Versi formula (agreements.audit_hash_versi, migrasi 0063):
//   1 = field kepala saja (perjanjian tanpa salinan pasal — perilaku lama,
//       hash lama tak pernah dihitung ulang di mana pun);
//   2 = kepala + SELURUH pasal ter-render, untuk perjanjian bersalinan pasal
//       (pasal_json). Tanpa ini tak bisa dibuktikan teks pasal mana yang
//       ditandatangani begitu isi pasal bisa diedit admin.
const versiHash = (agr) => (agr.pasal_json ? 2 : 1);
async function hashDokumen(agr, nikPlain, signedAt) {
  // Label mengikuti jenis identitas. Untuk KTP teks ini IDENTIK byte-per-byte
  // dengan sebelum fitur SIM ("NIK", "KTP"). Hash ini tidak pernah dihitung ulang
  // di mana pun (hanya disimpan + dicetak di PDF), jadi mengubah label SIM aman.
  // Isi hash mengikuti teks yang BENAR-BENAR tercetak (label kewenangan, alamat
  // tanpa duplikat, jenis transaksi & harga dari tujuan) — lihat isiPerjanjian.js.
  const id = IDENTITAS[normalisasiJenisIdentitas(agr.jenis_identitas)];
  const doc = [
    `PERJANJIAN PEMASARAN PROPERTI`,
    `Kode: ${agr.kode_perjanjian}`,
    `Tanggal TTD: ${signedAt}`,
    `Pihak Pertama: CV Salam Bumi Property`,
    `Pihak Kedua: ${agr.nama_ktp} (${id.label}: ${nikPlain})`,
    `Alamat ${id.kartu}: ${alamatPemilik(agr)}`,
    `Bertindak sebagai: ${labelBertindak(agr.bertindak_sebagai)}`,
    `Properti: ${agr.title} | ${agr.kode_perjanjian}`,
    `Jenis Transaksi: ${jenisTransaksi(agr.tujuan).label}`,
    `Jenis Listing: ${agr.jenis_listing}`,
    `Durasi Kontrak: ${agr.durasi_kontrak ?? '-'} bulan`,
    `Fee Pemasaran: ${agr.fee_persen}%`,
    teksHargaPenawaran(agr),
  ];
  if (versiHash(agr) === 2) {
    for (const p of pasalDokumen(agr)) doc.push(`Pasal ${p.pasal} — ${p.judul}: ${p.isi}`);
  }

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(doc.join('\n')));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Alamat pemilik sebagaimana tercetak — dipakai halaman, hash, dan PDF.
function alamatPemilik(agr) {
  return susunAlamatPemilik({
    alamat_ktp: agr.alamat_ktp, rt_rw: agr.rt_rw,
    kelurahan: agr.owner_kelurahan, kecamatan: agr.owner_kecamatan,
  }) || '-';
}

// Pasal-pasal: functions/_lib/teksPerjanjian.js (pasalDokumen / susunPasalLama).

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/sign/:token
// ═════════════════════════════════════════════════════════════════════════════
export async function onRequestGet(context) {
  const { env, params, request } = context;
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
    // [b1] …tapi sudah DIGANTIKAN versi perbaikan. Dulu tetap berbunyi "sudah
    // ditandatangani" — pemilik yang membuka link lama dari riwayat WA mengira
    // urusannya selesai, padahal versi baru menunggu tanda tangannya (kasus
    // SBP-AGR-20260926-001 → -20260927-002, 27 Sep 2026).
    if (agr.digantikan_oleh) {
      const pengganti = await ambilPengganti(env.DB, agr.digantikan_oleh);
      if (pengganti) {
        // Sinyal untuk admin: pemilik memegang link yang salah → kirim ulang link baru.
        context.waitUntil(logServerError(env, {
          message: `[sign GET] Link lama dibuka — ${agr.kode_perjanjian} sudah digantikan ${pengganti.kode_perjanjian} (status ${pengganti.status}${pengganti.link_kedaluwarsa ? ', link kedaluwarsa' : ''})`,
          url: redaksiUrl(request.url),
          userAgent: request.headers.get('User-Agent') ?? undefined,
          context: { kind: 'link-lama-dibuka', kode_lama: agr.kode_perjanjian, kode_baru: pengganti.kode_perjanjian, status_baru: pengganti.status },
        }));
        return jsonOk({
          status: 'digantikan',
          kode_perjanjian: agr.kode_perjanjian,
          kode_listing: agr.kode_listing,
          pengganti,
        });
      }
    }
    return jsonOk({
      status: 'sudah_ditandatangani',
      slug_properti: agr.slug,
      kode_perjanjian: agr.kode_perjanjian,
      kode_listing: agr.kode_listing,
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

  // Increment link_opened_count (best-effort, tidak blokir response).
  // ⚠️ WAJIB lewat waitUntil. Dulu promise-nya dibiarkan menggantung tanpa
  // di-await — Workers membunuh pekerjaan yang tertinggal begitu respons
  // terkirim, sehingga hanya 1 dari 19 perjanjian signed yang tercatat pernah
  // dibuka (padahal mustahil ditandatangani tanpa dibuka).
  context.waitUntil(
    env.DB.prepare('UPDATE agreements SET link_opened_count = link_opened_count + 1 WHERE sign_token = ?')
      .bind(token).run().catch(err => console.error('[sign GET] link_opened_count gagal:', err?.message))
  );

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

  // Salinan pasal rusak → GAGAL TERTUTUP (bacaSnapshot melempar). Diam-diam
  // jatuh ke teks lama berarti menampilkan isi yang berbeda dari yang dibekukan.
  let dokumen;
  try {
    dokumen = susunDokumen(agr, nik_owner);
  } catch (err) {
    context.waitUntil(logServerError(env, {
      message: `[sign GET] Isi pasal tidak bisa disusun — ${agr.kode_perjanjian}: ${err.message}`,
      url: redaksiUrl(request.url),
      context: { kind: 'pasal-rusak', kode_perjanjian: agr.kode_perjanjian },
    }));
    return jsonError('Dokumen belum bisa ditampilkan karena kendala teknis. Tim SBP sudah menerima laporannya dan akan menghubungi Anda.', 500);
  }
  return jsonOk({
    status: 'valid',
    token_expires_at: agr.token_expires_at,
    // Di LUAR susunDokumen(): kode listing tak pernah berubah dan bukan isi yang
    // ditandatangani — memasukkannya ke hash versi_dokumen hanya membuat halaman
    // yang sedang terbuka saat deploy terkena 409 "dokumen berubah" tanpa alasan.
    kode_listing: agr.kode_listing,
    ...dokumen,
    // Sidik jari isi yang SEDANG DIBACA pemilik — wajib dikirim balik saat
    // menandatangani (lihat POST). Tanpa ini admin bisa mengubah data di antara
    // pemilik membaca dan menandatangani, dan PDF memuat isi yang tidak pernah ia lihat.
    versi_dokumen: await versiDokumen(dokumen),
  });
}

// Isi dokumen yang ditampilkan halaman /sign — SATU fungsi untuk GET (tampil)
// dan POST (verifikasi versi), supaya keduanya tidak mungkin berbeda.
function susunDokumen(agr, nik_owner) {
  return {
    kode_perjanjian: agr.kode_perjanjian,
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
      jenis_identitas: normalisasiJenisIdentitas(agr.jenis_identitas),
      // Teks jadi — SAMA PERSIS dengan yang tercetak di PDF (isiPerjanjian.js).
      // Halaman tidak lagi menyusun label/alamat sendiri.
      bertindak_label: labelBertindak(agr.bertindak_sebagai),
      alamat_lengkap: alamatPemilik(agr),
    },
    // Data properti
    properti: {
      title: agr.title,
      slug: agr.slug,
      jenis_properti: agr.jenis_properti,
      tujuan: agr.tujuan,
      harga: agr.harga,
      harga_penawaran: teksHargaPenawaran(agr),
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
    // Syarat perjanjian — jenis transaksi dari tujuan properti, bukan kolom
    // agreements.jenis_transaksi (lihat jenisTransaksi() di isiPerjanjian.js).
    jenis_transaksi: jenisTransaksi(agr.tujuan).kode,
    jenis_transaksi_label: jenisTransaksi(agr.tujuan).label,
    jenis_listing: agr.jenis_listing,
    durasi_kontrak: agr.durasi_kontrak,
    fee_persen: agr.fee_persen,
    // Pasal-pasal dokumen: salinan beku (pasal_json, migrasi 0063) bila ada,
    // selain itu teks lama — lihat functions/_lib/teksPerjanjian.js.
    pasal: pasalDokumen(agr),
  };
}

async function versiDokumen(dokumen) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(dokumen)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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

  // ─── Validasi token (server-side, jangan percaya client) ─────────────────
  // Token dicari PALING DULU: penolakan hanya dicatat bila token dikenali, supaya
  // permintaan acak ke /api/sign/<apa-saja> tidak bisa membanjiri error_logs.
  const agr = await getAgreementByToken(env.DB, token);
  if (!agr) {
    return jsonError('Link tidak valid', 404);
  }

  // Setiap penolakan setelah ini WAJIB tercatat (tanpa token, NIK, atau isi TTD).
  // Dulu hanya 500 yang tercatat, sehingga "pemilik sudah mencoba tapi ditolak?"
  // mustahil dibuktikan (kasus SBP-AGR-20260927-002, 27 Sep 2026).
  const urlAman = redaksiUrl(request.url);
  const ua = request.headers.get('User-Agent') ?? undefined;
  const tolak = (http, kind, pesan, details) => {
    context.waitUntil(logServerError(env, {
      message: `[sign POST] Ditolak ${http} (${kind}) — ${agr.kode_perjanjian}`,
      url: urlAman,
      userAgent: ua,
      context: { kind, http, kode_perjanjian: agr.kode_perjanjian },
    }));
    return jsonError(pesan, http, details);
  };

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return tolak(415, 'content-type', 'Content-Type harus application/json');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return tolak(400, 'body-rusak', 'Body JSON tidak valid');
  }

  // Persetujuan wajib true
  if (body.persetujuan !== true) {
    return tolak(422, 'tanpa-persetujuan', 'Persetujuan wajib dicentang sebelum menandatangani');
  }

  // Validasi signature ada dan format benar
  const signatureDataUrl = body.signature ?? '';
  if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
    return tolak(422, 'format-ttd', 'Tanda tangan harus berformat PNG base64 (data:image/png;base64,...)');
  }

  if (agr.token_used === 1) {
    return tolak(409, 'sudah-dipakai', 'Link tanda tangan sudah digunakan sebelumnya');
  }
  if (agr.token_expires_at && new Date(agr.token_expires_at) < new Date()) {
    return tolak(410, 'kedaluwarsa', 'Link tanda tangan sudah kedaluwarsa');
  }
  if (agr.status !== 'menunggu_ttd') {
    return tolak(409, 'belum-siap', 'Perjanjian belum siap untuk ditandatangani');
  }

  // ─── Decode signature PNG ─────────────────────────────────────────────────
  const base64Sig = signatureDataUrl.slice('data:image/png;base64,'.length);
  let sigBytes;
  try {
    const binaryStr = atob(base64Sig);
    sigBytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
  } catch {
    return tolak(422, 'base64-rusak', 'Data tanda tangan tidak valid (base64 rusak)');
  }

  // Validasi ukuran: maks 2MB
  if (sigBytes.length > 2 * 1024 * 1024) {
    return tolak(413, 'terlalu-besar', 'Ukuran tanda tangan terlalu besar (maks 2MB)');
  }

  // Validasi magic bytes PNG (\x89PNG\r\n\x1a\n) — jangan simpan payload
  // sembarang yang cuma berlabel data:image/png
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (sigBytes.length < 8 || !PNG_MAGIC.every((b, i) => sigBytes[i] === b)) {
    return tolak(422, 'bukan-png', 'Data tanda tangan bukan file PNG yang valid');
  }

  // ─── [0] Dekripsi nomor identitas SEBELUM apa pun ditulis ─────────────────
  // Dokumen hukum TIDAK BOLEH ditandatangani tanpa nomor identitas pihak kedua.
  // Dulu kegagalan dekripsi (mis. NIK_ENC_KEY dirotasi — kunci tak berversi)
  // diteruskan diam-diam sebagai '(terenkripsi)', sehingga PDF dan hash audit
  // resmi lahir tanpa NIK. Sekarang ditolak dan tercatat untuk admin.
  let nikPlain = null;
  if (agr.nik_encrypted && env.NIK_ENC_KEY) {
    try {
      nikPlain = await decryptNIK(agr.nik_encrypted, env.NIK_ENC_KEY);
    } catch (err) {
      console.error('[sign POST] Dekripsi nomor identitas gagal:', err.message);
    }
  }
  if (!nikPlain) {
    context.waitUntil(logServerError(env, {
      message: '[sign POST] Nomor identitas tidak bisa didekripsi — penandatanganan ditolak (500)',
      url: urlAman,
      context: { kode_perjanjian: agr.kode_perjanjian, ada_ciphertext: Boolean(agr.nik_encrypted), ada_kunci: Boolean(env.NIK_ENC_KEY) },
    }));
    return jsonError('Dokumen belum bisa ditandatangani karena kendala teknis. Tim SBP sudah menerima laporannya dan akan menghubungi Anda.', 500);
  }

  // ─── [0b] Yang ditandatangani = yang dibaca ──────────────────────────────
  // Dokumen disusun ulang dari data TERKINI. Bila berbeda dari versi yang
  // dibaca pemilik (admin mengedit data saat link masih terbuka), tolak dan
  // minta muat ulang — jangan pernah menandatangani isi yang tidak ia lihat.
  let dokumenKini;
  try {
    dokumenKini = susunDokumen(agr, nikPlain);
  } catch (err) {
    context.waitUntil(logServerError(env, {
      message: `[sign POST] Isi pasal tidak bisa disusun — penandatanganan ditolak (500): ${err.message}`,
      url: urlAman,
      context: { kind: 'pasal-rusak', kode_perjanjian: agr.kode_perjanjian },
    }));
    return jsonError('Dokumen belum bisa ditandatangani karena kendala teknis. Tim SBP sudah menerima laporannya dan akan menghubungi Anda.', 500);
  }
  if (body.versi_dokumen !== await versiDokumen(dokumenKini)) {
    return tolak(
      409,
      'dokumen-berubah',
      'Isi perjanjian baru saja diperbarui. Halaman akan dimuat ulang — mohon baca kembali sebelum menandatangani.',
      { kode: 'dokumen_berubah' },
    );
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
    context.waitUntil(logServerError(env, { message: `[sign POST] Upload R2 gagal: ${err.message}`, stack: err.stack, url: urlAman, context: { kode_perjanjian: agr.kode_perjanjian } }));
    // Jika R2 gagal, JANGAN set token_used — tolak request
    return jsonError('Gagal menyimpan tanda tangan. Silakan coba lagi.', 500);
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
  let updateResult;
  try {
    updateResult = await env.DB.prepare(`
      UPDATE agreements
      SET token_used          = 1,
          status              = 'signed',
          signature_image_url = ?,
          signed_at           = ?,
          audit_ip            = ?,
          audit_user_agent    = ?,
          audit_hash_dokumen  = ?,
          audit_hash_versi    = ?,
          updated_at          = CURRENT_TIMESTAMP
      WHERE sign_token = ? AND token_used = 0
    `).bind(
      signature_image_url,
      signedAt,
      audit_ip,
      audit_user_agent,
      audit_hash_dokumen,
      versiHash(agr),
      token
    ).run();
  } catch (err) {
    console.error('[sign POST] UPDATE agreements gagal:', err.message);
    context.waitUntil(logServerError(env, { message: `[sign POST] UPDATE agreements gagal: ${err.message}`, stack: err.stack, url: urlAman, context: { kode_perjanjian: agr.kode_perjanjian } }));
    return jsonError('Gagal merekam tanda tangan. Silakan coba lagi.', 500);
  }

  // Guard double-submit: dua request paralel sama-sama lolos validasi token di atas,
  // tapi hanya satu yang mengubah baris (WHERE token_used = 0). Yang kalah TIDAK
  // boleh lanjut ke auto-publish/PDF — itu akan menimpa pdf_url tanda tangan sah
  // dan mengembalikan respons "signed" palsu.
  if ((updateResult?.meta?.changes ?? 0) === 0) {
    await env.MEDIA.delete(signature_image_url).catch(() => {});
    // Biasanya ketukan ganda — permintaan satunya SUDAH berhasil menandatangani.
    return tolak(409, 'kalah-race', 'Link tanda tangan sudah digunakan sebelumnya');
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
  // Status tayang SESUNGGUHNYA — dulu pesan sukses selalu "telah dipublikasikan",
  // termasuk untuk listing yang diarsipkan admin (UPDATE di atas hanya menyentuh
  // draft) atau saat UPDATE-nya gagal.
  const properti_tayang = await env.DB.prepare('SELECT status_publish FROM properties WHERE id = ?')
    .bind(agr.property_id).first().then(r => r?.status_publish === 'published', () => false);

  // ─── [7] Generate PDF arsip (non-fatal: gagal = pdf_url null, sign tetap sukses) ──
  let pdf_tersedia = false;
  try {
    // Ambil bytes TTD owner dari R2 untuk diembed di PDF
    let ownerSigBytes = null;
    try {
      const sigObj = await env.MEDIA.get(signature_image_url);
      if (sigObj) ownerSigBytes = await sigObj.arrayBuffer();
    } catch (err) {
      console.error('[sign POST] Fetch owner sig dari R2 gagal:', err.message);
    }

    const pdfBytes = await generateAgreementPDF({
      agr,
      nikPlain,
      signedAt,
      auditIp:   audit_ip,
      auditHash: audit_hash_dokumen,
      ownerSigBytes,
      pasalList: pasalDokumen(agr),
    });

    const pdfKey = `agreements/${agr.kode_perjanjian}-${crypto.randomUUID()}.pdf`;
    await env.MEDIA.put(pdfKey, pdfBytes, {
      httpMetadata: { contentType: 'application/pdf' },
    });

    await env.DB.prepare('UPDATE agreements SET pdf_url = ? WHERE sign_token = ?')
      .bind(pdfKey, token).run();

    pdf_tersedia = true;
  } catch (err) {
    console.error('[sign POST] Generate/simpan PDF gagal (non-fatal):', err.message);
    // Tanda tangan SAH tapi arsip PDF tidak ada — admin perlu tahu (dulu senyap).
    context.waitUntil(logServerError(env, { message: `[sign POST] PDF gagal dibuat (TTD tetap sah): ${err.message}`, stack: err.stack, url: urlAman, context: { kind: 'pdf-gagal', kode_perjanjian: agr.kode_perjanjian } }));
  }

  return jsonOk({
    status: 'signed',
    kode_perjanjian: agr.kode_perjanjian,
    slug_properti: agr.slug,
    signed_at: signedAt,
    audit_hash_dokumen,
    pdf_tersedia,
    properti_tayang,
    pesan: properti_tayang
      ? 'Tanda tangan berhasil. Properti Anda telah dipublikasikan di platform SBP.'
      : 'Tanda tangan berhasil. Tim SBP akan menayangkan properti Anda setelah pemeriksaan akhir.',
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
