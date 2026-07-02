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

    const { image_base64, prompt, scene_index } = body;

    if (!image_base64 || image_base64.length < 100) {
      return Response.json({ error: 'image_base64 tidak valid' }, { status: 400 });
    }
    if (image_base64.length > 5_000_000) {
      return Response.json({ error: 'Foto terlalu besar, max ~3.7MB sebelum base64' }, { status: 413 });
    }
    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: 'prompt tidak boleh kosong' }, { status: 400 });
    }

    const apiKey = env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'SILICONFLOW_API_KEY tidak dikonfigurasi' }, { status: 500 });
    }

    const sfPayload = JSON.stringify({
      model: 'Wan-AI/Wan2.1-I2V-14B-720P-Turbo',
      image: image_base64,
      prompt: String(prompt),
      duration: 5,
      resolution: '720p',
      seed: Math.floor(Math.random() * 999999),
    });
    let sfRes;
    try {
      sfRes = await fetch('https://api.siliconflow.com/v1/video/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: sfPayload,
      });
      // TEMP DEBUG 4: fetch berhasil dijawab SiliconFlow
      return Response.json({ debug: 'checkpoint_4_fetch_ok', sf_status: sfRes.status, sf_ok: sfRes.ok });
    } catch (err) {
      return Response.json({ error: `Gagal menghubungi SiliconFlow: ${err.message}` }, { status: 502 });
    }

    const sfText = await sfRes.text();

    if (!sfRes.ok) {
      return Response.json({ error: `SiliconFlow error ${sfRes.status}: ${sfText.slice(0, 300)}` }, { status: 502 });
    }

    let sfJson;
    try {
      sfJson = JSON.parse(sfText);
    } catch {
      return Response.json({ error: 'SiliconFlow return non-JSON: ' + sfText.slice(0, 200) }, { status: 502 });
    }

    const request_id = sfJson.requestId ?? sfJson.request_id ?? null;
    if (!request_id) {
      return Response.json({ error: 'SiliconFlow tidak return requestId. Response: ' + sfText.slice(0, 300) }, { status: 502 });
    }

    return Response.json({ request_id, scene_index: scene_index ?? null });
  } catch (err) {
    return Response.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
