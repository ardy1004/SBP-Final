// GET /api/admin/viralframe/siliconflow-token
// Auth via functions/api/admin/_middleware.js

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.SILICONFLOW_API_KEY) {
    return Response.json({ error: 'SILICONFLOW_API_KEY tidak dikonfigurasi' }, { status: 500 });
  }
  return Response.json({ token: env.SILICONFLOW_API_KEY });
}
