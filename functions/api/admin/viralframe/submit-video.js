// POST /api/admin/viralframe/submit-video
// Auth via functions/api/admin/_middleware.js

// image_base64: JPEG q0.8 hasil crop client (photoToBase64WithRatio, maks
// 1280x720) — biasanya jauh di bawah ini, cap murni jaring pengaman (audit
// 2026-07-28, sebelumnya tidak ada batas sama sekali).
const MAX_IMAGE_BASE64_LEN = 8_000_000;
const MAX_PROMPT_LEN = 2000;
const FETCH_TIMEOUT_MS = 10000;

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
    if (image_base64.length > MAX_IMAGE_BASE64_LEN) {
      return Response.json({ error: 'image_base64 terlalu besar' }, { status: 413 });
    }
    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: 'prompt tidak boleh kosong' }, { status: 400 });
    }
    if (String(prompt).length > MAX_PROMPT_LEN) {
      return Response.json({ error: `prompt terlalu panjang (maks ${MAX_PROMPT_LEN} karakter)` }, { status: 413 });
    }

    // Whitelist model & image_size — jangan percaya nilai bebas dari client
    const MODEL_VALID = ['Wan-AI/Wan2.2-I2V-A14B', 'Wan-AI/Wan2.1-I2V-14B-720P-Turbo'];
    const SIZE_VALID  = ['1280x720', '720x1280', '960x960'];
    const modelFinal  = MODEL_VALID.includes(model) ? model : 'Wan-AI/Wan2.2-I2V-A14B';
    const sizeFinal   = SIZE_VALID.includes(image_size) ? image_size : '1280x720';

    // Negative prompt untuk mengunci konsistensi image-to-video: cegah model
    // mengubah adegan/arsitektur/menambah objek yang tidak ada di foto referensi.
    // Client boleh menambah, tapi guard inti selalu disertakan.
    const NEG_CORE = 'different scene, changed architecture, new rooms, extra objects, added furniture, morphing, warping, distorted geometry, style change, text, watermark, logo, people appearing, flickering, blurry, low quality';
    const clientNeg = typeof body.negative_prompt === 'string' ? body.negative_prompt.slice(0, 400).trim() : '';
    const negativePrompt = clientNeg ? `${NEG_CORE}, ${clientNeg}` : NEG_CORE;

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
          negative_prompt: negativePrompt,
          image_size: sizeFinal,
          seed: Math.floor(Math.random() * 999999),
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
