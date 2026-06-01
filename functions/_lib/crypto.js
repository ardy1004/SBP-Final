// Helper enkripsi/dekripsi NIK menggunakan Web Crypto API (AES-256-GCM)
// Spec 15 / K7: NIK wajib terenkripsi at-rest. Kunci dari env NIK_ENC_KEY.
//
// NIK_ENC_KEY boleh berupa string apapun (passphrase) — akan di-hash SHA-256 → 32-byte AES key.
// Format tersimpan di DB: base64(iv):base64(ciphertext)
// IV: 12 byte (96-bit) acak per enkripsi — aman untuk AES-GCM
//
// Produksi: `wrangler secret put NIK_ENC_KEY` dengan nilai passphrase acak yang kuat.

const ALG = { name: 'AES-GCM', length: 256 };

function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Derive AES-256 key dari passphrase via SHA-256
async function deriveKey(passphrase) {
  const rawKey = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(passphrase)
  );
  return crypto.subtle.importKey('raw', rawKey, ALG, false, ['encrypt', 'decrypt']);
}

export async function encryptNIK(nikPlain, keyMaterial) {
  const key = await deriveKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(nikPlain));
  return `${bytesToB64(iv)}:${bytesToB64(cipherBuf)}`;
}

export async function decryptNIK(encrypted, keyMaterial) {
  const sep = encrypted.indexOf(':');
  if (sep === -1) throw new Error('Format ciphertext NIK tidak valid');
  const iv = b64ToBytes(encrypted.slice(0, sep));
  const ct = b64ToBytes(encrypted.slice(sep + 1));
  const key = await deriveKey(keyMaterial);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
