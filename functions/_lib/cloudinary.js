// Helper Cloudinary bersama untuk Pages Functions (signed request + destroy).
// API secret hanya dipakai di server, tidak pernah dikirim ke browser.
//
// Sejak migrasi 0037 tiap agent bisa punya akun Cloudinary sendiri, jadi
// destroy TIDAK BOLEH lagi membaca env global begitu saja — ia harus menembak
// cloud tempat aset itu benar-benar tersimpan (kolom cloudinary_name di baris
// aset). Pakai destroyByCloudName() dari pemanggil yang punya baris DB-nya.

import { resolveCloudinaryByCloudName } from './agentAccounts.js';

export async function sha1Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// creds = { cloudName, apiKey, apiSecret } hasil resolve, BUKAN env.
export async function destroyCloudinaryAsset(creds, publicId, resourceType) {
  if (!creds?.cloudName || !creds?.apiKey || !creds?.apiSecret) throw new Error('Cloudinary belum dikonfigurasi');

  const timestamp = Math.floor(Date.now() / 1000);
  const paramString = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramString + creds.apiSecret);

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', creds.apiKey);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/${resourceType || 'video'}/destroy`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary destroy gagal: ${res.status}`);
}

// Hapus aset berdasarkan cloud tempat ia tersimpan. Melempar (bukan diam) kalau
// cloud-nya sudah tidak dikenali — pemanggil (bulk/purge) sudah dirancang
// menahan penghapusan baris D1 saat destroy gagal, supaya aset tidak jadi
// yatim tanpa jejak untuk retry.
export async function destroyByCloudName(env, cloudName, publicId, resourceType) {
  const creds = await resolveCloudinaryByCloudName(env, cloudName);
  if (!creds) throw new Error(`Kredensial Cloudinary untuk cloud '${cloudName ?? '(tidak tercatat)'}' tidak ditemukan`);
  return destroyCloudinaryAsset(creds, publicId, resourceType);
}
