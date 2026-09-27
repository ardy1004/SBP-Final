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
// Batas unggahan per tiket (sid). Form menerima maks 20 foto; sisanya ruang
// untuk percobaan ulang. Dulu tanpa batas → hosting berkas anonim gratis.
const MAKS_UNGGAHAN_PER_TIKET = 30;

/**
 * Jenis gambar menurut ISI berkas (magic bytes), bukan label data-URL-nya.
 * Dulu byte apa pun disimpan dengan contentType image/* dan tersaji lewat
 * /api/media dengan cache 1 tahun.
 */
function jenisDariIsi(b) {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
      && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

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
  // Buktinya dipindah ke tiket ber-HMAC yang diterbitkan `/api/titip-jual-tiket-foto`
  // saat form dibuka (pola tiket yang sama dengan chat.js). Endpoint itu punya
  // rem per-IP, tiketnya kedaluwarsa dalam 1 jam, dan membawa `sid` yang
  // membatasi jumlah unggahan (MAKS_UNGGAHAN_PER_TIKET).
  let tiketSah = null;
  if (!env.JWT_SECRET) {
    // Fail-CLOSED. Dulu fail-open di host MANA PUN (tanpa daftar host seperti
    // turnstile.js) — deployment tanpa secret = unggah anonim tanpa batas ke
    // bucket privat. Production, Preview, dan .dev.vars lokal sama-sama punya
    // JWT_SECRET, jadi cabang ini hanya menyala bila konfigurasi rusak.
    context.waitUntil(logServerError(env, { message: '[titip-jual-foto] JWT_SECRET kosong (503)', url: request.url, context: { kind: 'config-503' } }));
    return jsonError('Konfigurasi server tidak lengkap', 503);
  } else {
    tiketSah = await verifyJWT(body.tiket, env.JWT_SECRET, 'titipjual-foto');
    if (!tiketSah) {
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

  let rawBytes;
  try {
    rawBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch {
    return jsonError('Format foto tidak valid — base64 rusak', 422);
  }
  if (jenisDariIsi(rawBytes) !== ext) {
    context.waitUntil(logServerError(env, {
      message: '[titip-jual-foto] Isi berkas bukan gambar yang dideklarasikan (422)',
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
      context: { kind: 'isi-bukan-gambar-422', label: ext, isi: jenisDariIsi(rawBytes) },
    }));
    return jsonError('Berkas ini bukan foto JPEG, PNG, atau WebP yang valid', 422);
  }

  // Batas per tiket. Tiket lama tanpa `sid` (terbit sebelum deploy ini, berumur
  // ≤ 1 jam) dibiarkan lewat supaya pengisi form yang sedang berjalan tidak putus.
  const sid = tiketSah?.sid;
  if (sid && env.DB) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM titip_jual_foto_log WHERE sid = ?').bind(sid).first()
      .then(r => r?.n ?? 0, () => 0);   // fail-open: gangguan D1 tidak boleh menahan pengisi asli
    if (n >= MAKS_UNGGAHAN_PER_TIKET) {
      context.waitUntil(logServerError(env, {
        message: `[titip-jual-foto] Batas ${MAKS_UNGGAHAN_PER_TIKET} unggahan per tiket tercapai (429)`,
        url: request.url,
        context: { kind: 'batas-unggah-429' },
      }));
      return jsonError('Batas unggahan untuk sesi ini tercapai. Muat ulang halaman untuk melanjutkan.', 429);
    }
  }

  try {
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

  if (sid && env.DB) {
    context.waitUntil(
      env.DB.prepare('INSERT INTO titip_jual_foto_log (sid) VALUES (?)').bind(sid).run()
        .catch(err => console.error('[titip-jual-foto] catat unggahan gagal:', err.message))
    );
  }

  return jsonOk({ key });
}

export async function onRequestOptions() { return handleOptions(); }
