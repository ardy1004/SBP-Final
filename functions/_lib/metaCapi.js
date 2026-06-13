// Meta Conversions API (CAPI) helper — server-side event sending
// Digunakan oleh wa-click.js (Contact) dan leads.js (Lead).
// PII harus di-hash SHA-256 sebelum dikirim ke Meta.

/** Normalisasi nomor WA ke format E.164 Indonesia (62xxx) */
function normalizePhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('62')) return d;
  if (d.startsWith('0'))  return '62' + d.slice(1);
  if (d.startsWith('8'))  return '62' + d;
  return d;
}

/** SHA-256 hex via Web Crypto API (tersedia di Cloudflare Workers) */
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash PII fields sesuai standar Meta CAPI.
 * @param {{ ph?: string, em?: string }} rawData - PII mentah (no_wa, email)
 * @returns {Promise<Record<string, string>>}
 */
async function hashUserData(rawData) {
  const out = {};
  if (rawData.ph) {
    const normalized = normalizePhone(rawData.ph);
    if (normalized) out.ph = await sha256hex(normalized);
  }
  if (rawData.em) {
    out.em = await sha256hex(rawData.em.trim().toLowerCase());
  }
  return out;
}

/**
 * Kirim 1 event ke Meta Conversions API.
 * Tidak melempar exception — gagal = log saja (best-effort).
 *
 * @param {object} _env - Cloudflare env (reserved for future use)
 * @param {object} opts
 * @param {string} opts.pixelId
 * @param {string} opts.accessToken
 * @param {string} opts.eventName
 * @param {string} opts.eventId - untuk dedup dengan client-side Pixel
 * @param {string} [opts.eventSourceUrl]
 * @param {{ ph?: string, em?: string }} [opts.userData] - PII mentah, akan di-hash
 * @param {Record<string, unknown>} [opts.customData]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendCapiEvent(_env, { pixelId, accessToken, eventName, eventId, eventSourceUrl, userData = {}, customData = {} }) {
  try {
    const hashedUser = await hashUserData(userData);

    const payload = {
      data: [{
        event_name:       eventName,
        event_time:       Math.floor(Date.now() / 1000),
        event_id:         eventId,
        event_source_url: eventSourceUrl ?? '',
        action_source:    'website',
        user_data:        hashedUser,
        custom_data:      customData,
      }],
    };

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[CAPI] ${eventName} pixel=${pixelId} HTTP ${res.status}:`, errText.slice(0, 300));
      return { success: false, error: `HTTP ${res.status}` };
    }

    console.log(`[CAPI] ${eventName} pixel=${pixelId} event_id=${eventId} OK`);
    return { success: true };
  } catch (err) {
    console.error(`[CAPI] ${eventName} pixel=${pixelId} exception:`, err?.message);
    return { success: false, error: err?.message ?? 'unknown' };
  }
}
