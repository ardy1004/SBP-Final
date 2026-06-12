import { useState, useEffect } from 'react';

// Email kontak dirakit CLIENT-SIDE setelah mount.
// Alasan: Cloudflare "Email Address Obfuscation" me-rewrite email plaintext di HTML SSR
// menjadi <a data-cfemail=...> — DOM jadi beda dengan hasil render React → hydration
// mismatch (React error #418/#423) di SEMUA halaman (email ada di Footer global).
// Dengan tidak merender email saat SSR, tidak ada yang bisa di-rewrite → hydration aman.
const EMAIL_USER = 'salambumiproperty';
const EMAIL_DOMAIN = 'gmail.com';

/** Fallback yang tampil saat SSR / sebelum hydration (tidak match pola email scanner). */
export const EMAIL_FALLBACK = `${EMAIL_USER}[at]${EMAIL_DOMAIN}`;

/** Return { email, href } — kosong saat SSR, terisi setelah mount. */
export function useContactEmail() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const email = mounted ? `${EMAIL_USER}@${EMAIL_DOMAIN}` : '';
  return {
    email,
    display: email || EMAIL_FALLBACK,
    href: email ? `mailto:${email}` : undefined,
  };
}
