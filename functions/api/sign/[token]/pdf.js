// GET /api/sign/:token/pdf — unduh PDF arsip perjanjian yang sudah ditandatangani
// Publik (dilindungi token rahasia, seperti GET /api/sign/:token).
// 404 jika token tidak ada / belum signed / pdf_url null.
// 410 jika sudah lewat JENDELA_UNDUH_HARI sejak ditandatangani.
//
// ⚠️ KENAPA ADA BATAS WAKTU. PDF ini memuat NIK/SIM pemilik, dan satu-satunya
// kuncinya adalah token di URL /sign/<token>. Sampai 2026-09-27 link itu:
// (1) tidak pernah kedaluwarsa setelah ditandatangani, dan (2) ikut terkirim ke
// Meta Pixel & GA4 setiap kali dibuka (lihat tanpaPelacak() di root.tsx).
// Jadi siapa pun yang pernah melihat URL-nya — termasuk di laporan GA4 — bisa
// mengunduh dokumen ber-NIK SELAMANYA. Pemilik cukup mengunduh sesaat setelah
// tanda tangan; sesudah jendela ini, salinan diminta ke admin (admin tetap bisa
// mengunduh kapan saja lewat /api/admin/media).

import { jsonError } from '../../_shared/response.js';

const JENDELA_UNDUH_HARI = 7;

export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.token?.trim();

  if (!token) return jsonError('Token tidak disertakan', 400);

  const agr = await env.DB.prepare(
    'SELECT kode_perjanjian, status, pdf_url, signed_at FROM agreements WHERE sign_token = ?',
  ).bind(token).first();

  if (!agr)                   return jsonError('Perjanjian tidak ditemukan', 404);
  if (agr.status !== 'signed') return jsonError('Perjanjian belum ditandatangani', 404);

  // signed_at ditulis sign POST sebagai ISO UTC. Baris tanpa signed_at (mustahil
  // untuk status signed, tapi jangan menebak) diperlakukan sudah lewat jendela.
  const ditandatanganiMs = Date.parse(agr.signed_at ?? '');
  if (!Number.isFinite(ditandatanganiMs)
      || Date.now() - ditandatanganiMs > JENDELA_UNDUH_HARI * 24 * 3600 * 1000) {
    return jsonError(
      `Link unduhan hanya berlaku ${JENDELA_UNDUH_HARI} hari setelah penandatanganan. Silakan minta salinan perjanjian ke admin SBP via WhatsApp 0813-9127-8889.`,
      410,
    );
  }

  if (!agr.pdf_url)            return jsonError('PDF arsip belum tersedia', 404);

  const obj = await env.MEDIA.get(agr.pdf_url);
  if (!obj) return jsonError('File PDF tidak ditemukan di storage', 404);

  // Use arrayBuffer so middleware stream-rewrap preserves explicit Content-Type
  const pdfBuf = await obj.arrayBuffer();
  const filename = `Perjanjian-${agr.kode_perjanjian}.pdf`;
  return new Response(pdfBuf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function onRequestOptions(context) {
  const { env } = context;
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
