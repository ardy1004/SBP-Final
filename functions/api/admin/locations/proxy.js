import { jsonError, handleOptions } from '../../_shared/response.js';

// Whitelist pattern — cegah SSRF: hanya provinces.json, regencies/N.json,
// districts/N.N.json, villages/N.N.N.json
const SAFE_PATH = /^(provinces\.json|regencies\/[\d]+\.json|districts\/[\d.]+\.json|villages\/[\d.]+\.json)$/;

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';

  if (!path || !SAFE_PATH.test(path)) {
    return jsonError('Path tidak valid', 400);
  }

  let res;
  try {
    res = await fetch(`https://wilayah.id/api/${path}`);
  } catch {
    return jsonError('Gagal menghubungi wilayah.id', 502);
  }

  if (!res.ok) {
    return jsonError(`Upstream error: ${res.status}`, 502);
  }

  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
