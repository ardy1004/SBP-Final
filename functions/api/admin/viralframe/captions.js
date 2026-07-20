// POST /api/admin/viralframe/captions — generate N variasi caption, tiap caption
// punya 5 kombinasi hashtag. Ringan & terpisah dari generate utama (bisa diulang).
// Body: { property_id, variasi (1|3|5), platform?, register_instruction?, provider? }
// Respons SUKSES = streaming NDJSON (heartbeat 2s + baris {done,data|error}) —
// dari dalam Worker latensi Gemini bisa >22s bahkan untuk output kecil sehingga
// pola "tunggu lalu balas" menabrak wall-clock 30s → 502 (lihat youtube-long.js).
// Error validasi awal tetap JSON biasa (client membedakan via content-type).
// Auth: _middleware.js

import { jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];
const PLATFORM_LABEL = { tiktok: 'TikTok', ig_reels: 'Instagram Reels', yt_shorts: 'YouTube Shorts', fb_reels: 'Facebook Reels' };

function fmtRupiah(n) {
  if (n == null || n <= 0) return 'hubungi kami';
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1).replace(/\.0$/, '')} M`;
  if (n >= 1e6) return `Rp ${Math.round(n / 1e6)} jt`;
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);
  const variasi = [1, 3, 5].includes(parseInt(body.variasi, 10)) ? parseInt(body.variasi, 10) : 3;
  const platform = PLATFORM_LABEL[body.platform] ?? 'TikTok/Reels';
  const registerInstruction = typeof body.register_instruction === 'string' ? body.register_instruction.slice(0, 300) : '';
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';

  let p;
  try {
    p = await env.DB.prepare(`SELECT title, jenis_properti, tujuan, harga, kecamatan, kabupaten, kode_listing, deskripsi
                              FROM properties WHERE id = ?`).bind(propertyId).first();
  } catch (err) {
    console.error('[captions] property', err.message);
    return jsonError('Gagal mengambil properti', 500);
  }
  if (!p) return jsonError('Properti tidak ditemukan', 404);

  const system = `Kamu copywriter media sosial properti Indonesia. Output HANYA JSON valid, mulai { akhiri }, tanpa markdown.`;
  const user = `Buat ${variasi} variasi CAPTION untuk ${platform} mempromosikan properti berikut. Setiap caption (variasi) punya SATU baris hashtag berisi kombinasi 5 hashtag — BUKAN beberapa pilihan hashtag per caption.

Data properti:
- Judul: ${p.title}
- Jenis: ${p.jenis_properti} (${p.tujuan})
- Harga: ${fmtRupiah(p.harga)}
- Lokasi: ${p.kecamatan}, ${p.kabupaten}
- Kode: ${p.kode_listing}
${p.deskripsi ? `- Deskripsi: ${String(p.deskripsi).slice(0, 200)}` : ''}

Aturan:
- Caption menarik, ada hook di kalimat pertama, sebut 1-2 keunggulan nyata + lokasi + ajakan (DM/WA). 2-4 kalimat.
${registerInstruction ? `- GAYA BAHASA: ${registerInstruction}` : ''}
- Field "hashtags" = SATU string berisi TEPAT 5 hashtag dipisah spasi, campurkan: lokasi (${p.kecamatan}/${p.kabupaten}/Jogja), jenis (${p.jenis_properti}), niat beli (rumahdijual/propertijogja/investasiproperti), dan brand (#salambumiproperty #salambumi).
- Jika ${variasi} > 1, tiap variasi (caption + hashtags) WAJIB berbeda kombinasi dari variasi lain — jangan mengulang kombinasi hashtag yang sama persis.
- JANGAN mengarang fasilitas yang tidak disebutkan.

Format JSON WAJIB:
{"captions":[{"caption":"...","hashtags":"#a #b #c #d #e"}]}
Jumlah item captions = ${variasi}. Setiap "hashtags" berisi TEPAT 5 hashtag dalam satu string.`;

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];

  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n')).catch(() => {});

  const work = (async () => {
    const heartbeat = setInterval(() => send({ status: 'progress' }), 2000);
    try {
      let raw = null, used = null, lastErr = null;
      for (const prov of tryOrder) {
        const key = await getProviderKey(env, prov);
        if (!key) continue;
        const r = await callChatCompletion({
          provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
          systemPrompt: system, userPrompt: user, maxTokens: 1600, temperature: 0.9,
          // Gemini = model thinking: tanpa 'none', token reasoning tersembunyi bikin lambat.
          reasoningEffort: prov === 'gemini' ? 'none' : undefined,
          timeoutMs: 55000,
        });
        if (r.ok) { raw = r.content; used = prov; break; }
        lastErr = r.error;
        console.error(`[captions] ${prov} gagal:`, r.error?.slice(0, 120));
      }
      if (!raw) {
        send({ done: true, error: `Gagal generate caption: ${(lastErr || 'semua provider gagal/kehabisan kuota').slice(0, 180)}. Pastikan API key AI diatur di Pengaturan.` });
        return;
      }

      let parsed;
      try {
        let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const first = txt.indexOf('{'), last = txt.lastIndexOf('}');
        if (first > 0 || last < txt.length - 1) txt = txt.slice(first, last + 1);
        parsed = JSON.parse(txt);
      } catch {
        send({ done: true, error: 'Respons AI bukan JSON valid. Coba lagi.' });
        return;
      }
      // hashtags = SATU string per caption (kombinasi 5 hashtag). Fallback bila
      // model masih terbawa format lama (array hashtag_sets) — ambil elemen pertama.
      const captions = Array.isArray(parsed.captions) ? parsed.captions.slice(0, variasi).map(c => ({
        caption: String(c.caption ?? '').slice(0, 800),
        hashtags: typeof c.hashtags === 'string'
          ? c.hashtags.slice(0, 300)
          : String(Array.isArray(c.hashtag_sets) ? c.hashtag_sets[0] ?? '' : '').slice(0, 300),
      })) : [];
      if (captions.length === 0) {
        send({ done: true, error: 'AI tidak mengembalikan caption. Coba lagi.' });
        return;
      }

      send({ done: true, data: { captions, provider_used: used } });
    } catch (err) {
      console.error('[captions] stream', err.message);
      send({ done: true, error: 'Terjadi kesalahan internal saat generate caption. Coba lagi.' });
    } finally {
      clearInterval(heartbeat);
      await writer.close().catch(() => {});
    }
  })();
  context.waitUntil?.(work);

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions() { return handleOptions(); }
