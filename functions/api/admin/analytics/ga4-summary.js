// GET /api/admin/analytics/ga4-summary — ringkasan data GA4 30 hari terakhir
//   untuk widget tab Ringkasan (tren harian, halaman terpopuler, sumber trafik).
// Auth: _middleware.js
//
// Butuh ga4_property_id (settings D1, admin-editable via Pengaturan) + secret
// GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY (Service Account
// dengan akses Viewer ke property GA4 tsb — lihat functions/_lib/googleServiceAuth.js).

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { getGoogleAccessToken } from '../../../_lib/googleServiceAuth.js';

const DATE_RANGE = { startDate: '30daysAgo', endDate: 'today' };

async function runReport(propertyId, token, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateRanges: [DATE_RANGE], ...body }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `GA4 Data API error ${res.status}`);
  return json;
}

export async function onRequestGet(context) {
  const { env } = context;

  let propertyId;
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ga4_property_id'").first();
    propertyId = row?.value ? String(row.value).trim() : '';
  } catch (err) {
    console.error('[ga4-summary] baca settings', err.message);
    return jsonError('Gagal membaca konfigurasi', 500);
  }
  if (!propertyId) return jsonError('GA4 Property ID belum diisi di Pengaturan', 422);

  let token;
  try {
    token = await getGoogleAccessToken(env);
  } catch (err) {
    console.error('[ga4-summary] auth', err.message);
    return jsonError(`Gagal autentikasi ke Google: ${err.message}`, 502);
  }

  try {
    const [trend, topPages, channels] = await Promise.all([
      runReport(propertyId, token, {
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runReport(propertyId, token, {
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      runReport(propertyId, token, {
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),
    ]);

    const parseRows = (report, cols) => (report.rows ?? []).map(r => {
      const out = {};
      cols.forEach((c, i) => {
        const isMetric = c.metric;
        const raw = isMetric ? r.metricValues?.[c.idx]?.value : r.dimensionValues?.[c.idx]?.value;
        out[c.name] = isMetric ? Number(raw ?? 0) : (raw ?? '');
      });
      return out;
    });

    const trendRows = parseRows(trend, [
      { name: 'date', idx: 0 },
      { name: 'activeUsers', idx: 0, metric: true },
      { name: 'pageviews', idx: 1, metric: true },
      { name: 'sessions', idx: 2, metric: true },
    ]).map(r => ({ ...r, date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}` }));

    const topPagesRows = parseRows(topPages, [
      { name: 'pagePath', idx: 0 },
      { name: 'pageTitle', idx: 1 },
      { name: 'views', idx: 0, metric: true },
    ]);

    const channelRows = parseRows(channels, [
      { name: 'channel', idx: 0 },
      { name: 'sessions', idx: 0, metric: true },
    ]);

    return jsonOk({ trend: trendRows, topPages: topPagesRows, channels: channelRows });
  } catch (err) {
    console.error('[ga4-summary] runReport', err.message);
    return jsonError(`Gagal mengambil data GA4: ${err.message}`, 502);
  }
}

export async function onRequestOptions() { return handleOptions(); }
