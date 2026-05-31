const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
