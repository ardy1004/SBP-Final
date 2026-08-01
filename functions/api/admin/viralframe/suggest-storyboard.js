// POST /api/admin/viralframe/suggest-storyboard — Sutradara AI BERVISI
// (refactor Tahap 2, 2026-08-01): AI melihat langsung foto berlabel properti
// (URL publik /api/media?key=..., BUKAN base64 — hemat CPU Worker) dan merancang
// isi tiap Part (1 Part = 1 generate call, lihat PartDef di options.ts):
// berapa CUT di dalamnya, foto referensi mana, dan alasan singkatnya.
//
// Model Part-as-Generate-Unit (kontrak baru Agent 1 Gelombang 1):
//   PartDef { role, durationSec, voDurationSec, refPhotoIds[], cuts[], label?, rationale? }
//   CutDef  { photoId, label, durasiDetik, aksi? }
// User MENGUNCI: jumlah Part, role, durationSec, voDurationSec tiap Part.
// AI MENENTUKAN: cuts (potongan) di dalam tiap Part + foto referensi + rationale.
//
// Body: { property_id, parts:[{role,durationSec,voDurationSec,label?}], archetype?,
//         register?, character_photo_url?, ai_tool?, provider? }
// Respons SUKSES = streaming NDJSON (pola sama seperti captions.js — heartbeat
// 2s + baris terakhir {done,data|error}, anti wall-clock 30s Workers).
// Error validasi awal (property_id, parts, foto berlabel kurang) tetap
// JSON biasa sebelum stream dibuka.
// Auth: _middleware.js
//
// Vision-first dengan degradasi teks-saja (WAJIB, lihat instruksi Tahap 2):
// coba provider ber-`supportsVision` dulu dengan foto terlampir; kalau tak ada
// yang punya key/gagal, turun ke provider teks-saja TANPA foto (kuota Gemini
// habis TIDAK BOLEH mematikan fitur ini).

import { jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';
import { MAX_REF_IMAGES_PER_PART, getClipMaxSec } from '../../../_lib/viralframe-shared.js';

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];
const MAKS_PART = 8;
const DUR_PART_FALLBACK_MAKS = 300; // dipakai hanya bila ai_tool tak dikenal/kosong

// Anggaran waktu TOTAL untuk seluruh rantai fallback (vision + teks), di bawah
// wall-clock 30s Workers. Request bervisi ke Gemini bisa lebih lambat dari
// teks-saja (payload foto lebih besar) — anggaran per-percobaan diturunkan dari
// sisa waktu global, bukan konstanta tetap, supaya percobaan terakhir tidak
// dipotong pas di tengah oleh Worker.
const BUDGET_MS = 26000;
const MIN_SISA_UNTUK_COBA_MS = 4000;

export async function onRequestPost(context) {
  const { request, env } = context;
  const mulai = Date.now();
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);

  const aiTool = typeof body.ai_tool === 'string' ? body.ai_tool.slice(0, 40) : '';
  const clipMax = getClipMaxSec(aiTool) ?? DUR_PART_FALLBACK_MAKS;

  // Part yang dirancang & DIKUNCI user — AI tidak boleh mengubah jumlah, role,
  // durationSec, atau voDurationSec-nya, hanya mengisi cuts/ref/rationale.
  const partsInput = Array.isArray(body.parts)
    ? body.parts
        .filter(p => ['Hook', 'Body', 'CTA'].includes(p?.role))
        .map(p => ({
          role: p.role,
          durationSec: parseInt(p.durationSec, 10),
          voDurationSec: parseInt(p.voDurationSec, 10),
          label: typeof p.label === 'string' ? p.label.slice(0, 80) : undefined,
          // Part yang di-set "Talking-Head Saja" di UI (cutawayExcluded): presenter
          // tetap di frame sepanjang Part, tanpa disela cutaway b-roll.
          talkingHead: p.talkingHead === true,
        }))
        .slice(0, MAKS_PART)
    : [];
  if (partsInput.length === 0) return jsonError('parts wajib berisi minimal 1 Part', 422);

  for (const p of partsInput) {
    if (!Number.isInteger(p.durationSec) || p.durationSec <= 0 || p.durationSec > clipMax) {
      return jsonError(`Durasi tiap Part harus 1-${clipMax} detik${aiTool ? ` (batas ${aiTool})` : ''}`, 422);
    }
    if (!Number.isInteger(p.voDurationSec) || p.voDurationSec < 0 || p.voDurationSec > p.durationSec) {
      return jsonError('voDurationSec tiap Part harus 0..durationSec Part itu', 422);
    }
  }

  const archetype = typeof body.archetype === 'string' ? body.archetype.slice(0, 60) : '';
  const register = typeof body.register === 'string' ? body.register.slice(0, 40) : '';
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';

  // ── BRIEF KREATIF ──────────────────────────────────────────────────────────
  // Sebelum 2026-08-01 endpoint ini HANYA menerima archetype/register/ai_tool,
  // sehingga sutradara AI merancang tanpa tahu tipe hook, tipe CTA, platform,
  // tone, gaya visual, maupun bahasa yang sudah dipilih user — hasilnya generik
  // dan Part pembuka/penutup tidak nyambung dengan pilihan user.
  // `rasio` SENGAJA TIDAK diterima: aspect ratio adalah setelan di Google Flow,
  // mengulanginya di prompt hanya menambah token tanpa mengubah hasil.
  const teks = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const brief = {
    hookType: teks(body.hook_type, 40),
    ctaType: teks(body.cta_type, 40),
    ctaKeyword: teks(body.cta_keyword, 30),
    tone: teks(body.tone, 40),
    visualStyle: teks(body.visual_style, 40),
    bahasa: teks(body.bahasa, 40),
    platforms: Array.isArray(body.platforms)
      ? body.platforms.filter(p => typeof p === 'string').slice(0, 6).map(p => p.slice(0, 30))
      : [],
  };

  // URL publik untuk dikirim ke vision AI. Foto sudah publik lewat
  // /api/media?key=... (PUBLIC_PREFIXES mencakup property-photos/ &
  // viralframe-characters/, lihat functions/api/media.js) — JANGAN base64 di
  // Worker, boros CPU dalam anggaran 10ms/request Cloudflare FREE tier.
  const origin = new URL(request.url).origin;
  function publicMediaUrl(rawKeyOrUrl) {
    if (!rawKeyOrUrl) return null;
    const s = String(rawKeyOrUrl).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/')) return origin + s; // sudah bentuk "/api/media?key=..."
    return `${origin}/api/media?key=${encodeURIComponent(s)}`;
  }
  const characterUrl = publicMediaUrl(typeof body.character_photo_url === 'string' ? body.character_photo_url : null);

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
  // terkecil). Kalau 2+ foto berbagi label sama, backend yang memilih satu
  // (rotasi di bawah) — AI melihat SATU foto representatif per label, bukan
  // memilih sendiri di antara duplikat (mencegah AI menyebut foto_id yang tak pernah ia lihat).
  const candidatesByLabel = new Map();
  for (const r of rows) {
    const label = String(r.label_ruangan).trim();
    const arr = candidatesByLabel.get(label) ?? [];
    arr.push(r);
    candidatesByLabel.set(label, arr);
  }
  const skor = (x) => (x.is_cover ? 1000 : 0) - (x.urutan ?? 0);
  for (const arr of candidatesByLabel.values()) arr.sort((a, b) => skor(b) - skor(a));

  // Rotasi foto dalam label yang sama antar generate — tanpa ini label yang
  // punya beberapa foto akan selalu memakai foto yang sama tiap regenerate.
  // Bentuk params_json BARU menyimpan photoId di parts[].cuts[] (bukan lagi
  // scenes[] flat); tetap toleran membaca bentuk lama untuk riwayat pra-refactor.
  const lastUsedIdx = new Map();
  try {
    const gens = await env.DB.prepare(
      `SELECT params_json FROM viralframe_generations WHERE property_id = ? ORDER BY created_at DESC LIMIT 10`
    ).bind(propertyId).all();
    let idx = 0;
    for (const g of gens.results ?? []) {
      let parsedGen;
      try { parsedGen = JSON.parse(g.params_json); } catch { continue; }
      const partsLama = parsedGen?.parts ?? parsedGen?.s1?.parts ?? [];
      for (const pt of partsLama) {
        for (const cut of pt?.cuts ?? []) {
          if (cut?.photoId != null && !lastUsedIdx.has(cut.photoId)) lastUsedIdx.set(cut.photoId, idx);
        }
      }
      for (const sc of parsedGen?.scenes ?? []) { // bentuk pra-Part-model (kompatibilitas)
        if (sc?.photoId != null && !lastUsedIdx.has(sc.photoId)) lastUsedIdx.set(sc.photoId, idx);
      }
      idx += 1;
    }
  } catch (err) {
    console.error('[suggest-storyboard] riwayat rotasi foto', err.message);
  }

  const byLabel = new Map();
  for (const [label, arr] of candidatesByLabel) {
    let pilih = arr[0];
    let pilihIdx = lastUsedIdx.has(arr[0].id) ? lastUsedIdx.get(arr[0].id) : Infinity;
    for (const cand of arr.slice(1)) {
      const candIdx = lastUsedIdx.has(cand.id) ? lastUsedIdx.get(cand.id) : Infinity;
      if (candIdx > pilihIdx) { pilih = cand; pilihIdx = candIdx; }
    }
    byLabel.set(label, pilih);
  }
  const uniqueLabels = [...byLabel.keys()];

  if (uniqueLabels.length === 0) {
    return jsonError('Belum ada foto berlabel untuk properti ini. Beri Label Foto dulu (Step 0 atau Detail Properti).', 422);
  }

  const refQuota = characterUrl ? MAX_REF_IMAGES_PER_PART - 1 : MAX_REF_IMAGES_PER_PART;
  if (refQuota < 1) {
    return jsonError(`MAX_REF_IMAGES_PER_PART (${MAX_REF_IMAGES_PER_PART}) terlalu kecil untuk menyisakan slot foto ruangan setelah foto karakter.`, 422);
  }

  const imageUrls = [
    ...(characterUrl ? [characterUrl] : []),
    ...uniqueLabels.map(l => publicMediaUrl(byLabel.get(l).url_webp)).filter(Boolean),
  ];

  const daftarLabelTeks = uniqueLabels.map((l, i) => `${i + 1}. ${l}`).join('\n');
  const partsSpecTeks = partsInput.map((p, i) => {
    const sisaVo = p.durationSec - p.voDurationSec;
    const th = p.talkingHead
      ? ` [TALKING-HEAD SAJA: presenter tetap di frame sepanjang Part, TANPA cutaway b-roll. Pakai TEPAT SATU cut sepanjang ${p.durationSec} detik, dengan SATU label ruangan sebagai LATAR tempat presenter berdiri/berbicara.]`
      : '';
    return `PART ${i + 1} — role ${p.role}, durasi TOTAL ${p.durationSec} detik, voiceover ${p.voDurationSec} detik (sisa ${sisaVo} detik tanpa VO untuk hook text/transisi/end card)${p.label ? `, tema "${p.label}"` : ''}.${th}`;
  }).join('\n');
  // ⚠️ Foto karakter TIDAK boleh disebut sebagai label. Ia dilampirkan OTOMATIS ke
  // setiap Part oleh konsumen (ZIP memakai characterFileName() terpisah), dan
  // `byLabel` hanya berisi label RUANGAN sehingga label karakter apa pun akan
  // ditolak validator (422). Versi lama teks ini bilang karakter "ikut dihitung
  // dalam kuota referensi" tanpa menyebut larangan menamainya — AI wajar
  // menyimpulkan boleh memakainya sebagai photo_label, lalu selalu gagal pada Part
  // talking-head (insiden 2026-08-01). Kuotanya tetap dikurangi 1 lewat refQuota.
  const kuotaRefTeks = characterUrl
    ? `Foto KARAKTER (talent, gambar pertama) sudah otomatis dilampirkan ke SETIAP Part — slotnya sudah dipotong dari kuota, jadi tiap Part maksimal ${refQuota} foto RUANGAN berbeda (total ${MAX_REF_IMAGES_PER_PART} dengan karakter). JANGAN PERNAH menulis karakter/talent/orang sebagai "photo_label" atau di "ref_photo_labels" — kedua field itu HANYA untuk label ruangan dari daftar di atas.`
    : `Tiap Part maksimal ${refQuota} foto ruangan berbeda sebagai referensi.`;

  // Brief kreatif yang disuntik ke user prompt. Baris yang kosong dibuang supaya
  // tidak mengirim label tanpa nilai ("Tone: .") yang justru membingungkan model.
  const briefTeks = [
    archetype ? `Gaya video (arketipe): ${archetype}.` : '',
    brief.platforms.length ? `Platform tujuan: ${brief.platforms.join(', ')} (platform pertama = primer; sesuaikan pacing & panjang cut dengan kebiasaan menonton di sana).` : '',
    brief.visualStyle ? `Gaya visual: ${brief.visualStyle}.` : '',
    brief.tone ? `Tone narasi: ${brief.tone}.` : '',
    brief.bahasa ? `Bahasa narasi: ${brief.bahasa}.` : '',
    register ? `Register/gaya bahasa: ${register}.` : '',
    brief.hookType ? `Tipe HOOK yang dipilih user: ${brief.hookType}. Part pertama WAJIB dirancang untuk mendukung tipe hook ini sejak detik pertama.` : '',
    brief.ctaType
      ? `Tipe CTA penutup: ${brief.ctaType}${brief.ctaKeyword ? ` (kata kunci komentar: "${brief.ctaKeyword}")` : ''}. Part terakhir WAJIB dirancang agar penonton siap melakukan CTA ini.`
      : '',
  ].filter(Boolean).join('\n');

  function buatPrompt(usingVision) {
    const system = usingVision
      ? `Kamu sutradara video pendek properti Indonesia yang MELIHAT foto-foto berikut secara visual (gambar dilampirkan sesuai urutan: ${characterUrl ? 'gambar pertama = foto KARAKTER/talent, gambar setelahnya berurutan sama dengan daftar label ruangan' : 'urutan sama dengan daftar label ruangan'} di bawah). Rancang storyboard berdasarkan apa yang BENAR-BENAR kamu lihat (pencahayaan, suasana, ukuran ruang, furnitur, detail nyata) — jangan mengarang detail yang tidak ada di foto. Jangan pernah menyebut label ruangan di luar daftar yang diberikan. Jangan pernah mengklaim tahu data algoritma/tren medsos terkini. Output HANYA JSON valid, tanpa markdown, tanpa teks lain.`
      : `Kamu sutradara video pendek properti Indonesia. Kamu HANYA menerima daftar LABEL RUANGAN (teks), bukan foto — jangan pernah mengarang label baru di luar daftar. Jangan pernah mengklaim tahu data algoritma/tren medsos terkini. Output HANYA JSON valid, tanpa markdown, tanpa teks lain.`;

    const user = `Rancang storyboard tiap PART (babak) video properti ini. Properti sudah difoto per ruangan/aspek berikut:
${daftarLabelTeks}

Struktur PART sudah DITETAPKAN user dan TIDAK BOLEH diubah (jumlah part, urutan, role, durasi total, durasi VO tetap):
${partsSpecTeks}
${briefTeks}

Tugas untuk TIAP Part:
1. Rancang beberapa "cut" (potongan shot) yang totalnya PERSIS sama dengan durasi TOTAL Part itu (dalam detik). Cut boleh berdurasi berapa saja yang masuk akal untuk video pendek (umumnya 1-6 detik per cut) asal jumlahnya pas.
2. Boleh memakai SATU label lebih dari sekali dalam satu Part (montase cepat: ruangan yang sama dengan framing/aksi berbeda) — ini VALID dan didorong untuk Part yang butuh banyak cut singkat, bukan bug.
3. ${kuotaRefTeks} Kumpulkan foto UNIK (tanpa duplikat) yang benar-benar dipakai Part ini ke dalam "ref_photo_labels" (urutan = urutan dilampirkan sebagai reference image).
4. Pilih foto yang paling mendukung role Part (Hook = paling menarik/fasad/first impression kuat; Body = tur isi ruangan utama; CTA = penutup/kesan tinggal/lingkungan sekitar).
5. Semua label WAJIB persis salah satu string dari daftar 1-${uniqueLabels.length} di atas — JANGAN mengarang label baru, jangan ubah ejaan.
6. Beri "rationale" singkat (1-2 kalimat, jujur & spesifik) alasan susunan Part ini — supaya keputusanmu bisa dikoreksi manual oleh user, bukan kotak hitam.
7. Fokus alasan pada craft naratif/pacing/framing sinematik SAJA — jangan mengklaim mengetahui data algoritma atau tren medsos real-time (kamu tidak punya akses itu).

Format JSON WAJIB (jumlah elemen "parts" HARUS ${partsInput.length}, urut sama seperti struktur di atas):
{"parts":[{"role":"${partsInput[0].role}","cuts":[{"photo_label":"...","durasi":N,"aksi":"deskripsi aksi/kamera singkat"}],"ref_photo_labels":["..."],"rationale":"..."}]}`;

    return { system, user };
  }

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];

  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n')).catch(() => {});

  const work = (async () => {
    const heartbeat = setInterval(() => send({ status: 'progress' }), 2000);
    try {
      let raw = null, used = null, lastErr = null, usedVision = false;

      // Fase 1 — coba provider ber-visi dulu (kirim imageUrls), dalam urutan
      // preferensi user. Kalau tak satupun provider bervisi punya key
      // ter-konfigurasi, fase ini tidak menghasilkan apa-apa (bukan error) —
      // lanjut ke Fase 2 (degradasi teks-saja).
      const { system: sysVision, user: userVision } = buatPrompt(true);
      for (const prov of tryOrder) {
        if (!PROVIDERS[prov].supportsVision) continue;
        const sisa = BUDGET_MS - (Date.now() - mulai);
        if (sisa < MIN_SISA_UNTUK_COBA_MS) break;
        const key = await getProviderKey(env, prov);
        if (!key) continue;
        const r = await callChatCompletion({
          provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
          systemPrompt: sysVision, userPrompt: userVision, imageUrls,
          maxTokens: 1600, temperature: 0.6,
          reasoningEffort: prov === 'gemini' ? 'none' : undefined,
          timeoutMs: Math.max(3000, Math.min(sisa - 1000, 18000)),
        });
        if (r.ok) { raw = r.content; used = prov; usedVision = true; break; }
        lastErr = r.error;
        console.error(`[suggest-storyboard] vision ${prov} gagal:`, r.error?.slice(0, 120));
      }

      // Fase 2 — degradasi teks-saja (label saja, TANPA foto). Kuota/keyless
      // provider bervisi TIDAK BOLEH mematikan fitur ini; provider apa pun
      // yang punya key dicoba, termasuk yang sudah gagal di Fase 1 dengan
      // imageUrls dilewati (mis. Gemini kuota habis khusus permintaan bervisi
      // yang lebih berat — percobaan teks-saja bisa saja masih berhasil).
      if (!raw) {
        const { system: sysTeks, user: userTeks } = buatPrompt(false);
        for (const prov of tryOrder) {
          const sisa = BUDGET_MS - (Date.now() - mulai);
          if (sisa < MIN_SISA_UNTUK_COBA_MS) break;
          const key = await getProviderKey(env, prov);
          if (!key) continue;
          const r = await callChatCompletion({
            provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
            systemPrompt: sysTeks, userPrompt: userTeks,
            maxTokens: 1600, temperature: 0.6,
            reasoningEffort: prov === 'gemini' ? 'none' : undefined,
            timeoutMs: Math.max(3000, Math.min(sisa - 1000, 12000)),
          });
          if (r.ok) { raw = r.content; used = prov; usedVision = false; break; }
          lastErr = r.error;
          console.error(`[suggest-storyboard] teks ${prov} gagal:`, r.error?.slice(0, 120));
        }
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

      // Struktur Part milik USER — AI hanya boleh mengisi cuts/ref_photo_labels/
      // rationale, bukan menambah/menghapus/menukar Part. Iterasi dilakukan atas
      // partsInput (bukan jawaban AI), role/durationSec/voDurationSec dari input.
      const jawabanPart = Array.isArray(parsed.parts) ? parsed.parts : [];
      if (jawabanPart.length !== partsInput.length) {
        send({ done: true, error: `AI mengembalikan ${jawabanPart.length} Part, seharusnya ${partsInput.length}. Coba lagi.` });
        return;
      }

      const parts = [];
      for (let i = 0; i < partsInput.length; i++) {
        const src = jawabanPart[i];
        const cutsRaw = Array.isArray(src?.cuts) ? src.cuts : [];
        if (cutsRaw.length === 0) {
          send({ done: true, error: `Part ${i + 1} (${partsInput[i].role}): AI tidak memberi cut sama sekali. Coba lagi.` });
          return;
        }

        const cuts = [];
        let sumDurasi = 0;
        let gagal = false;
        for (const c of cutsRaw) {
          const label = typeof c?.photo_label === 'string' ? c.photo_label.trim() : '';
          const img = byLabel.get(label);
          if (!img) {
            // Pesan harus bisa ditindaklanjuti: sebut label yang sah, dan jelaskan
            // kasus paling sering (AI menyebut foto karakter — ia dilampirkan
            // otomatis, bukan dipilih lewat label).
            const miripKarakter = /karakter|talent|presenter|agen|orang|host|model/i.test(label);
            send({
              done: true,
              error: `Part ${i + 1}: AI mengembalikan label "${label}" yang bukan label foto properti.`
                + (miripKarakter
                  ? ' Foto karakter dilampirkan otomatis ke setiap Part dan tidak boleh dipilih sebagai label cut.'
                  : '')
                + ` Label yang sah: ${uniqueLabels.join(', ')}. Coba jalankan lagi.`,
            });
            gagal = true; break;
          }
          const durasi = Number(c?.durasi);
          if (!Number.isFinite(durasi) || durasi <= 0) {
            send({ done: true, error: `Part ${i + 1}: durasi cut untuk "${label}" tidak valid. Coba lagi.` });
            gagal = true; break;
          }
          cuts.push({
            photoId: img.id,
            label,
            durasiDetik: durasi,
            aksi: typeof c?.aksi === 'string' && c.aksi.trim() ? c.aksi.trim().slice(0, 200) : undefined,
          });
          sumDurasi += durasi;
        }
        if (gagal) return;

        // Invarian keras: Σ durasi cuts = durationSec Part (toleransi kecil untuk
        // pembulatan angka desimal dari AI).
        if (Math.abs(sumDurasi - partsInput[i].durationSec) > 0.5) {
          send({ done: true, error: `Part ${i + 1} (${partsInput[i].role}): total durasi cut AI = ${sumDurasi}s, seharusnya ${partsInput[i].durationSec}s. Coba lagi.` });
          return;
        }

        const refLabelsRaw = Array.isArray(src?.ref_photo_labels)
          ? src.ref_photo_labels.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
          : [];
        for (const l of refLabelsRaw) {
          if (!byLabel.has(l)) {
            send({ done: true, error: `Part ${i + 1}: ref_photo_labels menyebut "${l}" yang tidak ada di daftar foto. Coba lagi.` });
            return;
          }
        }
        const refLabelSet = new Set(refLabelsRaw);
        if (refLabelSet.size !== refLabelsRaw.length) {
          send({ done: true, error: `Part ${i + 1}: ref_photo_labels berisi duplikat. Coba lagi.` });
          return;
        }
        // ref_photo_labels wajib unik ≤ MAX_REF_IMAGES_PER_PART per Part (foto
        // karakter ikut dihitung lewat refQuota bila character_photo_url diisi) —
        // ini invarian KERAS, tidak boleh dilonggarkan.
        if (refLabelsRaw.length > refQuota) {
          send({ done: true, error: `Part ${i + 1}: AI memakai ${refLabelsRaw.length} foto referensi, melebihi kuota ${refQuota}${characterUrl ? ' (setelah dikurangi 1 slot foto karakter)' : ''}. Coba lagi.` });
          return;
        }
        // ref_photo_labels wajib mencakup semua label unik yang benar-benar
        // dipakai di cuts — kalau tidak, konsumen ZIP/prompt akan melampirkan
        // foto yang tidak lengkap untuk cut yang disebut.
        const cutLabelsUnique = [...new Set(cuts.map(c => c.label))];
        const kurangDiRef = cutLabelsUnique.filter(l => !refLabelSet.has(l));
        if (kurangDiRef.length > 0) {
          send({ done: true, error: `Part ${i + 1}: ref_photo_labels tidak mencakup label yang dipakai di cuts ("${kurangDiRef[0]}"). Coba lagi.` });
          return;
        }

        parts.push({
          role: partsInput[i].role,
          durationSec: partsInput[i].durationSec,
          voDurationSec: partsInput[i].voDurationSec,
          label: typeof src?.label === 'string' && src.label.trim() ? src.label.slice(0, 80) : partsInput[i].label,
          refPhotoIds: refLabelsRaw.map(l => byLabel.get(l).id),
          cuts,
          rationale: typeof src?.rationale === 'string' ? src.rationale.trim().slice(0, 500) : '',
        });
      }

      send({ done: true, data: { parts, provider_used: used, used_vision: usedVision } });
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
