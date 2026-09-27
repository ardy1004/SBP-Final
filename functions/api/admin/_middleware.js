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

  // ⚠️ Scope 'admin' WAJIB. Tiket publik (chat_pass, tiket unggah foto,
  // tiket_lanjut Titip Jual) ditandatangani dengan JWT_SECRET yang SAMA, jadi
  // tanda tangan sah saja BUKAN bukti sesi admin. Sampai 2026-09-27 baris ini
  // tidak memeriksa scope, dan tiket foto yang bisa diminta siapa pun tanpa
  // login membuka NIK terdekripsi seluruh pemilik. Lihat komentar di jwt.js.
  const payload = await verifyJWT(rawToken, env.JWT_SECRET, 'admin');
  if (!payload || !Number.isInteger(payload.sub)) {
    return jsonError('Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.', 401);
  }

  // Admin WAJIB masih ada di tabel `admins`, dan token yang diterbitkan SEBELUM
  // password terakhir diganti ditolak. Tanpa yang kedua, mengganti password
  // tidak memutus sesi yang sudah bocor — token lama tetap sah sampai exp-nya
  // (8 jam). password_changed_at NULL (belum pernah ganti) = tanpa pembatasan.
  //
  // Gagal baca DB sengaja TIDAK memblokir: kalau tidak, gangguan D1 sesaat akan
  // mengunci admin keluar dari panelnya sendiri. Ini aman HANYA karena scope
  // 'admin' + sub integer sudah diverifikasi di atas — token seperti itu cuma
  // bisa diterbitkan login.js/password.js. Jangan pindahkan cek scope ke bawah
  // blok ini.
  try {
    const row = await env.DB
      .prepare(`SELECT id, CAST(strftime('%s', password_changed_at) AS INTEGER) AS pwd_epoch
                FROM admins WHERE id = ? LIMIT 1`)
      .bind(payload.sub)
      .first();
    if (!row) {
      return jsonError('Sesi tidak valid. Silakan login kembali.', 401);
    }
    if (row.pwd_epoch && Number(payload.iat ?? 0) < row.pwd_epoch) {
      return jsonError('Password telah diubah. Silakan login kembali.', 401);
    }
  } catch (err) {
    console.error('[admin auth] cek admin/password_changed_at gagal:', err?.message);
  }

  // Attach data admin ke context — dapat dibaca oleh handler di bawahnya
  context.data.admin = payload;

  return next();
}
