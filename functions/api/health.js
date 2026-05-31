import { jsonOk, jsonError, handleOptions } from './_shared/response.js';

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const result = await env.DB
      .prepare('SELECT COUNT(*) AS total FROM locations')
      .first();

    return jsonOk({
      db: 'connected',
      locations_count: result?.total ?? 0,
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT ?? 'unknown',
    });
  } catch (err) {
    console.error('[health] DB error:', err.message);
    return jsonError('Database connection failed', 503);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
