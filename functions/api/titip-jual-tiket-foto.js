// POST /api/titip-jual-tiket-foto — Publik, tanpa auth.
//
// Menerbitkan tiket unggah foto (`/api/titip-jual-foto`) independen dari
// `titip-jual-prospek.js`. Bagian dari refactor Titip Jual dua tahap
// (PLAN-TITIP-JUAL-PROPERTI-DULU.md): step form properti yang baru memanggil
// endpoint ini begitu dia mount — SEBELUM Turnstile, SEBELUM submit apa pun —
// supaya foto bisa mulai diunggah progresif tanpa menunggu step prospek lama.
//
// Bentuk tiketnya SAMA PERSIS dengan terbitkanTiketFoto() di
// titip-jual-prospek.js (scope 'titipjual-foto', TTL 1 jam) karena konsumennya
// (titip-jual-foto.js) hanya memvalidasi scope + tanda tangan, tidak peduli
// siapa penerbitnya.
//
// Tanpa Turnstile — alasan sama dengan titip-jual-prospek.js: harus tetap
// jalan walau widget Turnstile gagal dimuat, dan token Turnstile sekali pakai
// jadi tidak boleh dihabiskan di sini (submit akhir yang membutuhkannya).
//
// ⚠️ REM ANTI-FLOOD (ditambahkan setelah audit implementasi) — endpoint ini
// SEBELUMNYA tanpa syarat input maupun rate limit sama sekali, sedangkan
// pendahulunya (titip-jual-prospek.js) minimal mewajibkan nama+WA berformat
// valid sebelum menerbitkan tiket sejenis. Tanpa rem, siapa pun bisa mencetak
// tiket `titipjual-foto` tanpa batas lalu menyalahgunakannya di
// titip-jual-foto.js sebagai hosting gambar anonim gratis ke R2 sbp-media,
// tanpa pernah mengisi form atau lolos Turnstile. Polanya sama dengan
// wa-click.js/titip-jual-prospek.js: hitung baris semenit terakhir, fail-open.
// ⚠️ Beda dari titip-jual-prospek.js: DI SANA tiket TETAP diterbitkan walau
// jalur throttled (rem itu hanya melindungi tabel `leads`). DI SINI tiket
// SENGAJA ditahan saat throttle — endpoint ini tidak punya tabel lain untuk
// dilindungi, jadi rem-nya harus benar-benar membatasi penerbitan tiket itu
// sendiri, bukan cuma metrik sampingan.

import { jsonOk, handleOptions } from './_shared/response.js';
import { signJWT } from './_shared/jwt.js';
import { hashIp } from '../_lib/remIp.js';

const TIKET_FOTO_DETIK = 3600;

// ⚠️ REM PER-IP (2026-09-27), menggantikan rem GLOBAL 20/menit. Rem global itu
// adalah tuas DoS: satu orang yang meminta tiket tiap 3 detik membuat SEMUA
// penjual lain mendapat tiket null, sehingga setiap unggahan foto 403 dan tak
// seorang pun bisa mengirim Titip Jual. Batas per-IP longgar (CGNAT seluler —
// lihat remIp.js); plafon global tinggi hanya jaring pengaman terhadap banjir
// dari banyak IP.
const MAX_PER_IP_PER_MENIT = 10;
const MAX_GLOBAL_PER_MENIT = 120;

async function hitungSemenit(db, ipHash) {
  try {
    const row = await db.prepare(`
      SELECT COUNT(*) AS global,
             SUM(CASE WHEN ip_hash = ? THEN 1 ELSE 0 END) AS ip
        FROM titip_jual_tiket_log
       WHERE jenis = 'tiket' AND created_at > datetime('now', '-60 seconds')
    `).bind(ipHash).first();
    return { global: row?.global ?? 0, ip: row?.ip ?? 0 };
  } catch {
    return { global: 0, ip: 0 }; // fail-open: lebih baik kehilangan rem daripada menahan pengisi form asli
  }
}

async function terbitkanTiketFoto(env) {
  if (!env.JWT_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    // `sid` = identitas sesi unggah. titip-jual-foto.js membatasi jumlah
    // unggahan per sid — dulu satu tiket boleh mengunggah tanpa batas selama 1 jam.
    return await signJWT({ scope: 'titipjual-foto', sid: crypto.randomUUID(), iat: now, exp: now + TIKET_FOTO_DETIK }, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const ipHash = await hashIp(env, request);

  if (env.DB) {
    const n = await hitungSemenit(env.DB, ipHash);
    if (n.global >= MAX_GLOBAL_PER_MENIT || (ipHash && n.ip >= MAX_PER_IP_PER_MENIT)) {
      // 200, bukan 429 — klien memperlakukan tiket null sebagai "minta lagi
      // nanti" (TitipJualPage meminta ulang sebelum mengunggah & saat 403).
      return jsonOk({ tiket_foto: null, throttled: true });
    }
  }

  const tiket_foto = await terbitkanTiketFoto(env);
  if (env.DB && tiket_foto) {
    // Best-effort — gagal mencatat tidak boleh menggagalkan penerbitan tiket
    // yang sudah ditandatangani.
    context.waitUntil(
      env.DB.prepare(`INSERT INTO titip_jual_tiket_log (ip_hash, jenis) VALUES (?, 'tiket')`).bind(ipHash).run()
        .catch(err => console.error('[titip-jual-tiket-foto] catat rem gagal:', err.message))
    );
  }

  return jsonOk({ tiket_foto });
}

export async function onRequestOptions() { return handleOptions(); }
