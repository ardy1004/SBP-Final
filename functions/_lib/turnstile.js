// Verifikasi token Cloudflare Turnstile (CAPTCHA anti-bot).
// Dipakai oleh endpoint publik yang mahal/rawan spam: titip-jual, leads, chat.
//
// Pola rollout aman:
//   - env.TURNSTILE_SECRET BELUM di-set  → fail-open (skip), form tetap jalan.
//     Ini memungkinkan deploy kode lebih dulu, baru pasang key di dashboard.
//   - env.TURNSTILE_SECRET SUDAH di-set  → fail-closed, token wajib valid.
//   - Gangguan jaringan ke Cloudflare     → fail-open (degraded) agar user asli
//     tidak terblokir karena masalah infra, tapi dicatat di log.
//
// PENGECUALIAN fail-open (di luar host kanonik):
// Environment Preview Cloudflare Pages TIDAK mewarisi secret dari Production —
// harus di-set manual dan saat ini hanya berisi JWT_SECRET + NIK_ENC_KEY. Padahal
// deployment preview memakai binding D1/R2 yang SAMA dengan produksi. Tanpa
// pengecualian ini, setiap deploy dari branch non-master menghasilkan URL publik
// tanpa CAPTCHA yang bisa membanjiri tabel leads produksi.
// Karena itu: secret hilang + host di luar FAIL_OPEN_HOSTS → TOLAK, bukan skip.
// Perilaku di produksi dan dev lokal tidak berubah sama sekali. Alias per-deploy
// produksi (<hash>.sbp-final.pages.dev) juga tidak terpengaruh: environment-nya
// Production sehingga secret-nya ADA dan alurnya lewat verifikasi normal.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Host yang boleh fail-open saat secret kosong: produksi (menjaga properti rollout)
// dan dev lokal (.dev.vars memang tidak memuat TURNSTILE_SECRET — tanpa localhost
// di sini, `wrangler pages dev` akan menolak semua submit form).
const FAIL_OPEN_HOSTS = new Set([
  'salambumi.xyz', 'www.salambumi.xyz', 'localhost', '127.0.0.1', '[::1]',
]);

/**
 * @param {string|undefined} token  - token dari widget (field cf_turnstile_token)
 * @param {string|undefined} secret - env.TURNSTILE_SECRET
 * @param {string|null} [ip]        - CF-Connecting-IP (opsional, memperkuat verifikasi)
 * @param {string|null} [hostname]  - hostname request; dipakai hanya saat secret kosong.
 *                                    null/tak diisi = anggap kanonik (fail-open lama).
 * @returns {Promise<{ ok: boolean, skipped?: boolean, degraded?: boolean, error?: string }>}
 */
export async function verifyTurnstile(token, secret, ip = null, hostname = null) {
  if (!secret) {
    if (hostname && !FAIL_OPEN_HOSTS.has(hostname.toLowerCase())) {
      console.error('[turnstile] secret kosong di host non-kanonik, tolak:', hostname);
      return { ok: false, error: 'captcha-not-configured-on-non-canonical-host' };
    }
    return { ok: true, skipped: true };
  }
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
