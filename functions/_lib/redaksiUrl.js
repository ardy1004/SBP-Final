// Samarkan rahasia di URL sebelum disimpan ke error_logs (terbaca di Admin).
//
// - /sign/<token> dan /api/sign/<token>: token = kunci dokumen ber-NIK pemilik.
// - ?lanjut=<tiket>: tiket Tahap 2 Titip Jual (membuka form data diri).
//
// Dipakai SEMUA pencatat yang menyimpan URL dari request/klien: jalur server di
// functions/api/sign/[token].js dan laporan browser di functions/api/client-error.js
// (browser mengirim window.location.href apa adanya). Per 2026-09-27 belum ada
// satu pun baris error_logs yang memuat /sign/ — ini pencegahan.
export function redaksiUrl(u) {
  if (typeof u !== 'string' || !u) return u;
  return u
    .replace(/(\/sign\/)[^/?#\s]+/g, '$1<token>')
    .replace(/([?&]lanjut=)[^&#\s]*/g, '$1<tiket>');
}
