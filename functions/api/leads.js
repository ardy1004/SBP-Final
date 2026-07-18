import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { buildPropertyUrl } from '../_lib/propertyUrl.js';
import { sendCapiEvent } from '../_lib/metaCapi.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { normalizeWA, isValidWA } from '../_lib/waUtils.js';
import { logServerError } from '../_lib/logError.js';

// ─── Sanitasi ─────────────────────────────────────────────────────────────────
function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`]/g, '')
    .trim()
    .slice(0, maxLen);
}

// ─── Builder pesan WA ────────────────────────────────────────────────────────
function buildWaPesan({ tipe_pengirim, nama, asal_daerah, budget,
                        rencana_pembayaran, pesan,
                        propertyTitle, propertyUrl }) {
  const LABEL = { pembeli: 'Calon Pembeli', penjual: 'Penjual/Pemilik', broker: 'Broker/Agent' };
  const BAYAR = { hard_cash: 'Hard Cash', soft_cash: 'Soft Cash', kpr: 'KPR' };

  const lines = ['Halo Admin Salam Bumi Property!', ''];

  if (propertyTitle) {
    lines.push(`Saya tertarik dengan properti: *${propertyTitle}*`);
    if (propertyUrl) lines.push(propertyUrl);
    lines.push('');
  }

  lines.push(`Saya Adalah ${LABEL[tipe_pengirim] ?? tipe_pengirim}`);
  lines.push(`Nama: ${nama}`);
  if (asal_daerah)       lines.push(`Asal Daerah: ${asal_daerah}`);
  if (budget)            lines.push(`Estimasi Budget: ${budget}`);
  if (rencana_pembayaran) lines.push(`Rencana Pembayaran: ${BAYAR[rencana_pembayaran] ?? rencana_pembayaran}`);
  if (pesan)             lines.push(`Pesan: ${pesan}`);

  lines.push('', 'Mohon informasi lebih lanjut.');
  return lines.join('\n');
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Body JSON tidak valid', 400);
  }

  // ── Anti-bot: verifikasi Turnstile sebelum insert lead ──────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? null;
  const captcha = await verifyTurnstile(body.cf_turnstile_token, env.TURNSTILE_SECRET, ip);
  if (!captcha.ok) {
    return jsonError('Verifikasi anti-bot gagal. Silakan muat ulang halaman dan coba lagi.', 403);
  }

  // ── Validasi wajib ──────────────────────────────────────────────────────────
  const errors = {};

  const nama        = sanitize(body.nama ?? '', 100);
  const no_wa_raw   = sanitize(body.no_wa ?? '', 20);
  const tipe        = sanitize(body.tipe_pengirim ?? '', 20);
  const source_page = sanitize(body.source_page ?? '', 300);

  if (!nama)   errors.nama = 'Nama wajib diisi';
  if (!no_wa_raw) {
    errors.no_wa = 'Nomor WhatsApp wajib diisi';
  } else if (!isValidWA(no_wa_raw)) {
    errors.no_wa = 'Nomor WhatsApp tidak valid (gunakan format 08xx atau +628xx)';
  }
  if (!['pembeli', 'penjual', 'broker'].includes(tipe)) {
    errors.tipe_pengirim = 'tipe_pengirim harus pembeli, penjual, atau broker';
  }
  if (!source_page) errors.source_page = 'source_page wajib diisi';

  if (Object.keys(errors).length > 0) {
    return jsonError('Validasi gagal', 422, errors);
  }

  // ── Field opsional ────────────────────────────────────────────────────────
  const asal_daerah        = sanitize(body.asal_daerah ?? '', 100) || null;
  const budget             = sanitize(body.budget ?? '', 50)       || null;
  const pesan              = sanitize(body.pesan ?? '', 1000)       || null;
  const rencana_raw        = sanitize(body.rencana_pembayaran ?? '', 20);
  const rencana_pembayaran = ['hard_cash', 'soft_cash', 'kpr'].includes(rencana_raw) ? rencana_raw : null;

  let property_id   = null;
  let propertyTitle = null;
  let propertyUrl   = null;
  let propertyHarga = 0;
  let propertyKode  = '';

  const pidRaw = body.property_id;
  if (pidRaw !== undefined && pidRaw !== null) {
    const pid = parseInt(String(pidRaw), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return jsonError('property_id harus integer positif', 400);
    }
    property_id = pid;
  }

  if (property_id) {
    try {
      const prop = await env.DB
        .prepare('SELECT title, slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan, harga, kode_listing FROM properties WHERE id = ? AND status_publish = ?')
        .bind(property_id, 'published')
        .first();
      if (prop) {
        propertyTitle = prop.title;
        propertyUrl   = buildPropertyUrl(prop, env.APP_URL ?? 'https://salambumi.xyz');
        propertyHarga = prop.harga  ?? 0;
        propertyKode  = prop.kode_listing ?? '';
      }
    } catch {
      // Tidak fatal
    }
  }

  const no_wa = normalizeWA(no_wa_raw);

  // ── Simpan lead ke DB ────────────────────────────────────────────────────────
  const timestamp = Date.now();
  let leadId;
  try {
    const result = await env.DB.prepare(`
      INSERT INTO leads
        (property_id, nama, no_wa, asal_daerah, tipe_pengirim,
         budget, rencana_pembayaran, pesan, source_page,
         wa_clicked_at, status_pipeline, notes,
         created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         CURRENT_TIMESTAMP, 'baru', '[]',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      property_id, nama, no_wa, asal_daerah, tipe,
      budget, rencana_pembayaran, pesan, source_page
    ).run();

    leadId = result.meta?.last_row_id;
  } catch (err) {
    console.error('[leads] INSERT error:', err.message);
    context.waitUntil(logServerError(env, { message: `[leads] INSERT error: ${err.message}`, stack: err.stack, url: request.url }));
    return jsonError('Gagal menyimpan lead. Silakan coba lagi.', 500);
  }

  const leadEventId = `lead_${leadId}_${timestamp}`;

  // CAPI Lead — fire best-effort via waitUntil (tidak blocking response)
  context.waitUntil((async () => {
    try {
      const pixelRes = await env.DB
        .prepare("SELECT pixel_id, capi_access_token, events_enabled FROM pixel_configs WHERE is_active = 1 AND capi_access_token IS NOT NULL AND capi_access_token != ''")
        .all();
      const capiPixels = (pixelRes.results ?? []).filter(px => {
        try { return JSON.parse(px.events_enabled ?? '[]').includes('Lead'); } catch { return false; }
      });
      if (capiPixels.length > 0) {
        await Promise.allSettled(capiPixels.map(px => sendCapiEvent(env, {
          pixelId:        px.pixel_id,
          accessToken:    px.capi_access_token,
          eventName:      'Lead',
          eventId:        leadEventId,
          eventSourceUrl: source_page,
          userData:       no_wa ? { ph: no_wa } : {},
          customData:     {
            content_ids:      [propertyKode],
            content_category: tipe,
            value:            propertyHarga,
            currency:         'IDR',
          },
        })));
      }
    } catch (err) {
      console.error('[leads] CAPI dispatch error:', err?.message);
    }
  })());

  // ── Build pesan WA ───────────────────────────────────────────────────────────
  const waPesan = buildWaPesan({
    tipe_pengirim: tipe,
    nama, asal_daerah, budget, rencana_pembayaran, pesan,
    propertyTitle, propertyUrl,
  });

  const waAdmin = (env.WA_ADMIN ?? '6281391278889').replace(/\D/g, '');
  const waUrl   = `https://wa.me/${waAdmin}?text=${encodeURIComponent(waPesan)}`;

  return jsonOk({
    lead_id:  leadId,
    wa_url:   waUrl,
    wa_pesan: waPesan,
    event_id: leadEventId,
  }, 201);
}

export async function onRequestOptions() {
  return handleOptions();
}
