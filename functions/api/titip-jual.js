// POST /api/titip-jual — DIPENSIUNKAN (tombstone 410 Gone), 2026-09-27.
//
// Dulu menerima form Titip Jual SEKALI JALAN: properti + owner ber-NIK +
// perjanjian dalam satu request. Sejak alur dua tahap (06c8a87, 21 Sep 2026)
// klien memakai /api/titip-jual-mulai (Tahap 1) lalu /api/titip-jual-lengkapi
// (Tahap 2), dan tidak ada satu pun pemanggil endpoint ini di src/.
//
// Bukti nol pemakaian (D1 produksi, baca-saja, 2026-09-27): properti dengan
// perjanjian yang lahir <5 detik setelahnya — ciri khas jalur sekali-jalan ini
// — nol sejak 22 Sep (dari 9 kiriman Titip Jual baru); terakhir 18 Sep 2026.
//
// Kenapa dipensiunkan, bukan dibiarkan:
// - Pintu lama dengan validasi yang tertinggal dari perbaikan audit 2026-09-27
//   (dedupe/klaim photo_keys, batas unggah, jalur atomik) — permukaan serangan
//   tanpa manfaat.
// - ±26 KB di bundle Worker.
//
// 410, bukan dihapus: tab/bundle yang sangat basi mendapat jawaban jelas alih-
// alih jatuh ke SSR catch-all. Aman dihapus total kapan saja. Isi lamanya ada di
// riwayat git (sebelum commit ini). Pola sama: titip-jual-prospek.js.

import { jsonError, handleOptions } from './_shared/response.js';

export async function onRequestPost() {
  return jsonError('Formulir ini sudah diperbarui. Muat ulang halaman Titip Jual untuk melanjutkan.', 410);
}

export async function onRequestOptions() { return handleOptions(); }
