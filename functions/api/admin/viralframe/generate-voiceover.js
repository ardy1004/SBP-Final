// POST /api/admin/viralframe/generate-voiceover
// Auth via functions/api/admin/_middleware.js

import { jsonError } from '../../_shared/response.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Voice OpenAI-audio standar yang didukung Pollinations (model=openai-audio).
// Sebelumnya `voice` diinterpolasi mentah ke query string tanpa whitelist/encode
// (audit 2026-07-28) — input sembarang bisa menyisipkan parameter query lain
// (mis. "alloy&model=x"). Whitelist + encodeURIComponent menutup keduanya.
const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
// Naskah TIDAK punya batas panjang sebelumnya — payload/URL bisa multi-MB
// (audit 2026-07-28). Voiceover realistis untuk beberapa scene pendek jauh
// di bawah ini; cap murni jaring pengaman.
const MAX_NASKAH_LEN = 3000;
const FETCH_TIMEOUT_MS = 8000;

function buildUrls(naskah, voice) {
  const withInstruction = encodeURIComponent(`Please read this naturally: ${naskah}`);
  const plain = encodeURIComponent(naskah);
  const v = encodeURIComponent(voice);
  return [
    `https://text.pollinations.ai/${withInstruction}?model=openai-audio&voice=${v}`,
    `https://text.pollinations.ai/${plain}?model=openai-audio&voice=${v}`,
    `https://text.pollinations.ai/${plain}?voice=${v}`,
  ];
}

export async function onRequestPost(context) {
  try {
    const { request } = context;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const { naskah, voice } = body;
    if (!naskah || !String(naskah).trim()) {
      return jsonError('naskah tidak boleh kosong', 400);
    }
    if (String(naskah).length > MAX_NASKAH_LEN) {
      return jsonError(`naskah terlalu panjang (maks ${MAX_NASKAH_LEN} karakter)`, 413);
    }

    const voiceParam = ALLOWED_VOICES.includes(voice) ? voice : 'alloy';
    const urls = buildUrls(String(naskah).trim(), voiceParam);

    for (const url of urls) {
      let ttsRes;
      try {
        ttsRes = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      } catch {
        continue;
      }

      if (!ttsRes.ok) continue;

      const audioBuffer = await ttsRes.arrayBuffer();
      if (audioBuffer.byteLength < 100) {
        return jsonError('Pollinations TTS response kosong', 502);
      }

      const ct = ttsRes.headers.get('Content-Type') || 'audio/mpeg';
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': ct,
          'Content-Disposition': 'attachment; filename=voiceover.mp3',
        },
      });
    }

    return jsonError('Pollinations TTS tidak tersedia', 502);
  } catch (err) {
    return Response.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
