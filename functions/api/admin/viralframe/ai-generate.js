// POST /api/admin/viralframe/ai-generate — Jalur C: generate N video prompt via DeepSeek
// Body: { property_id, jumlah_scene, platform, ai_tool, bahasa, musik_value, musik_prompt, karakter_id, foto_assignments }
// foto_assignments: [{ scene: 1, foto_url: '...', foto_label: '...' }, ...] — dipilih manual oleh user, bukan auto-pick.
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const PLATFORM_DURASI = {
  tiktok: 8,
  ig_reels: 8,
  yt_shorts: 10,
  fb_reels: 8,
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

const KAMERA_PER_LABEL = {
  fasad: 'cinematic drone pull-back shot revealing full building facade from street level',
  kamar_tidur: 'smooth interior dolly shot gliding through bedroom, warm ambient lighting',
  kamar_mandi: 'elegant interior tracking shot panning across bathroom details and fixtures',
  dapur: 'smooth interior reveal shot starting from window light, tracking across kitchen',
  ruang_tamu: 'wide interior establishing shot with slow zoom-in toward seating area',
  ruang_santai: 'steady interior tracking shot moving through living/family room',
  balkon: 'reveal shot pushing through doorway onto balcony, expanding view outside',
  kolam_renang: 'low-angle smooth glide along pool surface toward far end',
  koridor_tangga: 'smooth forward tracking shot ascending staircase or moving through corridor',
  parkir: 'wide exterior establishing shot showing parking area and building access',
  view_sekitar: 'slow aerial orbit revealing surrounding neighborhood and environment',
  lainnya: 'elegant cinematic reveal shot showing property space with smooth motion',
};

function formatRupiah(n) {
  if (n === null || n === undefined) return 'Hubungi agen';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function buildSystemPrompt({ jumlahScene, bahasa, musikValue, musikPrompt }) {
  // Bagian [8] MUSIK: rule abstrak di bawah butuh teks musik konkret disisipkan
  // agar bisa benar-benar dieksekusi DeepSeek — tanpa ini instruksi "tambahkan
  // tepat seperti yang diberikan" tidak merujuk ke apapun.
  const musikSection = musikValue === 'none'
    ? `Jika musik = none → JANGAN tambahkan instruksi audio apapun.`
    : `Jika musik tersedia, tambahkan di AKHIR setiap prompt, tepat seperti berikut ini (JANGAN dimodifikasi):
    ${musikPrompt}`;

  return `Kamu adalah direktur kreatif video properti profesional Indonesia dengan keahlian sinematografi, copywriting, dan digital marketing. Tugasmu: buat ${jumlahScene} video prompt terpisah untuk AI video generator.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] ANTI-HALUSINASI — WAJIB DIPATUHI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANYA gunakan informasi yang SECARA EKSPLISIT ada di data properti.
JANGAN mengarang, mengasumsikan, atau menambahkan fitur yang tidak disebutkan.
✗ SALAH: menyebut 'rooftop garden' jika tidak ada di data
✗ SALAH: menyebut 'pemandangan gunung' jika tidak ada di data
✓ BENAR: hanya sebut fitur yang tercantum di bagian Data Properti
Jika data minim → buat prompt berdasarkan foto yang dipilih dan lokasi kota saja.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2] KONSISTENSI FOTO PER SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene memiliki JENIS FOTO dan GERAKAN KAMERA YANG SUDAH DITENTUKAN.
Kamu WAJIB mengikuti gerakan kamera yang diberikan per scene.
Kamu WAJIB membuat prompt yang sesuai dengan jenis foto scene tersebut.
✗ SALAH: scene kamar tidur → prompt menyebut eksterior bangunan
✓ BENAR: scene kamar tidur → prompt fokus pada interior, pencahayaan hangat, detail furnitur
JANGAN mendeskripsikan konten yang tidak mungkin ada di foto tersebut.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3] STRUKTUR PROMPT WAJIB PER SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap field 'prompt' HARUS mengandung SEMUA elemen ini secara natural:
  • KAMERA: gerakan kamera yang sudah ditentukan (ikuti persis dari instruksi scene)
  • SUBJEK: karakter + aksi spesifik + ekspresi/gestur
  • PROPERTI: 1-2 fitur nyata yang terlihat sesuai jenis foto
  • PENCAHAYAAN: kondisi cahaya yang sesuai (golden hour / warm ambient / natural daylight)
  • MOOD: atmosfer emosional yang diinginkan (inviting / professional / homey / aspirational)
  • KUALITAS: 'cinematic 4K', 'smooth motion', 'professional real estate videography'
✗ SALAH prompt: 'A building exterior shot.' (terlalu generik, < 30 kata)
✓ BENAR prompt: 'Cinematic drone pull-back revealing the modern 4-story boarding house facade in Depok, Sleman. Property consultant Ayu in black SBP uniform stands at entrance, gestures warmly toward the building with a confident smile. Warm golden hour lighting, smooth aerial motion. Professional real estate videography, cinematic 4K.' (spesifik, > 50 kata)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4] BAHASA DIALOG KARAKTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Field 'dialog_karakter' WAJIB dalam ${bahasa}.
✗ SALAH (jika bahasa = Indonesia): 'Welcome to our property'
✓ BENAR (jika bahasa = Indonesia): 'Selamat datang di hunian impian Anda'
Dialog harus: natural diucapkan, menyebut 1 fitur properti nyata, 1-2 kalimat saja.
JIKA bahasa = Indonesia: gunakan Bahasa Indonesia formal yang hangat.
JIKA bahasa = English: gunakan English professional.
JIKA bahasa = Jawa: gunakan Bahasa Jawa Krama yang sopan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5] KONSISTENSI KARAKTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Karakter HARUS muncul di SETIAP scene dengan identitas yang KONSISTEN:
  • Nama yang sama di setiap scene
  • Pakaian yang sama di setiap scene (jika tidak disebutkan: 'baju profesional gelap')
  • Aksi berbeda per scene sesuai jenis foto (berdiri di fasad, duduk di ruang tamu, dll)
Gunakan deskripsi fisik karakter yang diberikan di data. Jika NULL → 'professional property consultant, formal attire'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6] VARIASI ANTAR SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene HARUS berbeda dalam: gerakan kamera, posisi karakter, angle, pencahayaan.
JANGAN copy-paste struktur prompt yang sama antar scene.
Jika ada ${jumlahScene} scene → ${jumlahScene} suasana berbeda (misal: golden hour, natural daylight, warm ambient, dramatic sunset).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[7] KATA/FRASA TERLARANG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DILARANG menggunakan kata/frasa ini (ganti dengan alternatif):
  luxury/mewah berlebihan → 'dirancang dengan cermat' / 'berkualitas tinggi'
  exclusive/eksklusif → 'well-appointed' / 'terawat baik'
  dramatic/shocking → 'captivating' / 'menawan'
  berlari/melompat → 'berjalan dengan percaya diri' / 'melangkah elegan'
  sexy/sensual → DILARANG MUTLAK
  terbaik/nomor 1 → 'berkualitas' / 'terpercaya'
  nama orang nyata/brand nyata → DILARANG

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[8] MUSIK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${musikSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[9] FORMAT OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respond HANYA dengan JSON array murni.
TIDAK ADA teks, komentar, penjelasan, atau markdown (\`\`\`) di luar JSON.
Format yang diharapkan:
[
  {
    "scene": 1,
    "kamera": "nama singkat gerakan kamera dalam 3-5 kata",
    "prompt": "teks prompt lengkap bahasa Inggris minimum 50 kata",
    "dialog_karakter": "1-2 kalimat dialog karakter dalam ${bahasa}"
  }
]
Field WAJIB ada dan non-empty: scene (integer), kamera (string), prompt (string min 50 kata), dialog_karakter (string).`;
}

function buildUserPrompt({ property, karakterDesc, jumlahScene, fotoAssignments, durasiDetik }) {
  const fasilitas = 'tidak disebutkan';
  const deskripsi = (property.deskripsi ?? '').slice(0, 200);
  const hargaLabel = `${formatRupiah(property.harga)}${property.nego ? ' (nego)' : property.nett ? ' (nett)' : ''}`;

  const sceneLines = fotoAssignments
    .slice()
    .sort((a, b) => a.scene - b.scene)
    .map(a => {
      const fotoDeskripsi = LABEL_MAP[a.foto_label] ?? LABEL_MAP.lainnya;
      const kameraHint = KAMERA_PER_LABEL[a.foto_label] ?? KAMERA_PER_LABEL.lainnya;
      return `Scene ${a.scene}:\n  Foto    : ${fotoDeskripsi} (${a.foto_label})\n  Kamera  : ${kameraHint}\n  Durasi  : ${durasiDetik} detik`;
    })
    .join('\n\n');

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

Karakter: ${karakterDesc}

Instruksi per scene (kamera & durasi sudah ditentukan, WAJIB diikuti):
${sceneLines}

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

// Khusus untuk userPrompt DeepSeek — beda dari describeKarakter() di atas
// (yang dipakai untuk field karakter.deskripsi di response API): sertakan
// nama karakter langsung, dan fallback teks jika ciri_fisik NULL.
function describeKarakterUntukPrompt(k) {
  return [
    k.nama,
    k.gender ?? null,
    k.usia ? `usia sekitar ${k.usia} tahun` : null,
    k.etnik ?? null,
    k.style ?? null,
    k.ciri_fisik ?? 'penampilan profesional, pakaian formal gelap',
  ].filter(Boolean).join(', ');
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
    typeof s.kamera === 'string' && s.kamera.trim().length >= 3 &&
    typeof s.prompt === 'string' && s.prompt.trim().split(/\s+/).length >= 50 &&
    typeof s.dialog_karakter === 'string' && s.dialog_karakter.trim().length >= 10;
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
      error: `DeepSeek output tidak valid. Dapat ${Array.isArray(parsed) ? parsed.length : 'non-array'} scene, butuh ${jumlahScene}. Setiap scene wajib: scene (int), kamera (≥3 karakter), prompt (≥50 kata), dialog_karakter (≥10 karakter).`,
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
  const karakterDesc = describeKarakterUntukPrompt(karakter);

  const systemPrompt = buildSystemPrompt({ jumlahScene, bahasa, musikValue, musikPrompt });
  const userPrompt = buildUserPrompt({ property, karakterDesc, jumlahScene, fotoAssignments, durasiDetik });

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
