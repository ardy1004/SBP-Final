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

/**
 * Ambil pengidentifikasi TEKNIS dari request untuk user_data CAPI.
 *
 * ⚠️ KEEMPATNYA DIKIRIM MENTAH — JANGAN DI-HASH. Berbeda dengan em/ph, Meta
 * mencocokkan fbc/fbp/client_* apa adanya; meng-hash-nya justru mematikan
 * pencocokan tanpa error apa pun. Ini jebakan yang mudah "dirapikan" orang
 * berikutnya karena tetangganya (hashUserData) memang di-hash.
 *
 * `fbc` = ClickID Meta, pengikat konversi ke KLIK IKLAN tertentu. Sampai
 * 2026-08-29 tidak pernah dikirim sama sekali, dan Events Manager menandainya
 * sebagai tindakan prioritas tertinggi ("Kirim ClickID Meta untuk meningkatkan
 * pelaporan konversi"). Tanpa ini Meta tidak tahu lead berasal dari iklan mana.
 *
 * @param {Request} request
 * @param {string} [eventSourceUrl] - dipakai untuk fallback fbclid
 * @returns {Record<string, string>} hanya field yang benar-benar ada
 */
export function extractMetaIdentity(request, eventSourceUrl = '') {
  const out = {};
  try {
    const h = request?.headers;
    if (!h) return out;

    const ip = h.get('CF-Connecting-IP') ?? h.get('X-Forwarded-For');
    if (ip) out.client_ip_address = ip.split(',')[0].trim();

    const ua = h.get('User-Agent');
    if (ua) out.client_user_agent = ua;

    // Cookie _fbp/_fbc ditulis oleh pixel browser di domain kita sendiri, jadi
    // ikut terkirim ke Worker. Belum ada helper cookie di repo (jwt.js hanya
    // MENULIS cookie), jadi parser kecil di sini — satu tempat, 4 pemanggil.
    const cookies = {};
    for (const bagian of (h.get('Cookie') ?? '').split(';')) {
      const i = bagian.indexOf('=');
      if (i > 0) cookies[bagian.slice(0, i).trim()] = bagian.slice(i + 1).trim();
    }
    if (cookies._fbp) out.fbp = cookies._fbp;
    if (cookies._fbc) out.fbc = cookies._fbc;

    // Fallback: pixel browser diblokir (adblock/JS mati) sehingga _fbc tak
    // pernah ditulis, padahal URL iklannya utuh. Bentuk `fb.1.<ms>.<fbclid>`
    // sesuai spesifikasi Meta. Aman dipakai: edgeCache membuang param pelacak
    // hanya dari KUNCI cache (objek Request terpisah), bukan dari request asli.
    if (!out.fbc && eventSourceUrl) {
      try {
        const fbclid = new URL(eventSourceUrl).searchParams.get('fbclid');
        if (fbclid) out.fbc = `fb.1.${Date.now()}.${fbclid}`;
      } catch { /* eventSourceUrl bukan URL absolut (mis. 'contact') — lewati */ }
    }
  } catch { /* header tidak terbaca -> kirim tanpa identitas, jangan melempar */ }
  return out;
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
 * @param {Record<string, string>} [opts.identity] - hasil extractMetaIdentity();
 *        fbc/fbp/client_ip_address/client_user_agent, dikirim MENTAH (jangan di-hash)
 * @param {Record<string, unknown>} [opts.customData]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendCapiEvent(_env, { pixelId, accessToken, eventName, eventId, eventSourceUrl, userData = {}, identity = {}, customData = {} }) {
  try {
    // PII di-hash, pengidentifikasi teknis TIDAK — lihat catatan di
    // extractMetaIdentity(). Nilai kosong dibuang: Meta menurunkan kualitas
    // pencocokan bila menerima field bernilai null/string kosong.
    const hashedUser = await hashUserData(userData);
    for (const [k, v] of Object.entries(identity)) {
      if (v) hashedUser[k] = v;
    }

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
