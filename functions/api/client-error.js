// POST /api/client-error — endpoint publik untuk error dari browser pengunjung
// (ErrorBoundary React, window.onerror, unhandledrejection). Tanpa CAPTCHA —
// error report legitimate harus tetap bisa terkirim walau user belum sempat
// isi form apa pun; risiko spam ditahan lewat cap ukuran + field wajib.
//
// TIDAK memakai Turnstile (akan menolak error report yang justru terjadi
// SEBELUM widget captcha sempat render).

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { logServerError } from '../_lib/logError.js';

function clip(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const message = clip(body.message, 1000);
  if (!message) return jsonError('message wajib diisi', 400);

  const stack = clip(body.stack, 4000);
  const url = clip(body.url, 500);
  const userAgent = clip(request.headers.get('User-Agent') ?? '', 500);

  const errCtx = body.context && typeof body.context === 'object' ? body.context : undefined;

  await logServerError(env, { source: 'client', message, stack, url, userAgent, context: errCtx });

  return jsonOk({ logged: true });
}

export async function onRequestOptions() {
  return handleOptions();
}
