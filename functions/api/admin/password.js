import bcrypt from 'bcryptjs';
import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';

function sanitize(val, maxLen = 100) {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const adminCtx = context.data.admin;

  if (!adminCtx?.sub) return jsonError('Tidak terautentikasi', 401);

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const password_lama             = sanitize(body.password_lama            ?? '');
  const password_baru             = sanitize(body.password_baru            ?? '');
  const password_baru_konfirmasi  = sanitize(body.password_baru_konfirmasi ?? '');

  if (!password_lama || !password_baru || !password_baru_konfirmasi) {
    return jsonError('Semua field wajib diisi', 400);
  }
  if (password_baru !== password_baru_konfirmasi) {
    return jsonError('Password baru dan konfirmasi tidak cocok', 400);
  }
  if (password_baru.length < 8) {
    return jsonError('Password baru minimal 8 karakter', 400);
  }

  const row = await env.DB
    .prepare('SELECT password_hash FROM admins WHERE id = ? LIMIT 1')
    .bind(adminCtx.sub)
    .first()
    .catch(() => null);

  if (!row) return jsonError('Admin tidak ditemukan', 404);

  let valid = false;
  try {
    valid = await bcrypt.compare(password_lama, row.password_hash);
  } catch (err) {
    console.error('[password] bcrypt compare:', err.message);
    return jsonError('Terjadi kesalahan saat verifikasi', 500);
  }

  if (!valid) return jsonError('Password lama salah', 401);

  let hash;
  try {
    hash = await bcrypt.hash(password_baru, 12);
  } catch (err) {
    console.error('[password] bcrypt hash:', err.message);
    return jsonError('Terjadi kesalahan saat hashing', 500);
  }

  await env.DB
    .prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
    .bind(hash, adminCtx.sub)
    .run();

  return jsonOk({ message: 'Password berhasil diubah' });
}

export async function onRequestOptions() {
  return handleOptions();
}
