// POST /api/admin/viralframe/captions — generate N variasi caption, tiap caption
// punya 5 kombinasi hashtag. Ringan & terpisah dari generate utama (bisa diulang).
// Body: { property_id, variasi (1|3|5), platform?, register_instruction?, provider? }
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
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
  const user = `Buat ${variasi} variasi CAPTION untuk ${platform} mempromosikan properti berikut. Setiap caption punya 5 KOMBINASI HASHTAG berbeda.

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
- Setiap "hashtag_sets" berisi 5 string; tiap string 5-8 hashtag dipisah spasi, campurkan: lokasi (${p.kecamatan}/${p.kabupaten}/Jogja), jenis (${p.jenis_properti}), niat beli (rumahdijual/propertijogja/investasiproperti), dan brand (#salambumiproperty #salambumi). Tanpa duplikat antar-kombinasi.
- JANGAN mengarang fasilitas yang tidak disebutkan.

Format JSON WAJIB:
{"captions":[{"caption":"...","hashtag_sets":["#a #b #c #d #e","#...","#...","#...","#..."]}]}
Jumlah item captions = ${variasi}. Setiap hashtag_sets berisi tepat 5 string.`;

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];
  const deadline = Date.now() + 22000;
  let raw = null, used = null;
  for (const prov of tryOrder) {
    if (Date.now() > deadline - 5000) break;
    const key = await getProviderKey(env, prov);
    if (!key) continue;
    const r = await callChatCompletion({
      provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
      systemPrompt: system, userPrompt: user, maxTokens: 1600, temperature: 0.9,
      timeoutMs: deadline - Date.now() - 1500,
    });
    if (r.ok) { raw = r.content; used = prov; break; }
    console.error(`[captions] ${prov} gagal:`, r.error?.slice(0, 120));
  }
  if (!raw) return jsonError('Gagal generate caption (semua provider). Pastikan API key AI diatur di Pengaturan.', 502);

  let parsed;
  try {
    const txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(txt);
  } catch {
    return jsonError('Respons AI bukan JSON valid', 502);
  }
  const captions = Array.isArray(parsed.captions) ? parsed.captions.slice(0, variasi).map(c => ({
    caption: String(c.caption ?? '').slice(0, 800),
    hashtag_sets: Array.isArray(c.hashtag_sets) ? c.hashtag_sets.slice(0, 5).map(h => String(h).slice(0, 300)) : [],
  })) : [];
  if (captions.length === 0) return jsonError('AI tidak mengembalikan caption', 502);

  return jsonOk({ captions, provider_used: used });
}

export async function onRequestOptions() { return handleOptions(); }
