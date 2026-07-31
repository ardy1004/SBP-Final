// Access-Control-Allow-Origin SENGAJA tidak diset di sini — functions/_middleware.js
// selalu menimpa header CORS pada SETIAP response (termasuk yang dari helper ini)
// dengan origin asli (env.ALLOWED_ORIGIN), jadi middleware itu satu-satunya sumber
// kebenaran untuk origin. Menaruh '*' di sini menyesatkan pembaca kode ini secara
// terpisah (audit 2026-08-01).
const CORS_HEADERS = {
  // PATCH ditambahkan (audit 2026-07-28) — videos/[id].js, agent-videos/[id].js,
  // badges/[id].js, characters/[id].js semua memakai PATCH tapi header CORS ini
  // sebelumnya tidak mengizinkannya (permintaan preflight cross-origin akan ditolak).
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonOk(data, status = 200) {
  return Response.json(
    { success: true, data },
    { status, headers: CORS_HEADERS }
  );
}

export function jsonError(message, status = 400, details = null) {
  const body = { success: false, error: message };
  if (details) body.details = details;
  return Response.json(body, { status, headers: CORS_HEADERS });
}

export function jsonCreated(data) {
  return jsonOk(data, 201);
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
