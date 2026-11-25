// GET /api/media?key=property-photos/uuid.webp
// Public proxy untuk foto publik di R2 (foto properti & foto klien testimoni).
// Tidak butuh auth — foto ini memang tampil di halaman publik.

// portfolio/ (2026-11-21, migrasi 0062): foto bukti kerja untuk beranda &
// /portfolio — sudah disensor & dibuang EXIF-nya di browser sebelum diunggah.
//
// Varian ukuran foto properti (2026-11-25): property-photos/<640|1280>/<nama>
// — lihat functions/_lib/ukuranFoto.js. Bila varian BELUM dibuat (foto Titip
// Jual/impor CSV yang belum dibuka admin, atau selama backfill), foto dasar
// disajikan sebagai gantinya: halaman tidak pernah rusak karena varian telat.
// Cache-nya sengaja pendek (1 jam), bukan immutable — supaya browser beralih ke
// varian asli begitu varian itu ada. Header X-SBP-Ukuran: 640|1280|asli
// dipakai skrip backfill & audit untuk membedakan keduanya.
import { POLA_VARIAN, kunciDasar } from '../_lib/ukuranFoto.js';

const PUBLIC_PREFIXES = ['property-photos/', 'testimonials/', 'viralframe-characters/', 'portfolio/'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';

  if (
    !key ||
    key.includes('..') ||
    key.includes('\0') ||
    !PUBLIC_PREFIXES.some(p => key.startsWith(p))
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  const varian = POLA_VARIAN.exec(key);
  let obj = await env.MEDIA.get(key);
  let pakaiDasar = false;
  if (!obj && varian) {
    obj = await env.MEDIA.get(kunciDasar(key));
    pakaiDasar = true;
  }
  if (!obj) return new Response('Not found', { status: 404 });

  const buf = await obj.arrayBuffer();
  const ct = obj.httpMetadata?.contentType ?? 'image/webp';
  const etag = obj.httpEtag ?? null;

  const headers = new Headers({
    'Content-Type': ct,
    'Cache-Control': pakaiDasar ? 'public, max-age=3600' : 'public, max-age=31536000, immutable',
  });
  if (etag) headers.set('ETag', etag);
  if (varian) headers.set('X-SBP-Ukuran', pakaiDasar ? 'asli' : varian[1]);

  return new Response(buf, { headers });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
