// GET /sitemap.xml — sitemap dinamis dari D1.
// Menggabungkan halaman statis + seluruh properti published + artikel blog published.
// Di-cache 1 jam di edge. Route ini lebih spesifik dari [[catchall]].js sehingga
// dijalankan lebih dulu (Pages Functions: exact route > catch-all).

import { withEdgeCache } from './_lib/edgeCache.js';
import { buildPropertyUrl } from './_lib/propertyUrl.js';
import { LANDMARKS, LANDMARK_RADIUS_KM, resolveApproxCoord, haversineKm } from './_lib/geoLandmarks.js';

const STATIC_PATHS = [
  { path: '/',          changefreq: 'daily',   priority: '1.0' },
  { path: '/properties', changefreq: 'daily',  priority: '0.9' },
  { path: '/about',     changefreq: 'monthly', priority: '0.5' },
  { path: '/blog',      changefreq: 'weekly',  priority: '0.6' },
  { path: '/faq',       changefreq: 'monthly', priority: '0.4' },
  { path: '/contact',   changefreq: 'monthly', priority: '0.4' },
  { path: '/notaris',   changefreq: 'monthly', priority: '0.4' },
  { path: '/titip-jual', changefreq: 'monthly', priority: '0.6' },
];

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq, priority) {
  const parts = [`    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod)    parts.push(`    <lastmod>${xmlEscape(String(lastmod).slice(0, 10))}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority)   parts.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

export async function onRequestGet(context) {
  // Merangkai 533+ URL dari D1 pada tiap request tidak muat di 10 ms CPU paket Free:
  // smoke 2026-07-26 mencatat /sitemap.xml gagal 47,5% dengan Error 1102. Header
  // 'Cache-Control' di bawah TIDAK cukup — Worker berjalan sebelum cache CDN, jadi
  // ia tetap dieksekusi ulang. Cache API-lah yang benar-benar melewati perangkaian.
  // TTL 1 jam: sitemap tidak perlu real-time, dan crawler tidak menuntut itu.
  return withEdgeCache(context, { ttl: 3600 }, () => bangunSitemap(context));
}

async function bangunSitemap(context) {
  const { env } = context;
  const base = (env.APP_URL || 'https://salambumi.xyz').replace(/\/$/, '');
  const urls = [];

  for (const s of STATIC_PATHS) {
    urls.push(urlEntry(base + s.path, null, s.changefreq, s.priority));
  }

  // Hoisted (dipakai lagi di blok landmark di bawah agar tak query D1 dua kali).
  let propsResults = [];
  try {
    const props = await env.DB.prepare(`
      SELECT slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan,
             latitude, longitude, updated_at
      FROM properties
      WHERE status_publish = 'published'
      ORDER BY published_at DESC
      LIMIT 5000
    `).all();
    propsResults = props.results ?? [];
    for (const p of propsResults) {
      urls.push(urlEntry(buildPropertyUrl(p, base), p.updated_at, 'weekly', '0.8'));
    }
  } catch (err) {
    console.error('[sitemap] properties query error:', err.message);
  }

  // Halaman programmatic SEO ({jenis}-{tujuan}[-{lokasi}], mis. /rumah-dijual-sleman,
  // /kost-dijual-depok). Hanya kombinasi dengan ≥3 listing (anti thin-content, spec 3.8).
  // Dua level lokasi: kabupaten (mis. "sleman") dan kecamatan (mis. "depok") — keduanya
  // dicocokkan oleh parseProgrammaticSlug + loader (kabupaten LIKE dulu, lalu kecamatan
  // LIKE), jadi slug flat "kost-dijual-depok" otomatis valid tanpa perlu prefix kabupaten.
  try {
    const kabCombos = await env.DB.prepare(`
      SELECT jenis_properti AS jenis, kabupaten AS lokasi,
        SUM(CASE WHEN tujuan IN ('dijual','dijual_disewa') THEN 1 ELSE 0 END) AS c_dijual,
        SUM(CASE WHEN tujuan IN ('disewa','dijual_disewa') THEN 1 ELSE 0 END) AS c_disewa
      FROM properties
      WHERE status_publish = 'published'
      GROUP BY jenis_properti, kabupaten
    `).all();
    const kecCombos = await env.DB.prepare(`
      SELECT jenis_properti AS jenis, kecamatan AS lokasi,
        SUM(CASE WHEN tujuan IN ('dijual','dijual_disewa') THEN 1 ELSE 0 END) AS c_dijual,
        SUM(CASE WHEN tujuan IN ('disewa','dijual_disewa') THEN 1 ELSE 0 END) AS c_disewa
      FROM properties
      WHERE status_publish = 'published' AND kecamatan IS NOT NULL AND kecamatan != ''
      GROUP BY jenis_properti, kecamatan
    `).all();
    // Level ke-3 (kelurahan/desa, mis. "kost-dijual-condongcatur") — sama pola,
    // slug flat tanpa prefix. Minim data saat ini (baru sedikit listing berisi
    // kelurahan), tapi mekanisme siap: halaman terbit otomatis begitu ≥3 listing
    // per kelurahan tercatat (via dropdown cascade admin, lihat Tahap 3).
    const kelCombos = await env.DB.prepare(`
      SELECT jenis_properti AS jenis, kelurahan AS lokasi,
        SUM(CASE WHEN tujuan IN ('dijual','dijual_disewa') THEN 1 ELSE 0 END) AS c_dijual,
        SUM(CASE WHEN tujuan IN ('disewa','dijual_disewa') THEN 1 ELSE 0 END) AS c_disewa
      FROM properties
      WHERE status_publish = 'published' AND kelurahan IS NOT NULL AND kelurahan != ''
      GROUP BY jenis_properti, kelurahan
    `).all();
    const rows = [...(kabCombos.results ?? []), ...(kecCombos.results ?? []), ...(kelCombos.results ?? [])];
    const slugSet = new Set();
    // "Kabupaten Sleman" → "sleman"; "Kota Yogyakarta" → "kota-yogyakarta" (JANGAN
    // dipangkas jadi "yogyakarta" — itu alias seluruh DIY di parseProgrammaticSlug).
    // Kecamatan (mis. "Depok") tidak punya prefix, cukup lowercase + slugify.
    const lokasiToken = (l) => String(l ?? '')
      .toLowerCase().replace(/^kabupaten\s+/, '').trim().replace(/\s+/g, '-');

    for (const r of rows) {
      const tok = lokasiToken(r.lokasi);
      if (!tok) continue;
      if (r.c_dijual >= 3) slugSet.add(`${r.jenis}-dijual-${tok}`);
      if (r.c_disewa >= 3) slugSet.add(`${r.jenis}-disewa-${tok}`);
    }
    // Agregat seluruh DIY → alias 'jogja' (dari data kabupaten, tidak double-count kecamatan)
    const diy = new Map();
    for (const r of (kabCombos.results ?? [])) {
      const cur = diy.get(r.jenis) ?? { dijual: 0, disewa: 0 };
      cur.dijual += r.c_dijual ?? 0;
      cur.disewa += r.c_disewa ?? 0;
      diy.set(r.jenis, cur);
    }
    for (const [jenis, c] of diy) {
      if (c.dijual >= 3) slugSet.add(`${jenis}-dijual-jogja`);
      if (c.disewa >= 3) slugSet.add(`${jenis}-disewa-jogja`);
    }
    for (const slug of slugSet) {
      urls.push(urlEntry(`${base}/${slug}`, null, 'daily', '0.7'));
    }
  } catch (err) {
    console.error('[sitemap] programmatic query error:', err.message);
  }

  // Halaman landmark ({jenis}-dekat-{landmark}, mis. /kost-dekat-ugm) — jarak
  // Haversine dari koordinat properti asli atau fallback centroid kecamatan
  // (lihat functions/_lib/geoLandmarks.js). Dihitung dari propsResults yang
  // sudah di-fetch di atas, TANPA query D1 tambahan. Ambang ≥3 listing sama
  // seperti kombinasi lokasi (anti thin-content, spec 3.8).
  try {
    for (const lm of LANDMARKS) {
      const byJenis = new Map();
      for (const p of propsResults) {
        const coord = resolveApproxCoord(p);
        if (!coord) continue;
        const d = haversineKm(coord.lat, coord.lon, lm.lat, lm.lon);
        if (d > LANDMARK_RADIUS_KM) continue;
        byJenis.set(p.jenis_properti, (byJenis.get(p.jenis_properti) ?? 0) + 1);
      }
      for (const [jenis, count] of byJenis) {
        if (count >= 3) urls.push(urlEntry(`${base}/${jenis}-dekat-${lm.slug}`, null, 'weekly', '0.7'));
      }
    }
  } catch (err) {
    console.error('[sitemap] landmark query error:', err.message);
  }

  try {
    const posts = await env.DB.prepare(`
      SELECT slug, updated_at FROM blog_posts
      WHERE status = 'published'
      ORDER BY updated_at DESC LIMIT 2000
    `).all();
    for (const b of (posts.results ?? [])) {
      urls.push(urlEntry(`${base}/blog/${b.slug}`, b.updated_at, 'monthly', '0.5'));
    }
  } catch {
    // Tabel blog belum ada / kolom beda — abaikan, sitemap tetap valid tanpa blog
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
