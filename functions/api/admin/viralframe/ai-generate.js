// POST /api/admin/viralframe/ai-generate — Jalur C: generate N video prompt via DeepSeek
// Body: { property_id, jumlah_scene, platform, ai_tool, bahasa, tone, visual_style, hook_type,
//         cta_type, scene_roles, musik_value, musik_prompt, karakter_id, foto_assignments,
//         supports_ref_image, expression }
// foto_assignments: [{ scene: 1, foto_url: '...', foto_label: '...' }, ...] — dipilih manual oleh user, bukan auto-pick.
// tone/visual_style/hook_type/cta_type: label sudah diresolve di frontend dari Step 1
// (options.ts TONES/VISUAL_STYLES/HOOK_TYPES/CTA_TYPES) — "Auto" berarti tidak ada instruksi tambahan.
// scene_roles: [{ scene: 1, role: 'Hook'|'Body'|'CTA' }, ...] — dari sceneRole() (options.ts), sama dengan Jalur A.
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

// Tabel lipsync — SAMA PERSIS dengan LIPSYNC_TABLE di
// src/app/components/admin/viralframe/options.ts, supaya batas kata dialog
// Jalur C konsisten dengan Jalur A (getLipsync).
const LIPSYNC_MAXWORDS = [
  { minSec: 2,  maxSec: 3,  maxWords: 8 },
  { minSec: 4,  maxSec: 5,  maxWords: 16 },
  { minSec: 6,  maxSec: 8,  maxWords: 26 },
  { minSec: 9,  maxSec: 12, maxWords: 44 },
  { minSec: 13, maxSec: 20, maxWords: 72 },
  { minSec: 21, maxSec: 30, maxWords: 108 },
];

function getMaxWords(durasiDetik) {
  const d = Math.max(2, Math.min(30, Math.round(durasiDetik || 0)));
  for (const row of LIPSYNC_MAXWORDS) {
    if (d >= row.minSec && d <= row.maxSec) return row.maxWords;
  }
  return d <= 3 ? LIPSYNC_MAXWORDS[0].maxWords : LIPSYNC_MAXWORDS[LIPSYNC_MAXWORDS.length - 1].maxWords;
}

// Deskripsi ekspresi singkat dalam English untuk injeksi ke prompt karakter —
// SAMA PERSIS dengan EXPRESSION_EN di
// src/app/components/admin/viralframe/options.ts (functions/ tidak bisa import
// langsung dari src/app/, jadi diduplikasi seperti pola LIPSYNC_MAXWORDS).
const EXPRESSION_EN = {
  auto:           'expression adapted to scene tone',
  excited_joyful: 'excited and joyful, big smile, high energy',
  confident_auth: 'confident and authoritative, assured',
  surprised_amazed: 'surprised and amazed, wide eyes',
  warm_friendly:  'warm and friendly, approachable',
  urgent_intense: 'urgent and intense, serious',
  empathetic:     'empathetic and relatable',
  playful_humor:  'playful and humorous, light-hearted',
  mysterious:     'mysterious and dramatic',
  curious_invest: 'curious and investigative',
};

function formatRupiah(n) {
  if (n === null || n === undefined) return 'Hubungi agen';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function isAutoValue(label) {
  return !label || label.trim().toLowerCase().startsWith('auto');
}

function buildSystemPrompt({ jumlahScene, bahasa, musikValue, musikPrompt, tone, visualStyle, hookType, ctaType, maxWords, supportsRefImage, expressionLabel }) {
  // Bagian [8] MUSIK: rule abstrak di bawah butuh teks musik konkret disisipkan
  // agar bisa benar-benar dieksekusi DeepSeek — tanpa ini instruksi "tambahkan
  // tepat seperti yang diberikan" tidak merujuk ke apapun.
  const musikSection = musikValue === 'none'
    ? `Jika musik = none → JANGAN tambahkan instruksi audio apapun.`
    : `Jika musik tersedia, tambahkan di AKHIR setiap prompt, tepat seperti berikut ini (JANGAN dimodifikasi):
    ${musikPrompt}`;

  // Tone/Gaya Visual: label sudah diresolve di frontend dari TONES/VISUAL_STYLES
  // (options.ts) — backend cuma menyisipkan teks, tidak perlu daftar terjemahan baru.
  // 'Auto' berarti biarkan DeepSeek memilih sendiri — tidak perlu instruksi tambahan.
  const toneLine = isAutoValue(tone)
    ? ''
    : `Tone/nada narasi WAJIB: ${tone}. Terapkan konsisten di setiap dialog_karakter dan pemilihan kata dalam prompt.\n`;
  const visualStyleLine = isAutoValue(visualStyle)
    ? ''
    : `Gaya visual WAJIB: ${visualStyle}. Terapkan konsisten di setiap scene (pencahayaan, komposisi, mood).\n`;
  const hookLine = isAutoValue(hookType)
    ? ''
    : `Scene berperan HOOK WAJIB memakai gaya opening: ${hookType}.\n`;
  const ctaLine = isAutoValue(ctaType)
    ? ''
    : `Scene berperan CTA WAJIB memakai gaya ajakan: ${ctaType}.\n`;
  const toneStyleSection = (toneLine + visualStyleLine + hookLine + ctaLine).trim();
  const toneStyleBlock = toneStyleSection
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[2b] TONE, GAYA VISUAL & PERAN SCENE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${toneStyleSection}\nSetiap scene punya peran (Hook/Body/CTA, lihat "Role" di user prompt) — sesuaikan penekanan narasi dengan peran itu.\n`
    : '';

  // Anti-halusinasi posisi karakter: perilaku beda tergantung apakah AI tool
  // tujuan mendukung reference image (AI_TOOL_FORMAT_SPEC.supportsRefImage di
  // options.ts) — kalau ya, jangan re-describe elemen statis yang sudah
  // terlihat di foto; kalau tidak, deskripsikan ruangan detail tapi karakter
  // tetap "sudah ada", bukan "muncul".
  const antiHalusinasiPosisiBlock = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2c] ANTI-HALUSINASI POSISI KARAKTER — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Karakter WAJIB dideskripsikan SUDAH BERADA di posisi/aktivitasnya sejak detik pertama shot dimulai.
DILARANG MUTLAK mendeskripsikan proses karakter masuk, muncul, keluar, atau melintasi elemen ruangan manapun (pintu, dinding, cermin, sudut ruangan) — ini menghasilkan visual yang fisik tidak mungkin dan terlihat jelas sebagai AI generation yang buruk.
✗ SALAH: 'Ayu walks in through the door and stands near the window'
✗ SALAH: 'Character emerges from behind the wall into the bedroom'
✓ BENAR: 'Ayu already standing near the window, gestures warmly toward the room'
${supportsRefImage
    ? `Tool AI tujuan MENDUKUNG reference image (foto scene jadi acuan visual langsung) — fokuskan prompt HANYA pada motion/aksi yang terjadi PADA foto referensi tersebut, JANGAN re-describe elemen statis ruangan yang sudah terlihat di foto (dinding, warna cat, furnitur latar belakang, dll).`
    : `Tool AI tujuan TIDAK mendukung reference image (text-to-video murni) — deskripsikan ruangan SEDETAIL MUNGKIN (warna, furnitur, pencahayaan, tata letak) karena AI tidak punya gambar acuan, TAPI karakter tetap harus dideskripsikan 'sudah ada' di posisinya, bukan 'muncul' atau 'masuk'.`
}
`;

  // Struktur retensi psikologis: versi simplified (scene sedikit, tidak ada ruang
  // untuk open loop penuh) vs versi lengkap (open loop di scene 1, rehook di scene
  // tengah, payoff sebelum CTA di scene terakhir).
  const retensiBlock = jumlahScene <= 3
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6b] STRUKTUR RETENSI PSIKOLOGIS — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Versi simplified (jumlah scene ≤ 3 — TANPA open loop/rehook, ruang terlalu sempit):
  • Scene 1: field 'kamera' HARUS berupa pattern interrupt (gerakan/angle yang langsung menarik perhatian di detik pertama).
  • Scene tengah: sisipkan MINIMAL 1 micro-reward konkret (fakta/angka nyata properti yang terasa seperti temuan baru).
  • Scene terakhir: payoff singkat (tegaskan nilai properti) LANGSUNG diikuti CTA — JANGAN buka open loop baru yang tidak terjawab.

`
    : `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6b] STRUKTUR RETENSI PSIKOLOGIS — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Versi lengkap (jumlah scene ≥ 4):
  • Scene 1 (Hook): field 'kamera' HARUS pattern interrupt, dan 'dialog_karakter' WAJIB membuka 1 open loop — janjikan sesuatu (info/reveal) yang BELUM dijawab di scene ini.
  • Scene tengah (Body): 'dialog_karakter' WAJIB diawali kalimat rehook yang menyambung dari scene sebelumnya (bukan mulai topik baru begitu saja), lalu sisipkan 1 micro-reward konkret (fakta/angka nyata properti).
  • Scene terakhir (CTA): WAJIB menjawab/menutup open loop dari Scene 1 (payoff) SEBELUM menyampaikan CTA — jangan biarkan open loop menggantung tanpa jawaban.

`;

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

${toneStyleBlock}${antiHalusinasiPosisiBlock}
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
[4] BAHASA & TEMPO DIALOG KARAKTER — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Field 'dialog_karakter' WAJIB dalam ${bahasa}.
Bagian dialog (setelah klausa delivery di bawah) WAJIB MAKSIMAL ${maxWords} kata — ini BATAS KETAT, bukan saran. Klip video pendek; dialog kepanjangan akan terlihat dipercepat/tidak sinkron dengan gerak bibir.
Field 'dialog_karakter' WAJIB berupa SATU KESATUAN TEKS (klausa delivery + dialog digabung, BUKAN dialog polos saja) dengan pola persis:
  "[Nama karakter] berbicara cepat, artikulasi jelas, tanpa jeda atau gagap, mengatakan: [dialog]"
Klausa delivery ("[Nama karakter] berbicara cepat...") WAJIB selalu ada di depan — hanya bagian [dialog] setelah "mengatakan:" yang dihitung ke batas ${maxWords} kata.
✗ SALAH: 'Selamat datang di hunian impian Anda, rumah nyaman dengan tiga kamar tidur yang luas dan taman yang asri di belakang.' (dialog polos tanpa klausa delivery, tidak ada instruksi tempo, melebihi ${maxWords} kata)
✗ SALAH (jika bahasa = Indonesia): 'Welcome to our property'
✓ BENAR: 'Ayu berbicara cepat, artikulasi jelas, tanpa jeda atau gagap, mengatakan: Selamat datang di hunian impian Anda.'
Dialog harus: natural diucapkan, menyebut 1 fitur properti nyata, maksimal ${maxWords} kata.
JIKA bahasa = Indonesia: gunakan Bahasa Indonesia formal yang hangat.
JIKA bahasa = English: gunakan English professional (klausa delivery tetap wajib, diterjemahkan proporsional, mis. "[Name] speaks quickly, clear articulation, no pauses or stutters, saying:").
JIKA bahasa = Jawa: gunakan Bahasa Jawa Krama yang sopan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5] KONSISTENSI KARAKTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Karakter HARUS muncul di SETIAP scene dengan identitas yang KONSISTEN:
  • Nama yang sama di setiap scene
  • Pakaian yang sama di setiap scene (jika tidak disebutkan: 'baju profesional gelap')
  • Aksi berbeda per scene sesuai jenis foto (berdiri di fasad, duduk di ruang tamu, dll)
Gunakan deskripsi fisik karakter yang diberikan di data. Jika NULL → 'professional property consultant, formal attire'.
Ekspresi/emosi karakter WAJIB konsisten '${expressionLabel}' di SEMUA scene — pengaruhi juga pemilihan kata dan energi pada dialog_karakter (bukan cuma deskripsi visual di prompt), supaya nada bicara terasa sesuai ekspresi yang dipilih, bukan datar/formal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6] VARIASI ANTAR SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene HARUS berbeda dalam: gerakan kamera, posisi karakter, angle, pencahayaan.
JANGAN copy-paste struktur prompt yang sama antar scene.
Jika ada ${jumlahScene} scene → ${jumlahScene} suasana berbeda (misal: golden hour, natural daylight, warm ambient, dramatic sunset).

${retensiBlock}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    "dialog_karakter": "klausa delivery + dialog karakter dalam ${bahasa}, sesuai pola wajib di [4], maksimal ${maxWords} kata untuk bagian dialog"
  }
]
Field WAJIB ada dan non-empty: scene (integer), kamera (string), prompt (string min 50 kata), dialog_karakter (string, format sesuai [4]).`;
}

function buildUserPrompt({ property, karakterDesc, jumlahScene, fotoAssignments, durasiDetik, sceneRoles, cameraDirectives, archetypeNote }) {
  const fasilitas = 'tidak disebutkan';
  const deskripsi = (property.deskripsi ?? '').slice(0, 200);
  const hargaLabel = `${formatRupiah(property.harga)}${property.nego ? ' (nego)' : property.nett ? ' (nett)' : ''}`;

  const roleByScene = new Map((sceneRoles ?? []).map(r => [Number(r.scene), r.role]));
  // Koreografi kamera arketipe (dihitung di client) — string siap-pakai per scene.
  const cameraByScene = new Map((cameraDirectives ?? []).map(c => [Number(c.scene), String(c.camera ?? '')]));

  const sceneLines = fotoAssignments
    .slice()
    .sort((a, b) => a.scene - b.scene)
    .map(a => {
      const fotoDeskripsi = LABEL_MAP[a.foto_label] ?? LABEL_MAP.lainnya;
      // Bila arketipe menyediakan koreografi kamera untuk scene ini, pakai itu
      // (lebih koheren dgn gaya video). Kalau tidak, fallback ke hint per-label.
      const kameraHint = cameraByScene.get(a.scene) || KAMERA_PER_LABEL[a.foto_label] || KAMERA_PER_LABEL.lainnya;
      const role = roleByScene.get(a.scene) ?? 'Body';
      return `Scene ${a.scene}:\n  Foto    : ${fotoDeskripsi} (${a.foto_label})\n  Kamera  : ${kameraHint}\n  Durasi  : ${durasiDetik} detik\n  Role    : ${role}`;
    })
    .join('\n\n');

  const archetypeBlock = archetypeNote
    ? `ARAHAN GAYA VIDEO (ARKETIPE) — WAJIB dipatuhi di semua scene:\n${archetypeNote}\n\n`
    : '';

  return `${archetypeBlock}Data properti:
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
function describeKarakterUntukPrompt(k, expression) {
  return [
    k.nama,
    k.gender ?? null,
    k.usia ? `usia sekitar ${k.usia} tahun` : null,
    k.etnik ?? null,
    k.style ?? null,
    k.ciri_fisik ?? 'penampilan profesional, pakaian formal gelap',
    `ekspresi ${EXPRESSION_EN[expression] ?? EXPRESSION_EN.auto}`,
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
  const {
    platform, ai_tool: aiTool, bahasa, musik_value: musikValue,
    tone, visual_style: visualStyle, hook_type: hookType, cta_type: ctaType,
  } = body;
  const sceneRoles = Array.isArray(body.scene_roles) ? body.scene_roles : [];
  const musikPrompt = typeof body.musik_prompt === 'string' ? body.musik_prompt : '';
  const karakterId = parseInt(body.karakter_id, 10);
  const fotoAssignments = body.foto_assignments;
  const supportsRefImage = body.supports_ref_image === true;
  const expression = typeof body.expression === 'string' ? body.expression : 'auto';
  // Arketipe (opsional) — string siap-pakai dari client (client compute, backend consume).
  const archetypeNote = typeof body.archetype_note === 'string' ? body.archetype_note.slice(0, 600) : '';
  const cameraDirectives = Array.isArray(body.camera_directives)
    ? body.camera_directives
        .filter(c => c && Number.isInteger(Number(c.scene)) && typeof c.camera === 'string')
        .map(c => ({ scene: Number(c.scene), camera: c.camera.slice(0, 400) }))
    : [];

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
  const maxWords = getMaxWords(durasiDetik);
  const expressionLabel = EXPRESSION_EN[expression] ?? EXPRESSION_EN.auto;
  const deskripsiKarakter = describeKarakter(karakter);
  const karakterDesc = describeKarakterUntukPrompt(karakter, expression);

  const systemPrompt = buildSystemPrompt({ jumlahScene, bahasa, musikValue, musikPrompt, tone, visualStyle, hookType, ctaType, maxWords, supportsRefImage, expressionLabel });
  const userPrompt = buildUserPrompt({ property, karakterDesc, jumlahScene, fotoAssignments, durasiDetik, sceneRoles, cameraDirectives, archetypeNote });

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
