// Autentikasi Google Service Account (JWT Bearer flow, RS256) memakai Web
// Crypto API bawaan Workers — tanpa library eksternal (google-auth-library
// tidak jalan di runtime Workers, itu library Node-only).
//
// Dipakai untuk panggil GA4 Data API (functions/api/admin/analytics/ga4-summary.js).
// Butuh 2 secret: GA4_SERVICE_ACCOUNT_EMAIL (client_email dari file JSON key)
// dan GA4_SERVICE_ACCOUNT_PRIVATE_KEY (private_key dari file JSON key — boleh
// disimpan APA ADANYA persis dari JSON, termasuk karakter literal "\n" di
// dalamnya, karena di-decode manual di bawah — tidak perlu diubah jadi baris
// baru sungguhan saat di-set via wrangler pages secret put).

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str) {
  return base64UrlEncode(new TextEncoder().encode(str));
}

async function importPrivateKey(pemRaw) {
  // JSON key Google menyimpan newline sebagai literal "\n" 2-karakter kalau
  // di-copy apa adanya ke satu baris (mis. saat di-set via wrangler secret put) —
  // konversi balik ke newline sungguhan dulu sebelum strip header/footer PEM.
  const pem = pemRaw.includes('\\n') ? pemRaw.replace(/\\n/g, '\n') : pemRaw;
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// Dapatkan access token OAuth2 (berlaku 1 jam). Tidak di-cache lintas-request —
// tiap panggilan bikin token baru, cukup untuk skala pemakaian admin panel ini.
export async function getGoogleAccessToken(env, scope = 'https://www.googleapis.com/auth/analytics.readonly') {
  const clientEmail = env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY belum dikonfigurasi');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const key = await importPrivateKey(privateKeyRaw);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new Error(`Gagal dapat access token Google: ${res.status} ${json?.error_description ?? json?.error ?? ''}`);
  }
  return json.access_token;
}
