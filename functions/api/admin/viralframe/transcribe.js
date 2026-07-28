// POST /api/admin/viralframe/transcribe
// Auth via functions/api/admin/_middleware.js
//
// Proxy ke Groq Whisper (audio/transcriptions) supaya API key tidak keluar ke
// browser — pola sama submit-video.js. Klien wajib kirim audio yang SUDAH
// diekstrak (mono, bitrate rendah) dari video asli, BUKAN video utuh — auto
// caption butuh timing kata dari suara asli, bukan estimasi, jadi harus lewat
// STT sungguhan (bukan reuse callChatCompletion di aiProviders.js — itu cuma
// untuk chat/completions JSON, Whisper butuh multipart/form-data ke endpoint
// berbeda).

import { getProviderKey } from '../../../_lib/aiProviders.js';
import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const MAX_AUDIO_BYTES = 20_000_000; // jauh di atas kebutuhan nyata (audio hasil ekstrak ~1MB/menit)
const FETCH_TIMEOUT_MS = 25000; // di bawah wall-clock 30s Worker

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const contentType = request.headers.get('Content-Type') ?? '';
    if (!contentType.startsWith('audio/')) {
      return jsonError('Content-Type harus audio/*', 400);
    }

    const audioBuf = await request.arrayBuffer();
    if (audioBuf.byteLength === 0) {
      return jsonError('Audio kosong', 400);
    }
    if (audioBuf.byteLength > MAX_AUDIO_BYTES) {
      return jsonError('Audio terlalu besar', 413);
    }

    const apiKey = await getProviderKey(env, 'groq');
    if (!apiKey) {
      return jsonError('Groq API key belum dikonfigurasi', 500);
    }

    const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : 'audio';
    const form = new FormData();
    form.append('file', new Blob([audioBuf], { type: contentType }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', 'id');

    let groqRes;
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      return jsonError(`Gagal menghubungi Groq: ${err.message}`, 502);
    }

    // Cek status SEBELUM baca body — hindari kerja sia-sia baca HTML error page.
    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      return jsonError(`Groq Whisper HTTP ${groqRes.status}: ${errText.slice(0, 300)}`, 502);
    }

    let groqJson;
    try {
      groqJson = await groqRes.json();
    } catch {
      return jsonError('Groq return non-JSON saat status 200', 502);
    }

    const words = Array.isArray(groqJson.words)
      ? groqJson.words.map(w => ({ word: String(w.word ?? '').trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 })).filter(w => w.word)
      : [];

    if (words.length === 0) {
      return jsonError('Groq tidak mengembalikan timestamp kata — coba lagi atau cek audio', 502);
    }

    return jsonOk({ words });
  } catch (err) {
    return jsonError(err.message ?? 'Internal error', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
