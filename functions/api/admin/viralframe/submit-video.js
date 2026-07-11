// POST /api/admin/viralframe/submit-video
// Auth via functions/api/admin/_middleware.js

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { image_base64, prompt, scene_index, model, image_size } = body;

    if (!image_base64 || !image_base64.startsWith('data:image/')) {
      return Response.json({ error: 'image_base64 tidak valid' }, { status: 400 });
    }
    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: 'prompt tidak boleh kosong' }, { status: 400 });
    }

    // Whitelist model & image_size — jangan percaya nilai bebas dari client
    const MODEL_VALID = ['Wan-AI/Wan2.2-I2V-A14B', 'Wan-AI/Wan2.1-I2V-14B-720P-Turbo'];
    const SIZE_VALID  = ['1280x720', '720x1280', '960x960'];
    const modelFinal  = MODEL_VALID.includes(model) ? model : 'Wan-AI/Wan2.2-I2V-A14B';
    const sizeFinal   = SIZE_VALID.includes(image_size) ? image_size : '1280x720';

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
          model: modelFinal,
          image: image_base64,
          prompt: String(prompt),
          image_size: sizeFinal,
          seed: Math.floor(Math.random() * 999999),
        }),
      });
    } catch (err) {
      return Response.json({ error: `Gagal menghubungi SiliconFlow: ${err.message}` }, { status: 502 });
    }

    // Cek status SEBELUM baca body — hindari crash CPU saat baca HTML error page
    if (!sfRes.ok) {
      return Response.json({ error: `SiliconFlow HTTP ${sfRes.status} — cek API key dan parameter` }, { status: 502 });
    }
    // Hanya baca body jika 200 OK — response kecil JSON
    let sfJson;
    try {
      sfJson = await sfRes.json();
    } catch {
      return Response.json({ error: 'SiliconFlow return non-JSON saat status 200' }, { status: 502 });
    }
    const request_id = sfJson.requestId ?? sfJson.request_id ?? null;
    if (!request_id) {
      return Response.json({ error: `SiliconFlow tidak return requestId: ${JSON.stringify(sfJson).slice(0, 200)}` }, { status: 502 });
    }
    return Response.json({ request_id, scene_index: scene_index ?? null });
  } catch (err) {
    return Response.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
