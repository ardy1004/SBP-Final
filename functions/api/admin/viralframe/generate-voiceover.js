// POST /api/admin/viralframe/generate-voiceover
// Auth via functions/api/admin/_middleware.js

import { jsonError } from '../../_shared/response.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function buildUrls(naskah, voice) {
  const withInstruction = encodeURIComponent(`Please read this naturally: ${naskah}`);
  const plain = encodeURIComponent(naskah);
  return [
    `https://text.pollinations.ai/${withInstruction}?model=openai-audio&voice=${voice}`,
    `https://text.pollinations.ai/${plain}?model=openai-audio&voice=${voice}`,
    `https://text.pollinations.ai/${plain}?voice=${voice}`,
  ];
}

export async function onRequestPost(context) {
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

  const voiceParam = voice || 'alloy';
  const urls = buildUrls(String(naskah).trim(), voiceParam);

  for (const url of urls) {
    let ttsRes;
    try {
      ttsRes = await fetch(url);
    } catch {
      continue;
    }

    if (!ttsRes.ok) continue;

    const contentType = ttsRes.headers.get('Content-Type') ?? '';
    if (!contentType.startsWith('audio/')) continue;

    const audioBuffer = await ttsRes.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename=voiceover.mp3',
      },
    });
  }

  return jsonError('Pollinations TTS tidak tersedia', 502);
}
