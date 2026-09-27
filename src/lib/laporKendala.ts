// Lapor kendala yang MENGHENTIKAN pengiriman formulir, ke /api/client-error.
//
// KENAPA ADA (2026-09-08/10)
// Tiga klien melapor "sudah mengisi form" sementara kita tidak punya apa-apa:
// nol baris di database, nol jejak di error_logs, dan dari sisi server semuanya
// tampak sehat. Sebabnya dua jalur di klien yang menghentikan submit SEBELUM
// request pernah dikirim, dan tidak melapor ke mana pun:
//   1. validasi menahan karena Turnstile belum ✓ (backend fail-closed, jadi
//      submit tanpa token memang percuma dikirim) — form berhenti diam-diam;
//   2. blok catch jaringan — pengunjung melihat "koneksi terputus", kita tidak.
// Selama keduanya gelap, setiap kegagalan berikutnya akan terlihat persis sama:
// klien yakin sudah mengirim, kita tidak punya bukti apa pun.
//
// ⚠️ HANYA UNTUK KENDALA SISTEM, BUKAN ISIAN YANG KURANG.
// "Harga wajib diisi" adalah perilaku normal dan terjadi sepanjang hari;
// melaporkannya akan membanjiri error_logs dan menenggelamkan yang penting —
// kegagalan yang sesungguhnya. Panggil ini hanya ketika yang menghalangi adalah
// SISTEM kita (CAPTCHA tidak terbit, jaringan putus), bukan pengunjungnya.

/** Kendala yang layak dilaporkan. Menambah nilai baru berarti menambah volume — timbang dulu. */
export type KodeKendala =
  | 'turnstile-menahan'   // token belum/gagal terbit, submit dihentikan di klien
  | 'jaringan-putus'      // request terkirim lalu koneksi mati sebelum respons
  | 'galat-tak-terduga';  // pengecualian yang lolos dari alur kirim (dulu = tombol macet)

export function laporKendalaForm(
  form: string,
  kode: KodeKendala,
  detail?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({
      message: `[form:${form}] ${kode}`,
      url: window.location.href,
      context: { kind: 'kendala-form', form, kode, ...detail },
    });
    // sendBeacon: tidak menahan interaksi dan tetap terkirim walau pengunjung
    // langsung menutup tab setelah gagal — alasan yang sama seperti waTrack.ts.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/client-error', new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => { /* noop */ });
  } catch {
    /* pelaporan kendala tidak boleh pernah menjadi kendala baru */
  }
}
