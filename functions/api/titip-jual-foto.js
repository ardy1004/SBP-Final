// POST /api/titip-jual-foto — Publik, tanpa auth.
// Menerima SATU foto, menulisnya ke R2 (`sbp-media`), mengembalikan key-nya.
//
// KENAPA ADA. Sampai 8 Sep 2026 seluruh foto dikirim sebagai base64 di dalam
// SATU body `/api/titip-jual` — 8–11 MB untuk 20 foto, 60–90 detik di uplink
// seluler. Koneksi yang putus di tengah membuat `request.json()` gagal dan
// SELURUH form hilang: data diri, harga, legalitas, semuanya. Tiga klien
// kehilangan submitnya pada hari yang sama, dan tidak satu pun meninggalkan
// jejak. Dengan endpoint ini tiap foto jadi request ~1 MB yang bisa diulang
// sendiri, dan submit form tinggal mengirim daftar key (beberapa KB).
//
// ⚠️ SENGAJA BUKAN presigned URL langsung ke R2 (pola r2-sign.js milik
// ViralFrame). Bucket ini `sbp-media` yang PRIVAT — berisi NIK terenkripsi dan
// arsip kontrak — dan presigned PUT tidak bisa membatasi ukuran objek, jadi
// siapa pun yang lolos CAPTCHA bisa menulis objek sebesar apa pun. Lewat Worker,
// ukuran tetap kita yang pegang.

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { verifyJWT } from './_shared/jwt.js';
import { stripExif } from '../_lib/exif.js';
import { logServerError } from '../_lib/logError.js';

const MAKS_BYTE = 8 * 1024 * 1024;          // sama dengan ambang di titip-jual.js & klien
const PREFIKS   = 'property-photos/';        // skema key yang sudah dipakai sejak awal

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch {
    // Pembedaan baca/parse tidak diperlukan di sini: request ini ~1 MB, dan
    // kalaupun putus, klien tinggal mengulang SATU foto — bukan seluruh form.
    return jsonError('Body JSON tidak valid', 400);
  }

  // ─── Anti-bot: TIKET, bukan Turnstile ─────────────────────────────────────
  // 🔥 Endpoint ini SENGAJA tidak memverifikasi Turnstile sendiri, dan itu bukan
  // kelalaian. Token Turnstile SEKALI PAKAI: memakainya di sini akan menghanguskan
  // token yang dibutuhkan `/api/titip-jual` beberapa detik kemudian, sehingga
  // submit yang fotonya sudah aman justru ditolak 403. Persis kegagalan yang
  // sedang kita perbaiki.
  //
  // Buktinya dipindah ke tiket ber-HMAC yang diterbitkan `/api/titip-jual-prospek`
  // saat Step 1 selesai (pola tiket yang sama dengan chat.js). Endpoint itu punya
  // rem sendiri — MAX_PER_MINUTE 20 — jadi jumlah tiket yang bisa diterbitkan
  // per menit sudah terbatas, dan tiketnya kedaluwarsa dalam 1 jam.
  if (!env.JWT_SECRET) {
    // Tanpa secret, tiket tidak bisa diverifikasi. Fail-open mengikuti pola
    // turnstile.js agar dev lokal tetap jalan; di produksi secret ini selalu ada.
    console.warn('[titip-jual-foto] JWT_SECRET kosong — verifikasi tiket dilewati');
  } else {
    const tiket = await verifyJWT(body.tiket, env.JWT_SECRET, 'titipjual-foto');
    if (!tiket) {
      context.waitUntil(logServerError(env, {
        message: '[titip-jual-foto] Tiket tidak sah (403)',
        url: request.url,
        userAgent: request.headers.get('User-Agent') ?? undefined,
        context: { kind: 'tiket-403', ada_tiket: Boolean(body.tiket) },
      }));
      return jsonError('Sesi unggah tidak sah. Muat ulang halaman lalu isi ulang Step 1.', 403);
    }
  }

  // ─── Validasi foto ────────────────────────────────────────────────────────
  const foto = typeof body.foto === 'string' ? body.foto : '';
  const cocok = foto.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
  if (!cocok) return jsonError('Format foto tidak valid — hanya JPEG, PNG, atau WebP', 422);

  const base64 = foto.slice(foto.indexOf(',') + 1);
  const ukuran = Math.ceil(base64.length * 3 / 4);
  if (ukuran > MAKS_BYTE) return jsonError('Ukuran foto melebihi 8MB', 422);

  if (!env.MEDIA) {
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-foto] Binding R2 MEDIA tidak tersedia (503)',
      url: request.url,
      context: { kind: 'config-503' },
    }));
    return jsonError('Penyimpanan tidak tersedia', 503);
  }

  const ext = cocok[1].toLowerCase() === 'jpg' ? 'jpeg' : cocok[1].toLowerCase();
  // Key SELALU ditentukan server. Klien tidak pernah boleh memilihnya — kalau
  // bisa, ia dapat menimpa foto listing lain di bucket yang sama.
  const key = `${PREFIKS}${crypto.randomUUID()}.${ext}`;

  try {
    const rawBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    // ⚠️ stripExif WAJIB — jalur lama membuangnya, dan tanpa ini koordinat GPS
    // rumah pemilik ikut tersimpan di bucket lalu tersaji lewat /api/media.
    const bytes = stripExif(rawBytes);
    await env.MEDIA.put(key, bytes.buffer, { httpMetadata: { contentType: `image/${ext}` } });
  } catch (err) {
    console.error('[titip-jual-foto] upload gagal:', err.message);
    context.waitUntil(logServerError(env, {
      message: `[titip-jual-foto] Upload R2 gagal (500): ${err.message}`,
      stack: err.stack,
      url: request.url,
      context: { kind: 'upload-500' },
    }));
    return jsonError('Foto gagal diunggah. Coba lagi.', 500);
  }

  return jsonOk({ key });
}

export async function onRequestOptions() { return handleOptions(); }
