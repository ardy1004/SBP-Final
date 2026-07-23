// Helper Cloudinary bersama untuk Pages Functions (signed request + destroy).
// API secret hanya dipakai di server, tidak pernah dikirim ke browser.

export async function sha1Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function destroyCloudinaryAsset(env, publicId, resourceType) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary belum dikonfigurasi');

  const timestamp = Math.floor(Date.now() / 1000);
  const paramString = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramString + apiSecret);

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', apiKey);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType || 'video'}/destroy`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary destroy gagal: ${res.status}`);
}
