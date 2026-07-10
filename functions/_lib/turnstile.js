// Verifikasi token Cloudflare Turnstile (CAPTCHA anti-bot).
// Dipakai oleh endpoint publik yang mahal/rawan spam: titip-jual, leads, chat.
//
// Pola rollout aman:
//   - env.TURNSTILE_SECRET BELUM di-set  → fail-open (skip), form tetap jalan.
//     Ini memungkinkan deploy kode lebih dulu, baru pasang key di dashboard.
//   - env.TURNSTILE_SECRET SUDAH di-set  → fail-closed, token wajib valid.
//   - Gangguan jaringan ke Cloudflare     → fail-open (degraded) agar user asli
//     tidak terblokir karena masalah infra, tapi dicatat di log.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {string|undefined} token  - token dari widget (field cf_turnstile_token)
 * @param {string|undefined} secret - env.TURNSTILE_SECRET
 * @param {string|null} [ip]        - CF-Connecting-IP (opsional, memperkuat verifikasi)
 * @returns {Promise<{ ok: boolean, skipped?: boolean, degraded?: boolean, error?: string }>}
 */
export async function verifyTurnstile(token, secret, ip = null) {
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing-token' };

  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success === true) return { ok: true };
    return { ok: false, error: (data['error-codes'] ?? []).join(',') || 'verify-failed' };
  } catch (err) {
    console.error('[turnstile] verify error:', err?.message);
    return { ok: true, degraded: true };
  }
}
