// GET /llms.txt — panduan situs untuk AI crawler / generative engine (GEO).
// Format mengikuti spesifikasi llmstxt.org: H1 nama situs, blockquote ringkasan,
// lalu daftar link markdown per seksi. Konten listing diambil live dari D1.
// Di-cache 1 jam di edge, sama seperti sitemap.xml.

import { withEdgeCache } from './_lib/edgeCache.js';
import { buildPropertyUrl } from './_lib/propertyUrl.js';

export async function onRequestGet(context) {
  // Sama seperti sitemap.xml: header 'Cache-Control' saja tidak melewati Worker,
  // hanya Cache API yang benar-benar melewatkan query D1 + perangkaian teks.
  return withEdgeCache(context, { ttl: 3600 }, () => bangunLlmsTxt(context));
}

async function bangunLlmsTxt(context) {
  const { env } = context;
  const base = (env.APP_URL || 'https://salambumi.xyz').replace(/\/$/, '');

  const lines = [
    '# Salam Bumi Property',
    '',
    '> Portal properti berbasis kepercayaan & kecerdasan investasi untuk Yogyakarta (DIY), Indonesia. Semua listing (rumah, kost, villa, tanah, komersial) dikurasi dan diverifikasi langsung oleh tim CV Salam Bumi Property. Melayani Kota Yogyakarta, Sleman, Bantul, Kulon Progo, dan Gunungkidul.',
    '',
    'Kontak: WhatsApp +62 813-9127-8889 · Email salambumiproperty@gmail.com',
    'Bahasa konten: Indonesia. Harga dalam Rupiah (IDR).',
    '',
    '## Halaman Utama',
    '',
    `- [Beranda](${base}/): pencarian properti, listing unggulan, testimoni klien`,
    `- [Semua Listing](${base}/properties): katalog lengkap properti dijual & disewa di Yogyakarta`,
    `- [Titip Jual](${base}/titip-jual): layanan jual properti dengan perjanjian tertulis`,
    `- [Jasa Notaris](${base}/notaris): pendampingan legalitas & balik nama sertifikat`,
    `- [FAQ](${base}/faq): pertanyaan umum seputar jual-beli properti di Yogyakarta`,
    `- [Tentang Kami](${base}/about): profil CV Salam Bumi Property`,
    `- [Kontak](${base}/contact): alamat, jam operasional, formulir kontak`,
    '',
  ];

  try {
    const props = await env.DB.prepare(`
      SELECT slug, title, jenis_properti, tujuan, provinsi, kabupaten, kecamatan, harga
      FROM properties
      WHERE status_publish = 'published'
      ORDER BY published_at DESC
      LIMIT 50
    `).all();
    const rows = props.results ?? [];
    if (rows.length > 0) {
      lines.push('## Listing Terbaru', '');
      for (const p of rows) {
        const harga = p.harga ? ` — Rp ${Number(p.harga).toLocaleString('en-US').replace(/,/g, '.')}` : '';
        const lokasi = [p.kecamatan, p.kabupaten].filter(Boolean).join(', ');
        lines.push(`- [${p.title}](${buildPropertyUrl(p, base)}): ${p.jenis_properti || 'Properti'} ${p.tujuan === 'disewa' ? 'disewa' : 'dijual'} di ${lokasi}${harga}`);
      }
      lines.push('');
    }
  } catch (err) {
    console.error('[llms.txt] properties query error:', err.message);
  }

  try {
    const posts = await env.DB.prepare(`
      SELECT slug, judul FROM blog_posts
      WHERE status = 'published'
      ORDER BY updated_at DESC LIMIT 20
    `).all();
    const rows = posts.results ?? [];
    if (rows.length > 0) {
      lines.push('## Artikel & Panduan', '');
      for (const b of rows) {
        lines.push(`- [${b.judul}](${base}/blog/${b.slug})`);
      }
      lines.push('');
    }
  } catch {
    // Tabel blog belum ada — abaikan
  }

  lines.push(
    '## Optional',
    '',
    `- [Sitemap XML](${base}/sitemap.xml): daftar lengkap seluruh URL`,
    `- [Kebijakan Privasi](${base}/privacy)`,
    ''
  );

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
