import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { buildPropertyUrl } from '../_lib/propertyUrl.js';

// ─── Sanitasi ─────────────────────────────────────────────────────────────────
// Strip tag HTML + karakter < > untuk mencegah XSS bila data dirender di admin
function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/[<>"'`]/g, '')   // strip karakter berbahaya
    .trim()
    .slice(0, maxLen);
}

// ─── Validasi & normalisasi nomor WA Indonesia ───────────────────────────────
// Format yang diterima: 08xx, 628xx, +628xx, 8xx → dinormalisasi ke 628xxx
function normalizeWA(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('62')) return d;
  if (d.startsWith('0'))  return '62' + d.slice(1);
  if (d.startsWith('8'))  return '62' + d;
  return d;
}

function isValidWA(raw) {
  return /^628[0-9]{8,12}$/.test(normalizeWA(raw));
}

// ─── Builder pesan WA terformat (spec 8.8) ────────────────────────────────────
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

  // Tolak content-type selain JSON
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

  // ── Field opsional (sanitasi) ────────────────────────────────────────────────
  const asal_daerah        = sanitize(body.asal_daerah ?? '', 100) || null;
  const budget             = sanitize(body.budget ?? '', 50)       || null;
  const pesan              = sanitize(body.pesan ?? '', 1000)       || null;
  const rencana_raw        = sanitize(body.rencana_pembayaran ?? '', 20);
  const rencana_pembayaran = ['hard_cash', 'soft_cash', 'kpr'].includes(rencana_raw) ? rencana_raw : null;

  // property_id: opsional integer
  let property_id    = null;
  let propertyTitle  = null;
  let propertyUrl    = null;

  const pidRaw = body.property_id;
  if (pidRaw !== undefined && pidRaw !== null) {
    const pid = parseInt(String(pidRaw), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return jsonError('property_id harus integer positif', 400);
    }
    property_id = pid;
  }

  // Jika property_id disertakan, ambil judul untuk pesan WA
  if (property_id) {
    try {
      const prop = await env.DB
        .prepare('SELECT title, slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan FROM properties WHERE id = ? AND status_publish = ?')
        .bind(property_id, 'published')
        .first();
      if (prop) {
        propertyTitle = prop.title;
        propertyUrl   = buildPropertyUrl(prop, env.APP_URL ?? 'https://salambumi.xyz');
      }
    } catch {
      // Tidak fatal — lead tetap disimpan walau lookup gagal
    }
  }

  const no_wa = normalizeWA(no_wa_raw);

  // ── K6: simpan lead ke DB SEBELUM apa pun ────────────────────────────────────
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
    return jsonError('Gagal menyimpan lead. Silakan coba lagi.', 500);
  }

  // ── Build pesan WA + URL (agar frontend tinggal buka wa.me) ─────────────────
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
  }, 201);
}

export async function onRequestOptions() {
  return handleOptions();
}
