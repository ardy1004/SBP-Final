// Master Prompt Compiler — ViralFrame Fase V4a.
// Pure function: input state (properti + step 1/2/3) → output SATU teks Master Prompt.
// Adaptasi PRD Seksi 7.2 untuk niche fixed real_estate (SBP) + guardrail ekstra ketat.

import {
  AI_TOOLS, AI_TOOL_FORMAT_SPEC, PLATFORM_BEHAVIOR, PLATFORMS,
  REAL_ESTATE_CONTEXT, PHOTO_LABEL_HINT, HOOK_TYPES, CTA_TYPES,
  VISUAL_STYLES, TONES, LANGUAGES, RATIOS, EXPRESSIONS,
  ETHNIC_EN, STYLE_EN, EXPRESSION_EN, getLipsync, sceneRole,
  sceneFileName, characterFileName,
} from './options';
import { findArchetype, compileCameraChoreography } from './archetypes';

// ─── Tipe input (struktural, decoupled dari komponen React) ──────────────────
export interface CompilerProperty {
  title: string; kode_listing: string; jenis_properti: string; tujuan: string;
  harga: number; kecamatan: string; kabupaten: string; provinsi: string;
  luas_tanah: number | null; luas_bangunan: number | null;
  jumlah_kamar_tidur: number | null; jumlah_kamar_mandi: number | null;
  deskripsi: string | null; legalitas?: string | null;
}
export interface CompilerCharacter {
  nama: string; gender: string | null; usia: number | null;
  etnik: string | null; style: string | null; ciri_fisik: string | null;
}
export interface CompilerS1 {
  sceneCount: number; durationMode: 'uniform' | 'manual';
  uniformDuration: number; manualDurations: number[];
  platforms: string[]; aiTool: string; ratio: string; language: string;
  hookType: string; ctaType: string; ctaKeyword: string;
  visualStyle: string; tone: string; niche: string;
  archetype?: string; // id VideoArchetype (opsional; 'custom'/undefined = tanpa arketipe)
}
export interface CompilerScene { photoId: number | null; label: string }
export interface CompilerS3 {
  useCharacter: boolean; characterId: number | null;
  visualAnchor: string; expression: string;
  character?: CompilerCharacter | null;
}

// ─── Helper ──────────────────────────────────────────────────────────────────
const labelOf = (arr: { value: string; label: string }[], v: string) =>
  arr.find(o => o.value === v)?.label ?? v;

function formatRupiah(n: number): string {
  if (!n || n <= 0) return 'Hubungi kami';
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')} Miliar`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} Juta`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function durationOf(s1: CompilerS1, idx: number): number {
  return s1.durationMode === 'uniform'
    ? s1.uniformDuration
    : (s1.manualDurations[idx] ?? s1.uniformDuration);
}

function totalDuration(s1: CompilerS1): number {
  let t = 0;
  for (let i = 0; i < s1.sceneCount; i++) t += durationOf(s1, i);
  return t;
}

// PRD 3.13 — bangun deskripsi karakter English untuk injeksi verbatim.
export function buildCharacterDescription(c: CompilerCharacter, expression: string): string {
  const usia = c.usia ?? 30;
  const etnik = ETHNIC_EN[c.etnik ?? ''] ?? (c.etnik ?? 'Southeast Asian');
  const style = STYLE_EN[c.style ?? ''] ?? (c.style ?? 'casual modern outfit');
  const ciri = (c.ciri_fisik ?? '').trim();
  const expr = EXPRESSION_EN[expression] ?? EXPRESSION_EN.auto;

  if (c.gender === 'Duo') {
    let s = `Duo characters: ${usia}-year-old ${etnik} male and ${usia}-year-old ${etnik} female, both in ${style}`;
    if (ciri) s += `, ${ciri}`;
    s += `. Both characters MUST appear together in all scenes unless scene type requires solo shot.`;
    s += ` Expression: ${expr}.`;
    return s;
  }

  const sex = c.gender === 'Wanita' ? 'female' : 'male';
  let s = `${usia}-year-old ${etnik} ${sex}, ${style}`;
  if (ciri) s += `, ${ciri}`;
  s += `. Expression: ${expr}.`;
  return s;
}

// USP otomatis dari spesifikasi unggulan.
function buildUSP(prop: CompilerProperty): string {
  const usp: string[] = ['Lokasi strategis'];
  const leg = (prop.legalitas ?? '').toUpperCase();
  if (leg.includes('SHM')) usp.push('Sertifikat Hak Milik (SHM)');
  else if (leg) usp.push(`Legalitas ${prop.legalitas}`);
  if (prop.luas_tanah && prop.luas_tanah >= 150) usp.push(`Tanah luas ${prop.luas_tanah}m²`);
  if (prop.jumlah_kamar_tidur && prop.jumlah_kamar_tidur >= 3) usp.push(`${prop.jumlah_kamar_tidur} kamar tidur`);
  return usp.join(', ');
}

// ─── COMPILER UTAMA ──────────────────────────────────────────────────────────
export function compileMasterPrompt(
  prop: CompilerProperty, s1: CompilerS1, scenes: CompilerScene[], s3: CompilerS3,
): string {
  const L: string[] = [];
  const n = s1.sceneCount;
  const primer = s1.platforms[0] ?? 'tiktok';
  const tool = AI_TOOLS.find(t => t.value === s1.aiTool);
  const toolSpec = AI_TOOL_FORMAT_SPEC[s1.aiTool];
  const platformBehavior = PLATFORM_BEHAVIOR[primer] ?? '';
  const archetype = findArchetype(s1.archetype);

  // ── HEADER ──
  L.push('# MASTER PROMPT — VIRALFRAME (SBP / Salam Bumi Property)');
  L.push('');
  L.push('INSTRUKSI KRITIS: Output kamu HANYA berupa JSON murni yang valid sesuai schema di BLOK 5.');
  L.push('JANGAN tulis penjelasan, basa-basi, markdown, atau teks apa pun di luar JSON.');
  L.push('Mulai output dengan karakter { dan akhiri dengan }. Tidak ada yang lain.');
  L.push('');

  // ── BLOK 0: ARAHAN FORMAT & GAYA (ARKETIPE) ──
  // Hanya muncul bila user memilih arketipe. Ini "Style DNA" yang mengikat
  // presenter mode, sudut narasi, dan tata bahasa kamera menjadi satu arahan.
  if (archetype) {
    const povLabel = {
      agent_to_camera: 'Agen berbicara langsung ke kamera (presenter di layar).',
      vlogger_handheld: 'Vlogger walk-and-talk, sering menyapa kamera, energi personal.',
      first_person_pov: 'Sudut pandang orang pertama — penonton seolah hadir sendiri; TIDAK ada presenter di layar.',
    }[archetype.narrationPOV];
    const presenterLabel = {
      on_camera: 'Talent/presenter TAMPIL di layar.',
      voiceover_only: 'TANPA talent di layar — narasi hanya voiceover.',
      faceless_broll: 'Faceless — rangkaian b-roll estetik tanpa orang, narasi voiceover.',
    }[archetype.presenterMode];

    L.push('═══════════════════════════════════════════════');
    L.push('BLOK 0 — ARAHAN FORMAT & GAYA VIDEO (ARKETIPE)');
    L.push('═══════════════════════════════════════════════');
    L.push(`ARKETIPE          : ${archetype.label}`);
    L.push(`MODE PRESENTER    : ${presenterLabel}`);
    L.push(`SUDUT NARASI      : ${povLabel}`);
    L.push(`TEMPO/PACING      : ${archetype.pacing}`);
    L.push(`ARAHAN SUTRADARA  : ${archetype.shotGrammarNote}`);
    L.push('CATATAN: Arahan arketipe ini MENGIKAT seluruh scene. Gaya visual, tone, dan');
    L.push('koreografi kamera di bawah sudah diselaraskan dengan arketipe ini — jaga konsistensinya.');
    L.push('');
  }

  // ── BLOK 1: IDENTITAS & PERAN ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 1 — IDENTITAS & PERAN KAMU');
  L.push('═══════════════════════════════════════════════');
  L.push('Kamu adalah gabungan dari 4 ahli kelas dunia yang bekerja bersamaan:');
  L.push('');
  L.push(`1. ALGORITMA MEDIA SOSIAL (${labelOf(PLATFORMS, primer)} sebagai platform primer).`);
  L.push(`   Perilaku platform yang WAJIB kamu patuhi: ${platformBehavior}`);
  L.push('2. CREATIVE DIRECTOR — kamu merancang konsep visual yang scroll-stopping & sinematik.');
  L.push('3. DIRECT RESPONSE COPYWRITER — kamu menulis narasi yang menggerakkan aksi (bukan deskriptif datar).');
  L.push(`4. AI VIDEO PROMPT ENGINEER untuk tool: ${tool?.label ?? s1.aiTool}.`);
  L.push(`   Format prompt video tool ini: ${toolSpec?.formatSpec ?? 'natural language cinematic'}`);
  L.push(`   Batas karakter ai_ready_prompt per scene: ±${tool?.charLimit ?? 1000} karakter. JANGAN melebihi.`);
  L.push(`   Dukungan reference image: ${toolSpec?.supportsRefImage ? 'YA — foto referensi scene dipakai sebagai panduan frame.' : 'TIDAK — tool ini text-to-video murni, deskripsikan visual sangat detail dalam teks.'}`);
  L.push('');

  // ── BLOK 2: KONTEKS PROPERTI ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 2 — KONTEKS PROPERTI (NICHE: real_estate)');
  L.push('═══════════════════════════════════════════════');
  L.push(`NICHE             : real_estate (fixed)`);
  L.push(`JUDUL PROPERTI    : ${prop.title}`);
  L.push(`KODE LISTING      : ${prop.kode_listing}`);
  L.push(`JENIS             : ${prop.jenis_properti}`);
  L.push(`TUJUAN            : ${prop.tujuan}`);
  L.push(`LOKASI            : ${prop.kecamatan}, ${prop.kabupaten}, ${prop.provinsi}`);
  L.push(`HARGA             : ${formatRupiah(prop.harga)}`);
  const spec: string[] = [];
  if (prop.luas_tanah) spec.push(`Luas Tanah ${prop.luas_tanah}m²`);
  if (prop.luas_bangunan) spec.push(`Luas Bangunan ${prop.luas_bangunan}m²`);
  if (prop.jumlah_kamar_tidur) spec.push(`${prop.jumlah_kamar_tidur} Kamar Tidur`);
  if (prop.jumlah_kamar_mandi) spec.push(`${prop.jumlah_kamar_mandi} Kamar Mandi`);
  L.push(`SPESIFIKASI       : ${spec.length ? spec.join(', ') : 'Lihat deskripsi'}`);
  const desk = (prop.deskripsi ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (desk) L.push(`DESKRIPSI SINGKAT : ${desk}`);
  L.push(`USP               : ${buildUSP(prop)}`);
  L.push(`PSIKOGRAFIS       : ${REAL_ESTATE_CONTEXT.psikografis}`);
  L.push(`PAIN POINT        : ${REAL_ESTATE_CONTEXT.painPoint}`);
  const platLabels = s1.platforms.map((p, i) => `${labelOf(PLATFORMS, p)}${i === 0 ? ' (PRIMER)' : ''}`).join(', ');
  L.push(`PLATFORM TARGET   : ${platLabels || labelOf(PLATFORMS, primer) + ' (PRIMER)'}`);
  L.push(`BAHASA NARASI     : ${labelOf(LANGUAGES, s1.language)}`);
  L.push('');

  // ── BLOK 3: SPESIFIKASI VIDEO ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 3 — SPESIFIKASI VIDEO');
  L.push('═══════════════════════════════════════════════');
  L.push(`AI VIDEO TOOL     : ${tool?.label ?? s1.aiTool}`);
  L.push(`RASIO VIDEO       : ${labelOf(RATIOS, s1.ratio)}`);
  L.push(`TOTAL SCENE       : ${n}`);
  L.push(`TOTAL DURASI      : ${totalDuration(s1)} detik`);
  L.push('');
  L.push('STRUKTUR SCENE:');
  for (let i = 0; i < n; i++) {
    const role = sceneRole(i, n);
    let extra = '';
    if (role === 'Hook') extra = ` — Tipe Hook: ${labelOf(HOOK_TYPES, s1.hookType)}`;
    if (role === 'CTA') {
      extra = ` — CTA: ${labelOf(CTA_TYPES, s1.ctaType)}`;
      if (s1.ctaType === 'comment_keyword' && s1.ctaKeyword) extra += ` (keyword: "${s1.ctaKeyword}")`;
    }
    L.push(`  Scene ${i + 1} = ${role}${extra}`);
  }
  L.push('');

  // Koreografi kamera per scene (dari arketipe) — motion kompleks multi-beat
  // yang menyesuaikan durasi & peran scene. Hanya bila arketipe dipilih.
  if (archetype) {
    L.push('KOREOGRAFI KAMERA PER SCENE (WAJIB dijadikan dasar field camera/motion di ai_ready_prompt):');
    for (let i = 0; i < n; i++) {
      const role = sceneRole(i, n);
      const d = durationOf(s1, i);
      const choreo = compileCameraChoreography(archetype.cameraGrammar, role, d, i, s1.aiTool);
      L.push(`  Scene ${i + 1} (${role}, ${d}s): ${choreo}`);
    }
    L.push('  Terjemahkan koreografi ini ke dalam ai_ready_prompt masing-masing scene sebagai gerakan kamera utama — jaga agar setiap beat terasa mulus dan termotivasi, bukan gerakan acak.');
    L.push('');
  }
  L.push('TABEL LIPSYNC PER SCENE (durasi klip ↔ batas kata narasi — WAJIB dipatuhi):');
  for (let i = 0; i < n; i++) {
    const d = durationOf(s1, i);
    const ls = getLipsync(d);
    L.push(`  Scene ${i + 1}: ${d}s → maksimal ${ls.maxWords} kata, pace "${ls.pace}". ${ls.instruksi}`);
  }
  L.push('');
  L.push('KARAKTER:');
  if (s3.useCharacter && s3.character) {
    const desc = buildCharacterDescription(s3.character, s3.expression);
    L.push(`  [CHARACTER_SPEC] ${desc}`);
    L.push('  PERINGATAN: Penampilan karakter ini WAJIB IDENTIK di semua scene tanpa pengecualian.');
    L.push('  JANGAN PARAFRASE deskripsi ini — COPY EXACT STRING [CHARACTER_SPEC] di setiap scene yang menampilkan karakter.');
    L.push(`  File foto karakter: ${characterFileName(s3.character.nama)}`);
    if (toolSpec?.supportsRefImage) {
      L.push('  File ini bisa di-upload sebagai Character Reference Image (jika tool mendukung multiple reference) — pastikan [CHARACTER_SPEC] di setiap scene tetap konsisten dengan visual di file ini.');
    } else {
      L.push('  [CHARACTER_SPEC] (deskripsi teks) adalah SATU-SATUNYA jangkar konsistensi karakter — file ini hanya untuk referensi visual kamu sendiri saat memilih talent.');
    }
  } else {
    L.push(`  Tidak ada karakter. Visual anchor: ${s3.visualAnchor?.trim() || 'tidak ada'}`);
    if (s3.visualAnchor?.trim()) {
      L.push('  Visual anchor di atas WAJIB muncul konsisten di setiap scene sebagai elemen pengikat.');
    }
  }
  L.push('');
  L.push(`GAYA VISUAL       : ${labelOf(VISUAL_STYLES, s1.visualStyle)} — terapkan sinematografi, color grading, dan komposisi yang konsisten dengan gaya ini di SEMUA scene.`);
  L.push(`TONE NARASI       : ${labelOf(TONES, s1.tone)}`);
  L.push('');

  // ── BLOK 3b: FOTO REFERENSI PER SCENE ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 3b — FOTO REFERENSI PER SCENE (grounding visual — WAJIB)');
  L.push('═══════════════════════════════════════════════');
  for (let i = 0; i < n; i++) {
    const label = scenes[i]?.label || '(belum dilabeli)';
    const hint = PHOTO_LABEL_HINT[label] ?? 'elemen visual properti yang relevan';
    L.push(`Scene ${i + 1} — Foto referensi: ${label} (${hint}).`);
    L.push(`  File foto: ${sceneFileName(i, label)}`);
    L.push(`  ai_ready_prompt WAJIB menggambarkan elemen visual konkret dari foto ini (ruangan/area: ${hint}), BUKAN deskripsi generik.`);
    if (toolSpec?.supportsRefImage) {
      L.push(`  Tool ini MENDUKUNG reference image. File ${sceneFileName(i, label)} akan di-upload sebagai Start Frame/Reference Image saat generate video. ai_ready_prompt scene ini WAJIB FOKUS pada MOTION, ACTION, dan CAMERA MOVEMENT yang terjadi PADA gambar referensi tersebut — JANGAN re-describe elemen statis (warna dinding, furnitur, layout) yang sudah terlihat jelas dari gambar, karena deskripsi yang berbeda dari gambar asli akan membuat AI menghasilkan visual yang melenceng dari foto.`);
    } else {
      L.push(`  Tool ini TIDAK mendukung reference image (text-to-video murni). File ${sceneFileName(i, label)} adalah RUJUKAN INTERNAL untuk kamu (tidak diupload ke AI) — ai_ready_prompt WAJIB mendeskripsikan visual SEDETAIL MUNGKIN agar hasil generate AI semirip mungkin dengan komposisi foto tersebut: sebutkan elemen ruangan, warna dominan, sudut pandang, pencahayaan secara konkret.`);
    }
  }
  L.push('');
  L.push('ATURAN FOTO: Jika 2 scene memakai foto yang sama, ai_ready_prompt boleh berbeda angle/momen TAPI elemen ruangan/area HARUS tetap konsisten dengan foto tersebut.');
  L.push('PENAMAAN FILE: semua nama file di atas (scene0N_xxx.webp, character_xxx.webp) akan tersedia dalam ZIP hasil export. Gunakan nama file ini sebagai acuan saat upload ke AI video generator — pastikan urutan dan penamaan tidak tertukar agar hasil video tetap konsisten dan sinkron antar scene.');
  L.push('');

  // ── BLOK 4: ATURAN VIRAL & KONSISTENSI + GUARDRAIL SBP ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 4 — ATURAN VIRAL, KONSISTENSI & GUARDRAIL (WAJIB)');
  L.push('═══════════════════════════════════════════════');
  L.push('8 ELEMEN VIRAL (terapkan MINIMAL 4 dari 8 di seluruh video):');
  L.push('  1. Hook 3 detik pertama yang scroll-stopping.');
  L.push('  2. Pattern interrupt / kejutan visual.');
  L.push('  3. Emotional trigger (aspirasi, FOMO, rasa aman).');
  L.push('  4. Storytelling / narasi yang punya arc.');
  L.push('  5. Value bomb (informasi/insight konkret tentang properti).');
  L.push('  6. Social proof / kredibilitas.');
  L.push('  7. Open loop / curiosity gap yang baru terjawab di akhir.');
  L.push('  8. CTA yang jelas dan mendesak.');
  L.push('');
  L.push('KONSISTENSI WAJIB di seluruh scene:');
  L.push('  - Color temperature & color grade konsisten (tentukan 1 LUT/mood, pakai di semua scene).');
  L.push('  - Karakter identik (lihat [CHARACTER_SPEC] BLOK 3 bila ada).');
  L.push('  - Voice/gaya narasi konsisten (1 persona narator).');
  L.push('  - Musik/scoring satu tema yang ber-eskalasi menuju CTA.');
  L.push('  - Eskalasi energi naik dari Hook → Body → CTA.');
  L.push('  - Transisi antar scene mengalir sebagai satu video utuh.');
  L.push('');
  L.push('GUARDRAIL SBP (DIPERTEGAS — TIDAK BOLEH DILANGGAR):');
  L.push('  - WORD COUNT WAJIB: script_narration setiap scene HARUS dalam rentang ±10% dari max_words tabel lipsync scene tersebut (BUKAN sekadar di bawah maksimal — target presisi agar durasi ucapan PAS dengan durasi klip video).');
  L.push('  - SETIAP ai_ready_prompt WAJIB ground pada foto referensi scene tersebut (lihat BLOK 3b) — gambarkan ruangan/area konkret, bukan generik.');
  L.push('  - DESKRIPSI KARAKTER: jika ada karakter, COPY EXACT STRING [CHARACTER_SPEC] dari BLOK 3 ke setiap scene yang menampilkannya — TIDAK ADA variasi kata sedikit pun.');
  L.push('  - TRANSISI: setiap transition_to_next harus EKSPLISIT (hard cut / zoom punch / whip pan / dissolve + audio cue) agar editor dapat menyambung scene menjadi satu video utuh tanpa miss.');
  L.push('');

  // ── BLOK 5: OUTPUT JSON SCHEMA ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 5 — SCHEMA OUTPUT JSON (PATUHI PERSIS)');
  L.push('═══════════════════════════════════════════════');
  L.push('Hasilkan JSON dengan struktur berikut:');
  L.push('{');
  L.push('  "video_metadata": {');
  L.push(`    "title": "judul video pendek menarik",`);
  L.push(`    "niche": "real_estate",`);
  L.push(`    "property_code": "${prop.kode_listing}",`);
  L.push(`    "ai_tool": "${s1.aiTool}",`);
  L.push(`    "aspect_ratio": "${s1.ratio}",`);
  L.push(`    "total_scenes": ${n},`);
  L.push(`    "total_duration_sec": ${totalDuration(s1)},`);
  L.push(`    "language": "${s1.language}"`);
  L.push('  },');
  L.push('  "global_style": {');
  L.push('    "visual_style": "deskripsi gaya visual & sinematografi",');
  L.push('    "color_grade": "1 LUT/mood konsisten untuk semua scene",');
  L.push('    "music_mood": "tema musik yang ber-eskalasi",');
  L.push('    "narration_voice": "persona & tone narator"');
  L.push('  },');
  L.push('  "character_sheet": {');
  if (s3.useCharacter && s3.character) {
    L.push('    "has_character": true,');
    L.push('    "character_spec": "COPY EXACT [CHARACTER_SPEC] dari BLOK 3 di sini",');
    L.push('    "consistency_rule": "string identik wajib dipakai verbatim di setiap scene yang menampilkan karakter"');
  } else {
    L.push('    "has_character": false,');
    L.push(`    "visual_anchor": "${(s3.visualAnchor ?? '').replace(/"/g, "'") || 'tidak ada'}"`);
  }
  L.push('  },');
  L.push('  "scenes": [');
  L.push('    {');
  L.push('      "scene_number": 1,');
  L.push('      "role": "Hook | Body | CTA",');
  L.push('      "duration_sec": 0,');
  L.push('      "photo_reference_label": "label foto scene ini",');
  L.push('      "script_narration": "narasi (patuhi WORD COUNT lipsync ±10%)",');
  L.push('      "word_count": 0,');
  L.push('      "ai_ready_prompt": "prompt video siap-pakai untuk tool, ground pada foto referensi",');
  L.push('      "on_screen_text": "teks overlay singkat",');
  L.push('      "transition_to_next": "transisi eksplisit + audio cue"');
  L.push('    }');
  L.push(`    // ... ulangi untuk seluruh ${n} scene sesuai struktur & lipsync di BLOK 3`);
  L.push('  ],');
  L.push('  "production_notes": {');
  L.push('    "lipsync_summary": "ringkasan kepatuhan word count per scene",');
  L.push('    "editing_sequence": "urutan & catatan penyambungan scene",');
  L.push('    "color_grade_lut": "rekomendasi LUT konkret",');
  L.push('    "thumbnail_concept": "konsep thumbnail/cover",');
  L.push('    "posting_time_suggestion": "waktu posting optimal",');
  L.push('    "ab_test_suggestion": "1 ide variasi hook untuk A/B test",');
  L.push('    "caption": "string pendek 1-2 kalimat untuk TikTok/Reels/Shorts/FB",');
  L.push('    "hashtags": ["3-5 string tanpa simbol #"]');
  L.push('  }');
  L.push('}');
  L.push('');
  L.push('GUARDRAIL PENUTUP: Output JSON murni. Mulai {. Akhiri }. Tidak ada teks lain.');

  return L.join('\n');
}

// Estimasi token kasar (≈ panjang / 4).
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}
