// POST /api/admin/agreements/:id/versi-perbaikan
// Buat perjanjian PENGGANTI untuk perjanjian signed yang isinya tercetak keliru
// (lihat migrations/0053_agreements_digantikan_oleh.sql untuk latar belakang).
//
// Yang lama TIDAK diubah statusnya — tetap 'signed', PDF & tanda tangannya tetap
// arsip sah, penjaga hapus-properti tetap aktif, listing tetap tayang. Yang baru
// lahir sebagai 'draft' dengan syarat (listing/durasi/fee) disalin dari yang lama;
// admin lalu mengkonfigurasi & mengirim link tanda tangan seperti biasa. Isi
// dokumennya disusun ulang dari data terkini oleh isiPerjanjian.js saat pemilik
// membuka link, jadi label kewenangan/harga/jenis transaksi otomatis benar.
//
// Auth: _middleware.js (admin only)

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { nextKodeSeq, fmtSeq, isUniqueErr } from '../../../../_lib/kodeSeq.js';
import { logServerError } from '../../../../_lib/logError.js';

function today8() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID agreement tidak valid', 400);

  const lama = await env.DB.prepare(
    'SELECT id, kode_perjanjian, status, digantikan_oleh FROM agreements WHERE id = ?'
  ).bind(id).first();

  if (!lama) return jsonError('Agreement tidak ditemukan', 404);
  if (lama.status !== 'signed') {
    return jsonError('Versi perbaikan hanya untuk perjanjian yang sudah ditandatangani. Perjanjian yang belum ditandatangani cukup dikonfigurasi ulang.', 409);
  }
  if (lama.digantikan_oleh) {
    return jsonError('Perjanjian ini sudah punya versi perbaikan.', 409, { agreement_id: lama.digantikan_oleh });
  }

  const date8 = today8();
  let seq;
  try {
    seq = await nextKodeSeq(env.DB, 'agreements', 'kode_perjanjian', `SBP-AGR-${date8}-`);
  } catch (err) {
    context.waitUntil(logServerError(env, { message: `[versi-perbaikan] Gagal generate kode: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal membuat versi perbaikan. Coba lagi.', 500);
  }

  // Satu batch = satu transaksi D1:
  // 1. INSERT pengganti — HANYA bila yang lama masih signed & belum digantikan.
  //    Dua klik bersamaan diserialkan D1; yang kedua melihat digantikan_oleh sudah
  //    terisi sehingga INSERT-nya 0 baris (tidak ada draft yatim).
  // 2. UPDATE penanda pada yang lama, menunjuk baris pengganti lewat kodenya.
  const jalankan = kode => env.DB.batch([
    env.DB.prepare(`
      INSERT INTO agreements
        (kode_perjanjian, property_id, owner_id, jenis_transaksi, jenis_listing,
         durasi_kontrak, fee_persen, status, created_at, updated_at)
      SELECT ?, property_id, owner_id, jenis_transaksi, jenis_listing,
             durasi_kontrak, fee_persen, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM agreements
       WHERE id = ? AND status = 'signed' AND digantikan_oleh IS NULL
    `).bind(kode, id),
    env.DB.prepare(`
      UPDATE agreements
         SET digantikan_oleh = (SELECT id FROM agreements WHERE kode_perjanjian = ?),
             updated_at      = CURRENT_TIMESTAMP
       WHERE id = ? AND digantikan_oleh IS NULL
         AND EXISTS (SELECT 1 FROM agreements WHERE kode_perjanjian = ?)
    `).bind(kode, id, kode),
  ]);

  let kode = `SBP-AGR-${date8}-${fmtSeq(seq)}`;
  let hasil;
  for (let percobaan = 0; ; percobaan++) {
    try {
      hasil = await jalankan(kode);
      break;
    } catch (err) {
      if (!isUniqueErr(err) || percobaan >= 3) {
        context.waitUntil(logServerError(env, { message: `[versi-perbaikan] batch gagal: ${err.message}`, stack: err.stack, url: request.url, context: { agreement_id: id } }));
        return jsonError('Gagal membuat versi perbaikan. Coba lagi.', 500);
      }
      kode = `SBP-AGR-${date8}-${fmtSeq(seq + percobaan + 1)}`;
    }
  }

  if ((hasil[0]?.meta?.changes ?? 0) === 0) {
    // Kalah balapan dengan klik lain, atau status berubah di antara SELECT & batch.
    const kini = await env.DB.prepare('SELECT digantikan_oleh FROM agreements WHERE id = ?').bind(id).first();
    return jsonError('Perjanjian ini sudah punya versi perbaikan.', 409, { agreement_id: kini?.digantikan_oleh ?? null });
  }

  const baru = await env.DB.prepare('SELECT id, kode_perjanjian FROM agreements WHERE kode_perjanjian = ?').bind(kode).first();
  return jsonOk({
    agreement_id: baru?.id,
    kode_perjanjian: baru?.kode_perjanjian,
    menggantikan: lama.kode_perjanjian,
    pesan: `Versi perbaikan ${baru?.kode_perjanjian} dibuat. Konfigurasi lalu kirim link tanda tangan ke pemilik.`,
  }, 201);
}

export async function onRequestOptions() {
  return handleOptions();
}
