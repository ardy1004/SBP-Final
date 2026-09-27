// HS256 JWT menggunakan Web Crypto API bawaan Workers — tanpa library eksternal

const SESSION_HOURS = 8;

// Encode string/ArrayBuffer ke base64url
function toB64Url(input) {
  let binary;
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = new Uint8Array(input instanceof ArrayBuffer ? input : input.buffer);
    binary = String.fromCharCode(...bytes);
  } else {
    // String (mungkin mengandung Unicode — encode ke UTF-8 dulu)
    const bytes = new TextEncoder().encode(input);
    binary = String.fromCharCode(...bytes);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Decode base64url → string (UTF-8)
function fromB64Url(b64) {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes  = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

// ⚠️ SETIAP token WAJIB ber-`scope`, dan SETIAP verifikasi WAJIB menyebut scope
// yang diharapkan. Semua token proyek ini — sesi admin DAN tiket publik
// (`chat`, `titipjual-foto`, `titipjual-lanjut`) — ditandatangani dengan
// JWT_SECRET yang SAMA, jadi tanda tangan sah saja tidak membuktikan apa pun
// tentang JENIS token.
//
// Sampai 2026-09-27 middleware admin hanya memeriksa tanda tangan: tiket unggah
// foto yang bisa diminta siapa pun tanpa login (POST /api/titip-jual-tiket-foto)
// diterima sebagai sesi admin, dan membuka NIK terdekripsi seluruh pemilik.
// Terbuka sejak 26 Jul (chat_pass), tanpa captcha sejak 8 Sep. Karena itu kedua
// fungsi di bawah MENOLAK dipanggil tanpa scope — lupa memeriksanya sekarang
// menjadi error saat itu juga, bukan celah senyap.
export async function signJWT(payload, secret) {
  if (typeof payload?.scope !== 'string' || !payload.scope) {
    throw new Error('signJWT: payload wajib punya `scope` (lihat komentar di jwt.js)');
  }
  const header  = toB64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = toB64Url(JSON.stringify(payload));
  const data    = `${header}.${body}`;
  const key     = await hmacKey(secret, 'sign');
  const sigBuf  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64  = toB64Url(sigBuf);
  return `${data}.${sigB64}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {string} scopeWajib  scope yang HARUS dimiliki token ('admin', 'chat', …).
 *   Wajib diisi — token sah ber-scope lain dikembalikan null.
 * @returns {Promise<object|null>} payload, atau null bila tidak sah/kedaluwarsa/scope beda
 */
export async function verifyJWT(token, secret, scopeWajib) {
  if (typeof scopeWajib !== 'string' || !scopeWajib) {
    throw new Error('verifyJWT: scopeWajib wajib diisi (lihat komentar di jwt.js)');
  }
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  try {
    const key      = await hmacKey(secret, 'verify');
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(fromB64Url(body));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (payload.scope !== scopeWajib) return null;
    return payload;
  } catch {
    return null;
  }
}

export function makePayload(admin) {
  const now = Math.floor(Date.now() / 1000);
  return {
    scope: 'admin',
    sub:   admin.id,
    email: admin.email,
    nama:  admin.nama,
    role:  admin.role,
    iat:   now,
    exp:   now + SESSION_HOURS * 3600,
  };
}

export function SESSION_COOKIE_NAME() { return 'sbp_session'; }

export function makeSessionCookie(token, clear = false) {
  const opts = [
    `sbp_session=${clear ? '' : token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_HOURS * 3600}`,
    'Secure',
  ];
  return opts.join('; ');
}
