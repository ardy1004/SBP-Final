// GET /api/admin/agreements/:id/pasal — isi pasal perjanjian untuk editor admin.
// PUT /api/admin/agreements/:id/pasal — simpan isi pasal khusus perjanjian ini.
//     Body: { blok: [{ judul, isi }] }  → pasal_kustom = 1
//        atau { reset: true }           → kembali ke template (pasal_kustom = 0)
//
// Tahap C2 (2026-11-21). Fondasi (salinan beku, hash v2): functions/_lib/teksPerjanjian.js.
// Aturan:
//   · perjanjian `signed` TERKUNCI (409) — perubahan sesudah TTD lewat
//     "Versi perbaikan" (versi-perbaikan.js), sejalan dengan Pasal 8.
//   · menyunting saat `menunggu_ttd` mengubah versi_dokumen → pemilik yang
//     sedang membuka link diminta memuat ulang (409 "dokumen berubah" di
//     /api/sign). Itu perilaku yang benar: tak ada yang menandatangani isi
//     yang tidak ia baca.
//   · placeholder di luar daftar putih ditolak; angka penting (fee, durasi,
//     harga) WAJIB lewat placeholder supaya teks tak bertentangan dengan data.
//   · siapa & kapan dicatat (pasal_diubah_oleh/at, migrasi 0064).
// Auth: functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import {
  TEMPLATE_V1, PLACEHOLDER, buatSnapshot, bacaSnapshot, varianDari, pilihBlok, validasiBlok,
} from '../../../../_lib/teksPerjanjian.js';

const KOLOM = `a.id, a.kode_perjanjian, a.status, a.jenis_listing, a.durasi_kontrak, a.fee_persen,
  a.pasal_json, a.pasal_kustom, a.pasal_template_versi, a.pasal_diubah_oleh, a.pasal_diubah_at,
  p.tujuan, p.jenis_properti, p.alamat, p.kelurahan, p.kecamatan, p.kabupaten, p.provinsi,
  p.legalitas, p.harga, p.harga_sewa_tahun, p.nego, p.nett`;

async function ambil(env, id) {
  return env.DB.prepare(`SELECT ${KOLOM} FROM agreements a JOIN properties p ON p.id = a.property_id WHERE a.id = ?`).bind(id).first();
}

function bentukRespons(agr) {
  let snap = null, rusak = false;
  try { snap = bacaSnapshot(agr.pasal_json); } catch { rusak = true; }
  const varianSekarang = varianDari(agr);
  const signedTanpaSalinan = agr.status === 'signed' && !snap;
  return {
    id: agr.id,
    kode_perjanjian: agr.kode_perjanjian,
    status: agr.status,
    terkunci: agr.status === 'signed',
    // salinan_rusak: editor menawarkan "Kembalikan ke template" untuk memulihkan.
    salinan_rusak: rusak,
    sumber: snap ? (agr.pasal_kustom === 1 ? 'kustom' : 'salinan') : (signedTanpaSalinan ? 'arsip_pdf' : 'template'),
    template_versi: snap?.versi ?? TEMPLATE_V1.versi,
    diubah_oleh: agr.pasal_diubah_oleh ?? null,
    diubah_at: agr.pasal_diubah_at ?? null,
    varian: snap?.varian ?? varianSekarang,
    varian_sekarang: varianSekarang,
    // Perjanjian signed tanpa salinan (sebelum 0063): teks yang ditandatangani
    // hanya ada di PDF arsip — tidak direkonstruksi di sini.
    blok: snap ? snap.blok : (signedTanpaSalinan ? [] : pilihBlok(TEMPLATE_V1, varianSekarang)),
    // Data untuk pratinjau ter-render di browser (renderPasal yang sama dengan /sign).
    data_render: {
      jenis_listing: agr.jenis_listing, durasi_kontrak: agr.durasi_kontrak, fee_persen: agr.fee_persen,
      tujuan: agr.tujuan, jenis_properti: agr.jenis_properti, alamat: agr.alamat, kelurahan: agr.kelurahan,
      kecamatan: agr.kecamatan, kabupaten: agr.kabupaten, provinsi: agr.provinsi, legalitas: agr.legalitas,
      harga: agr.harga, harga_sewa_tahun: agr.harga_sewa_tahun, nego: agr.nego, nett: agr.nett,
    },
    placeholder: PLACEHOLDER,
  };
}

const idSah = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

export async function onRequestGet({ env, params }) {
  const id = idSah(params.id);
  if (!id) return jsonError('ID agreement tidak valid', 400);
  const agr = await ambil(env, id);
  if (!agr) return jsonError('Agreement tidak ditemukan', 404);
  return jsonOk(bentukRespons(agr));
}

export async function onRequestPut({ env, request, params, data }) {
  const id = idSah(params.id);
  if (!id) return jsonError('ID agreement tidak valid', 400);
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const agr = await ambil(env, id);
  if (!agr) return jsonError('Agreement tidak ditemukan', 404);
  if (agr.status === 'signed') {
    return jsonError('Perjanjian sudah ditandatangani — isi pasal terkunci. Perubahan dibuat lewat "Versi perbaikan".', 409);
  }

  const oleh = String(data?.admin?.nama || data?.admin?.email || `admin#${data?.admin?.sub ?? '?'}`).slice(0, 120);
  let pasal_json, kustom, versi;
  if (body?.reset === true) {
    const snap = buatSnapshot(TEMPLATE_V1, agr);
    pasal_json = JSON.stringify(snap);
    kustom = 0;
    versi = snap.versi;
  } else {
    const hasil = validasiBlok(body?.blok);
    if (hasil.galat) return jsonError(hasil.galat, 422);
    let versiLama = TEMPLATE_V1.versi;
    try { versiLama = bacaSnapshot(agr.pasal_json)?.versi ?? versiLama; } catch { /* rusak → versi template */ }
    // Varian = konfigurasi TERSIMPAN saat ini. Bila admin lalu mengubah jenis
    // listing/transaksi di configure, configure.js menolak (409) supaya pasal
    // kustom ditinjau ulang — blok ini disusun untuk varian ini.
    pasal_json = JSON.stringify({ versi: versiLama, varian: varianDari(agr), blok: hasil.blok });
    kustom = 1;
    versi = versiLama;
  }

  await env.DB.prepare(
    `UPDATE agreements SET pasal_json = ?, pasal_kustom = ?, pasal_template_versi = ?,
            pasal_diubah_oleh = ?, pasal_diubah_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'signed'`
  ).bind(pasal_json, kustom, versi, oleh, id).run();

  return jsonOk(bentukRespons(await ambil(env, id)));
}

export async function onRequestOptions() { return handleOptions(); }
