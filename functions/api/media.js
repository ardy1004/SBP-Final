// GET /api/media?key=property-photos/uuid.webp
// Public proxy untuk foto publik di R2 (foto properti & foto klien testimoni).
// Tidak butuh auth — foto ini memang tampil di halaman publik.

const PUBLIC_PREFIXES = ['property-photos/', 'testimonials/'];

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

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const buf = await obj.arrayBuffer();
  const ct = obj.httpMetadata?.contentType ?? 'image/webp';
  const etag = obj.httpEtag ?? null;

  const headers = new Headers({
    'Content-Type': ct,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (etag) headers.set('ETag', etag);

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
