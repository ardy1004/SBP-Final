// POST /api/admin/viralframe/ai-generate — Jalur C: generate N video prompt via DeepSeek
// Body: { property_id, jumlah_scene, platform, ai_tool, bahasa, musik_value, musik_prompt, karakter_id }
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const PLATFORM_DURASI = {
  tiktok: 8, reels: 8, youtube_shorts: 10, facebook: 8,
};

const SCENE_CAMERA_HINTS = [
  'smooth cinematic drone pull-back revealing full facade',
  'elegant dolly push-in from gate toward entrance',
  'steady tracking shot along building exterior',
  'crane rise from ground level showing property and surroundings',
  'close-up detail pan across architectural features',
  'wide establishing shot from elevated position',
];

function formatRupiah(n) {
  if (n === null || n === undefined) return 'Hubungi agen';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function buildSystemPrompt({ jumlahScene, aiTool, platform, bahasa, namaKarakter, deskripsiKarakter, durasiDetik, musikValue, musikPrompt }) {
  const cameraLines = SCENE_CAMERA_HINTS.slice(0, jumlahScene)
    .map((hint, i) => `    Scene ${i + 1}: ${hint}`)
    .join('\n');

  const musikRule = musikValue === 'none'
    ? `[6] MUSIK: Jangan tambahkan instruksi audio apapun (mode tanpa musik).`
    : `[6] MUSIK: Tambahkan di akhir setiap prompt tepat seperti ini:\n    ${musikPrompt}`;

  return `Kamu adalah copywriter video prompting profesional untuk AI video generator.
Buat TEPAT ${jumlahScene} video prompt untuk properti di Yogyakarta.
AI video tool target: ${aiTool}
Platform: ${platform}

ATURAN KRITIS — WAJIB DIPATUHI TANPA PENGECUALIAN:

[1] BAHASA DIALOG KARAKTER: Semua ucapan/dialog karakter WAJIB dalam ${bahasa}.
    BENAR: karakter berkata "Selamat datang di hunian impian kami"
    SALAH: karakter berkata "Welcome to our dream home"
    Jika bahasa = Indonesia, semua dialog = Bahasa Indonesia.

[2] KATA/FRASA YANG DILARANG (ganti dengan alternatif berikut):
    luxury/mewah berlebihan → "dirancang dengan cermat" atau "berkualitas tinggi"
    exclusive/eksklusif → "well-appointed" atau "terawat baik"
    dramatic/dramatis → "sinematik" atau "memukau"
    shocking/mengejutkan → "captivating" atau "menawan"
    berlari/melompat → "berjalan dengan percaya diri" atau "melangkah elegan"
    sexy/sensual → DILARANG MUTLAK, hapus dari prompt
    terbaik di dunia/nomor 1 → "berkualitas" atau "terpercaya"
    nama orang nyata/nama brand nyata → DILARANG

[3] KARAKTER: Nama karakter = ${namaKarakter}. Deskripsi penampilan: ${deskripsiKarakter}.
    Karakter harus tampil secara fisik di scene (jalan, berdiri, gestur).
    Dialog karakter harus menyebut minimal 1 fitur nyata properti.

[4] PROPERTI: Sebutkan minimal 2 fitur nyata secara natural di setiap scene.
    Data properti tersedia di user prompt.

[5] GERAKAN KAMERA — setiap scene WAJIB BERBEDA:
${cameraLines}

${musikRule}

[7] DURASI: Setiap scene untuk video ${durasiDetik} detik.

FORMAT OUTPUT: JSON array murni. TIDAK ADA teks, komentar, atau markdown di luar JSON.
[
  {
    "scene": 1,
    "kamera": "nama singkat gerakan kamera",
    "prompt": "teks prompt lengkap dalam Bahasa Inggris untuk AI video tool",
    "dialog_karakter": "kalimat yang diucapkan karakter dalam ${bahasa}"
  }
]`;
}

function buildUserPrompt({ property, karakter, jumlahScene }) {
  const fasilitas = 'tidak disebutkan';
  const deskripsi = (property.deskripsi ?? '').slice(0, 200);
  const hargaLabel = `${formatRupiah(property.harga)}${property.nego ? ' (nego)' : property.nett ? ' (nett)' : ''}`;
  const deskripsiKarakter = describeKarakter(karakter);

  return `Data properti:
- Jenis: ${property.jenis_properti}
- Judul: ${property.title}
- Lokasi: ${property.kecamatan}, ${property.kabupaten}
- Harga: ${hargaLabel}
- Luas Tanah: ${property.luas_tanah ?? '-'} m² | Luas Bangunan: ${property.luas_bangunan ?? '-'} m²
- Kamar Tidur: ${property.jumlah_kamar_tidur ?? '-'} | Kamar Mandi: ${property.jumlah_kamar_mandi ?? '-'}
- Legalitas: ${property.legalitas ?? '-'}
- Fasilitas: ${fasilitas}
- Deskripsi singkat: ${deskripsi || '-'}

Karakter: ${karakter.nama} — ${deskripsiKarakter}

Buat ${jumlahScene} video prompt sesuai aturan system prompt.`;
}

function describeKarakter(k) {
  const parts = [];
  if (k.gender) parts.push(k.gender);
  if (k.usia) parts.push(`${k.usia} tahun`);
  if (k.etnik) parts.push(k.etnik);
  if (k.style) parts.push(`gaya ${k.style}`);
  if (k.ciri_fisik) parts.push(k.ciri_fisik);
  return parts.join(', ') || 'tidak ada deskripsi khusus';
}

function selectFotoUrls(images, jumlahScene) {
  if (images.length === 0) return [];
  const ordered = [...images].sort((a, b) => {
    if (a.is_cover !== b.is_cover) return a.is_cover - b.is_cover;
    return a.urutan - b.urutan;
  });
  const out = [];
  for (let i = 0; i < jumlahScene; i++) {
    out.push(ordered[i % ordered.length].url_webp);
  }
  return out;
}

function parseSceneJson(raw, jumlahScene) {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Respons DeepSeek bukan JSON valid' };
  }

  if (!Array.isArray(parsed)) return { ok: false, error: 'Respons DeepSeek harus berupa JSON array' };
  if (parsed.length !== jumlahScene) {
    return { ok: false, error: `Jumlah scene tidak sesuai: diminta ${jumlahScene}, diterima ${parsed.length}` };
  }
  for (const item of parsed) {
    if (typeof item?.scene !== 'number' || typeof item?.prompt !== 'string' || !item.prompt.trim()) {
      return { ok: false, error: 'Struktur scene JSON tidak lengkap (butuh scene, kamera, prompt, dialog_karakter)' };
    }
  }
  return { ok: true, data: parsed };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  const jumlahScene = parseInt(body.jumlah_scene, 10);
  const { platform, ai_tool: aiTool, bahasa, musik_value: musikValue } = body;
  const musikPrompt = typeof body.musik_prompt === 'string' ? body.musik_prompt : '';
  const karakterId = parseInt(body.karakter_id, 10);

  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib diisi', 422);
  if (!Number.isInteger(jumlahScene) || jumlahScene < 2 || jumlahScene > 6) return jsonError('jumlah_scene harus 2-6', 422);
  if (!platform || typeof platform !== 'string') return jsonError('platform wajib diisi', 422);
  if (!aiTool || typeof aiTool !== 'string') return jsonError('ai_tool wajib diisi', 422);
  if (!bahasa || typeof bahasa !== 'string') return jsonError('bahasa wajib diisi', 422);
  if (!Number.isInteger(karakterId) || karakterId <= 0) return jsonError('karakter_id wajib diisi', 422);

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return jsonError('DEEPSEEK_API_KEY tidak dikonfigurasi', 500);

  let property;
  try {
    property = await env.DB.prepare(`
      SELECT id, kode_listing, title, jenis_properti, harga, nego, nett,
             jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan,
             legalitas, kecamatan, kabupaten, deskripsi
      FROM properties WHERE id = ?
    `).bind(propertyId).first();
  } catch (err) {
    console.error('[viralframe ai-generate property]', err.message);
    return jsonError('Gagal mengambil data properti', 500);
  }
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  let images;
  try {
    const res = await env.DB.prepare(`
      SELECT url_webp, urutan, is_cover FROM property_images WHERE property_id = ?
      ORDER BY is_cover ASC, urutan ASC, id ASC
    `).bind(propertyId).all();
    images = res.results ?? [];
  } catch (err) {
    console.error('[viralframe ai-generate images]', err.message);
    return jsonError('Gagal mengambil foto properti', 500);
  }

  let karakter;
  try {
    karakter = await env.DB.prepare(`
      SELECT id, nama, foto_url, gender, usia, etnik, style, ciri_fisik
      FROM viralframe_characters WHERE id = ?
    `).bind(karakterId).first();
  } catch (err) {
    console.error('[viralframe ai-generate karakter]', err.message);
    return jsonError('Gagal mengambil data karakter', 500);
  }
  if (!karakter) return jsonError('Karakter tidak ditemukan', 404);

  const durasiDetik = PLATFORM_DURASI[platform] ?? 8;
  const deskripsiKarakter = describeKarakter(karakter);

  const systemPrompt = buildSystemPrompt({
    jumlahScene, aiTool, platform, bahasa,
    namaKarakter: karakter.nama, deskripsiKarakter,
    durasiDetik, musikValue, musikPrompt,
  });
  const userPrompt = buildUserPrompt({ property, karakter, jumlahScene });

  let dsRes;
  try {
    dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    return jsonError(`Gagal menghubungi DeepSeek: ${err.message}`, 502);
  }

  if (!dsRes.ok) {
    const errText = await dsRes.text().catch(() => '');
    return jsonError(`DeepSeek error ${dsRes.status}: ${errText}`, 502);
  }

  const dsJson = await dsRes.json();
  const raw = (dsJson.choices?.[0]?.message?.content ?? '').trim();
  if (!raw) return jsonError('DeepSeek mengembalikan respons kosong', 502);

  const parsed = parseSceneJson(raw, jumlahScene);
  if (!parsed.ok) return jsonError(parsed.error, 502);

  const fotoUrls = selectFotoUrls(images, jumlahScene);

  return jsonOk({
    scenes: parsed.data,
    foto_urls: fotoUrls,
    karakter: { nama: karakter.nama, deskripsi: deskripsiKarakter, foto_url: karakter.foto_url },
    metadata: {
      platform, ai_tool: aiTool, bahasa,
      musik_value: musikValue,
      judul_properti: property.title,
      kode_listing: property.kode_listing,
      generated_at: new Date().toISOString(),
    },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
