// POST /api/titip-jual-prospek — DIPENSIUNKAN (tombstone 410 Gone), 2026-09-27.
//
// Dulu menangkap calon penjual (nama + WA → tabel `leads`) sebelum form
// sekali-jalan selesai, sekaligus menerbitkan tiket unggah foto. Sejak alur dua
// tahap (06c8a87, 21 Sep 2026) klien TIDAK memanggilnya lagi: properti + owner
// ringan lahir nyata di /api/titip-jual-mulai, dan tiket foto diterbitkan
// /api/titip-jual-tiket-foto. Lead penjual terakhir tercatat 18 Sep 2026.
//
// Kenapa dipensiunkan, bukan dibiarkan (audit 2026-09-27):
// - IDOR tanpa autentikasi: jalur UPDATE menimpa `nama`/`no_wa` lead penjual
//   mana pun lewat `lead_id` berurutan, SEBELUM rem anti-flood — panggilan admin
//   bisa dibelokkan ke nomor penyerang.
// - Jalan pintas melewati rem tiket foto: jalur UPDATE & throttled tetap
//   menerbitkan tiket `titipjual-foto` tanpa batas.
// - Tiket itu juga (sampai perbaikan JWT scope hari yang sama) diterima sebagai
//   sesi admin.
//
// 410, bukan dihapus: tab/bundle yang sangat basi mendapat jawaban jelas alih-
// alih jatuh ke SSR catch-all. Aman dihapus total kapan saja.

import { jsonError, handleOptions } from './_shared/response.js';

export async function onRequestPost() {
  return jsonError('Formulir ini sudah diperbarui. Muat ulang halaman Titip Jual untuk melanjutkan.', 410);
}

export async function onRequestOptions() { return handleOptions(); }
