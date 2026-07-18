import bcrypt from 'bcryptjs';
import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';
import { signJWT, makePayload, makeSessionCookie } from '../_shared/jwt.js';

const RATE_LIMIT_MAX     = 5;   // max percobaan gagal per email (memperlambat, bukan mengunci total)
const RATE_LIMIT_IP_MAX  = 20;  // max percobaan gagal per IP dalam window (guard brute-force)
const RATE_LIMIT_WINDOW  = 15;  // menit

// Pesan error generik — tidak mengungkap apakah email ada atau tidak (spec 13.1)
const ERR_INVALID = 'Email atau password salah';

function sanitize(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

// Hitung percobaan gagal berdasarkan kolom (identifier=email atau ip_address)
async function countRecentAttempts(db, column, value) {
  if (!value) return 0;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW * 60 * 1000).toISOString();
  const row = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM login_rate_limits
              WHERE ${column} = ? AND attempted_at > ?`)
    .bind(value, windowStart)
    .first();
  return row?.cnt ?? 0;
}

async function recordFailedAttempt(db, identifier, ip) {
  await db
    .prepare(`INSERT INTO login_rate_limits (identifier, ip_address) VALUES (?, ?)`)
    .bind(identifier, ip ?? null)
    .run()
    .catch(err => console.error('[rate_limit] insert error:', err.message));
}

async function clearAttempts(db, identifier) {
  await db
    .prepare(`DELETE FROM login_rate_limits WHERE identifier = ?`)
    .bind(identifier)
    .run()
    .catch(() => {});
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Pastikan JWT_SECRET sudah dikonfigurasi
  if (!env.JWT_SECRET) {
    console.error('[login] JWT_SECRET belum dikonfigurasi');
    return jsonError('Konfigurasi server tidak lengkap', 503);
  }

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const email    = sanitize(body.email    ?? '');
  const password = sanitize(body.password ?? '', 100);

  if (!email || !password) {
    return jsonError('Email dan password wajib diisi', 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') ??
             request.headers.get('X-Forwarded-For')  ??
             null;

  // ── Rate limit: cek percobaan gagal per-email DAN per-IP ─────────────────────
  // Per-IP mencegah brute-force lintas banyak email; per-email memperlambat serangan
  // terhadap satu akun tanpa memungkinkan penyerang mengunci admin secara permanen.
  const [attempts, ipAttempts] = await Promise.all([
    countRecentAttempts(env.DB, 'identifier', email),
    countRecentAttempts(env.DB, 'ip_address', ip),
  ]);
  if (attempts >= RATE_LIMIT_MAX || ipAttempts >= RATE_LIMIT_IP_MAX) {
    return jsonError(
      `Terlalu banyak percobaan login. Coba lagi dalam ${RATE_LIMIT_WINDOW} menit.`,
      429
    );
  }

  // Housekeeping: buang attempt yang sudah jauh di luar window (>24 jam) —
  // tanpa ini tabel tumbuh tanpa batas karena hanya clearAttempts(email) saat
  // login sukses yang pernah menghapus baris.
  context.waitUntil(
    env.DB.prepare(`DELETE FROM login_rate_limits WHERE attempted_at < ?`)
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .run().catch(() => {})
  );

  // ── Cari admin by email ───────────────────────────────────────────────────────
  const admin = await env.DB
    .prepare(`SELECT id, email, password_hash, nama, role FROM admins WHERE email = ? LIMIT 1`)
    .bind(email)
    .first()
    .catch(() => null);

  // Admin tidak ditemukan — catat attempt & kembalikan pesan generik
  if (!admin) {
    await recordFailedAttempt(env.DB, email, ip);
    return jsonError(ERR_INVALID, 401);
  }

  // ── Verifikasi password dengan bcrypt ─────────────────────────────────────────
  let passwordValid = false;
  try {
    passwordValid = await bcrypt.compare(password, admin.password_hash);
  } catch (err) {
    console.error('[login] bcrypt error:', err.message);
    return jsonError('Terjadi kesalahan saat verifikasi. Coba lagi.', 500);
  }

  if (!passwordValid) {
    await recordFailedAttempt(env.DB, email, ip);
    // Pesan generik & identik dengan kasus "email tidak ditemukan" —
    // tidak membocorkan email admin mana yang valid (mencegah user enumeration).
    return jsonError(ERR_INVALID, 401);
  }

  // ── Login berhasil ─────────────────────────────────────────────────────────────
  // Sign token DULU — kalau gagal, rate limit tidak terlanjur direset.
  const payload = makePayload(admin);
  const token   = await signJWT(payload, env.JWT_SECRET);
  const cookie  = makeSessionCookie(token);

  // Bersihkan rate limit + update last_login (non-blocking, setelah token aman)
  context.waitUntil(Promise.all([
    clearAttempts(env.DB, email),
    env.DB.prepare(`UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(admin.id).run().catch(() => {}),
  ]));

  return new Response(
    JSON.stringify({ success: true, data: { nama: admin.nama, role: admin.role } }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://salambumi.xyz',
        'Access-Control-Allow-Credentials': 'true',
      },
    }
  );
}

export async function onRequestOptions() {
  return handleOptions();
}
