// POST /api/admin/viralframe/youtube-long — storyboard YouTube 16:9 terpandu.
// User memilih foto + label per scene + gaya visual + gaya kamera; AI menyusun
// skenario & mengeluarkan prompt JSON siap-tempel per blok:
//   thumbnail, opening, scene 1..N (per foto), ending.
// Body: { property_id, photos:[{label,url_webp}], visual_style, camera_style,
//         language? ('id'|'en'), use_agent?, agent_id?, provider? }
// Bila use_agent: agen (viralframe_characters) hadir sebagai host di semua blok,
// dengan mandat konsistensi ke reference image agent.webp.
// Auth: _middleware.js

import { jsonError, handleOptions } from '../../_shared/response.js';
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
  const language = body.language === 'en' ? 'en' : 'id';
  const useAgent = body.use_agent === true;

  let p;
  try {
    p = await env.DB.prepare(`SELECT title, jenis_properti, tujuan, harga, kecamatan, kabupaten, provinsi,
                                     jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan,
                                     legalitas, kode_listing, deskripsi FROM properties WHERE id = ?`).bind(propertyId).first();
  } catch (err) { console.error('[yt-long] property', err.message); return jsonError('Gagal ambil properti', 500); }
  if (!p) return jsonError('Properti tidak ditemukan', 404);

  // Agen (host) opsional — ambil profil dari viralframe_characters.
  let agent = null;
  if (useAgent) {
    const agentId = parseInt(body.agent_id, 10);
    if (!Number.isInteger(agentId) || agentId <= 0) return jsonError('Pilih agen terlebih dahulu', 422);
    try {
      agent = await env.DB.prepare(`SELECT id, nama, foto_url, gender, usia, etnik, style, ciri_fisik
                                    FROM viralframe_characters WHERE id = ?`).bind(agentId).first();
    } catch (err) { console.error('[yt-long] agent', err.message); return jsonError('Gagal ambil data agen', 500); }
    if (!agent) return jsonError('Agen tidak ditemukan', 404);
  }

  const sceneList = photos.map((f, i) => `${i + 1}. ${f.label}`).join('\n');
  const langName = language === 'en' ? 'English' : 'Bahasa Indonesia';
  const agentDesc = agent
    ? [agent.gender, agent.usia ? `${agent.usia} th` : null, agent.etnik, agent.style, agent.ciri_fisik]
        .filter(Boolean).join(', ')
    : '';

  const system = `Kamu sutradara & prompt engineer video properti YouTube profesional. Output HANYA satu objek JSON valid, mulai { akhiri }, tanpa markdown/komentar/proses berpikir.
SYARAT WAJIB — KONSISTENSI REFERENCE IMAGE: setiap prompt yang kamu tulis akan dieksekusi image-to-video/image dengan foto referensi terlampir. Setiap objek "prompt" WAJIB punya field "reference_image" (nama file referensinya) dan instruksi harus SETIA ke foto itu: jangan mengarang arsitektur, furnitur, warna, atau material yang tidak ada di foto. Gaya visual & kamera harus konsisten di semua blok agar terasa satu film.${agent ? `
SYARAT WAJIB — KONSISTENSI AGEN: agen/host yang sama (dari reference image "agent.webp") hadir di thumbnail, opening, scene, dan ending. WAJIB tulis "exact same person as reference image agent.webp — identical face, hair, and outfit in every shot" di field subject/agent tiap prompt. Jangan pernah mengganti wajah, gaya rambut, atau pakaian antar blok.` : ''}`;
  const user = `Susun STORYBOARD video tur properti YouTube (16:9, long-form) berdasarkan foto & urutan scene yang DIPILIH user. JANGAN mengarang fitur yang tak disebutkan di data.

GAYA VISUAL : ${visualStyle || 'cinematic real estate, clean & aspiratif'}
GAYA KAMERA : ${cameraStyle || 'kombinasi drone aerial + gimbal interior yang mulus'}
BAHASA DIALOG/NARASI : ${langName} (semua field narration_id ditulis dalam ${langName})
${agent ? `AGEN/HOST : ${agent.nama}${agentDesc ? ` (${agentDesc})` : ''} — reference image: agent.webp. Agen tampil sebagai host tur: berjalan, menunjuk fitur, bicara ke kamera secara natural. narration_id = kalimat yang DIUCAPKAN agen on-camera.` : 'TANPA AGEN : murni sinematik properti (tanpa manusia); narration_id = voiceover.'}

DATA PROPERTI:
- Judul: ${p.title}
- Jenis: ${p.jenis_properti} (${p.tujuan})
- Harga: ${fmtRupiah(p.harga)}
- Lokasi: ${p.kecamatan}, ${p.kabupaten}, ${p.provinsi}
- Spesifikasi: ${p.jumlah_kamar_tidur ?? '-'} KT / ${p.jumlah_kamar_mandi ?? '-'} KM, LT ${p.luas_tanah ?? '-'}m², LB ${p.luas_bangunan ?? '-'}m²
- Legalitas: ${p.legalitas ?? '-'} · Kode: ${p.kode_listing}
${p.deskripsi ? `- Deskripsi: ${String(p.deskripsi).slice(0, 300)}` : ''}

URUTAN SCENE (buat TEPAT 1 scene per item, sesuai ruangan/area foto; reference_image scene ke-N = "scene_N.webp"):
${sceneList}

Untuk SETIAP blok (thumbnail, opening, tiap scene, ending), field "prompt" WAJIB berupa OBJEK JSON siap-tempel ke AI video/image generator, English sinematik, dengan field: reference_image, shot, subject, camera_movement (terapkan gaya kamera di atas), lighting, mood, style (terapkan gaya visual di atas), duration_sec, aspect_ratio ("16:9"). Prompt harus grounded ke ruangan/fitur nyata sesuai label — bukan generik. Opening & ending pakai reference_image "scene_1.webp" (establishing shot).

THUMBNAIL — WAJIB WOW & CATCHY (gaya high-CTR YouTube real estate, ini penentu klik):
- Basis foto terbaik (reference_image "scene_1.webp")${agent ? ' + agen dengan ekspresi wajah kuat (kagum/excited, mulut terbuka atau menunjuk ke rumah) di sepertiga kiri/kanan frame' : ''}.
- Field wajib di prompt thumbnail: reference_image, shot, subject, text_overlay (2-4 kata ${langName} HURUF BESAR yang provokatif, mis. harga atau hook — bukan judul panjang), text_style (bold sans-serif ekstra besar, warna kontras + outline/glow, mudah dibaca di layar HP), color_grade (vivid, high-saturation, dramatic golden-hour/HDR, langit biru dramatis), focal_point, composition (rule of thirds, depth, sudut rendah heroik), badge (badge harga/label mencolok, mis. "${fmtRupiah(p.harga)}"), style, aspect_ratio "16:9".
- Hindari: thumbnail datar, teks kecil, warna pucat, komposisi pas-foto.

FORMAT JSON WAJIB (patuhi persis):
{
  "titles": ["3 judul video SEO Bahasa Indonesia"],
  "description": "deskripsi YouTube 3-5 kalimat + CTA subscribe/WA",
  "chapters_timestamp": ["00:00 Opening", "00:08 <label scene 1>", "..."],
  "caption": "caption share singkat",
  "hashtag_sets": ["5 string, tiap string 5-8 hashtag campur lokasi+jenis+brand #salambumiproperty"],
  "thumbnail": { "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "text_overlay": "...", "text_style": "...", "color_grade": "...", "focal_point": "...", "composition": "...", "badge": "...", "style": "...", "aspect_ratio": "16:9" } },
  "opening": { "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "camera_movement": "...", "lighting": "...", "mood": "...", "style": "...", "duration_sec": 8, "aspect_ratio": "16:9" }, "narration_id": "narasi ${langName}" },
  "scenes": [ { "scene": 1, "photo_label": "<label>", "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "camera_movement": "...", "lighting": "...", "mood": "...", "style": "...", "duration_sec": 10, "aspect_ratio": "16:9" }, "narration_id": "narasi ${langName}" } ],
  "ending": { "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "camera_movement": "...", "cta": "...", "duration_sec": 8, "aspect_ratio": "16:9" }, "narration_id": "narasi CTA ${langName}" }
}
"scenes" berisi TEPAT ${photos.length} item (urutan sama dengan daftar di atas). hashtag_sets TEPAT 5 string. titles/description/caption/hashtag tetap Bahasa Indonesia. Keluarkan HANYA objek JSON.`;

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];
  // Output nyata 12 scene ≈ 2.200 token; skala per scene + headroom, jangan flat 8000
  // (max_tokens Gemini juga menghitung token thinking). Mode agen menambah detail subject.
  const maxTokens = Math.min(8000, 1500 + photos.length * 300 + (agent ? 500 : 0));

  // Respons STREAMING NDJSON, bukan JSON tunggal. Alasannya: dari dalam Worker,
  // latensi Gemini terukur >22s bahkan untuk 2 scene (jauh di atas 7-17s dari luar),
  // sehingga pola "tunggu lalu balas" selalu menabrak wall-clock 30s → 502.
  // Dengan mengirim heartbeat tiap 2s response sudah "mengalir" sejak awal, koneksi
  // tetap hidup tanpa batas 30s, dan tiap provider bisa diberi waktu penuh (55s).
  // Baris terakhir: { done:true, data:{...} } atau { done:true, error:"..." }.
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
          systemPrompt: system, userPrompt: user, maxTokens, temperature: 0.6,
          // Gemini 3 Flash = model thinking: tanpa ini ±1.400 token reasoning tersembunyi
          // memperlambat drastis. Dengan "none" JSON tetap valid.
          reasoningEffort: prov === 'gemini' ? 'none' : undefined,
          timeoutMs: 55000,
        });
        if (r.ok) { raw = r.content; used = prov; break; }
        lastErr = r.error;
        console.error(`[yt-long] ${prov} gagal:`, r.error?.slice(0, 160));
      }
      if (!raw) {
        send({ done: true, error: `Gagal generate storyboard: ${(lastErr || 'semua provider gagal/kehabisan kuota').slice(0, 200)}. Pastikan API key AI diatur di Pengaturan.` });
        return;
      }

      // Ekstraksi JSON tahan-banting: '{' pertama sampai '}' terakhir.
      let parsed;
      try {
        let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const first = txt.indexOf('{'), last = txt.lastIndexOf('}');
        if (first > 0 || last < txt.length - 1) txt = txt.slice(first, last + 1);
        parsed = JSON.parse(txt);
      } catch {
        send({ done: true, error: `Respons AI tidak valid (kemungkinan terpotong). Coba lagi / kurangi jumlah foto / ganti provider. Cuplikan: ${String(raw).slice(0, 150)}` });
        return;
      }

      // Tautkan foto (url) ke tiap scene sesuai urutan, agar client bisa tampilkan referensinya.
      if (Array.isArray(parsed.scenes)) {
        parsed.scenes = parsed.scenes.map((s, i) => ({ ...s, url_webp: photos[i]?.url_webp ?? null }));
      }

      try {
        await env.DB.prepare(`INSERT INTO viralframe_generations (property_id, params_json, master_prompt, result_json)
                              VALUES (?,?,?,?)`)
          .bind(propertyId, JSON.stringify({ mode: 'youtube_long', photos, visualStyle, cameraStyle, language, agent_id: agent?.id ?? null }), null, JSON.stringify(parsed)).run();
      } catch { /* non-fatal */ }

      send({
        done: true,
        data: {
          ...parsed, provider_used: used, kode_listing: p.kode_listing, language,
          agent: agent ? { id: agent.id, nama: agent.nama, foto_url: agent.foto_url } : null,
        },
      });
    } catch (err) {
      console.error('[yt-long] stream', err.message);
      send({ done: true, error: 'Terjadi kesalahan internal saat generate. Coba lagi.' });
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
