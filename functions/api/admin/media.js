// GET /api/admin/media?key=property-photos/uuid.jpeg
// Serves R2 media objects for admin viewing (photos, signatures).
// Auth: _middleware.js (admin only — automatically applied)

import { jsonError, handleOptions } from '../_shared/response.js';

// 'testimonials/' sempat terlewat di sini — tertutupi karena AdminTestimoniPage
// memakai endpoint publik /api/media. Disamakan supaya jalur admin tidak pincang
// kalau nanti halaman itu diseragamkan ke proxy admin.
const ALLOWED_PREFIXES = ['property-photos/', 'testimonials/', 'signatures/', 'agreements/', 'viralframe-characters/', 'viralframe-videos/', 'viralframe-backsound/'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';

  if (
    !key ||
    key.includes('..') ||
    key.includes('\0') ||
    !ALLOWED_PREFIXES.some(p => key.startsWith(p))
  ) {
    return jsonError('Key tidak valid', 400);
  }

  // Dukung header Range (seek video di Library) + stream body langsung —
  // arrayBuffer() penuh untuk video 60MB menekan memori Worker dan memaksa
  // player download penuh sebelum bisa play.
  const rangeHeader = request.headers.get('Range');
  const rangeMatch = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);

  let obj;
  if (rangeMatch && (rangeMatch[1] || rangeMatch[2])) {
    const range = rangeMatch[1]
      ? { offset: parseInt(rangeMatch[1], 10),
          ...(rangeMatch[2] ? { length: parseInt(rangeMatch[2], 10) - parseInt(rangeMatch[1], 10) + 1 } : {}) }
      : { suffix: parseInt(rangeMatch[2], 10) };
    try { obj = await env.MEDIA.get(key, { range }); }
    catch { return new Response('Range tidak valid', { status: 416 }); }
  } else {
    obj = await env.MEDIA.get(key);
  }
  if (!obj) return new Response('Not found', { status: 404 });

  const ct = obj.httpMetadata?.contentType ?? 'application/octet-stream';
  const headers = new Headers({
    'Content-Type': ct,
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  });

  if (obj.range) {
    const start = obj.range.offset ?? (obj.size - obj.range.suffix);
    const length = obj.range.length ?? obj.range.suffix ?? (obj.size - start);
    const end = Math.min(start + length, obj.size) - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
}

export async function onRequestOptions() {
  return handleOptions();
}
