// POST /api/admin/viralframe/cloudinary-sign
//   Body: { character_id? } → kredensial Cloudinary milik agent tsb (migrasi 0037);
//                             tanpa itu (atau agent belum punya akun) pakai akun global.
//          { property_id? } → folder default sbp-viralframe/agent-videos/{id}
//          { folder? } eksplisit (harus diawali "sbp-viralframe/") untuk kebutuhan
//                      lain di luar video agent.
//   Membuat parameter signed upload Cloudinary (timestamp + signature) supaya
//   browser bisa upload video langsung ke Cloudinary tanpa lewat Worker
//   (hindari limit 30 detik wall-clock & buffering file besar) dan tanpa
//   pernah mengirim CLOUDINARY_API_SECRET ke client.
//
//   cloudName yang dikembalikan WAJIB dipakai client untuk URL upload DAN
//   dikirim balik saat mencatat metadata — baris aset menyimpan cloud-nya
//   sendiri supaya penghapusan nanti menembak akun yang benar.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { sha1Hex } from '../../../_lib/cloudinary.js';
import { resolveCloudinary, cekSpesialis } from '../../../_lib/agentAccounts.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch { /* body opsional */ }

  const characterId = parseInt(body.character_id, 10);
  const propertyId0 = parseInt(body.property_id, 10);

  // Cek kecocokan spesialis SEBELUM tanda tangan diberikan — kalau ditolak di
  // sini, admin belum sempat mengunggah file 20 MB untuk kemudian ditolak.
  // Gerbang sebenarnya tetap di agent-videos POST (endpoint ini bisa dilewati).
  if (Number.isInteger(characterId) && Number.isInteger(propertyId0)) {
    const prop = await env.DB.prepare('SELECT jenis_properti FROM properties WHERE id = ?')
      .bind(propertyId0).first().catch(() => null);
    const cek = await cekSpesialis(env, characterId, prop?.jenis_properti);
    if (!cek.boleh) return jsonError(cek.pesan, 422);
  }

  const creds = await resolveCloudinary(env, Number.isInteger(characterId) ? characterId : null);
  if (!creds) {
    return jsonError('Cloudinary belum dikonfigurasi — isi di Admin → Konten Agent → Akun Agent, atau set CLOUDINARY_* di Cloudflare', 500);
  }

  const explicitFolder = typeof body.folder === 'string' && body.folder.startsWith('sbp-viralframe/') ? body.folder.slice(0, 200) : null;
  const propertyId = parseInt(body.property_id, 10);
  const folder = explicitFolder ?? `sbp-viralframe/agent-videos/${Number.isInteger(propertyId) && propertyId > 0 ? propertyId : 'misc'}`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary signature = SHA1(paramString + api_secret), param diurutkan alfabetis, hanya param yang dikirim ke /upload
  const paramString = `folder=${folder}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramString + creds.apiSecret);

  return jsonOk({ cloudName: creds.cloudName, apiKey: creds.apiKey, timestamp, folder, signature, sumber: creds.sumber });
}

export async function onRequestOptions() { return handleOptions(); }
