import { verifyJWT, SESSION_COOKIE_NAME } from '../_shared/jwt.js';
import { jsonError } from '../_shared/response.js';

// Route yang TIDAK membutuhkan auth (whitelist)
const PUBLIC_PATHS = ['/api/admin/login', '/api/admin/logout'];

export async function onRequest(context) {
  const { request, env, next } = context;

  // Lewati auth untuk route publik (login, logout)
  const url = new URL(request.url);
  if (PUBLIC_PATHS.some(p => url.pathname === p)) {
    return next();
  }

  // Preflight OPTIONS — tidak perlu auth
  if (request.method === 'OPTIONS') {
    return next();
  }

  // Tidak ada JWT_SECRET → konfigurasi server salah
  if (!env.JWT_SECRET) {
    return jsonError('Konfigurasi server tidak lengkap', 503);
  }

  // Baca token dari cookie httpOnly
  const cookieName = SESSION_COOKIE_NAME();
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const cookieMatch  = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  const token = cookieMatch?.[1] ?? null;

  // Fallback: Bearer token di Authorization header (untuk klien non-browser / testing)
  const authHeader = request.headers.get('Authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const rawToken = token ?? bearerToken;

  if (!rawToken) {
    return jsonError('Sesi tidak ditemukan. Silakan login kembali.', 401);
  }

  const payload = await verifyJWT(rawToken, env.JWT_SECRET);
  if (!payload) {
    return jsonError('Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.', 401);
  }

  // Tolak token yang diterbitkan SEBELUM password terakhir diganti. Tanpa ini,
  // mengganti password tidak memutus sesi yang sudah bocor — token lama tetap
  // sah sampai exp-nya (8 jam). password_changed_at NULL (belum pernah ganti)
  // berarti tidak ada pembatasan.
  // Gagal baca DB sengaja TIDAK memblokir: kalau tidak, gangguan D1 sesaat akan
  // mengunci admin keluar dari panelnya sendiri.
  try {
    const row = await env.DB
      .prepare(`SELECT CAST(strftime('%s', password_changed_at) AS INTEGER) AS pwd_epoch
                FROM admins WHERE id = ? LIMIT 1`)
      .bind(payload.sub)
      .first();
    if (row?.pwd_epoch && Number(payload.iat ?? 0) < row.pwd_epoch) {
      return jsonError('Password telah diubah. Silakan login kembali.', 401);
    }
  } catch (err) {
    console.error('[admin auth] cek password_changed_at gagal:', err?.message);
  }

  // Attach data admin ke context — dapat dibaca oleh handler di bawahnya
  context.data.admin = payload;

  return next();
}
