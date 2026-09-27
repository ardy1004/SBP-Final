// Definisi bersama untuk pekerjaan admin atas pengajuan Titip Jual — SATU SUMBER
// bagi daftar properti, badge sidebar, kartu ringkasan, dan tab "belum lengkap".
//
// KENAPA ADA (audit 2026-09-27). Pengajuan Titip Jual tidak memberi tahu admin
// sama sekali: tidak ada notifikasi di Tahap 1 maupun 2, badge sidebar "Titip
// Jual" di-hardcode 0, dan listing hasil Titip Jual tidak bisa dibedakan dari
// draft buatan admin. Pemilik yang berhenti setelah Tahap 1 (punya WA, belum
// KYC, tanpa perjanjian) praktis tak terlihat — padahal pesan galat kita
// menjanjikan "admin akan menghubungi Anda".

/**
 * Ekspresi SQL (alias tabel properti WAJIB `p`): properti ini lahir dari form
 * Titip Jual.
 * - `submit_id` diisi titip-jual-mulai.js untuk SETIAP pengajuan sejak migrasi
 *   0042 (server membuatnya sendiri bila klien tidak mengirim).
 * - Pengajuan sebelum 0042 lewat alur sekali-jalan titip-jual.js yang SELALU
 *   membuat perjanjian — jadi EXISTS(agreements) menangkapnya.
 * Diverifikasi ke D1 produksi 2026-09-27: 29 + 3 cocok, 7 owner buatan admin
 * (tanpa NIK, tanpa submit_id) TIDAK ikut. Jangan diganti "punya owner tanpa
 * NIK" — itu justru menangkap owner buatan admin.
 */
export const SQL_DARI_TITIP_JUAL =
  '(p.submit_id IS NOT NULL OR EXISTS (SELECT 1 FROM agreements ax WHERE ax.property_id = p.id))';

/**
 * Pemilik berhenti di Tahap 1: pengajuan Titip Jual, owner belum KYC, belum ada
 * perjanjian. Alias tabel: `p` (properties), `o` (owners).
 */
export const SQL_TAHAP1_TERTUNDA = `
  p.submit_id IS NOT NULL
  AND (o.nik_encrypted IS NULL OR o.nik_encrypted = '')
  AND NOT EXISTS (SELECT 1 FROM agreements ax WHERE ax.property_id = p.id)
`;

/** Link tanda tangan sudah lewat masa berlaku tapi statusnya masih menunggu_ttd. */
export function linkKedaluwarsa(a, sekarang = Date.now()) {
  if (a?.status !== 'menunggu_ttd' || !a.token_expires_at) return false;
  const t = Date.parse(a.token_expires_at);
  return Number.isFinite(t) && t < sekarang;
}
