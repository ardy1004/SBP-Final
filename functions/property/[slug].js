// GET /property/:slug — 301 ke struktur URL saat ini.
//
// Struktur lama `/property/{slug}` sudah diganti oleh
// `/{dijual|disewa}/{jenis}/{provinsi}/{kabupaten}/{kecamatan}/{slug}`
// (lihat src/app/routes.ts + functions/_lib/propertyUrl.js), tapi URL lamanya
// MASIH ADA di indeks Google dan masih menerima trafik: Search Console mencatat
// /property/boutique-hotel-link-premium-dekat-malioboro-jogja-kota-h19 mendapat
// 11 tayangan dalam 90 hari — sementara URL-nya sendiri membalas 404. Itu satu
// entri "Tidak ditemukan (404)" di laporan Pengindeksan halaman.
//
// Tanpa file ini, otoritas tautan dan tayangan yang sudah ada terbuang. 301
// (permanen) dipilih, bukan 302, supaya Google memindahkan sinyal peringkat ke
// URL baru alih-alih terus menyimpan yang lama.
//
// Route eksplisit di Pages Functions berjalan LEBIH DULU daripada
// [[catchall]].js, jadi ini tidak bentrok dengan SSR React Router.

import { buildPropertyUrl } from '../_lib/propertyUrl.js';

export async function onRequestGet({ params, env }) {
  const slug = String(params?.slug ?? '').trim();
  if (!slug) return new Response(null, { status: 404 });

  // Tanpa binding DB (mis. `npm run dev` tanpa proxy — lihat CLAUDE.md) jangan
  // menebak URL tujuan; 404 lebih jujur daripada redirect ke alamat karangan.
  if (!env?.DB) return new Response(null, { status: 404 });

  try {
    const row = await env.DB.prepare(`
      SELECT slug, jenis_properti, tujuan, provinsi, kabupaten, kecamatan
      FROM properties
      WHERE slug = ? AND status_publish = 'published'
      LIMIT 1
    `).bind(slug).first();

    // Slug tidak dikenal (atau sudah tidak terbit) → 404 sungguhan. JANGAN
    // dialihkan ke beranda: soft-404 massal justru sinyal kualitas yang buruk.
    if (!row) return new Response(null, { status: 404 });

    const tujuan = buildPropertyUrl(row, env.APP_URL || 'https://salambumi.xyz');
    return new Response(null, {
      status: 301,
      headers: {
        Location: tujuan,
        // Redirect ini stabil (slug tidak berubah setelah terbit), jadi aman
        // di-cache lama — menghemat pembacaan D1 untuk crawler yang berulang.
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[property redirect]', err.message);
    return new Response(null, { status: 404 });
  }
}

// Googlebot melakukan HEAD sebelum GET pada sebagian permintaan. Pages Functions
// TIDAK otomatis memetakan HEAD ke onRequestGet untuk handler bernama — tanpa ini
// HEAD /property/... akan 405/404 walau GET-nya 301 (bug yang sama persis pernah
// terjadi di sitemap.xml.js, ditemukan 2026-08-06).
export async function onRequestHead(context) {
  return onRequestGet(context);
}
