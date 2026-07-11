// POST /api/admin/viralframe/youtube-long — storyboard YouTube 16:9 terpandu.
// User memilih foto + label per scene + gaya visual + gaya kamera; AI menyusun
// skenario & mengeluarkan prompt JSON siap-tempel per blok:
//   thumbnail, opening, scene 1..N (per foto), ending.
// Body: { property_id, photos:[{label,url_webp}], visual_style, camera_style, provider? }
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];

function fmtRupiah(n) {
  if (n == null || n <= 0) return 'hubungi kami';
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')} Miliar`;
  if (n >= 1e6) return `Rp ${Math.round(n / 1e6)} Juta`;
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';

  const photos = Array.isArray(body.photos)
    ? body.photos.filter(x => x && typeof x.label === 'string' && x.label.trim()).slice(0, 12)
    : [];
  if (photos.length < 2) return jsonError('Pilih minimal 2 foto beserta labelnya', 422);
  const visualStyle = typeof body.visual_style === 'string' ? body.visual_style.slice(0, 80) : '';
  const cameraStyle = typeof body.camera_style === 'string' ? body.camera_style.slice(0, 80) : '';

  let p;
  try {
    p = await env.DB.prepare(`SELECT title, jenis_properti, tujuan, harga, kecamatan, kabupaten, provinsi,
                                     jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan,
                                     legalitas, kode_listing, deskripsi FROM properties WHERE id = ?`).bind(propertyId).first();
  } catch (err) { console.error('[yt-long] property', err.message); return jsonError('Gagal ambil properti', 500); }
  if (!p) return jsonError('Properti tidak ditemukan', 404);

  const sceneList = photos.map((f, i) => `${i + 1}. ${f.label}`).join('\n');

  const system = `Kamu sutradara & prompt engineer video properti YouTube profesional. Output HANYA satu objek JSON valid, mulai { akhiri }, tanpa markdown/komentar/proses berpikir.`;
  const user = `Susun STORYBOARD video tur properti YouTube (16:9, long-form) berdasarkan foto & urutan scene yang DIPILIH user. JANGAN mengarang fitur yang tak disebutkan di data.

GAYA VISUAL : ${visualStyle || 'cinematic real estate, clean & aspiratif'}
GAYA KAMERA : ${cameraStyle || 'kombinasi drone aerial + gimbal interior yang mulus'}

DATA PROPERTI:
- Judul: ${p.title}
- Jenis: ${p.jenis_properti} (${p.tujuan})
- Harga: ${fmtRupiah(p.harga)}
- Lokasi: ${p.kecamatan}, ${p.kabupaten}, ${p.provinsi}
- Spesifikasi: ${p.jumlah_kamar_tidur ?? '-'} KT / ${p.jumlah_kamar_mandi ?? '-'} KM, LT ${p.luas_tanah ?? '-'}m², LB ${p.luas_bangunan ?? '-'}m²
- Legalitas: ${p.legalitas ?? '-'} · Kode: ${p.kode_listing}
${p.deskripsi ? `- Deskripsi: ${String(p.deskripsi).slice(0, 300)}` : ''}

URUTAN SCENE (buat TEPAT 1 scene per item, sesuai ruangan/area foto):
${sceneList}

Untuk SETIAP blok (thumbnail, opening, tiap scene, ending), field "prompt" WAJIB berupa OBJEK JSON siap-tempel ke AI video/image generator, English sinematik, dengan field: shot, subject, camera_movement (terapkan gaya kamera di atas), lighting, mood, style (terapkan gaya visual di atas), duration_sec, aspect_ratio ("16:9"). Prompt harus grounded ke ruangan/fitur nyata sesuai label — bukan generik.

FORMAT JSON WAJIB (patuhi persis):
{
  "titles": ["3 judul video SEO Bahasa Indonesia"],
  "description": "deskripsi YouTube 3-5 kalimat + CTA subscribe/WA",
  "chapters_timestamp": ["00:00 Opening", "00:08 <label scene 1>", "..."],
  "caption": "caption share singkat",
  "hashtag_sets": ["5 string, tiap string 5-8 hashtag campur lokasi+jenis+brand #salambumiproperty"],
  "thumbnail": { "prompt": { "shot": "...", "text_overlay": "...", "style": "...", "aspect_ratio": "16:9" } },
  "opening": { "prompt": { "shot": "...", "camera_movement": "...", "lighting": "...", "mood": "...", "duration_sec": 8, "aspect_ratio": "16:9" }, "narration_id": "narasi voiceover Indonesia" },
  "scenes": [ { "scene": 1, "photo_label": "<label>", "prompt": { "shot": "...", "subject": "...", "camera_movement": "...", "lighting": "...", "mood": "...", "style": "...", "duration_sec": 10, "aspect_ratio": "16:9" }, "narration_id": "narasi voiceover Indonesia" } ],
  "ending": { "prompt": { "shot": "...", "camera_movement": "...", "cta": "...", "duration_sec": 8, "aspect_ratio": "16:9" }, "narration_id": "narasi CTA Indonesia" }
}
"scenes" berisi TEPAT ${photos.length} item (urutan sama dengan daftar di atas). hashtag_sets TEPAT 5 string. Keluarkan HANYA objek JSON.`;

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];
  const deadline = Date.now() + 26000;
  // Output nyata 12 scene ≈ 2.200 token; skala per scene + headroom, jangan flat 8000
  // (max_tokens Gemini juga menghitung token thinking).
  const maxTokens = Math.min(8000, 1500 + photos.length * 300);
  let raw = null, used = null, lastErr = null;
  for (const prov of tryOrder) {
    const remaining = deadline - Date.now();
    if (remaining < 8000) break; // sisa waktu tak cukup untuk satu percobaan berarti
    const key = await getProviderKey(env, prov);
    if (!key) continue;
    const r = await callChatCompletion({
      provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
      systemPrompt: system, userPrompt: user, maxTokens, temperature: 0.6,
      // Gemini 3 Flash = model thinking: tanpa ini ±1.400 token reasoning tersembunyi
      // membuat 12 scene ~24s (nabrak wall-clock 30s). Dengan "none": ~8s, JSON tetap valid.
      reasoningEffort: prov === 'gemini' ? 'none' : undefined,
      // Cap per provider agar provider berikutnya masih kebagian waktu bila yang ini hang.
      timeoutMs: Math.min(remaining - 1500, 16000),
    });
    if (r.ok) { raw = r.content; used = prov; break; }
    lastErr = r.error;
    console.error(`[yt-long] ${prov} gagal:`, r.error?.slice(0, 160));
  }
  if (!raw) return jsonError(`Gagal generate storyboard: ${(lastErr || 'semua provider gagal/kehabisan kuota').slice(0, 200)}. Pastikan API key AI diatur di Pengaturan.`, 502);

  // Ekstraksi JSON tahan-banting: '{' pertama sampai '}' terakhir.
  let parsed;
  try {
    let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const first = txt.indexOf('{'), last = txt.lastIndexOf('}');
    if (first > 0 || last < txt.length - 1) txt = txt.slice(first, last + 1);
    parsed = JSON.parse(txt);
  } catch {
    return jsonError(`Respons AI tidak valid (kemungkinan terpotong). Coba lagi / kurangi jumlah foto / ganti provider. Cuplikan: ${String(raw).slice(0, 150)}`, 502);
  }

  // Tautkan foto (url) ke tiap scene sesuai urutan, agar client bisa tampilkan referensinya.
  if (Array.isArray(parsed.scenes)) {
    parsed.scenes = parsed.scenes.map((s, i) => ({ ...s, url_webp: photos[i]?.url_webp ?? null }));
  }

  try {
    await env.DB.prepare(`INSERT INTO viralframe_generations (property_id, params_json, master_prompt, result_json)
                          VALUES (?,?,?,?)`)
      .bind(propertyId, JSON.stringify({ mode: 'youtube_long', photos, visualStyle, cameraStyle }), null, JSON.stringify(parsed)).run();
  } catch { /* non-fatal */ }

  return jsonOk({ ...parsed, provider_used: used, kode_listing: p.kode_listing });
}

export async function onRequestOptions() { return handleOptions(); }
