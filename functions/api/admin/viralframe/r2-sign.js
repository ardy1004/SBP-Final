// POST /api/admin/viralframe/r2-sign
//   Body: { property_id?, character_id? }
//   Mengembalikan presigned PUT URL ke bucket R2 sbp-video untuk video + poster,
//   supaya browser mengunggah LANGSUNG ke R2 tanpa lewat Worker.
//
// Kenapa presign, bukan upload lewat Worker: alasannya sama persis dengan
// cloudinary-sign.js yang digantikannya — file 20 MB dari koneksi rumahan bisa
// melewati batas wall-clock Worker 30 detik kalau body-nya harus mengalir lewat
// sana. Kredensial S3 R2 tidak pernah dikirim ke browser, hanya tanda tangannya.
//
// Menggantikan cloudinary-sign.js (migrasi 0043). Lihat functions/_lib/videoStorage.js
// untuk alasan biaya di balik perpindahan ini.
// Auth: _middleware.js

import { AwsClient } from 'aws4fetch';
import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { cekSpesialis } from '../../../_lib/agentAccounts.js';
import { kunciVideoBaru, urlPublik, r2Siap } from '../../../_lib/videoStorage.js';

const BUCKET = 'sbp-video';
const BERLAKU_DETIK = 900; // 15 menit — cukup untuk upload 50 MB di koneksi lambat

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch { /* body opsional */ }

  const characterId = parseInt(body.character_id, 10);
  const propertyId = parseInt(body.property_id, 10);

  // Pesan menyebut PERSIS apa yang hilang. Versi lama menulis "binding VIDEO +
  // R2_PUBLIC_BASE" padahal yang kosong cuma salah satunya — itu mengirim
  // diagnosa ke arah yang salah selama satu putaran penuh (2026-08-22).
  const kurang = [];
  if (!r2Siap(env)) kurang.push('binding R2 "VIDEO" (Dashboard → Pages → sbp-final → Settings → Functions → R2 bindings)');
  if (!env.R2_ACCOUNT_ID) kurang.push('R2_ACCOUNT_ID');
  if (!env.R2_ACCESS_KEY_ID) kurang.push('R2_ACCESS_KEY_ID');
  if (!env.R2_SECRET_ACCESS_KEY) kurang.push('R2_SECRET_ACCESS_KEY');
  if (kurang.length > 0) {
    return jsonError(`Storage R2 belum siap — yang belum ada: ${kurang.join(', ')}`, 500);
  }

  // Cek kecocokan spesialis SEBELUM tanda tangan diberikan — kalau ditolak di
  // sini, admin belum sempat mengunggah file 20 MB untuk kemudian ditolak.
  // Gerbang sebenarnya tetap di agent-videos POST (endpoint ini bisa dilewati).
  if (Number.isInteger(characterId) && Number.isInteger(propertyId)) {
    const prop = await env.DB.prepare('SELECT jenis_properti FROM properties WHERE id = ?')
      .bind(propertyId).first().catch(() => null);
    const cek = await cekSpesialis(env, characterId, prop?.jenis_properti);
    if (!cek.boleh) return jsonError(cek.pesan, 422);
  }

  const { key, posterKey } = kunciVideoBaru(propertyId);

  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  // signQuery: tanda tangan masuk ke query string, bukan header Authorization —
  // wajib untuk URL yang dipakai XHR dari browser. Efek sampingnya penting:
  // Content-Type TIDAK ikut ditandatangani, jadi browser bebas mengirimkannya
  // (dan memang WAJIB mengirim video/mp4 — platform sosmed menolak media yang
  // content-type-nya salah).
  const tandaTangani = async (objectKey) => {
    const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${objectKey}?X-Amz-Expires=${BERLAKU_DETIK}`;
    const signed = await client.sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } });
    return signed.url;
  };

  try {
    const [uploadUrl, posterUploadUrl] = await Promise.all([
      tandaTangani(key),
      tandaTangani(posterKey),
    ]);

    return jsonOk({
      key,
      posterKey,
      uploadUrl,
      posterUploadUrl,
      publicUrl: urlPublik(env, key),
      posterPublicUrl: urlPublik(env, posterKey),
      berlakuDetik: BERLAKU_DETIK,
    });
  } catch (err) {
    console.error('[vf r2-sign]', err.message);
    return jsonError('Gagal menyiapkan upload ke R2', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
