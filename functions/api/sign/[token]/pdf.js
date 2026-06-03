// GET /api/sign/:token/pdf — unduh PDF arsip perjanjian yang sudah ditandatangani
// Publik (dilindungi token rahasia, seperti GET /api/sign/:token).
// 404 jika token tidak ada / belum signed / pdf_url null.

import { jsonError } from '../../_shared/response.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const token = params.token?.trim();

  if (!token) return jsonError('Token tidak disertakan', 400);

  const agr = await env.DB.prepare(
    'SELECT kode_perjanjian, status, pdf_url FROM agreements WHERE sign_token = ?',
  ).bind(token).first();

  if (!agr)                   return jsonError('Perjanjian tidak ditemukan', 404);
  if (agr.status !== 'signed') return jsonError('Perjanjian belum ditandatangani', 404);
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
