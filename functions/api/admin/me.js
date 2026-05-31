import { jsonOk, handleOptions } from '../_shared/response.js';

// GET /api/admin/me — kembalikan data admin yang sedang login
// Middleware di _middleware.js sudah memverifikasi JWT sebelum sampai sini
export async function onRequestGet(context) {
  const { admin } = context.data;
  return jsonOk({ sub: admin.sub, email: admin.email, nama: admin.nama, role: admin.role });
}

export async function onRequestOptions() {
  return handleOptions();
}
