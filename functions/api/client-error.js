// POST /api/client-error — endpoint publik untuk error dari browser pengunjung
// (ErrorBoundary React, window.onerror, unhandledrejection). Tanpa CAPTCHA —
// error report legitimate harus tetap bisa terkirim walau user belum sempat
// isi form apa pun; risiko spam ditahan lewat cap ukuran + field wajib.
//
// TIDAK memakai Turnstile (akan menolak error report yang justru terjadi
// SEBELUM widget captcha sempat render).

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { logServerError } from '../_lib/logError.js';

// Endpoint ini publik dan tanpa CAPTCHA, jadi laju insert-nya harus dibatasi di
// sisi server. Satu error nyata biasanya datang beberapa kali per menit; angka di
// bawah jauh di atas itu tapi tetap menutup skenario flood yang membengkakkan D1
// sekaligus menenggelamkan error asli.
const MAX_CLIENT_ERRORS_PER_MINUTE = 60;

// Backstop pertumbuhan tabel. Admin tetap bisa menghapus lebih agresif lewat
// DELETE /api/admin/errors?older_than_days=N — ini hanya jaring pengaman agar
// error_logs tidak tumbuh tanpa batas kalau housekeeping manual tidak pernah jalan.
const RETENTION_DAYS = 90;

function clip(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : null;
}

// Berapa banyak error klien yang sudah masuk dalam 60 detik terakhir.
// Gagal baca → kembalikan 0 (fail-open): kehilangan rem lebih baik daripada
// membuang error report asli karena D1 sedang bermasalah.
async function recentClientErrorCount(db) {
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM error_logs
                WHERE source = 'client' AND created_at > datetime('now', '-60 seconds')`)
      .first();
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
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

  // Housekeeping otomatis, non-blocking.
  if (env.DB) {
    context.waitUntil(
      env.DB.prepare(`DELETE FROM error_logs WHERE created_at < datetime('now', ?)`)
        .bind(`-${RETENTION_DAYS} days`)
        .run()
        .catch(() => {})
    );
  }

  // Throttle: balas 200 (bukan 429) supaya ErrorBoundary di browser tidak memicu
  // error susulan gara-gara laporan errornya sendiri ditolak.
  if (env.DB && (await recentClientErrorCount(env.DB)) >= MAX_CLIENT_ERRORS_PER_MINUTE) {
    return jsonOk({ logged: false, throttled: true });
  }

  await logServerError(env, { source: 'client', message, stack, url, userAgent, context: errCtx });

  return jsonOk({ logged: true });
}

export async function onRequestOptions() {
  return handleOptions();
}
