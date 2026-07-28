// POST /api/admin/viralframe/suggest-storyboard — AI merancang Part (Hook/Body/
// CTA) + urutan foto per scene dari label_ruangan yang SUDAH TERSIMPAN (migrasi
// 0026), tanpa vision AI (AI hanya bernalar dari teks label, tidak pernah lihat
// foto). Deteksi otomatis "ini foto apa" dari gambar mentah adalah fitur
// TERPISAH yang sengaja tidak dibangun di sini.
// Body: { property_id, scene_count, archetype?, register? }
// Respons SUKSES = streaming NDJSON (pola sama seperti captions.js — heartbeat
// 2s + baris terakhir {done,data|error}, anti wall-clock 30s Workers).
// Error validasi awal (property_id, scene_count, foto berlabel kurang) tetap
// JSON biasa sebelum stream dibuka.
// Auth: _middleware.js

import { jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);
  const sceneCount = parseInt(body.scene_count, 10);
  if (!Number.isInteger(sceneCount) || sceneCount < 2 || sceneCount > 12) return jsonError('scene_count harus 2-12', 422);
  const archetype = typeof body.archetype === 'string' ? body.archetype.slice(0, 60) : '';
  const register = typeof body.register === 'string' ? body.register.slice(0, 40) : '';
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';

  let rows;
  try {
    const res = await env.DB.prepare(
      `SELECT id, label_ruangan, urutan, is_cover, url_webp
       FROM property_images
       WHERE property_id = ? AND label_ruangan IS NOT NULL AND TRIM(label_ruangan) != ''`
    ).bind(propertyId).all();
    rows = res.results ?? [];
  } catch (err) {
    console.error('[suggest-storyboard] query', err.message);
    return jsonError('Gagal mengambil foto properti', 500);
  }

  // Dedup label: 2+ foto share label sama → backend pilih representatif (is_cover
  // dulu, else urutan terkecil) — AI TIDAK PERNAH melihat foto_id individual, jadi
  // AI tidak bisa jadi yang "memilih" di antara foto duplikat.
  const byLabel = new Map();
  for (const r of rows) {
    const label = String(r.label_ruangan).trim();
    const cur = byLabel.get(label);
    if (!cur) { byLabel.set(label, r); continue; }
    const curScore = (cur.is_cover ? 1000 : 0) - (cur.urutan ?? 0);
    const newScore = (r.is_cover ? 1000 : 0) - (r.urutan ?? 0);
    if (newScore > curScore) byLabel.set(label, r);
  }
  const uniqueLabels = [...byLabel.keys()];

  if (uniqueLabels.length < sceneCount) {
    return jsonError(
      `Baru ${uniqueLabels.length} foto berlabel, butuh minimal ${sceneCount} foto berlabel untuk ${sceneCount} scene. Label foto dulu di Detail Properti.`,
      422
    );
  }

  const system = `Kamu sutradara storyboard video properti Indonesia. Kamu HANYA menerima daftar LABEL RUANGAN (teks), bukan foto — jangan pernah mengarang label baru di luar daftar yang diberikan. Output HANYA JSON valid, mulai { akhiri }, tanpa markdown.`;
  const user = `Rancang storyboard video dari daftar label ruangan berikut (properti sudah difoto per ruangan/aspek ini):
${uniqueLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Total scene video = ${sceneCount} (TETAP, tidak boleh diubah).
${archetype ? `Gaya video: ${archetype}.` : ''}
${register ? `Register bahasa: ${register}.` : ''}

Tugas:
1. Kelompokkan ${sceneCount} scene menjadi babak "parts": Hook (pembuka, biasanya 1 scene paling menarik/fasad), Body (tur isi properti), CTA (penutup ajakan, biasanya 1 scene). Total scene_count semua part HARUS PERSIS ${sceneCount}.
2. Tentukan urutan ${sceneCount} scene, tiap scene diisi TEPAT SATU label dari daftar di atas (pilih subset paling representatif kalau label lebih banyak dari ${sceneCount} — prioritaskan ruangan utama: fasad/ruang tamu/kamar/dapur/kamar mandi di atas ruangan minor). JANGAN mengulang label yang sama di scene berbeda kecuali daftar label kurang dari ${sceneCount} (tidak mungkin terjadi di sini karena sudah divalidasi).
3. Label di scene_photo_order WAJIB persis salah satu string dari daftar 1-${uniqueLabels.length} di atas — JANGAN mengarang label baru, jangan ubah ejaan.

Format JSON WAJIB:
{"parts":[{"role":"Hook","scene_count":1,"label":"..."},{"role":"Body","scene_count":N,"label":"..."},{"role":"CTA","scene_count":1,"label":"..."}],"scene_photo_order":[{"scene":1,"label":"..."}]}
Jumlah scene_photo_order = ${sceneCount}, urut dari scene 1 sampai ${sceneCount}.`;

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
          systemPrompt: system, userPrompt: user, maxTokens: 1200, temperature: 0.6,
          reasoningEffort: prov === 'gemini' ? 'none' : undefined,
          timeoutMs: 55000,
        });
        if (r.ok) { raw = r.content; used = prov; break; }
        lastErr = r.error;
        console.error(`[suggest-storyboard] ${prov} gagal:`, r.error?.slice(0, 120));
      }
      if (!raw) {
        send({ done: true, error: `Gagal rancang storyboard: ${(lastErr || 'semua provider gagal/kehabisan kuota').slice(0, 180)}. Pastikan API key AI diatur di Pengaturan.` });
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

      const parts = Array.isArray(parsed.parts) ? parsed.parts
        .filter(p => ['Hook', 'Body', 'CTA'].includes(p.role) && Number.isInteger(p.scene_count) && p.scene_count > 0)
        .map(p => ({ role: p.role, sceneCount: p.scene_count, label: typeof p.label === 'string' ? p.label.slice(0, 80) : undefined }))
        : [];
      const partsSum = parts.reduce((s, p) => s + p.sceneCount, 0);
      if (parts.length === 0 || partsSum !== sceneCount) {
        send({ done: true, error: `AI mengembalikan pembagian Part yang tidak konsisten (total ${partsSum} scene, seharusnya ${sceneCount}). Coba lagi.` });
        return;
      }

      const order = Array.isArray(parsed.scene_photo_order) ? parsed.scene_photo_order : [];
      if (order.length !== sceneCount) {
        send({ done: true, error: `AI mengembalikan ${order.length} scene, seharusnya ${sceneCount}. Coba lagi.` });
        return;
      }
      const sorted = [...order].sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0));
      const scenePhotoOrder = [];
      for (const item of sorted) {
        const label = typeof item.label === 'string' ? item.label.trim() : '';
        const img = byLabel.get(label);
        if (!img) {
          send({ done: true, error: `AI mengembalikan label "${label}" yang tidak ada di daftar foto berlabel. Coba lagi.` });
          return;
        }
        scenePhotoOrder.push({ scene: item.scene, label, photo_id: img.id, url_webp: img.url_webp });
      }

      send({ done: true, data: { parts, scene_photo_order: scenePhotoOrder, provider_used: used } });
    } catch (err) {
      console.error('[suggest-storyboard] stream', err.message);
      send({ done: true, error: 'Terjadi kesalahan internal saat rancang storyboard. Coba lagi.' });
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
