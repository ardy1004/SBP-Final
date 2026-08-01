// POST /api/admin/viralframe/suggest-storyboard — AI merancang isi tiap Part
// (BERAPA scene + foto apa saja) dari label_ruangan yang SUDAH TERSIMPAN (migrasi
// 0026), tanpa vision AI (AI hanya bernalar dari teks label, tidak pernah lihat
// foto). Deteksi otomatis "ini foto apa" dari gambar mentah adalah fitur
// TERPISAH yang sengaja tidak dibangun di sini.
//
// Model Part (Fase 2): yang DIKUNCI user = daftar Part + durasi tiap Part.
// Yang ditentukan AI = jumlah scene per Part dan foto mana yang dipakai.
// Sebelumnya sebaliknya (user mengunci scene_count total, AI cuma membagi) —
// itu yang membuat Part terasa kosmetik.
// Body: { property_id, parts: [{role, durationSec, label?}], archetype?, register? }
// Respons SUKSES = streaming NDJSON (pola sama seperti captions.js — heartbeat
// 2s + baris terakhir {done,data|error}, anti wall-clock 30s Workers).
// Error validasi awal (property_id, parts, foto berlabel kurang) tetap
// JSON biasa sebelum stream dibuka.
// Auth: _middleware.js

import { jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];

// Batas struktural. SCENE_MIN/MAKS = rentang yang didukung wizard; DUR_SCENE_*
// = rentang durasi satu scene yang benar-benar didukung getLipsync() (2-30 detik),
// dipakai untuk menurunkan "berapa scene yang muat" dari durasi sebuah Part.
const MAKS_PART = 8;
const SCENE_MIN = 2;
const SCENE_MAKS = 12;
const DUR_SCENE_MIN = 2;
const DUR_SCENE_MAKS = 30;
const DUR_SCENE_IDEAL = 7;

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);

  // Part yang dirancang user. durationSec = sumber kebenaran durasi babak;
  // dari sinilah anggaran jumlah scene per Part dihitung.
  const partsInput = Array.isArray(body.parts)
    ? body.parts
        .filter(p => ['Hook', 'Body', 'CTA'].includes(p?.role))
        .map(p => ({
          role: p.role,
          durationSec: parseInt(p.durationSec, 10),
          label: typeof p.label === 'string' ? p.label.slice(0, 80) : undefined,
        }))
        .slice(0, MAKS_PART)
    : [];
  if (partsInput.length === 0) return jsonError('parts wajib berisi minimal 1 Part', 422);
  const partDurasiTidakSah = partsInput.find(p => !Number.isInteger(p.durationSec) || p.durationSec < DUR_SCENE_MIN || p.durationSec > 300);
  if (partDurasiTidakSah) return jsonError(`Durasi tiap Part harus ${DUR_SCENE_MIN}-300 detik`, 422);

  // Anggaran scene per Part dari durasinya (target ±DUR_SCENE_IDEAL detik/scene),
  // dijaga agar hasil bagi tetap di rentang yang didukung getLipsync() (2-30 detik).
  const anggaran = partsInput.map(p => {
    const min = Math.max(1, Math.ceil(p.durationSec / DUR_SCENE_MAKS));
    const max = Math.max(min, Math.floor(p.durationSec / DUR_SCENE_MIN));
    const saran = Math.max(min, Math.min(max, Math.round(p.durationSec / DUR_SCENE_IDEAL)));
    return { min, max, saran };
  });
  let totalMin = anggaran.reduce((s, a) => s + a.min, 0);
  if (totalMin > SCENE_MAKS) {
    return jsonError(`Total durasi Part terlalu panjang — minimal butuh ${totalMin} scene, batasnya ${SCENE_MAKS}. Kurangi durasi Part atau jumlah Part.`, 422);
  }
  // Wizard mensyaratkan minimal SCENE_MIN scene. Rancangan yang sangat pendek
  // (mis. 1 Part 8 detik) minimalnya cuma 1 scene — naikkan min Part yang masih
  // punya headroom sampai totalnya sah, supaya AI tidak dituntun ke jawaban yang
  // pasti ditolak validator di bawah (dead-end "coba lagi" tanpa jalan keluar).
  for (let i = 0; totalMin < SCENE_MIN && i < anggaran.length; i++) {
    while (totalMin < SCENE_MIN && anggaran[i].min < anggaran[i].max) {
      anggaran[i].min += 1;
      totalMin += 1;
    }
  }
  if (totalMin < SCENE_MIN) {
    return jsonError(`Durasi Part terlalu pendek untuk dipecah jadi minimal ${SCENE_MIN} scene. Tambah durasi Part atau tambah Part baru.`, 422);
  }

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

  // Kelompokkan per label, urut preferensi bawaan (is_cover dulu, lalu urutan
  // terkecil). AI TIDAK PERNAH melihat foto_id individual — backend yang memilih
  // di antara foto yang berbagi label, jadi AI tidak bisa jadi penentunya.
  const candidatesByLabel = new Map();
  for (const r of rows) {
    const label = String(r.label_ruangan).trim();
    const arr = candidatesByLabel.get(label) ?? [];
    arr.push(r);
    candidatesByLabel.set(label, arr);
  }
  const skor = (x) => (x.is_cover ? 1000 : 0) - (x.urutan ?? 0);
  for (const arr of candidatesByLabel.values()) arr.sort((a, b) => skor(b) - skor(a));

  // Tahap 8b — rotasi foto dalam label yang sama. Tanpa ini, label "Kamar Tidur"
  // yang punya 3 foto akan SELALU memakai foto yang sama tiap regenerate, dan
  // video untuk properti yang sama terlihat identik di mata algoritma medsos.
  // Urutan pemakaian diambil dari riwayat generate properti ini: foto yang belum
  // pernah dipakai menang duluan, sisanya yang paling lama tidak dipakai.
  const lastUsedIdx = new Map();
  try {
    const gens = await env.DB.prepare(
      `SELECT params_json FROM viralframe_generations WHERE property_id = ? ORDER BY created_at DESC LIMIT 10`
    ).bind(propertyId).all();
    let idx = 0;
    for (const g of gens.results ?? []) {
      let parsedGen;
      try { parsedGen = JSON.parse(g.params_json); } catch { continue; }
      for (const sc of parsedGen?.scenes ?? []) {
        if (sc?.photoId != null && !lastUsedIdx.has(sc.photoId)) lastUsedIdx.set(sc.photoId, idx);
      }
      idx += 1;
    }
  } catch (err) {
    // Riwayat gagal dibaca → jatuh ke preferensi bawaan, bukan error fatal.
    console.error('[suggest-storyboard] riwayat rotasi foto', err.message);
  }

  const byLabel = new Map();
  for (const [label, arr] of candidatesByLabel) {
    // arr sudah urut preferensi; pilih yang paling lama tidak dipakai.
    // Infinity = belum pernah dipakai sama sekali → prioritas tertinggi.
    let pilih = arr[0];
    let pilihIdx = lastUsedIdx.has(arr[0].id) ? lastUsedIdx.get(arr[0].id) : Infinity;
    for (const cand of arr.slice(1)) {
      const candIdx = lastUsedIdx.has(cand.id) ? lastUsedIdx.get(cand.id) : Infinity;
      if (candIdx > pilihIdx) { pilih = cand; pilihIdx = candIdx; }
    }
    byLabel.set(label, pilih);
  }
  const uniqueLabels = [...byLabel.keys()];

  // Tiap scene memakai label berbeda, jadi jumlah label unik = plafon keras jumlah
  // scene. Plafon ini dikirim ke AI DAN divalidasi ulang setelah AI menjawab.
  if (uniqueLabels.length < Math.max(SCENE_MIN, totalMin)) {
    return jsonError(
      `Baru ${uniqueLabels.length} foto berlabel, butuh minimal ${Math.max(SCENE_MIN, totalMin)} untuk rancangan Part ini. Pilih foto + Label Foto dulu di Step 0 (tersimpan otomatis), atau di Detail Properti.`,
      422
    );
  }
  const sceneMaksEfektif = Math.min(SCENE_MAKS, uniqueLabels.length);
  // Persempit rentang tiap Part agar SATU Part tidak bisa sendirian melampaui
  // plafon total — tanpa ini AI bisa menjawab "sah per Part" tapi totalnya
  // melanggar, dan user cuma dapat pesan "coba lagi" berulang tanpa sebab jelas.
  const slack = sceneMaksEfektif - totalMin;
  for (const a of anggaran) {
    a.max = Math.max(a.min, Math.min(a.max, a.min + slack));
    a.saran = Math.max(a.min, Math.min(a.max, a.saran));
  }
  // Angka "saran" per Part dihitung independen, jadi JUMLAHnya bisa melewati
  // plafon total (mis. 8 Part × 30 detik → saran 32 scene padahal batasnya 12).
  // Tanpa koreksi ini kita menuntun AI ke jawaban yang pasti ditolak validator.
  // Kurangi dari Part bersaran terbesar dulu agar pemangkasan terasa proporsional.
  let totalSaran = anggaran.reduce((s, a) => s + a.saran, 0);
  while (totalSaran > sceneMaksEfektif) {
    let target = -1;
    for (let i = 0; i < anggaran.length; i++) {
      if (anggaran[i].saran > anggaran[i].min && (target < 0 || anggaran[i].saran > anggaran[target].saran)) target = i;
    }
    if (target < 0) break; // semua sudah di min — validator total di bawah yang menangkap
    anggaran[target].saran -= 1;
    totalSaran -= 1;
  }

  const system = `Kamu sutradara storyboard video properti Indonesia. Kamu HANYA menerima daftar LABEL RUANGAN (teks), bukan foto — jangan pernah mengarang label baru di luar daftar yang diberikan. Output HANYA JSON valid, mulai { akhiri }, tanpa markdown.`;
  const user = `Rancang isi tiap babak (PART) video properti dari daftar label ruangan berikut (properti sudah difoto per ruangan/aspek ini):
${uniqueLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Struktur PART sudah DITETAPKAN user dan TIDAK BOLEH diubah (jumlah part, urutan, role, dan durasinya tetap):
${partsInput.map((p, i) => `PART ${i + 1} — role ${p.role}, durasi ${p.durationSec} detik${p.label ? `, tema "${p.label}"` : ''} → isi dengan ${anggaran[i].min}-${anggaran[i].max} scene (paling pas sekitar ${anggaran[i].saran} scene).`).join('\n')}
${archetype ? `Gaya video: ${archetype}.` : ''}
${register ? `Register bahasa: ${register}.` : ''}

Tugas:
1. Tentukan BERAPA scene untuk tiap PART, dalam rentang yang disebut di atas. Pertimbangkan durasi part: satu scene enak ditonton sekitar ${DUR_SCENE_IDEAL} detik, jadi part yang panjang butuh lebih banyak scene, bukan satu scene yang bertele-tele.
2. Total scene semua PART digabung HARUS antara ${SCENE_MIN} dan ${sceneMaksEfektif}.
3. Untuk tiap PART, pilih foto yang dipakai lewat "photo_labels": daftar label, PERSIS sebanyak scene_count part itu, urut sesuai urutan tampil. Pilih yang paling mendukung role part-nya (Hook = paling menarik/fasad; Body = tur isi ruangan utama; CTA = penutup/lingkungan). Prioritaskan ruangan utama (fasad/ruang tamu/kamar/dapur/kamar mandi) di atas ruangan minor.
4. SATU label hanya boleh dipakai SEKALI di seluruh video (lintas semua part) — jangan ada label kembar.
5. Semua label WAJIB persis salah satu string dari daftar 1-${uniqueLabels.length} di atas — JANGAN mengarang label baru, jangan ubah ejaan.

Format JSON WAJIB (jumlah elemen "parts" HARUS ${partsInput.length}, urut sama seperti di atas):
{"parts":[{"role":"${partsInput[0].role}","scene_count":N,"label":"judul babak singkat","photo_labels":["...","..."]}]}`;

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

      // Struktur Part milik USER — AI hanya boleh mengisi scene_count/photo_labels,
      // bukan menambah/menghapus/menukar Part. Karena itu iterasi dilakukan atas
      // partsInput (bukan atas jawaban AI), dan role/durationSec diambil dari input.
      const jawabanPart = Array.isArray(parsed.parts) ? parsed.parts : [];
      if (jawabanPart.length !== partsInput.length) {
        send({ done: true, error: `AI mengembalikan ${jawabanPart.length} Part, seharusnya ${partsInput.length}. Coba lagi.` });
        return;
      }

      const parts = [];
      const scenePhotoOrder = [];
      const labelTerpakai = new Set();
      for (let i = 0; i < partsInput.length; i++) {
        const src = jawabanPart[i];
        const n = parseInt(src?.scene_count, 10);
        if (!Number.isInteger(n) || n < anggaran[i].min || n > anggaran[i].max) {
          send({ done: true, error: `AI memberi ${src?.scene_count} scene untuk Part ${i + 1} (${partsInput[i].role}), di luar rentang ${anggaran[i].min}-${anggaran[i].max} yang muat di ${partsInput[i].durationSec} detik. Coba lagi.` });
          return;
        }
        const labels = Array.isArray(src.photo_labels) ? src.photo_labels : [];
        if (labels.length !== n) {
          send({ done: true, error: `Part ${i + 1} (${partsInput[i].role}): AI menyebut ${n} scene tapi memberi ${labels.length} foto. Coba lagi.` });
          return;
        }

        const photoIds = [];
        for (const raw of labels) {
          const label = typeof raw === 'string' ? raw.trim() : '';
          const img = byLabel.get(label);
          if (!img) {
            send({ done: true, error: `AI mengembalikan label "${label}" yang tidak ada di daftar foto berlabel. Coba lagi.` });
            return;
          }
          if (labelTerpakai.has(label)) {
            send({ done: true, error: `AI memakai label "${label}" lebih dari sekali. Coba lagi.` });
            return;
          }
          labelTerpakai.add(label);
          photoIds.push(img.id);
          scenePhotoOrder.push({ scene: scenePhotoOrder.length + 1, label, photo_id: img.id, url_webp: img.url_webp });
        }

        parts.push({
          role: partsInput[i].role,
          sceneCount: n,
          durationSec: partsInput[i].durationSec,
          label: typeof src.label === 'string' && src.label.trim() ? src.label.slice(0, 80) : partsInput[i].label,
          photoIds,
        });
      }

      const totalScene = scenePhotoOrder.length;
      if (totalScene < SCENE_MIN || totalScene > sceneMaksEfektif) {
        send({ done: true, error: `Total scene hasil AI = ${totalScene}, di luar batas ${SCENE_MIN}-${sceneMaksEfektif}. Coba lagi atau sesuaikan durasi Part.` });
        return;
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
