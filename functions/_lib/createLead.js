import { buildPropertyUrl } from './propertyUrl.js';
import { sendCapiEvent } from './metaCapi.js';
import { normalizeWA, isValidWA } from './waUtils.js';

function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

function buildChatWaPesan({ nama, propertyTitle, propertyUrl, budget, pesan }) {
  const lines = ['Halo Admin Salam Bumi Property!', ''];
  if (propertyTitle) {
    lines.push(`Saya tertarik dengan properti: *${propertyTitle}*`);
    if (propertyUrl) lines.push(propertyUrl);
    lines.push('');
  }
  lines.push(`Nama: ${nama}`);
  if (budget) lines.push(`Budget: ${budget}`);
  if (pesan)  lines.push(`Pesan: ${pesan}`);
  lines.push('', 'Mohon informasi lebih lanjut.');
  return lines.join('\n');
}

/**
 * @param {object} env        - CF Workers env (env.DB, env.WA_ADMIN, env.APP_URL)
 * @param {object} context    - CF Pages context (context.waitUntil)
 * @param {object} params     - { nama, no_wa, property_id?, tipe_pengirim?, budget?, pesan?, source_page }
 * @returns {Promise<{success:true,leadId:number,wa_url:string}|{success:false,error:string}>}
 */
export async function createLead(env, context, params = {}) {
  const nama        = sanitize(params.nama ?? '', 100);
  const no_wa_raw   = sanitize(params.no_wa ?? '', 20);
  const tipe        = ['pembeli', 'penjual', 'broker'].includes(params.tipe_pengirim)
    ? params.tipe_pengirim : 'pembeli';
  const budget      = sanitize(params.budget ?? '', 50) || null;
  const pesan       = sanitize(params.pesan  ?? '', 1000) || null;
  const source_page = sanitize(params.source_page ?? 'chat', 300);

  if (!nama)                       return { success: false, error: 'nama_empty' };
  if (!no_wa_raw || !isValidWA(no_wa_raw)) return { success: false, error: 'no_wa_invalid' };

  const no_wa = normalizeWA(no_wa_raw);

  let property_id   = null;
  let propertyTitle = null;
  let propertyUrl   = null;
  let propertyHarga = 0;
  let propertyKode  = '';

  const pidRaw = params.property_id;
  if (pidRaw !== undefined && pidRaw !== null) {
    const pid = parseInt(String(pidRaw), 10);
    if (Number.isInteger(pid) && pid > 0) {
      property_id = pid;
      try {
        const prop = await env.DB
          .prepare('SELECT title, slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan, harga, kode_listing FROM properties WHERE id = ? AND status_publish = ?')
          .bind(property_id, 'published')
          .first();
        if (prop) {
          propertyTitle = prop.title;
          propertyUrl   = buildPropertyUrl(prop, env.APP_URL ?? 'https://salambumi.xyz');
          propertyHarga = prop.harga ?? 0;
          propertyKode  = prop.kode_listing ?? '';
        }
      } catch {
        // non-fatal
      }
    }
  }

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
      property_id, nama, no_wa, null, tipe,
      budget, null, pesan, source_page
    ).run();

    leadId = result.meta?.last_row_id;
  } catch (err) {
    console.error('[createLead] INSERT error:', err.message);
    return { success: false, error: 'db_error' };
  }

  const leadEventId = `lead_${leadId}_${timestamp}`;

  // CAPI fire — best-effort, non-blocking
  if (context?.waitUntil) {
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
            userData:       { ph: no_wa },
            customData:     {
              content_ids:      [propertyKode],
              content_category: tipe,
              value:            propertyHarga,
              currency:         'IDR',
            },
          })));
        }
      } catch (err) {
        console.error('[createLead] CAPI error:', err?.message);
      }
    })());
  }

  const waPesan = buildChatWaPesan({ nama, propertyTitle, propertyUrl, budget, pesan });
  const waAdmin = (env.WA_ADMIN ?? '6281391278889').replace(/\D/g, '');
  const wa_url  = `https://wa.me/${waAdmin}?text=${encodeURIComponent(waPesan)}`;

  return { success: true, leadId, wa_url };
}
