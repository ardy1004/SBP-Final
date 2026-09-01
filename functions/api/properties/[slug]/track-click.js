// POST /api/properties/:slug/track-click
// Publik — tanpa auth. Dipicu navigator.sendBeacon() saat kartu properti
// diklik di halaman listing/beranda (sebelum navigasi ke halaman detail).
// Catat click_type='wa_click' ditangani terpisah di wa-click.js — endpoint ini
// khusus 'card_click'. Lihat migrasi 0036_property_click_geo.sql.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { extractGeo } from '../../../_lib/geoRequest.js';

// Endpoint PUBLIK tanpa CAPTCHA yang meng-INSERT baris baru tiap panggilan —
// bukan UPSERT bervolume terikat seperti property_view_daily. Tanpa rem, POST
// berulang bisa membengkakkan property_click_geo tanpa batas.
//
// ⚠️ Ini penulis D1 publik TERAKHIR yang belum punya rem (audit 2026-09-02).
// Asimetri yang sama sudah ditemukan 31 Agustus pada wa-click properti — sapuan
// waktu itu melewatkan endpoint ini. Kalau menambah endpoint publik baru yang
// menulis ke D1, pasang rem-nya sekaligus.
//
// 60/menit ≈ 12.000× trafik terukur (137 baris dalam 27 hari) — longgar untuk
// lonjakan iklan wajar, tapi menutup flood.
const MAX_CARD_CLICK_PER_MINUTE = 60;

async function cardClickSemenit(db) {
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM property_click_geo
                WHERE click_type = 'card_click'
                  AND created_at > datetime('now', '-60 seconds')`)
      .first();
    return row?.cnt ?? 0;
  } catch {
    return 0; // fail-open: lebih baik kehilangan rem daripada membuang data asli
  }
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') {
    return jsonError('Slug tidak valid', 400);
  }

  try {
    const row = await env.DB
      .prepare("SELECT id FROM properties WHERE slug = ? AND status_publish = 'published' LIMIT 1")
      .bind(slug)
      .first();
    // sendBeacon adalah fire-and-forget dari sisi pengunjung — 404 di sini tidak
    // pernah dilihat siapa pun, tapi tetap balas 200 supaya tidak ada percobaan
    // retry otomatis browser untuk properti yang memang sudah tidak publish.
    if (!row) return jsonOk({ tercatat: false });

    // Rem hanya melewati INSERT-nya, dan responsnya tetap 200. Pemanggilnya
    // navigator.sendBeacon (fire-and-forget) — tidak ada yang membaca body ini,
    // jadi 429 hanya akan memicu perilaku retry browser tanpa manfaat apa pun.
    if ((await cardClickSemenit(env.DB)) >= MAX_CARD_CLICK_PER_MINUTE) {
      return jsonOk({ tercatat: false, throttled: true });
    }

    const geo = extractGeo(request);
    await env.DB.prepare(`
      INSERT INTO property_click_geo (property_id, click_type, city, region, country)
      VALUES (?, 'card_click', ?, ?, ?)
    `).bind(row.id, geo.city, geo.region, geo.country).run();

    return jsonOk({ tercatat: true });
  } catch (err) {
    console.error('[track-click]', err.message);
    // Tracking gagal tidak boleh terlihat sebagai error oleh pengunjung.
    return jsonOk({ tercatat: false });
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
