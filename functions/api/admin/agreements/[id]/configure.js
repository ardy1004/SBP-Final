// POST /api/admin/agreements/:id/configure
// Admin mengisi konfigurasi perjanjian dan men-generate sign_token untuk owner.
// Auth: JWT cookie/Bearer — ditangani oleh _middleware.js di functions/api/admin/

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const TOKEN_EXPIRY_HOURS = 72;

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError('ID agreement tidak valid', 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Body JSON tidak valid', 400);
  }

  // ─── Validasi input ────────────────────────────────────────────────────────
  const errors = {};
  const jenis_listing = String(body.jenis_listing ?? '').trim();
  const fee_persen_raw = body.fee_persen;
  const durasi_raw = body.durasi_kontrak;

  if (!['open', 'exclusive'].includes(jenis_listing)) {
    errors.jenis_listing = "jenis_listing harus 'open' atau 'exclusive'";
  }

  let fee_persen = parseFloat(fee_persen_raw);
  if (!isFinite(fee_persen) || fee_persen <= 0) {
    errors.fee_persen = 'fee_persen harus angka positif (mis. 3 atau 2.5)';
  }

  let durasi_kontrak = null;
  if (jenis_listing === 'exclusive') {
    const DURASI_VALID = [3, 6, 12];
    durasi_kontrak = parseInt(String(durasi_raw ?? ''), 10);
    if (!DURASI_VALID.includes(durasi_kontrak)) {
      errors.durasi_kontrak = 'durasi_kontrak wajib diisi untuk jenis exclusive (3, 6, atau 12 bulan)';
    }
  }

  if (Object.keys(errors).length > 0) {
    return jsonError('Validasi gagal', 422, errors);
  }

  // ─── Pastikan agreement ada dan masih bisa dikonfigurasi ──────────────────
  const agr = await env.DB
    .prepare('SELECT id, status FROM agreements WHERE id = ?')
    .bind(id)
    .first();

  if (!agr) {
    return jsonError('Agreement tidak ditemukan', 404);
  }
  if (agr.status === 'signed') {
    return jsonError('Agreement sudah ditandatangani, tidak bisa dikonfigurasi ulang', 409);
  }

  // ─── Generate sign_token + expiry ─────────────────────────────────────────
  const sign_token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3600 * 1000).toISOString();

  // ─── Update agreement ──────────────────────────────────────────────────────
  await env.DB.prepare(`
    UPDATE agreements
    SET jenis_listing   = ?,
        durasi_kontrak  = ?,
        fee_persen      = ?,
        sign_token      = ?,
        token_expires_at = ?,
        token_used      = 0,
        status          = 'menunggu_ttd',
        updated_at      = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    jenis_listing,
    durasi_kontrak,
    fee_persen,
    sign_token,
    expiresAt,
    id
  ).run();

  const appUrl = env.APP_URL ?? 'https://salambumi.xyz';
  const signUrl = `${appUrl}/sign/${sign_token}`;

  return jsonOk({
    agreement_id: id,
    sign_token,
    sign_url: signUrl,
    token_expires_at: expiresAt,
    jenis_listing,
    durasi_kontrak,
    fee_persen,
    status: 'menunggu_ttd',
    pesan: `Link TTD berhasil dibuat. Berlaku hingga ${new Date(expiresAt).toLocaleString('id-ID')}.`,
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
