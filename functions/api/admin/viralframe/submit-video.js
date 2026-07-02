// POST /api/admin/viralframe/submit-video
// Auth via functions/api/admin/_middleware.js

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { image_base64, prompt, scene_index } = body;

  if (!image_base64 || !String(image_base64).startsWith('data:image/')) {
    return Response.json({ error: 'image_base64 tidak valid — harus berupa data URL data:image/...' }, { status: 400 });
  }
  if (!prompt || !String(prompt).trim()) {
    return Response.json({ error: 'prompt tidak boleh kosong' }, { status: 400 });
  }

  const apiKey = env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'SILICONFLOW_API_KEY tidak dikonfigurasi' }, { status: 500 });
  }

  let sfRes;
  try {
    sfRes = await fetch('https://api.siliconflow.com/v1/video/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Wan-AI/Wan2.1-I2V-14B-720P-Turbo',
        image: image_base64,
        prompt: String(prompt),
        duration: 8,
        resolution: '720p',
        seed: Math.floor(Math.random() * 999999),
      }),
    });
  } catch (err) {
    return Response.json({ error: `Gagal menghubungi SiliconFlow: ${err.message}` }, { status: 502 });
  }

  if (!sfRes.ok) {
    const errText = await sfRes.text().catch(() => '');
    return Response.json({ error: `SiliconFlow error ${sfRes.status}: ${errText}` }, { status: 502 });
  }

  const sfJson = await sfRes.json();
  const request_id = sfJson.requestId ?? sfJson.request_id;
  if (!request_id) {
    return Response.json({ error: 'SiliconFlow tidak mengembalikan requestId', raw: sfJson }, { status: 502 });
  }

  return Response.json({ request_id, scene_index: scene_index ?? null });
}
