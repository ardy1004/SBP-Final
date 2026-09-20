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

const TIKET_FOTO_DETIK = 3600;

// Volume wajar: satu tiket per pengunjung yang membuka /titip-jual. Cap ini
// jauh di atas trafik organik tapi menutup skenario flood ke tabel penghitung.
const MAX_PER_MINUTE = 20;

async function tiketTerakhirSemenit(db) {
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM titip_jual_tiket_log WHERE created_at > datetime('now', '-60 seconds')`)
      .first();
    return row?.cnt ?? 0;
  } catch {
    return 0; // fail-open: lebih baik kehilangan rem daripada menahan pengisi form asli
  }
}

async function terbitkanTiketFoto(env) {
  if (!env.JWT_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    return await signJWT({ scope: 'titipjual-foto', iat: now, exp: now + TIKET_FOTO_DETIK }, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const { env } = context;

  if (env.DB && (await tiketTerakhirSemenit(env.DB)) >= MAX_PER_MINUTE) {
    // 200, bukan 429 — dipanggil fire-and-forget saat StepProperti mount, klien
    // tidak menampilkan error apa pun untuk kegagalan ini. Tanpa tiket, unggah
    // foto akan ditolak titip-jual-foto.js dengan pesan yang sudah ada ("sesi
    // unggah tidak sah, muat ulang halaman") — bukan kegagalan senyap baru.
    return jsonOk({ tiket_foto: null, throttled: true });
  }

  const tiket_foto = await terbitkanTiketFoto(env);
  if (env.DB && tiket_foto) {
    // Best-effort — gagal mencatat tidak boleh menggagalkan penerbitan tiket
    // yang sudah ditandatangani.
    context.waitUntil(
      env.DB.prepare('INSERT INTO titip_jual_tiket_log DEFAULT VALUES').run()
        .catch(err => console.error('[titip-jual-tiket-foto] catat rem gagal:', err.message))
    );
  }

  return jsonOk({ tiket_foto });
}

export async function onRequestOptions() { return handleOptions(); }
