// Master Prompt Compiler — ViralFrame Fase V4a.
// Pure function: input state (properti + step 1/2/3) → output SATU teks Master Prompt.
// Adaptasi PRD Seksi 7.2 untuk niche fixed real_estate (SBP) + guardrail ekstra ketat.

import {
  AI_TOOLS, AI_TOOL_FORMAT_SPEC, PLATFORM_BEHAVIOR, PLATFORMS,
  REAL_ESTATE_CONTEXT, PHOTO_LABEL_HINT, HOOK_TYPES, CTA_TYPES,
  VISUAL_STYLES, TONES, LANGUAGES, RATIOS, EXPRESSIONS,
  ETHNIC_EN, STYLE_EN, EXPRESSION_EN, getLipsync,
  sceneFileName, characterFileName, REGISTER_INSTRUCTION,
  isNativeAudioTool, getClipMaxSec, NEGATIVE_PROMPT_VIDEO,
  REALISM_QUALITY_CUES, REALISM_BANNED_QUALITY_PHRASES,
  sceneRoleFromParts, partIndexForScene, partsValidForTotal, type PartDef,
  partDurationsToScenes,
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
  sceneCount: number; durationMode: 'uniform' | 'manual' | 'part';
  uniformDuration: number; manualDurations: number[];
  platforms: string[]; aiTool: string; ratio: string; language: string;
  hookType: string; ctaType: string; ctaKeyword: string;
  visualStyle: string; tone: string; niche: string;
  archetype?: string; // id VideoArchetype (opsional; 'custom'/undefined = tanpa arketipe)
  register?: string;  // gaya bahasa dialog (auto/formal/santai/gaul/jawa_halus)
  /** Nomor scene (1-based) dikecualikan dari cutaway arketipe hybrid — jadi
   * talking-head/selfie murni. Hanya relevan bila archetype.allowMultiShotPerScene. */
  cutawayExcluded?: number[];
  /** Pengelompokan naratif opsional di atas Scene (Fase 6) — lihat PartDef di options.ts.
   * undefined/tidak valid (jumlah sceneCount != sceneCount total) = fallback sceneRole() posisi lama. */
  parts?: PartDef[];
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

// Fase 2 — durasi per Part. durationOf() dipanggil berkali-kali di banyak blok
// (BLOK 1/2/3/5), jadi array turunannya di-cache per objek s1 supaya pembagian
// durasi tidak dihitung ulang tiap panggilan. WeakMap = otomatis lepas begitu
// objek s1 (baru tiap render) tidak dirujuk lagi.
const cacheDurasiPart = new WeakMap<CompilerS1, number[]>();
function durasiPartArray(s1: CompilerS1): number[] {
  let arr = cacheDurasiPart.get(s1);
  if (!arr) {
    arr = partDurationsToScenes(s1.parts, s1.sceneCount, s1.uniformDuration || 8);
    cacheDurasiPart.set(s1, arr);
  }
  return arr;
}

function durationOf(s1: CompilerS1, idx: number): number {
  if (s1.durationMode === 'part') {
    return durasiPartArray(s1)[idx] ?? s1.uniformDuration;
  }
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
      text_driven: 'Teks on-screen sebagai jalur informasi utama — footage hanya latar, TIDAK ada presenter di layar.',
      client_testimonial: 'Klien/penghuni asli bicara ke kamera gaya interview santai — BUKAN agen properti, narasi personal tidak scripted.',
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
    const excluded = archetype.allowMultiShotPerScene ? (s1.cutawayExcluded ?? []).filter(n => n >= 1 && n <= s1.sceneCount) : [];
    if (excluded.length > 0) {
      L.push(`PENGECUALIAN CUTAWAY: Scene ${excluded.join(', ')} TIDAK memakai pola 2-bagian di atas — scene tersebut HANYA talking-head/selfie PENUH durasi TANPA cutaway b-roll (kamera stabil/steady, tanpa hard cut). Lihat detail per scene di KOREOGRAFI KAMERA PER SCENE di bawah.`);
    }
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
  if (isNativeAudioTool(s1.aiTool)) {
    L.push('   Format ai_ready_prompt: OBJEK JSON terstruktur (lihat BLOK 5), bukan string paragraf.');
    L.push(`   Jaga total isi objek itu tetap ringkas, ±${tool?.charLimit ?? 1000} karakter per scene — padat dan konkret, bukan bertele-tele.`);
  } else {
    L.push(`   Batas karakter ai_ready_prompt per scene: ±${tool?.charLimit ?? 1000} karakter. JANGAN melebihi.`);
  }
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
  // Batas panjang satu klip per generate (Veo/Flow = 8 detik). Scene yang melebihi
  // batas tidak bisa dihasilkan sekali jalan — beri tahu AI agar prompt-nya tetap
  // bisa dieksekusi, alih-alih membiarkan user menemukan sendiri setelah gagal.
  const clipMax = getClipMaxSec(s1.aiTool);
  if (clipMax != null) {
    const terlaluPanjang: number[] = [];
    for (let i = 0; i < n; i++) if (durationOf(s1, i) > clipMax) terlaluPanjang.push(i + 1);
    L.push(`BATAS KLIP TOOL   : ${clipMax} detik per sekali generate.`);
    if (terlaluPanjang.length > 0) {
      L.push(`  PERHATIAN: Scene ${terlaluPanjang.join(', ')} melebihi ${clipMax} detik. Untuk scene tersebut, susun ai_ready_prompt sebagai SATU aksi berkelanjutan yang bisa DIPERPANJANG (fitur Extend/Scene Extension) — hindari mendeskripsikan rangkaian kejadian yang mustahil selesai dalam ${clipMax} detik pertama. Word count narasi TETAP mengikuti tabel lipsync durasi penuh scene.`);
    }
  }
  L.push('');
  const usesParts = partsValidForTotal(s1.parts, n);
  if (usesParts) {
    L.push('PART (pengelompokan naratif — role & konsistensi mengikuti Part, bukan per-scene):');
    const durasiScenePart = durasiPartArray(s1);
    let acc = 0;
    s1.parts!.forEach((p, pi) => {
      const partScenes = Array.from({ length: p.sceneCount }, (_, k) => acc + k + 1);
      // Durasi Part = sumber kebenaran di mode 'part'; di mode lain tetap
      // informatif (jumlah durasi scene yang tergabung di Part ini).
      const durasiPart = partScenes.reduce((t, num) => t + (durasiScenePart[num - 1] ?? 0), 0);
      L.push(`  PART ${pi + 1} — ${p.role}${p.label ? `: ${p.label}` : ''} (${durasiPart} detik, ${p.sceneCount} scene → Scene ${partScenes.join(', ')})`);
      acc += p.sceneCount;
    });
    L.push('  Satu PART = satu babak naratif yang UTUH: scene-scene di dalamnya harus terasa menyambung (kalimat berlanjut, bukan mengulang pembuka), dan pergantian babak hanya terjadi di batas antar-PART.');
    L.push('');
  }
  L.push('STRUKTUR SCENE:');
  for (let i = 0; i < n; i++) {
    const role = sceneRoleFromParts(i, n, s1.parts);
    let extra = '';
    if (role === 'Hook') extra = ` — Tipe Hook: ${labelOf(HOOK_TYPES, s1.hookType)}`;
    if (role === 'CTA') {
      extra = ` — CTA: ${labelOf(CTA_TYPES, s1.ctaType)}`;
      if (s1.ctaType === 'comment_keyword' && s1.ctaKeyword) extra += ` (keyword: "${s1.ctaKeyword}")`;
    }
    const partTag = usesParts ? ` [PART ${partIndexForScene(i, s1.parts, n) + 1}]` : '';
    L.push(`  Scene ${i + 1} = ${role}${partTag}${extra}`);
  }
  L.push('');

  // Koreografi kamera per scene (dari arketipe) — motion kompleks multi-beat
  // yang menyesuaikan durasi & peran scene. Hanya bila arketipe dipilih.
  if (archetype) {
    const cutawayExcluded = archetype.allowMultiShotPerScene ? (s1.cutawayExcluded ?? []).filter(x => x >= 1 && x <= n) : [];
    L.push('KOREOGRAFI KAMERA PER SCENE (WAJIB dijadikan dasar field camera/motion di ai_ready_prompt):');
    for (let i = 0; i < n; i++) {
      const role = sceneRoleFromParts(i, n, s1.parts);
      const d = durationOf(s1, i);
      const sceneNum = i + 1;
      if (cutawayExcluded.includes(sceneNum)) {
        L.push(`  Scene ${sceneNum} (${role}, ${d}s): [PENGECUALIAN] Talking-head/selfie PENUH durasi TANPA cutaway b-roll — kamera stabil/steady mengikuti presenter sepanjang scene, JANGAN terapkan pola 2-bagian arketipe ini di scene ini.`);
      } else {
        // Tool ber-reference image: koreografi ditahan di dalam bingkai foto,
        // kalau tidak AI mengarang area di luar frame (audit uji 2026-07-28).
        const choreo = compileCameraChoreography(archetype.cameraGrammar, role, d, i, s1.aiTool, toolSpec?.supportsRefImage === true);
        L.push(`  Scene ${sceneNum} (${role}, ${d}s): ${choreo}`);
      }
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

  // ── BLOK 3c: AUDIO NATIVE (Veo / Google Flow) ──
  // Tool Veo menghasilkan dialog TERUCAP + lip-sync langsung dari teks prompt.
  // Bila dialog hanya ditaruh di script_narration (field terpisah), audio itu
  // tidak pernah dibuat: hasilnya orang bergerak tanpa bicara. Karena itu untuk
  // tool ini dialog WAJIB ditanam ulang DI DALAM ai_ready_prompt.
  const nativeAudio = isNativeAudioTool(s1.aiTool);
  if (nativeAudio) {
    L.push('═══════════════════════════════════════════════');
    L.push('BLOK 3c — AUDIO NATIVE & DIALOG TERUCAP (WAJIB)');
    L.push('═══════════════════════════════════════════════');
    L.push(`Tool ${tool?.label ?? s1.aiTool} menghasilkan AUDIO NATIVE: dialog yang ada di dalam prompt akan BENAR-BENAR DIUCAPKAN dengan lip-sync.`);
    L.push('Untuk tool ini, ai_ready_prompt BUKAN string melainkan OBJEK JSON TERSTRUKTUR (lihat BLOK 5).');
    L.push('Aturan wajibnya:');
    L.push('  - ai_ready_prompt.dialogue.line WAJIB berisi script_narration scene itu PERSIS SAMA, karakter demi karakter.');
    L.push('    Jangan diterjemahkan, diringkas, atau diparafrase. Bahasanya tetap sesuai BAHASA NARASI di BLOK 2.');
    L.push('  - ai_ready_prompt.dialogue.voice diisi karakter suara singkat (mis. "warm confident female voice, natural conversational pace") dan WAJIB SAMA di semua scene agar timbre narator konsisten.');
    L.push('  - Untuk scene TANPA orang di layar (b-roll/voiceover), tetap isi dialogue.line dengan narasinya dan set dialogue.speaker = "narrator (voiceover, off-screen)".');
    L.push('  - ai_ready_prompt.audio untuk lapisan NON-dialog saja (ambience ruangan, musik latar). JANGAN menaruh kalimat narasi di sini.');
    L.push('  - Semua field deskriptif lain (shot, subject, action, scene, camera_movement, lighting, mood, style) ditulis dalam BAHASA INGGRIS. HANYA dialogue.line yang memakai bahasa narasi.');
    L.push('PERINGATAN SUBTITLE: tool ini cenderung MEMBAKAR subtitle ke dalam frame begitu ada dialog.');
    L.push('  - DILARANG meminta teks, caption, subtitle, atau tulisan apa pun muncul di dalam frame lewat field mana pun di ai_ready_prompt.');
    L.push('  - Field on_screen_text (di luar ai_ready_prompt) adalah untuk EDITOR — ditambahkan belakangan di CapCut/Premiere. Jangan pernah menyebut isinya di dalam ai_ready_prompt.');
    L.push('  - ai_ready_prompt.negative_prompt WAJIB diisi (lihat nilai bakunya di BLOK 5) untuk menekan subtitle bakar.');
    L.push('');
  }

  // ── BLOK 3d: REALISME TEKNIS (WAJIB) ──
  // Instruksi kualitas generik ('cinematic 4K', 'professional videography') adalah
  // sinyal yang mendorong model video ke hasil terlalu mulus/menyerupai CGI, bukan
  // rekaman kamera sungguhan (audit kualitas 2026-07-29, lihat viralframe-shared.js
  // REALISM_*). Blok ini berlaku untuk SEMUA tool (bukan hanya audio-native).
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 3d — REALISME TEKNIS (WAJIB, SEMUA SCENE)');
  L.push('═══════════════════════════════════════════════');
  L.push('Deskripsi visual (field lighting/mood/style untuk tool audio-native, atau bagian akhir ai_ready_prompt untuk tool lain) WAJIB memakai KOSAKATA FISIK KAMERA NYATA, bukan kata sifat generik. Pilih yang relevan dari contoh berikut (boleh diparafrase, jaga maknanya):');
  for (const cue of REALISM_QUALITY_CUES) L.push(`  - ${cue}`);
  L.push(`DILARANG menutup deskripsi visual dengan frasa generik seperti: ${REALISM_BANNED_QUALITY_PHRASES.join(', ')}. Frasa ini terbukti mendorong hasil video terlihat CGI/render 3D, bukan rekaman kamera sungguhan.`);
  L.push('Bila tool tujuan mendukung field negative_prompt terpisah, nilainya WAJIB memuat istilah anti-CGI/plastic/uncanny (lihat NEGATIVE_PROMPT_VIDEO di BLOK 5).');
  L.push('');

  // ── BLOK 3e: SEQUENCES TIMESTAMP (opsional per scene) ──
  // Riset resmi Veo 3.1 (Google Cloud, Juli 2026): 1 panggilan generate TIDAK bisa
  // menerima banyak foto referensi berbeda dengan hard-cut per timecode — tapi BISA
  // menerima "sequences" bertimecode (foto/environment SAMA, aksi & kamera berubah
  // per beat) via field ai_ready_prompt.sequences[]. Ini pengganti/pelengkap yang
  // lebih presisi dari camera_movement satu-kalimat untuk scene yang cukup panjang
  // untuk berisi >1 aksi berbeda. Dibatasi ke tool audio-native dulu karena hanya
  // di sana ai_ready_prompt sudah berbentuk objek JSON terstruktur (BLOK 5).
  const scenesLayakSequences = nativeAudio
    ? Array.from({ length: n }, (_, i) => i + 1).filter(num => durationOf(s1, num - 1) > 6)
    : [];
  if (nativeAudio && scenesLayakSequences.length > 0) {
    L.push('═══════════════════════════════════════════════');
    L.push('BLOK 3e — SEQUENCES TIMESTAMP (WAJIB untuk scene > 6 detik)');
    L.push('═══════════════════════════════════════════════');
    L.push(`Scene ${scenesLayakSequences.join(', ')} berdurasi > 6 detik — cukup panjang untuk memuat lebih dari 1 aksi/beat kamera berbeda dalam satu take.`);
    L.push('Untuk scene tersebut, ai_ready_prompt WAJIB menambah field "sequences": array beat bertimecode, MASING-MASING dalam environment/foto referensi yang SAMA (JANGAN ganti lokasi/foto antar sequence — itu tidak didukung tool video-gen manapun):');
    L.push('  { "sequence": 1, "timestamp": "00:00-00:0Xs", "action": "aksi/kamera pada beat ini", "audio": "lapisan suara pada beat ini (opsional)" }');
    L.push('Aturan sequences:');
    L.push('  - Timecode berurutan tanpa celah/tumpang tindih, total menutup penuh duration_sec scene.');
    L.push('  - Environment/subjek/karakter yang terlihat WAJIB identik di semua sequence — hanya aksi, gerakan kamera, dan penekanan yang boleh berubah per beat.');
    L.push('  - Scene ≤ 6 detik atau tidak disebut di atas: field "sequences" boleh diisi 1 elemen saja (mewakili keseluruhan durasi) atau dikosongkan — TIDAK wajib dipecah.');
    L.push('  - dialogue.line (BLOK 3c) tetap 1 nilai untuk keseluruhan scene, TIDAK dipecah per sequence.');
    L.push('');
  }

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
  const regInstr = REGISTER_INSTRUCTION[s1.register ?? 'auto'] ?? '';
  if (regInstr) L.push(`GAYA BAHASA       : ${regInstr} Terapkan pada semua script_narration/dialog.`);
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
  L.push('9 ELEMEN VIRAL (terapkan MINIMAL 4 dari 9 di seluruh video):');
  L.push('  1. Hook 3 detik pertama yang scroll-stopping.');
  L.push('  2. Pattern interrupt / kejutan visual.');
  L.push('  3. Emotional trigger (aspirasi, FOMO, rasa aman).');
  L.push('  4. Storytelling / narasi yang punya arc.');
  L.push('  5. Value bomb (informasi/insight konkret tentang properti).');
  L.push('  6. Social proof / kredibilitas.');
  L.push('  7. Open loop / curiosity gap yang baru terjawab di akhir.');
  L.push('  8. CTA yang jelas dan mendesak.');
  L.push('  9. Loop-bait ending — lihat instruksi LOOP EDIT di bawah (WAJIB, bukan opsional, terlepas dari 4 elemen minimum di atas).');
  L.push('');
  L.push('LOOP EDIT (WAJIB — meningkatkan rewatch & autoplay loop di TikTok/Reels/Shorts):');
  L.push(`  Frame PENUTUP scene terakhir (CTA) WAJIB disusun agar secara visual "menyambung" ke frame PEMBUKA scene pertama (Hook) — komposisi, sudut kamera, atau elemen visual yang mirip/echo, sehingga saat platform me-replay video secara otomatis (autoplay loop), transisi akhir→awal terasa MULUS seperti satu gerakan berkelanjutan, bukan potongan patah. Jangan tutup video dengan frame yang terasa "final"/statis (mis. black screen, freeze frame) — akhiri dengan komposisi yang secara visual bisa lanjut ke Hook tanpa jeda canggung. Sebutkan strategi loop ini secara eksplisit di transition_to_next scene terakhir dan di production_notes.editing_sequence.`);
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
  if (nativeAudio) {
    L.push('  - DIALOG TERUCAP: ai_ready_prompt.dialogue.line setiap scene WAJIB identik dengan script_narration scene tersebut (lihat BLOK 3c). Scene dengan dialogue.line kosong atau berbeda dari naskah = OUTPUT DITOLAK, karena videonya akan bisu atau mengucapkan kalimat yang salah.');
    L.push('  - NEGATIVE PROMPT: ai_ready_prompt.negative_prompt setiap scene WAJIB diisi. Jangan dikosongkan.');
    L.push('  - ai_ready_prompt adalah OBJEK JSON, bukan string. Jangan menuliskannya sebagai satu paragraf teks.');
  }
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
  if (usesParts) L.push('      "part_number": 1,');
  L.push('      "role": "Hook | Body | CTA",');
  L.push('      "duration_sec": 0,');
  L.push('      "photo_reference_label": "label foto scene ini",');
  L.push('      "script_narration": "narasi (patuhi WORD COUNT lipsync ±10%)",');
  L.push('      "word_count": 0,');
  if (nativeAudio) {
    // Prompt terstruktur (JSON prompting) — format yang paling dipatuhi Veo 3.x:
    // tiap aspek jadi field tersendiri, bukan satu paragraf yang harus ditafsir.
    // dialogue.line = jalur audio native; tanpa itu videonya bisu.
    const durasiKlip = clipMax ?? durationOf(s1, 0);
    L.push('      "ai_ready_prompt": {');
    L.push('        "shot": "jenis shot + angle, mis. medium shot, eye level",');
    L.push('        "subject": "siapa/apa subjeknya — salin [CHARACTER_SPEC] bila ada karakter",');
    L.push('        "action": "aksi yang terjadi SELAMA klip (bukan deskripsi statis)",');
    L.push('        "scene": "lingkungan/area — rujuk ke reference image, jangan mengarang arsitektur",');
    L.push('        "camera_movement": "gerakan kamera sesuai KOREOGRAFI KAMERA scene ini",');
    L.push('        "lighting": "kondisi pencahayaan — pakai kosakata fisik BLOK 3d (practical light source, falloff, shadow), BUKAN kata sifat generik",');
    L.push('        "mood": "atmosfer emosional",');
    L.push('        "style": "gaya sinematografi + color grade (konsisten semua scene) — WAJIB pakai kosakata realisme BLOK 3d (lensa/DOF/grain/micro-jitter), DILARANG frasa generik seperti cinematic 4K/hyperrealistic",');
    L.push('        "dialogue": {');
    L.push('          "speaker": "nama karakter, atau \'narrator (voiceover, off-screen)\'",');
    L.push(`          "language": "${s1.language}",`);
    L.push('          "line": "SALIN PERSIS isi script_narration scene ini — jangan diubah sedikit pun",');
    L.push('          "voice": "karakter suara, WAJIB sama di semua scene",');
    L.push('          "delivery": "tempo & artikulasi sesuai tabel lipsync scene ini"');
    L.push('        },');
    L.push('        "audio": "ambience & musik latar SAJA — tanpa kalimat narasi",');
    if (scenesLayakSequences.length > 0) {
      L.push('        "sequences": [{ "sequence": 1, "timestamp": "00:00-00:0Xs", "action": "...", "audio": "..." }],');
      L.push('          // WAJIB diisi untuk scene > 6 detik (lihat BLOK 3e) — array kosong/1-elemen untuk scene lain.');
    }
    L.push(`        "negative_prompt": "${NEGATIVE_PROMPT_VIDEO}",`);
    L.push(`        "duration_sec": ${durasiKlip},`);
    L.push(`        "aspect_ratio": "${s1.ratio}"`);
    L.push('      },');
    L.push('      "on_screen_text": "teks overlay untuk EDITOR (jangan disebut di ai_ready_prompt)",');
  } else {
    L.push('      "ai_ready_prompt": "prompt video siap-pakai untuk tool, ground pada foto referensi — kualitas visual WAJIB pakai kosakata realisme BLOK 3d, DILARANG frasa generik seperti cinematic 4K/hyperrealistic",');
    L.push('      "on_screen_text": "teks overlay singkat",');
  }
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

// ─── Copy Prompt Natural — renderer KEDUA dari data terkompilasi yang SAMA ───
// compileMasterPrompt() di atas menghasilkan prompt terstruktur (instruksi AI
// mengeluarkan JSON per BLOK 5) — cocok untuk jalur AI Generate yang mem-parse
// output mesin. compileNaturalPrompt() merender data Part/Scene/Karakter/
// Parameter yang SAMA sebagai paragraf naratif bahasa Inggris per scene (dialog
// tetap Bahasa Indonesia) — cocok untuk paste manual ke tool percakapan seperti
// Google Flow/Veo, mengikuti format storyboard manual yang sudah terbukti bagus.
export function compileNaturalPrompt(
  prop: CompilerProperty, s1: CompilerS1, scenes: CompilerScene[], s3: CompilerS3,
): string {
  const L: string[] = [];
  const n = s1.sceneCount;
  const archetype = findArchetype(s1.archetype);
  const parts = partsValidForTotal(s1.parts, n) ? s1.parts : undefined;

  const charDesc = s3.useCharacter && s3.character ? buildCharacterDescription(s3.character, s3.expression) : '';
  const talentName = s3.useCharacter && s3.character ? s3.character.nama : '';

  L.push(`# PROMPT NATURAL — ${prop.title}`);
  L.push(`Talent: ${talentName || 'Tanpa karakter (faceless/b-roll)'} | Total durasi: ${totalDuration(s1)} detik | ${n} scene`);
  L.push(`Gaya: ${archetype ? archetype.label : labelOf(VISUAL_STYLES, s1.visualStyle)} — Tone: ${labelOf(TONES, s1.tone)}`);
  const regInstr = REGISTER_INSTRUCTION[s1.register ?? 'auto'] ?? '';
  if (regInstr) L.push(`Gaya bahasa dialog: ${regInstr}`);
  L.push('');

  for (let i = 0; i < n; i++) {
    const role = sceneRoleFromParts(i, n, parts);
    const dur = durationOf(s1, i);
    const label = scenes[i]?.label || '(belum dilabeli)';
    const hint = PHOTO_LABEL_HINT[label] ?? 'elemen visual properti yang relevan';
    const kamera = archetype
      ? compileCameraChoreography(archetype.cameraGrammar, role, dur, i, s1.aiTool, true)
      : 'steady cinematic frame with subtle natural motion';

    L.push(`## SCENE ${i + 1} — ${role} (${dur} detik)`);
    L.push('');
    L.push('```');
    let visual = s3.useCharacter && charDesc
      ? `${charDesc} is on screen at a property, in front of/near the ${hint} (reference: ${label}). Camera: ${kamera}.`
      : `A ${hint} (reference: ${label}) is shown, no presenter on screen. Camera: ${kamera}.`;
    if (role === 'Hook') visual += ` Opening style: ${labelOf(HOOK_TYPES, s1.hookType)}.`;
    if (role === 'CTA') visual += ` Closing/CTA style: ${labelOf(CTA_TYPES, s1.ctaType)}.`;
    L.push(visual);
    L.push('');
    L.push(`Style: ${labelOf(VISUAL_STYLES, s1.visualStyle)}, ${labelOf(TONES, s1.tone).toLowerCase()} mood, vertical framing, natural daylight unless scene suggests otherwise.`);
    L.push('```');
    L.push('');
    L.push(`Dialog (Bahasa Indonesia${regInstr ? ', ikuti gaya bahasa di atas' : ''}): [AI/kamu isi naskah untuk scene ini sesuai peran ${role} — target durasi ${dur} detik].`);
    L.push('');
  }

  L.push('## CATATAN PRODUKSI');
  L.push(`- Loop edit: frame penutup scene terakhir (CTA) sebaiknya "menyambung" secara visual ke frame pembuka scene pertama (Hook), supaya autoplay loop terasa mulus.`);
  L.push(`- Caption/subtitle wajib ditambahkan sepanjang video (banyak penonton mute audio).`);
  L.push(`- Rasio: ${s1.ratio || '9:16 vertikal'} — optimal untuk ${s1.platforms.map(p => labelOf(PLATFORMS, p)).join(', ') || 'TikTok/Reels'}.`);
  if (s1.ctaType === 'comment_keyword' && s1.ctaKeyword.trim()) {
    L.push(`- CTA keyword komentar: "${s1.ctaKeyword.trim()}".`);
  }

  return L.join('\n');
}

// Estimasi token kasar (≈ panjang / 4).
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}
