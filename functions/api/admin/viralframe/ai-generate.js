// POST /api/admin/viralframe/ai-generate — Jalur C: generate N video prompt via DeepSeek
// Body: { property_id, jumlah_scene, platform, ai_tool, bahasa, musik_value, musik_prompt, karakter_id, foto_assignments }
// foto_assignments: [{ scene: 1, foto_url: '...', foto_label: '...' }, ...] — dipilih manual oleh user, bukan auto-pick.
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const PLATFORM_DURASI = {
  tiktok: 8, reels: 8, youtube_shorts: 10, facebook: 8,
};

const LABEL_MAP = {
  fasad: 'tampak depan/fasad bangunan',
  kamar_tidur: 'kamar tidur',
  kamar_mandi: 'kamar mandi',
  dapur: 'dapur',
  ruang_tamu: 'ruang tamu',
  ruang_santai: 'ruang santai/keluarga',
  balkon: 'balkon',
  kolam_renang: 'kolam renang',
  koridor_tangga: 'koridor atau area tangga',
  parkir: 'area parkir',
  view_sekitar: 'pemandangan atau lingkungan sekitar',
  lainnya: 'area properti',
};

const SCENE_CAMERA_HINTS = [
  'smooth cinematic drone pull-back revealing full facade',
  'elegant dolly push-in from gate toward entrance',
  'steady tracking shot along building exterior',
  'crane rise from ground level showing property and surroundings',
  'close-up detail pan across architectural features',
  'wide establishing shot from elevated position',
  'slow lateral tracking shot along interior corridor',
  'handheld walk-through reveal entering a room',
  'orbit shot circling a key furniture or feature',
  'low-angle tilt-up revealing ceiling height and lighting',
  'rack focus shot from foreground detail to background space',
  'gentle push-in toward a window or view reveal',
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

KRITIS — ANTI-HALUSINASI:
HANYA gunakan informasi yang SECARA EKSPLISIT ada di data properti yang diberikan.
JANGAN mengarang, mengasumsikan, atau menambahkan fitur yang tidak disebutkan.
Contoh SALAH: menyebut 'rooftop garden' padahal tidak ada di data.
Contoh BENAR: hanya menyebut fitur yang tercantum di bagian Data Properti.
Jika data properti minim, buat prompt berdasarkan foto yang dipilih dan lokasi saja.

KONSISTENSI FOTO PER SCENE:
Setiap scene memiliki foto spesifik yang telah dipilih user (lihat "Foto per scene" di user prompt).
Prompt WAJIB mendeskripsikan gerakan kamera yang sesuai dengan jenis foto:
- fasad/eksterior → drone/exterior shot
- kamar tidur/mandi/dapur/ruang → interior tracking shot
- balkon/view → reveal shot ke luar
- tangga/koridor → tracking forward shot
JANGAN mendeskripsikan konten yang tidak mungkin ada di foto tersebut.

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

function buildUserPrompt({ property, karakter, jumlahScene, fotoAssignments }) {
  const fasilitas = 'tidak disebutkan';
  const deskripsi = (property.deskripsi ?? '').slice(0, 200);
  const hargaLabel = `${formatRupiah(property.harga)}${property.nego ? ' (nego)' : property.nett ? ' (nett)' : ''}`;
  const deskripsiKarakter = describeKarakter(karakter);

  const fotoLines = fotoAssignments
    .slice()
    .sort((a, b) => a.scene - b.scene)
    .map(a => {
      const deskripsi = LABEL_MAP[a.foto_label] ?? LABEL_MAP.lainnya;
      return `- Scene ${a.scene} — foto ${deskripsi}: buat prompt yang menonjolkan area ini.`;
    })
    .join('\n');

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

Foto per scene (referensi visual):
${fotoLines}

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

function validateFotoAssignments(fotoAssignments, jumlahScene) {
  if (!Array.isArray(fotoAssignments) || fotoAssignments.length !== jumlahScene) {
    return { ok: false, error: `foto_assignments harus berisi tepat ${jumlahScene} item` };
  }
  const scenesSeen = new Set();
  for (const a of fotoAssignments) {
    const sceneNum = Number(a?.scene);
    if (!Number.isInteger(sceneNum) || sceneNum < 1 || sceneNum > jumlahScene) {
      return { ok: false, error: 'foto_assignments punya nomor scene tidak valid' };
    }
    if (typeof a?.foto_url !== 'string' || !a.foto_url.trim()) {
      return { ok: false, error: `Scene ${sceneNum} belum punya foto terpilih` };
    }
    if (typeof a?.foto_label !== 'string' || !a.foto_label.trim()) {
      return { ok: false, error: `Scene ${sceneNum} belum punya label foto` };
    }
    scenesSeen.add(sceneNum);
  }
  if (scenesSeen.size !== jumlahScene) {
    return { ok: false, error: 'Semua scene harus punya foto terpilih' };
  }
  return { ok: true };
}

function isValidScene(s) {
  return typeof s === 'object' && s !== null &&
    Number.isInteger(s.scene) &&
    typeof s.kamera === 'string' && s.kamera.trim().length > 0 &&
    typeof s.prompt === 'string' && s.prompt.trim().length > 20 &&
    typeof s.dialog_karakter === 'string' && s.dialog_karakter.trim().length > 0;
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

  if (!Array.isArray(parsed) || parsed.length !== jumlahScene || !parsed.every(isValidScene)) {
    return {
      ok: false,
      error: `DeepSeek return JSON tidak valid. Dapat ${Array.isArray(parsed) ? parsed.length : 'non-array'} scene, dibutuhkan ${jumlahScene}. Field wajib: scene (integer), kamera (string), prompt (string >20 char), dialog_karakter (string).`,
    };
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
  const fotoAssignments = body.foto_assignments;

  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib diisi', 422);
  if (!Number.isInteger(jumlahScene) || jumlahScene < 2 || jumlahScene > 12) return jsonError('jumlah_scene harus 2-12', 422);
  if (!platform || typeof platform !== 'string') return jsonError('platform wajib diisi', 422);
  if (!aiTool || typeof aiTool !== 'string') return jsonError('ai_tool wajib diisi', 422);
  if (!bahasa || typeof bahasa !== 'string') return jsonError('bahasa wajib diisi', 422);
  if (!Number.isInteger(karakterId) || karakterId <= 0) return jsonError('karakter_id wajib diisi', 422);

  const fotoCheck = validateFotoAssignments(fotoAssignments, jumlahScene);
  if (!fotoCheck.ok) return jsonError(fotoCheck.error, 422);

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
  const userPrompt = buildUserPrompt({ property, karakter, jumlahScene, fotoAssignments });

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
        max_tokens: Math.min(4000, 500 + jumlahScene * 350),
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

  const fotoByScene = new Map(fotoAssignments.map(a => [Number(a.scene), a]));
  const enrichedScenes = parsed.data.map(s => {
    const assignment = fotoByScene.get(s.scene);
    return {
      ...s,
      foto_label: assignment?.foto_label ?? null,
      foto_deskripsi: assignment ? (LABEL_MAP[assignment.foto_label] ?? LABEL_MAP.lainnya) : null,
    };
  });

  const fotoUrls = fotoAssignments
    .slice()
    .sort((a, b) => a.scene - b.scene)
    .map(a => a.foto_url);

  return jsonOk({
    scenes: enrichedScenes,
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
