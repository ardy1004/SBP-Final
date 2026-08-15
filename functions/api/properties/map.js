// GET /api/properties/map — DINONAKTIFKAN sementara (410 Gone)
//
// Endpoint ini dulu mengembalikan koordinat (lat/lng) minimal untuk pin peta,
// hanya properti published yang punya koordinat. Static route ini prioritas di
// atas [slug].js — JANGAN HAPUS FILE-NYA: kalau dihapus, /api/properties/map
// jatuh ke [slug].js dan diperlakukan sebagai slug properti bernama "map".
//
// Dimatikan 2026-08-12 atas keputusan pemilik: calon pembeli, kompetitor, dan
// broker lain memakai peta + tautan Maps di situs untuk mendatangi lokasi
// properti langsung dan memotong peran agen. Ini penyembunyian tampilan, bukan
// penghapusan data — latitude/longitude/gmaps_link tetap utuh di D1, tetap
// dipakai admin, dan tetap dipakai pencarian "dekat <kampus>" yang menghitung
// jarak di sisi server (functions/_lib/geoLandmarks.js). Satu-satunya pemanggil
// klien, PropertyMap.tsx via getMapProperties() di src/lib/api.ts, kini tidak
// terjangkau (saklar TAMPILKAN_PETA_PUBLIK di src/lib/fiturPublik.ts = false).
//
// Untuk menghidupkan kembali: pulihkan isi onRequestGet dari commit ini (git
// history) — query lama yang menyeleksi properti berkoordinat dan mengembalikan
// { items } masih utuh di history.

// ⚠️ WAJIB lewat jsonError(), BUKAN Response.json() mentah. Dua alasan, keduanya
// tercatat di CLAUDE.md: (1) seluruh endpoint memakai amplop {success,data,error}
// yang dibaca bacaJson<T>() — endpoint terakhir yang melanggarnya sudah dihapus
// 2026-08-02 justru agar tidak ada pengecualian tersisa; (2) helper ini
// menyuntikkan Access-Control-Allow-Methods/-Headers, sedangkan _middleware.js
// hanya menimpa Allow-Origin — respons mentah kehilangan dua header itu.
import { jsonError, handleOptions } from '../_shared/response.js';

export async function onRequestGet() {
  return jsonError(
    'Endpoint dinonaktifkan sementara atas keputusan pemilik. Data koordinat masih utuh di D1 untuk keperluan admin & pencarian "dekat <kampus>".',
    410,
  );
}

export async function onRequestOptions() {
  return handleOptions();
}
