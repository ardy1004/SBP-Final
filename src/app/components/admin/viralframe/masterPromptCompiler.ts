// Master Prompt Compiler — ViralFrame Fase V4a → Part-as-Generate-Unit (2026-08-01).
// Pure function: input state (properti + Part[] + karakter) → output SATU teks Master Prompt.
// Adaptasi PRD Seksi 7.2 untuk niche fixed real_estate (SBP) + guardrail ekstra ketat.
//
// ─── REFACTOR 2026-08-01 (rencana "Part-as-Generate-Unit", lihat
// C:\Users\PC\.claude\plans\indexed-riding-lake.md) ──────────────────────────
// Model LAMA: unit generate = 1 scene = 1 foto. Model BARU: 1 PART = 1 generate
// call (maks MAX_REF_IMAGES_PER_PART foto referensi, termasuk foto karakter);
// `cuts[]` di dalam Part adalah potongan visual DI DALAM satu generate itu, bukan
// lagi array `scenes[]` terpisah. `sceneRoleFromParts`/`partIndexForScene`/
// `partsValidForTotal`/`partDurationsToScenes` (fungsi bantu bentuk lama) SUDAH
// DIHAPUS oleh Tahap 1 — compiler ini sepenuhnya bertumpu pada `PartDef[]`.
import {
  AI_TOOLS, AI_TOOL_FORMAT_SPEC, PLATFORM_BEHAVIOR, PLATFORMS,
  REAL_ESTATE_CONTEXT, PHOTO_LABEL_HINT, HOOK_TYPES, CTA_TYPES,
  VISUAL_STYLES, TONES, LANGUAGES, RATIOS, EXPRESSIONS,
  ETHNIC_EN, STYLE_EN, EXPRESSION_EN, getLipsync,
  characterFileName, REGISTER_INSTRUCTION,
  isNativeAudioTool, getClipMaxSec, NEGATIVE_PROMPT_VIDEO,
  REALISM_QUALITY_CUES, REALISM_BANNED_QUALITY_PHRASES,
  MAX_REF_IMAGES_PER_PART, buildZipNames, slugifyLabel,
  totalDurationOfParts, sumDurasiCuts,
  type PartDef, type ZipSourceImage,
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
  /** Unit generate — 1 Part = 1 panggilan generate. Mode durasi lama (uniform/manual/
   * sceneCount) DIHAPUS (Tahap 1) — Part adalah SATU-SATUNYA sumber struktur & durasi. */
  parts: PartDef[];
  platforms: string[]; aiTool: string; ratio: string; language: string;
  hookType: string; ctaType: string; ctaKeyword: string;
  visualStyle: string; tone: string; niche: string;
  archetype?: string; // id VideoArchetype (opsional; 'custom'/undefined = tanpa arketipe)
  register?: string;  // gaya bahasa dialog (auto/formal/santai/gaul/jawa_halus)
  /** Nomor PART (1-based) dikecualikan dari cutaway arketipe hybrid — jadi
   * talking-head/selfie murni. Hanya relevan bila archetype.allowMultiShotPerScene. */
  cutawayExcluded?: number[];
}
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

// ─── Penamaan file referensi per Part (sinkron ZIP — Tahap 1 buildZipNames()) ──
// PENTING: `images` WAJIB array yang SAMA (semua foto berlabel properti ini,
// urutan sama) yang dipakai konsumen (Tahap 4 — export ZIP per-Part) untuk
// membangun nama file, kalau tidak nomor "fasad1.webp"/"fasad2.webp" bisa
// berbeda antara yang disebut di prompt dan yang ada di dalam ZIP.
function buildPhotoNameMap(images: ZipSourceImage[]): Map<number, string> {
  return buildZipNames(images);
}

function photoFileName(photoId: number, label: string, nameMap: Map<number, string>): string {
  return nameMap.get(photoId) ?? `${slugifyLabel(label)}.webp`;
}

/** Nama file referensi Part ini, urutan lampir: karakter (bila dipakai) dulu,
 * lalu refPhotoIds sesuai urutan Part. Dipakai baik untuk daftar "LAMPIRKAN
 * SEBAGAI REFERENCE IMAGE" (Prompt Natural) maupun `reference_images[]` (Prompt JSON). */
function partRefImageNames(
  p: PartDef, useCharacter: boolean, character: CompilerCharacter | null | undefined, nameMap: Map<number, string>,
): string[] {
  const names: string[] = [];
  if (useCharacter && character) names.push(characterFileName(character.nama));
  for (const id of p.refPhotoIds) {
    const label = p.cuts.find(c => c.photoId === id)?.label ?? '';
    const nm = nameMap.get(id) ?? `${slugifyLabel(label)}.webp`;
    if (!names.includes(nm)) names.push(nm);
  }
  return names;
}

// ─── Catatan Produksi — invarian Σ VO vs Σ durasi Part (Tahap 3, WAJIB) ───────
export interface ProductionNotePart {
  part: number; role: 'Hook' | 'Body' | 'CTA';
  durationSec: number; voDurationSec: number;
  sisaDetik: number; overVo: boolean;
}
export interface ProductionNotes {
  totalDurationSec: number;
  totalVoDurationSec: number;
  sisaDetikTotal: number;
  perPart: ProductionNotePart[];
  overVoWarning: boolean;
  /** Ringkasan siap-tampil, mis. "3×8s VO = 24s, sisa 6s untuk hook text/transisi/end card." */
  summaryText: string;
}

/**
 * Hitung Σ voDurationSec vs Σ durationSec seluruh Part, dan tampilkan sisa waktu
 * untuk hook text/transisi/end card — plus peringatan eksplisit bila ada Part
 * dengan voDurationSec > durationSec (VO tidak akan muat).
 */
export function buildProductionNotes(parts: PartDef[] | undefined): ProductionNotes {
  const list = Array.isArray(parts) ? parts : [];
  const totalDurationSec = totalDurationOfParts(list);
  const totalVoDurationSec = list.reduce(
    (s, p) => s + (Number.isFinite(p.voDurationSec) && p.voDurationSec > 0 ? p.voDurationSec : 0), 0,
  );
  const sisaDetikTotal = totalDurationSec - totalVoDurationSec;
  const perPart: ProductionNotePart[] = list.map((p, i) => ({
    part: i + 1,
    role: p.role,
    durationSec: p.durationSec,
    voDurationSec: p.voDurationSec,
    sisaDetik: p.durationSec - p.voDurationSec,
    overVo: p.voDurationSec > p.durationSec,
  }));
  const overVoWarning = perPart.some(p => p.overVo);

  // Kalau VO seragam di semua Part, tampilkan bentuk ringkas "NxDs VO = Ts, sisa Rs"
  // (contoh persis dari rencana). Kalau tidak seragam, tampilkan total apa adanya.
  const voValues = new Set(perPart.map(p => p.voDurationSec));
  let summaryText: string;
  if (perPart.length > 0 && voValues.size === 1) {
    const v = perPart[0].voDurationSec;
    summaryText = `${perPart.length}×${v}s VO = ${totalVoDurationSec}s, sisa ${sisaDetikTotal}s untuk hook text/transisi/end card.`;
  } else if (perPart.length > 0) {
    summaryText = `Total VO ${totalVoDurationSec}s dari total durasi ${totalDurationSec}s, sisa ${sisaDetikTotal}s untuk hook text/transisi/end card.`;
  } else {
    summaryText = 'Belum ada Part.';
  }
  if (overVoWarning) {
    const daftar = perPart.filter(p => p.overVo)
      .map(p => `Part ${p.part} (VO ${p.voDurationSec}s > durasi ${p.durationSec}s)`)
      .join(', ');
    summaryText += ` PERINGATAN: ${daftar} — VO melebihi durasi Part, WAJIB dipotong atau durasi Part diperpanjang.`;
  }

  return { totalDurationSec, totalVoDurationSec, sisaDetikTotal, perPart, overVoWarning, summaryText };
}

// ─── COMPILER UTAMA (Prompt JSON — instruksi AI mengeluarkan JSON per BLOK 5) ─
// `images`: SEMUA foto berlabel properti ini (id + label_ruangan), urutan sama
// dengan yang dipakai Tahap 4 untuk export ZIP — WAJIB sumber yang sama supaya
// nama file di prompt identik dengan nama file di dalam ZIP (lihat buildZipNames()).
export function compileMasterPrompt(
  prop: CompilerProperty, s1: CompilerS1, s3: CompilerS3, images: ZipSourceImage[],
): string {
  const L: string[] = [];
  const parts = Array.isArray(s1.parts) ? s1.parts : [];
  const nameMap = buildPhotoNameMap(images);
  const primer = s1.platforms[0] ?? 'tiktok';
  const tool = AI_TOOLS.find(t => t.value === s1.aiTool);
  const toolSpec = AI_TOOL_FORMAT_SPEC[s1.aiTool];
  const platformBehavior = PLATFORM_BEHAVIOR[primer] ?? '';
  const archetype = findArchetype(s1.archetype);
  const nativeAudio = isNativeAudioTool(s1.aiTool);
  const clipMax = getClipMaxSec(s1.aiTool);
  const totalDurasi = totalDurationOfParts(parts);
  const prodNotes = buildProductionNotes(parts);

  // ── HEADER ──
  L.push('# MASTER PROMPT — VIRALFRAME (SBP / Salam Bumi Property)');
  L.push('');
  L.push('INSTRUKSI KRITIS: Output kamu HANYA berupa JSON murni yang valid sesuai schema di BLOK 5.');
  L.push('JANGAN tulis penjelasan, basa-basi, markdown, atau teks apa pun di luar JSON.');
  L.push('Mulai output dengan karakter { dan akhiri dengan }. Tidak ada yang lain.');
  L.push('');

  // ── BLOK 0: ARAHAN FORMAT & GAYA (ARKETIPE) ──
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
    L.push('CATATAN: Arahan arketipe ini MENGIKAT seluruh Part. Gaya visual, tone, dan');
    L.push('koreografi kamera di bawah sudah diselaraskan dengan arketipe ini — jaga konsistensinya.');
    const excluded = archetype.allowMultiShotPerScene ? (s1.cutawayExcluded ?? []).filter(n => n >= 1 && n <= parts.length) : [];
    if (excluded.length > 0) {
      L.push(`PENGECUALIAN CUTAWAY: PART ${excluded.join(', ')} TIDAK memakai pola 2-bagian di atas — Part tersebut HANYA talking-head/selfie PENUH durasi TANPA cutaway b-roll (kamera stabil/steady, tanpa hard cut). Lihat detail per Part di KOREOGRAFI KAMERA di bawah.`);
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
  L.push(`   Batas karakter per Part: ±${tool?.charLimit ?? 1000} karakter — padat dan konkret, bukan bertele-tele.`);
  L.push(`   Dukungan reference image: ${toolSpec?.supportsRefImage ? 'YA — foto referensi Part dipakai sebagai panduan frame (maks ' + MAX_REF_IMAGES_PER_PART + ' foto per Part, foto karakter ikut terhitung).' : 'TIDAK — tool ini text-to-video murni, deskripsikan visual sangat detail dalam teks.'}`);
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
  L.push(`TOTAL PART        : ${parts.length} (1 Part = 1 panggilan generate)`);
  L.push(`TOTAL DURASI      : ${totalDurasi} detik`);
  if (clipMax != null) {
    const terlaluPanjang = parts.map((p, i) => ({ i, p })).filter(({ p }) => p.durationSec > clipMax);
    L.push(`BATAS KLIP TOOL   : ${clipMax} detik per sekali generate.`);
    if (terlaluPanjang.length > 0) {
      L.push(`  PERHATIAN: Part ${terlaluPanjang.map(t => t.i + 1).join(', ')} melebihi ${clipMax} detik — durasi Part WAJIB dikoreksi di Step Parameter sebelum generate (satu Part = satu panggilan generate, tidak bisa dipecah otomatis di sini).`);
    }
  }
  L.push('');

  L.push('STRUKTUR PART (satu PART = satu panggilan generate, babak naratif yang UTUH):');
  parts.forEach((p, pi) => {
    const namaFoto = partRefImageNames(p, s3.useCharacter, s3.character, nameMap);
    const kuota = namaFoto.length > MAX_REF_IMAGES_PER_PART ? ` ⚠ MELEBIHI KUOTA ${MAX_REF_IMAGES_PER_PART}` : '';
    L.push(`  PART ${pi + 1} — ${p.role}${p.label ? `: ${p.label}` : ''} (${p.durationSec} detik, VO ${p.voDurationSec} detik, ${p.cuts.length} cut, ${namaFoto.length} foto referensi${kuota})`);
    if (p.rationale) L.push(`    Rationale AI: ${p.rationale}`);
    // Invarian WAJIB: Σ durasi cuts Part ini = durationSec Part. Bila AI/user
    // menyunting cuts secara manual dan lupa menyesuaikan total, tunjukkan
    // penyimpangannya secara eksplisit di prompt (bukan diam-diam salah).
    const sumCuts = sumDurasiCuts(p.cuts);
    if (sumCuts !== p.durationSec) {
      L.push(`    ⚠ Σ durasi cut (${sumCuts}s) TIDAK SAMA dengan durasi Part (${p.durationSec}s) — koreksi durasi cut sebelum generate.`);
    }
  });
  L.push('  Dialog/narasi DI DALAM satu Part harus menyambung sebagai SATU kesatuan (kalimat berlanjut, bukan mengulang pembuka per cut). Pergantian babak hanya terjadi di batas antar-PART.');
  L.push('');

  // Koreografi kamera per Part (dari arketipe) — motion kompleks multi-beat.
  if (archetype) {
    const cutawayExcluded = archetype.allowMultiShotPerScene ? (s1.cutawayExcluded ?? []).filter(x => x >= 1 && x <= parts.length) : [];
    L.push('KOREOGRAFI KAMERA PER PART (WAJIB dijadikan dasar field camera/motion tiap cut):');
    parts.forEach((p, pi) => {
      const partNum = pi + 1;
      if (cutawayExcluded.includes(partNum)) {
        L.push(`  PART ${partNum} (${p.role}, ${p.durationSec}s): [PENGECUALIAN] Talking-head/selfie PENUH durasi TANPA cutaway b-roll — kamera stabil/steady mengikuti presenter sepanjang Part, JANGAN terapkan pola 2-bagian arketipe ini di Part ini.`);
      } else {
        const choreo = compileCameraChoreography(archetype.cameraGrammar, p.role, p.durationSec, pi, s1.aiTool, toolSpec?.supportsRefImage === true);
        L.push(`  PART ${partNum} (${p.role}, ${p.durationSec}s): ${choreo}`);
      }
    });
    L.push('  Terjemahkan koreografi ini ke gerakan kamera utama tiap cut di dalam Part — jaga agar setiap beat terasa mulus dan termotivasi, bukan gerakan acak.');
    L.push('');
  }

  L.push('BUDGET NARASI PER PART (VO ↔ batas kata — WAJIB dipatuhi, dihitung dari voDurationSec Part, bukan durationSec):');
  parts.forEach((p, pi) => {
    const ls = getLipsync(p.voDurationSec);
    L.push(`  PART ${pi + 1}: VO ${p.voDurationSec}s (durasi Part ${p.durationSec}s) → maksimal ${ls.maxWords} kata, pace "${ls.pace}". ${ls.instruksi}`);
  });
  L.push('');

  // ── BLOK 3c: AUDIO NATIVE (Veo / Google Flow) ──
  if (nativeAudio) {
    L.push('═══════════════════════════════════════════════');
    L.push('BLOK 3c — AUDIO NATIVE & DIALOG TERUCAP (WAJIB)');
    L.push('═══════════════════════════════════════════════');
    L.push(`Tool ${tool?.label ?? s1.aiTool} menghasilkan AUDIO NATIVE: dialog yang ada di dalam prompt akan BENAR-BENAR DIUCAPKAN dengan lip-sync.`);
    L.push('Untuk tool ini, tiap Part di BLOK 5 punya field "dialogue" TERSTRUKTUR (bukan digabung ke teks cut).');
    L.push('Aturan wajibnya:');
    L.push('  - dialogue.line Part ini WAJIB berisi narasi (field "dialog") Part itu PERSIS SAMA, karakter demi karakter — jangan diterjemahkan/diringkas/diparafrase. Bahasanya tetap sesuai BAHASA NARASI di BLOK 2.');
    L.push('  - dialogue.voice diisi karakter suara singkat (mis. "warm confident female voice, natural conversational pace") dan WAJIB SAMA di semua Part agar timbre narator konsisten.');
    L.push('  - Untuk Part TANPA orang di layar (b-roll/voiceover), tetap isi dialogue.line dengan narasinya dan set dialogue.speaker = "narrator (voiceover, off-screen)".');
    L.push('  - Field "audio" tiap Part untuk lapisan NON-dialog saja (ambience ruangan, musik latar). JANGAN menaruh kalimat narasi di sini.');
    L.push('PERINGATAN SUBTITLE: tool ini cenderung MEMBAKAR subtitle ke dalam frame begitu ada dialog.');
    L.push('  - DILARANG meminta teks, caption, subtitle, atau tulisan apa pun muncul di dalam frame lewat cut manapun.');
    L.push('  - "on_screen_text" (di luar cuts) adalah untuk EDITOR — ditambahkan belakangan di CapCut/Premiere. Jangan pernah menyebut isinya di dalam cut/dialogue.');
    L.push('  - "negative_prompt" Part WAJIB diisi (lihat nilai bakunya di BLOK 5) untuk menekan subtitle bakar.');
    L.push('');
  }

  // ── BLOK 3d: REALISME TEKNIS (WAJIB) ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 3d — REALISME TEKNIS (WAJIB, SEMUA PART/CUT)');
  L.push('═══════════════════════════════════════════════');
  L.push('Deskripsi visual tiap cut WAJIB memakai KOSAKATA FISIK KAMERA NYATA, bukan kata sifat generik. Pilih yang relevan dari contoh berikut (boleh diparafrase, jaga maknanya):');
  for (const cue of REALISM_QUALITY_CUES) L.push(`  - ${cue}`);
  L.push(`DILARANG menutup deskripsi visual dengan frasa generik seperti: ${REALISM_BANNED_QUALITY_PHRASES.join(', ')}. Frasa ini terbukti mendorong hasil video terlihat CGI/render 3D, bukan rekaman kamera sungguhan.`);
  L.push('Bila tool tujuan mendukung field negative_prompt terpisah, nilainya WAJIB memuat istilah anti-CGI/plastic/uncanny (lihat NEGATIVE_PROMPT_VIDEO di BLOK 5).');
  L.push('');

  L.push('KARAKTER:');
  if (s3.useCharacter && s3.character) {
    const desc = buildCharacterDescription(s3.character, s3.expression);
    L.push(`  [CHARACTER_SPEC] ${desc}`);
    L.push('  PERINGATAN: Penampilan karakter ini WAJIB IDENTIK di semua Part tanpa pengecualian.');
    L.push('  JANGAN PARAFRASE deskripsi ini — COPY EXACT STRING [CHARACTER_SPEC] di setiap Part yang menampilkan karakter.');
    L.push(`  File foto karakter: ${characterFileName(s3.character.nama)}`);
    if (toolSpec?.supportsRefImage) {
      L.push('  File ini di-upload sebagai salah satu reference image tiap Part (ikut kuota MAX_REF_IMAGES_PER_PART) — pastikan [CHARACTER_SPEC] di setiap Part tetap konsisten dengan visual di file ini.');
    } else {
      L.push('  [CHARACTER_SPEC] (deskripsi teks) adalah SATU-SATUNYA jangkar konsistensi karakter — file ini hanya untuk referensi visual kamu sendiri saat memilih talent.');
    }
  } else {
    L.push(`  Tidak ada karakter. Visual anchor: ${s3.visualAnchor?.trim() || 'tidak ada'}`);
    if (s3.visualAnchor?.trim()) {
      L.push('  Visual anchor di atas WAJIB muncul konsisten di setiap Part sebagai elemen pengikat.');
    }
  }
  L.push('');
  L.push(`GAYA VISUAL       : ${labelOf(VISUAL_STYLES, s1.visualStyle)} — terapkan sinematografi, color grading, dan komposisi yang konsisten dengan gaya ini di SEMUA Part.`);
  L.push(`TONE NARASI       : ${labelOf(TONES, s1.tone)}`);
  const regInstr = REGISTER_INSTRUCTION[s1.register ?? 'auto'] ?? '';
  if (regInstr) L.push(`GAYA BAHASA       : ${regInstr} Terapkan pada semua dialog/narasi.`);
  L.push('');

  // ── BLOK 3b: FOTO REFERENSI PER PART (grounding visual — WAJIB) ──
  L.push('═══════════════════════════════════════════════');
  L.push('BLOK 3b — FOTO REFERENSI PER PART (grounding visual — WAJIB)');
  L.push('═══════════════════════════════════════════════');
  parts.forEach((p, pi) => {
    const namaFoto = partRefImageNames(p, s3.useCharacter, s3.character, nameMap);
    L.push(`PART ${pi + 1} — LAMPIRKAN SEBAGAI REFERENCE IMAGE:`);
    namaFoto.forEach((f, i) => L.push(`  ${i + 1}. ${f}`));
    p.cuts.forEach((cut, ci) => {
      const hint = PHOTO_LABEL_HINT[cut.label] ?? 'elemen visual properti yang relevan';
      const fileName = photoFileName(cut.photoId, cut.label, nameMap);
      L.push(`  Cut ${ci + 1} — Foto: ${cut.label} (${hint}). File: ${fileName}. Durasi cut: ${cut.durasiDetik} detik.${cut.aksi ? ` Aksi/kamera: ${cut.aksi}.` : ''}`);
    });
    if (toolSpec?.supportsRefImage) {
      L.push(`  Tool ini MENDUKUNG reference image. Storyboard (Tahap Sutradara AI bervisi) sudah MELIHAT foto-foto ini — deskripsi visual tiap cut WAJIB AKURAT terhadap apa yang benar-benar terlihat di foto (warna, material, tata letak, pencahayaan), JANGAN mengarang elemen yang tidak ada DAN JANGAN menghindari mendeskripsikannya. Fokuskan tetap pada MOTION/ACTION/CAMERA yang terjadi PADA foto referensi tersebut, tapi grounding visualnya harus presisi, bukan generik.`);
    } else {
      L.push(`  Tool ini TIDAK mendukung reference image (text-to-video murni) — foto di atas adalah RUJUKAN INTERNAL (tidak diupload ke AI). Deskripsikan visual SEDETAIL MUNGKIN dan AKURAT agar hasil generate semirip mungkin dengan foto: sebutkan elemen ruangan, warna dominan, sudut pandang, pencahayaan secara konkret.`);
    }
    L.push('');
  });
  L.push('ATURAN FOTO: Jika 2 cut (dalam Part yang sama atau Part berbeda) memakai foto yang sama, deskripsi boleh berbeda angle/momen TAPI elemen ruangan/area HARUS tetap konsisten dengan foto tersebut.');
  L.push('PENAMAAN FILE: semua nama file di atas akan tersedia dalam ZIP hasil export (satu folder per PART). Gunakan nama file ini sebagai acuan saat upload ke AI video generator — pastikan urutan dan penamaan tidak tertukar antar Part.');
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
  L.push(`  Frame PENUTUP Part terakhir (CTA) WAJIB disusun agar secara visual "menyambung" ke frame PEMBUKA Part pertama (Hook) — komposisi, sudut kamera, atau elemen visual yang mirip/echo, sehingga saat platform me-replay video secara otomatis (autoplay loop), transisi akhir→awal terasa MULUS seperti satu gerakan berkelanjutan, bukan potongan patah. Jangan tutup video dengan frame yang terasa "final"/statis (mis. black screen, freeze frame). Sebutkan strategi loop ini secara eksplisit di production_notes.editing_sequence.`);
  L.push('');
  L.push('KONSISTENSI WAJIB di seluruh Part:');
  L.push('  - Color temperature & color grade konsisten (tentukan 1 LUT/mood, pakai di semua Part).');
  L.push('  - Karakter identik (lihat [CHARACTER_SPEC] BLOK 3 bila ada).');
  L.push('  - Voice/gaya narasi konsisten (1 persona narator).');
  L.push('  - Musik/scoring satu tema yang ber-eskalasi menuju CTA.');
  L.push('  - Eskalasi energi naik dari Hook → Body → CTA.');
  L.push('  - Transisi antar Part mengalir sebagai satu video utuh.');
  L.push('');
  L.push('GUARDRAIL SBP (DIPERTEGAS — TIDAK BOLEH DILANGGAR):');
  L.push('  - WORD COUNT WAJIB: field "dialog" setiap Part HARUS dalam rentang ±10% dari max_words BUDGET NARASI PER PART di atas (BUKAN sekadar di bawah maksimal — target presisi agar durasi ucapan PAS dengan voDurationSec Part).');
  L.push('  - SETIAP cut WAJIB ground pada foto referensinya (lihat BLOK 3b) — gambarkan ruangan/area konkret dan AKURAT, bukan generik.');
  L.push('  - DESKRIPSI KARAKTER: jika ada karakter, COPY EXACT STRING [CHARACTER_SPEC] dari BLOK 3 ke setiap Part yang menampilkannya — TIDAK ADA variasi kata sedikit pun.');
  L.push('  - TRANSISI: field "transition_to_next" tiap Part harus EKSPLISIT (hard cut / zoom punch / whip pan / dissolve + audio cue) agar editor dapat menyambung Part menjadi satu video utuh tanpa miss.');
  if (nativeAudio) {
    L.push('  - DIALOG TERUCAP: dialogue.line setiap Part WAJIB identik dengan field "dialog" Part tersebut (lihat BLOK 3c). Part dengan dialogue.line kosong atau berbeda dari naskah = OUTPUT DITOLAK, karena videonya akan bisu atau mengucapkan kalimat yang salah.');
    L.push('  - NEGATIVE PROMPT: negative_prompt setiap Part WAJIB diisi. Jangan dikosongkan.');
  }
  L.push('');

  // ── BLOK 5: OUTPUT JSON SCHEMA (Part-level) ──
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
  L.push(`    "total_parts": ${parts.length},`);
  L.push(`    "total_duration_sec": ${totalDurasi},`);
  L.push(`    "language": "${s1.language}"`);
  L.push('  },');
  L.push('  "global_style": {');
  L.push('    "visual_style": "deskripsi gaya visual & sinematografi",');
  L.push('    "color_grade": "1 LUT/mood konsisten untuk semua Part",');
  L.push('    "music_mood": "tema musik yang ber-eskalasi",');
  L.push('    "narration_voice": "persona & tone narator"');
  L.push('  },');
  L.push('  "character_sheet": {');
  if (s3.useCharacter && s3.character) {
    L.push('    "has_character": true,');
    L.push('    "character_spec": "COPY EXACT [CHARACTER_SPEC] dari BLOK 3 di sini",');
    L.push('    "consistency_rule": "string identik wajib dipakai verbatim di setiap Part yang menampilkan karakter"');
  } else {
    L.push('    "has_character": false,');
    L.push(`    "visual_anchor": "${(s3.visualAnchor ?? '').replace(/"/g, "'") || 'tidak ada'}"`);
  }
  L.push('  },');
  L.push('  "parts": [');
  L.push('    {');
  L.push('      "part": 1,');
  L.push('      "role": "Hook | Body | CTA",');
  L.push('      "duration_sec": 0,');
  L.push('      "vo_duration_sec": 0,');
  L.push('      "reference_images": ["urutan file yang WAJIB dilampirkan — lihat LAMPIRKAN SEBAGAI REFERENCE IMAGE di BLOK 3b"],');
  L.push('      "cuts": [');
  L.push('        { "t": "0-4s", "photo": "nama file cut (lihat BLOK 3b)", "action": "aksi/motion pada cut ini, ground akurat pada foto", "camera": "gerakan kamera sesuai KOREOGRAFI" }');
  L.push('        // ... ulangi untuk setiap cut Part ini, Σ durasi cut = duration_sec Part');
  L.push('      ],');
  L.push('      "dialog": "narasi/dialog Part ini (patuhi WORD COUNT ±10% dari BUDGET NARASI)",');
  if (nativeAudio) {
    L.push('      "dialogue": {');
    L.push('        "speaker": "nama karakter, atau \'narrator (voiceover, off-screen)\'",');
    L.push(`        "language": "${s1.language}",`);
    L.push('        "line": "SALIN PERSIS isi field dialog Part ini — jangan diubah sedikit pun",');
    L.push('        "voice": "karakter suara, WAJIB sama di semua Part",');
    L.push('        "delivery": "tempo & artikulasi sesuai BUDGET NARASI Part ini"');
    L.push('      },');
    L.push(`      "negative_prompt": "${NEGATIVE_PROMPT_VIDEO}",`);
  }
  L.push('      "on_screen_text": ["teks overlay untuk EDITOR (array, boleh kosong)"],');
  L.push('      "audio": "ambience & musik latar Part ini — SAJA, tanpa kalimat narasi",');
  L.push('      "transition_to_next": "transisi eksplisit + audio cue"');
  L.push('    }');
  L.push(`    // ... ulangi untuk seluruh ${parts.length} Part sesuai STRUKTUR PART di BLOK 3`);
  L.push('  ],');
  L.push('  "production_notes": {');
  L.push(`    "vo_gap_summary": "${prodNotes.summaryText.replace(/"/g, "'")}",`);
  L.push('    "editing_sequence": "urutan & catatan penyambungan Part",');
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
// compileMasterPrompt() menghasilkan prompt terstruktur (instruksi AI mengeluarkan
// JSON per BLOK 5) — cocok untuk jalur AI Generate yang mem-parse output mesin.
// compileNaturalPrompt() merender Part/Karakter/Parameter yang SAMA sebagai teks
// siap-tempel per Part (Visual/Framing/Text Overlay/Voiceover/Musik/Transisi),
// mengikuti bentuk storyboard rujukan yang disukai user — untuk paste manual ke
// tool percakapan seperti Google Flow/Veo, TIAP Part diawali daftar tegas foto
// referensi (sinkron nama file ZIP via buildZipNames()).
export function compileNaturalPrompt(
  prop: CompilerProperty, s1: CompilerS1, s3: CompilerS3, images: ZipSourceImage[],
): string {
  const L: string[] = [];
  const parts = Array.isArray(s1.parts) ? s1.parts : [];
  const nameMap = buildPhotoNameMap(images);
  const archetype = findArchetype(s1.archetype);
  const nativeAudio = isNativeAudioTool(s1.aiTool);
  const totalDurasi = totalDurationOfParts(parts);
  const prodNotes = buildProductionNotes(parts);

  const charDesc = s3.useCharacter && s3.character ? buildCharacterDescription(s3.character, s3.expression) : '';
  const talentName = s3.useCharacter && s3.character ? s3.character.nama : '';
  const regInstr = REGISTER_INSTRUCTION[s1.register ?? 'auto'] ?? '';

  L.push(`# PROMPT NATURAL — ${prop.title}`);
  L.push(`Talent: ${talentName || 'Tanpa karakter (faceless/b-roll)'} | Total durasi: ${totalDurasi} detik | ${parts.length} Part (1 Part = 1 generate call)`);
  L.push(`Gaya: ${archetype ? archetype.label : labelOf(VISUAL_STYLES, s1.visualStyle)} — Tone: ${labelOf(TONES, s1.tone)}`);
  if (regInstr) L.push(`Gaya bahasa dialog: ${regInstr}`);
  L.push('');

  parts.forEach((p, pi) => {
    const namaFoto = partRefImageNames(p, s3.useCharacter, s3.character, nameMap);
    const kuotaWarn = namaFoto.length > MAX_REF_IMAGES_PER_PART
      ? ` ⚠ MELEBIHI KUOTA ${MAX_REF_IMAGES_PER_PART} foto per Part — kurangi jumlah foto referensi.`
      : '';
    const kamera = archetype
      ? compileCameraChoreography(archetype.cameraGrammar, p.role, p.durationSec, pi, s1.aiTool, true)
      : 'steady cinematic frame with subtle natural motion';
    const ls = getLipsync(p.voDurationSec);

    L.push(`## PART ${pi + 1} — ${p.role}${p.label ? `: ${p.label}` : ''} (${p.durationSec} detik, VO ${p.voDurationSec} detik)`);
    if (p.rationale) L.push(`Rationale AI: ${p.rationale}`);
    L.push('');
    L.push('LAMPIRKAN SEBAGAI REFERENCE IMAGE:');
    namaFoto.forEach((f, i) => L.push(`${i + 1}. ${f}`));
    if (kuotaWarn) L.push(kuotaWarn);
    L.push('');

    L.push('VISUAL (per cut):');
    p.cuts.forEach((cut, ci) => {
      const hint = PHOTO_LABEL_HINT[cut.label] ?? 'elemen visual properti yang relevan';
      const fileName = photoFileName(cut.photoId, cut.label, nameMap);
      const subjek = s3.useCharacter && charDesc
        ? `${charDesc} sudah berada di ${cut.label} (${hint}, ref: ${fileName})`
        : `Fokus pada ${cut.label} (${hint}, ref: ${fileName}), tanpa presenter di layar`;
      L.push(`  Cut ${ci + 1} (${cut.durasiDetik}s) — ${subjek}.${cut.aksi ? ` Aksi: ${cut.aksi}.` : ''}`);
    });
    L.push('');
    L.push(`FRAMING: ${kamera}.`);
    if (p.role === 'Hook') L.push(`  Opening style: ${labelOf(HOOK_TYPES, s1.hookType)}.`);
    if (p.role === 'CTA') L.push(`  Closing/CTA style: ${labelOf(CTA_TYPES, s1.ctaType)}${s1.ctaType === 'comment_keyword' && s1.ctaKeyword ? ` (keyword: "${s1.ctaKeyword}")` : ''}.`);
    L.push('');
    L.push(`TEXT OVERLAY: [isi teks on-screen untuk Part ini, ditambahkan editor — bukan dibakar AI].`);
    L.push('');
    L.push(`VOICEOVER (${p.voDurationSec} detik, maks ${ls.maxWords} kata, pace "${ls.pace}"${regInstr ? ', ' + regInstr : ''}): [isi naskah Part ini sesuai peran ${p.role}].`);
    if (nativeAudio) {
      L.push(`  Tool ini audio-native — tanam narasi ini VERBATIM di dalam teks prompt video (lihat BLOK 3c Prompt JSON) agar terucap dengan lip-sync, JANGAN taruh di field terpisah saja.`);
    }
    L.push('');
    L.push(`MUSIK: mood musik konsisten 1 tema, ber-eskalasi menuju CTA.`);
    L.push('');
    L.push(`TRANSISI KELUAR: ${pi === parts.length - 1 ? 'loop-bait — sambungkan visual ke frame pembuka PART 1 (Hook) agar autoplay loop terasa mulus.' : 'transisi eksplisit (hard cut / zoom punch / whip pan / dissolve) + audio cue ke PART berikutnya.'}`);
    L.push('');
    L.push('```');
    let visual = s3.useCharacter && charDesc
      ? `${charDesc} across ${p.cuts.length} cut(s) at this property: ${p.cuts.map(c => c.label).join(', ')}. Camera: ${kamera}.`
      : `A sequence covering ${p.cuts.map(c => c.label).join(', ')} is shown, no presenter on screen. Camera: ${kamera}.`;
    if (p.role === 'Hook') visual += ` Opening style: ${labelOf(HOOK_TYPES, s1.hookType)}.`;
    if (p.role === 'CTA') visual += ` Closing/CTA style: ${labelOf(CTA_TYPES, s1.ctaType)}.`;
    L.push(visual);
    L.push('');
    L.push(`Style: ${labelOf(VISUAL_STYLES, s1.visualStyle)}, ${labelOf(TONES, s1.tone).toLowerCase()} mood, vertical framing, visual grounded accurately in the attached reference photos.`);
    L.push('```');
    L.push('');
  });

  L.push('## CATATAN PRODUKSI');
  L.push(`- Budget VO: ${prodNotes.summaryText}`);
  L.push(`- Loop edit: frame penutup Part terakhir (CTA) sebaiknya "menyambung" secara visual ke frame pembuka Part pertama (Hook), supaya autoplay loop terasa mulus.`);
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
