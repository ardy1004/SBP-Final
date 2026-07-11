// GET /sitemap.xml — sitemap dinamis dari D1.
// Menggabungkan halaman statis + seluruh properti published + artikel blog published.
// Di-cache 1 jam di edge. Route ini lebih spesifik dari [[catchall]].js sehingga
// dijalankan lebih dulu (Pages Functions: exact route > catch-all).

import { buildPropertyUrl } from './_lib/propertyUrl.js';

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
  const { env } = context;
  const base = (env.APP_URL || 'https://salambumi.xyz').replace(/\/$/, '');
  const urls = [];

  for (const s of STATIC_PATHS) {
    urls.push(urlEntry(base + s.path, null, s.changefreq, s.priority));
  }

  try {
    const props = await env.DB.prepare(`
      SELECT slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan, updated_at
      FROM properties
      WHERE status_publish = 'published'
      ORDER BY published_at DESC
      LIMIT 5000
    `).all();
    for (const p of (props.results ?? [])) {
      urls.push(urlEntry(buildPropertyUrl(p, base), p.updated_at, 'weekly', '0.8'));
    }
  } catch (err) {
    console.error('[sitemap] properties query error:', err.message);
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
