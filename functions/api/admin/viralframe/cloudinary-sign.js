// POST /api/admin/viralframe/cloudinary-sign
//   Body opsional: { folder? }
//   Membuat parameter signed upload Cloudinary (timestamp + signature) supaya
//   browser bisa upload video langsung ke Cloudinary tanpa lewat Worker
//   (hindari limit 30 detik wall-clock & buffering file besar) dan tanpa
//   pernah mengirim CLOUDINARY_API_SECRET ke client.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

async function sha1Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return jsonError('Cloudinary belum dikonfigurasi (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)', 500);
  }

  let body = {};
  try { body = await request.json(); } catch { /* body opsional */ }

  const propertyId = parseInt(body.property_id, 10);
  const folder = `sbp-viralframe/agent-videos/${Number.isInteger(propertyId) && propertyId > 0 ? propertyId : 'misc'}`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary signature = SHA1(paramString + api_secret), param diurutkan alfabetis, hanya param yang dikirim ke /upload
  const paramString = `folder=${folder}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramString + apiSecret);

  return jsonOk({ cloudName, apiKey, timestamp, folder, signature });
}

export async function onRequestOptions() { return handleOptions(); }
