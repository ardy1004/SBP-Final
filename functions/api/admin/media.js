// GET /api/admin/media?key=property-photos/uuid.jpeg
// Serves R2 media objects for admin viewing (photos, signatures).
// Auth: _middleware.js (admin only — automatically applied)

import { jsonError, handleOptions } from '../_shared/response.js';

const ALLOWED_PREFIXES = ['property-photos/', 'signatures/', 'agreements/'];

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

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const buf = await obj.arrayBuffer();
  const ct = obj.httpMetadata?.contentType ?? 'application/octet-stream';

  return new Response(buf, {
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
