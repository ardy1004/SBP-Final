// ViralFrame — Video Archetype & Camera Choreography (Fase 1).
//
// Arketipe = satu "Style DNA" yang membundel arahan kreatif koheren:
// mode presenter (di layar / voiceover / faceless), sudut narasi, default
// visual style + tone + expression, dan tata bahasa kamera (camera grammar).
//
// Tujuan: user cukup memilih SATU arketipe → seluruh dropdown granular Step 1/3
// terisi default yang koheren (tetap bisa di-override). Arketipe lalu diinjeksi
// ke Master Prompt (BLOK 0) beserta koreografi kamera per scene.
//
// Pure data + pure function — tanpa React, aman diimpor compiler & (kelak) backend.

// ─── Camera Choreography ──────────────────────────────────────────────────────

export type CameraMove =
  | 'dolly_in' | 'pull_back' | 'orbit' | 'crane_up' | 'crane_down'
  | 'whip_pan' | 'gimbal_glide' | 'handheld_follow' | 'fpv_flythrough'
  | 'static_locked' | 'tilt_up' | 'slow_push' | 'lateral_track'
  | 'selfie_hold' | 'selfie_walk';

export type CameraSpeed = 'slow' | 'medium' | 'fast';
export type CameraEase = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface CameraBeat {
  move: CameraMove;
  speed: CameraSpeed;
  ease: CameraEase;
  motivation: string; // alasan naratif gerakan (mis. "reveal entrance")
}

// Frasa English per gerakan kamera (dipakai untuk mengompilasi beat → kalimat).
const MOVE_PHRASE: Record<CameraMove, string> = {
  dolly_in:        'dolly-in toward the subject',
  slow_push:       'slow push-in',
  pull_back:       'pull-back reveal',
  orbit:           'orbit arc around the space',
  crane_up:        'crane rising upward',
  crane_down:      'crane descending',
  whip_pan:        'whip-pan transition',
  gimbal_glide:    'smooth gimbal glide forward',
  handheld_follow: 'handheld follow shot',
  fpv_flythrough:  'FPV fly-through connecting the spaces',
  static_locked:   'locked static frame',
  tilt_up:         'tilt-up revealing full height',
  lateral_track:   'lateral tracking shot',
  // ⚠️ Dirumuskan sebagai POSISI KAMERA, bukan alat yang dipegang subjek. Versi lama
  // ("handheld selfie-stick shot") membuat model merender orang yang menenteng
  // tongsis/gimbal — lihat catatan panjang di leadInCamera selfie_luxury_hybrid.
  selfie_hold:     'camera held at arm\'s length facing back at the subject (selfie perspective), subject looks into the lens, natural micro-shake, subject\'s hands empty',
  selfie_walk:     'camera at arm\'s length facing back at the subject (selfie perspective) while they walk through the space, natural micro-shake, subject\'s hands empty',
};

const SPEED_PHRASE: Record<CameraSpeed, string> = {
  slow: 'slow', medium: 'steady', fast: 'fast',
};

/**
 * Frasa PENGGANTI untuk mode reference image (image-to-video seperti Google Flow).
 *
 * KENAPA ADA. Foto referensi hanya memuat apa yang ada di dalam bingkainya. Gerakan
 * yang membawa kamera keluar bingkai — crane naik, orbit mengelilingi bangunan,
 * lateral track melintasi properti, fly-through antar ruang — memaksa AI MENGARANG
 * area yang tidak ada di foto, sehingga hasilnya melenceng dari gambar yang diunggah.
 *
 * Terbukti pada uji nyata 2026-07-28: prompt scene 1 keluar sebagai "slow crane
 * rising upward ... hero-shot orbit arc around the building" dan propertinya tidak
 * konsisten dengan foto. Aturan umum di system prompt sudah melarang gerakan itu,
 * TAPI kalah karena koreografi dikirim sebagai instruksi per-scene ber-label
 * "WAJIB diikuti" — instruksi konkret mengalahkan aturan umum. Karena itu
 * perbaikannya harus di SUMBER frasa, bukan di imbauan.
 *
 * Nuansanya sengaja dipertahankan (tetap lambat/elegan), hanya geometrinya ditahan.
 * Gerakan yang memang sudah aman (push-in, static, selfie, handheld) tidak dipetakan
 * di sini dan tetap memakai MOVE_PHRASE biasa.
 */
const MOVE_PHRASE_FRAMESAFE: Partial<Record<CameraMove, string>> = {
  crane_up:        'slow upward tilt that keeps the same view in frame',
  crane_down:      'slow downward tilt that keeps the same view in frame',
  orbit:           'very slight arc around the subject without leaving the reference framing',
  pull_back:       'gentle pull-back that keeps the same view in frame',
  lateral_track:   'slow lateral drift across the same view, without panning to a new area',
  fpv_flythrough:  'slow forward push deeper into the same view',
  whip_pan:        'quick nudge that settles back on the same view',
  tilt_up:         'small tilt-up within the same view',
  gimbal_glide:    'smooth slow glide toward the same view',
};

/** Penegasan yang ditempel di akhir koreografi saat mode reference image. */
const FRAMESAFE_SUFFIX = 'camera stays within the framing of the reference image';

/**
 * Netralkan kata di `motivation` yang menyeret AI keluar bingkai.
 *
 * Motivation ikut disisipkan verbatim ke prompt, dan terbukti dipakai ulang oleh
 * model: motivation "hero-shot orbit around the scene area" keluar sebagai
 * "hero-shot orbit arc AROUND THE BUILDING" pada uji 2026-07-28 — mengelilingi
 * bangunan berarti menampilkan sisi yang tidak ada di foto.
 *
 * Yang fungsional (mis. "B-ROLL CUTAWAY", "no presenter") sengaja DIPERTAHANKAN;
 * hanya kata sifat berskala megah dan preposisi "around" yang diredam.
 */
function motivasiAmanBingkai(m: string): string {
  return m
    .replace(/\b(grand|majestic|hero-shot|sweeping|epic)\s+/gi, '')
    .replace(/\baround the\b/gi, 'within the');
}

/**
 * Gabungkan kecepatan + frasa tanpa mengulang kata yang sama.
 * `SPEED_PHRASE.slow` + `MOVE_PHRASE.slow_push` ('slow push-in') menghasilkan
 * "slow slow push-in" — cacat lama yang makin terlihat setelah frasa frame-safe
 * juga diawali "slow".
 */
function gabungKecepatan(speed: CameraSpeed, frasa: string): string {
  const kata = SPEED_PHRASE[speed];
  return frasa.toLowerCase().startsWith(`${kata.toLowerCase()} `) ? frasa : `${kata} ${frasa}`;
}

// Token pendek per gerakan — dipakai dialek "structured" (Kling/Wan/Minimax).
const MOVE_TOKEN: Record<CameraMove, string> = {
  dolly_in: 'push-in', slow_push: 'slow push-in', pull_back: 'pull-back',
  orbit: 'orbit', crane_up: 'crane-up', crane_down: 'crane-down',
  whip_pan: 'whip-pan', gimbal_glide: 'gimbal-forward', handheld_follow: 'handheld-follow',
  fpv_flythrough: 'fly-through', static_locked: 'static', tilt_up: 'tilt-up',
  lateral_track: 'track-lateral',
  selfie_hold: 'selfie-arm', selfie_walk: 'selfie-walk',
};

// ─── Dialek kamera per AI video tool ──────────────────────────────────────────
// Tool berbeda merespons frasa kamera berbeda:
//  - cinematic      : natural language kaya (Veo3/Sora/Flow/CogVideoX)
//  - structured     : token ringkas dipisah panah (Kling/Wan/Minimax/Jianying)
//  - directive      : instruksi singkat dipisah ';' (Runway/Luma)
//  - motion_strength: frasa + parameter -motion 1..4 (Pika)
export type ToolDialect = 'cinematic' | 'structured' | 'directive' | 'motion_strength';

const TOOL_DIALECT: Record<string, ToolDialect> = {
  veo3: 'cinematic', sora: 'cinematic', google_flow: 'cinematic', cogvideox: 'cinematic',
  kling: 'structured', wan21: 'structured', minimax: 'structured', jianying: 'structured',
  runway: 'directive', luma: 'directive',
  pika: 'motion_strength',
};

function speedToMotionStrength(speeds: CameraSpeed[]): number {
  // Pika -motion 1..4; ambil beat tercepat sebagai penentu intensitas.
  const max = speeds.reduce((m, s) => Math.max(m, rankSpeed(s)), 1);
  return Math.min(4, max + 1); // slow(1)→2, medium(2)→3, fast(3)→4
}

// Jumlah beat berdasarkan durasi scene — makin panjang, makin kompleks koreografinya.
function beatCountForDuration(durationSec: number): number {
  if (durationSec <= 4) return 1;
  if (durationSec <= 9) return 2;
  return 3;
}

/**
 * Kompilasi koreografi kamera untuk satu scene menjadi kalimat English kaya.
 * Beat dipilih dari cameraGrammar arketipe, disesuaikan peran & durasi scene.
 *
 * @param grammar  camera grammar arketipe (kosong = fallback statis)
 * @param role     'Hook' | 'Body' | 'CTA'
 * @param durationSec durasi scene
 * @param sceneIndex untuk rotasi beat antar Body scene
 * @param toolId    value AI tool (opsional) → memilih dialek frasa kamera
 * @param frameSafe tool memakai foto referensi → gerakan ditahan di dalam bingkai
 *                  (lihat MOVE_PHRASE_FRAMESAFE)
 * @param leadIn    OPSIONAL — arahan kamera BAGIAN 1 untuk arketipe 2-bagian
 *                  (`archetype.leadInCamera`). Lihat catatan di bawah.
 *
 * ─── KENAPA `leadIn` TERPISAH DARI `grammar` (jangan digabung!) ───────────────
 * Arketipe hybrid (agent_broll_hybrid, selfie_luxury_hybrid) membagi tiap Part
 * jadi BAGIAN 1 (presenter: selfie/tongsis atau talking-head) lalu BAGIAN 2
 * (b-roll cutaway). `cameraGrammar` mereka SENGAJA hanya berisi beat B-ROLL,
 * karena rotasi `ordered[(sceneIndex+i) % len]` di bawah bisa menaruh beat mana
 * pun di posisi pertama — kalau beat presenter ikut masuk array, Part tertentu
 * akan mendapat urutan terbalik (b-roll dulu, presenter belakangan) dan
 * bertentangan dengan shotGrammarNote yang menetapkan urutan TETAP.
 *
 * Kekhawatiran itu SAH, tapi solusi lamanya (menghilangkan beat presenter sama
 * sekali) membuat bagian selfie tidak punya arahan kamera konkret — hanya
 * disebut di prosa `shotGrammarNote` yang global. Terbukti 2026-08-02: model
 * mengikuti arahan per-Part yang konkret dan mengabaikan prosa global, sehingga
 * "Vlog Tongsis Mewah" menghasilkan "stands... gesturing" tanpa tongsis.
 *
 * `leadIn` menyelesaikan keduanya: ia SELALU di posisi pertama dan TIDAK PERNAH
 * ikut dirotasi, jadi urutan mustahil terbalik, sekaligus punya bobot konkret
 * yang setara dengan beat b-roll.
 */
export function compileCameraChoreography(
  grammar: CameraBeat[], role: 'Hook' | 'Body' | 'CTA', durationSec: number, sceneIndex: number,
  toolId?: string, frameSafe = false, leadIn?: string,
): string {
  const dialect: ToolDialect = (toolId && TOOL_DIALECT[toolId]) || 'cinematic';

  if (!grammar || grammar.length === 0) {
    const kosong = dialect === 'structured' ? '[camera: static]' : 'steady locked frame with subtle motion';
    return leadIn ? gabungDuaBagian(leadIn, kosong, durationSec) : kosong;
  }
  const nBeats = beatCountForDuration(durationSec);

  // Urutkan prioritas beat sesuai peran scene:
  // Hook → gerakan cepat/pattern-interrupt dulu; CTA → diakhiri pull-back megah.
  const ordered = [...grammar];
  if (role === 'Hook') {
    ordered.sort((a, b) => rankSpeed(b.speed) - rankSpeed(a.speed));
  } else if (role === 'CTA') {
    ordered.sort((a, b) => (isReveal(b.move) ? 1 : 0) - (isReveal(a.move) ? 1 : 0));
  }

  // Ambil nBeats beat, rotasi berdasarkan sceneIndex agar Body scene bervariasi.
  const picked: CameraBeat[] = [];
  for (let i = 0; i < nBeats; i++) {
    picked.push(ordered[(sceneIndex + i) % ordered.length]);
  }

  const brollPart = assembleDialect(dialect, picked, frameSafe);
  return leadIn ? gabungDuaBagian(leadIn, brollPart, durationSec) : brollPart;
}

/**
 * Rakit arahan 2-bagian: BAGIAN 1 (presenter, tetap) → HARD CUT → BAGIAN 2 (b-roll).
 * Titik potong = tengah durasi Part, dibulatkan, minimal 1 detik di tiap bagian
 * supaya tidak pernah menghasilkan rentang "0-0s" pada Part yang sangat pendek.
 */
function gabungDuaBagian(leadIn: string, broll: string, durationSec: number): string {
  const total = Number.isFinite(durationSec) && durationSec > 1 ? Math.round(durationSec) : 2;
  const potong = Math.max(1, Math.min(total - 1, Math.round(total / 2)));
  return `BAGIAN 1 (0-${potong}s): ${leadIn}; HARD CUT; BAGIAN 2 (${potong}-${total}s): ${broll}`;
}

// Rakit beat menjadi string sesuai dialek tool.
function assembleDialect(dialect: ToolDialect, beats: CameraBeat[], frameSafe = false): string {
  // Mode reference image: pakai frasa yang menahan gerakan di dalam bingkai.
  const frasa = (m: CameraMove) => (frameSafe && MOVE_PHRASE_FRAMESAFE[m]) || MOVE_PHRASE[m];
  const tutup = (t: string) => (frameSafe ? `${t}; ${FRAMESAFE_SUFFIX}` : t);
  switch (dialect) {
    case 'structured': {
      // Token ringkas dipisah panah — Kling/Wan/Minimax paham format ini.
      const tokens = beats.map(b => `${MOVE_TOKEN[b.move]} (${b.speed})`);
      return `[camera motion: ${tokens.join(' → ')}${frameSafe ? ', stay within reference framing' : ''}]`;
    }
    case 'directive': {
      // Instruksi singkat imperatif — Runway/Luma.
      const parts = beats.map(b => gabungKecepatan(b.speed, frasa(b.move)));
      return tutup(parts.join('; '));
    }
    case 'motion_strength': {
      // Frasa natural + parameter -motion (Pika).
      const parts = beats.map(b => frasa(b.move));
      const strength = speedToMotionStrength(beats.map(b => b.speed));
      return tutup(`${parts.join(', then ')} -motion ${strength}`);
    }
    case 'cinematic':
    default: {
      // Natural language kaya dengan motivasi — Veo3/Sora/Flow/CogVideoX.
      const phrases = beats.map(b => `${gabungKecepatan(b.speed, frasa(b.move))} (${frameSafe ? motivasiAmanBingkai(b.motivation) : b.motivation})`);
      return tutup(phrases.join(', then '));
    }
  }
}

function rankSpeed(s: CameraSpeed): number {
  return s === 'fast' ? 3 : s === 'medium' ? 2 : 1;
}
function isReveal(m: CameraMove): boolean {
  return m === 'pull_back' || m === 'crane_up' || m === 'tilt_up' || m === 'orbit';
}

// ─── Video Archetype ──────────────────────────────────────────────────────────

export type PresenterMode = 'on_camera' | 'voiceover_only' | 'faceless_broll';
export type NarrationPOV = 'agent_to_camera' | 'vlogger_handheld' | 'first_person_pov' | 'text_driven' | 'client_testimonial';

export interface VideoArchetype {
  id: string;
  label: string;
  emoji: string;
  ringkas: string;                 // deskripsi 1 baris untuk UI
  presenterMode: PresenterMode;
  narrationPOV: NarrationPOV;
  /** Default yang di-prefill ke Step 1/3 saat arketipe dipilih. */
  defaults: {
    visualStyle: string;           // value VISUAL_STYLES
    tone: string;                  // value TONES
    expression: string;            // value EXPRESSIONS
    useCharacter: boolean;         // apakah talent tampil di layar
    register?: string;             // value LANGUAGE_REGISTERS (opsional prefill gaya bahasa)
  };
  cameraGrammar: CameraBeat[];     // vokabuler gerakan kamera signature
  /** Arahan kamera BAGIAN 1 (presenter) untuk arketipe 2-bagian — SELALU di posisi
   * pertama dan TIDAK PERNAH ikut dirotasi `compileCameraChoreography`. Isi HANYA
   * untuk arketipe ber-`allowMultiShotPerScene`; arketipe 1-bagian biarkan kosong.
   * Tanpa ini, bagian presenter cuma hidup di prosa `shotGrammarNote` yang global
   * dan kalah oleh arahan per-Part yang konkret (insiden "tongsis hilang" 2026-08-02). */
  leadInCamera?: string;
  pacing: 'punchy' | 'flowing' | 'relaxed';
  shotGrammarNote: string;         // instruksi diinjeksi ke compiler (BLOK 0)
  /** Arketipe yang butuh 2 shot berbeda dalam 1 scene (mis. A-roll/B-roll cutaway).
   * Default false — jalur ai-generate.js (mode "AI Generate") secara default
   * MELARANG lebih dari 1 shot per scene ("SATU shot utuh"); flag ini memberi
   * sinyal ke backend untuk merelaksasi aturan itu khusus arketipe ini. */
  allowMultiShotPerScene?: boolean;
}

export const ARCHETYPES: VideoArchetype[] = [
  {
    id: 'pro_agent',
    label: 'Agen Properti Profesional',
    emoji: '👔',
    ringkas: 'Agen tampil rapi menghadap kamera, berwibawa & meyakinkan.',
    presenterMode: 'on_camera',
    narrationPOV: 'agent_to_camera',
    defaults: { visualStyle: 'modern_sleek', tone: 'professional_formal', expression: 'confident_auth', useCharacter: true, register: 'formal' },
    cameraGrammar: [
      { move: 'dolly_in',      speed: 'slow',   ease: 'ease-out', motivation: 'establish authority at entrance' },
      { move: 'static_locked', speed: 'slow',   ease: 'linear',   motivation: 'agent addresses camera directly' },
      { move: 'lateral_track', speed: 'slow',   ease: 'ease-in-out', motivation: 'showcase a key room while narrating' },
      { move: 'pull_back',     speed: 'medium', ease: 'ease-out', motivation: 'reveal full space for the close' },
    ],
    pacing: 'flowing',
    shotGrammarNote: 'Agen properti profesional berpakaian rapi (business attire) tampil di layar, menghadap kamera dengan gestur terkontrol dan bahasa tubuh berwibawa. Selipkan b-roll interior mulus di antara pernyataan. Framing stabil, komposisi rapi, kesan terpercaya.',
  },
  {
    id: 'vlogger',
    label: 'Vlogger Properti (Handheld)',
    emoji: '🎥',
    ringkas: 'Energi tinggi, handheld natural, walk-and-talk seperti vlog.',
    presenterMode: 'on_camera',
    narrationPOV: 'vlogger_handheld',
    defaults: { visualStyle: 'vlog_handheld', tone: 'friendly_casual', expression: 'excited_joyful', useCharacter: true, register: 'santai' },
    cameraGrammar: [
      { move: 'handheld_follow', speed: 'medium', ease: 'linear',  motivation: 'walk-and-talk energy through the space' },
      { move: 'whip_pan',        speed: 'fast',   ease: 'ease-in',  motivation: 'punchy reveal of the next room' },
      { move: 'gimbal_glide',    speed: 'medium', ease: 'ease-out', motivation: 'smooth glide into a highlight' },
      { move: 'slow_push',       speed: 'fast',   ease: 'ease-in',  motivation: 'emphasis on a wow detail' },
    ],
    pacing: 'punchy',
    shotGrammarNote: 'Gaya vlog: kamera handheld dengan micro-shake natural, energi tinggi, host antusias sering menyapa kamera (selfie-angle) sambil berjalan menjelajah properti. Transisi cepat & fun, kesan autentik/UGC, bukan korporat kaku.',
  },
  {
    id: 'selfie_vlog',
    label: 'Selfie Vlog (Tongsis)',
    emoji: '🤳',
    ringkas: 'Agen selfie pakai tongsis/gimbal, walk-and-talk, terasa nyata & akrab.',
    presenterMode: 'on_camera',
    narrationPOV: 'vlogger_handheld',
    defaults: { visualStyle: 'ugc_authentic', tone: 'friendly_casual', expression: 'excited_joyful', useCharacter: true, register: 'gaul' },
    cameraGrammar: [
      { move: 'selfie_hold', speed: 'medium', ease: 'linear',  motivation: 'presenter greets viewer selfie-style' },
      { move: 'selfie_walk', speed: 'medium', ease: 'linear',  motivation: 'walk-and-talk revealing the space behind' },
      { move: 'whip_pan',    speed: 'fast',   ease: 'ease-in', motivation: 'flip the camera to reveal a highlight' },
    ],
    pacing: 'punchy',
    shotGrammarNote: 'Gaya selfie vlog REALISTIS: POSISI KAMERA berada sejauh lengan di depan presenter dan sedikit menunduk ke wajahnya (perspektif selfie), presenter mengisi ~40% frame menghadap lensa LANGSUNG sambil berjalan menjelajah properti; ruangan/properti bergerak natural di belakangnya. Ada sedikit goyangan tangan yang wajar agar terasa autentik/UGC — BUKAN sinematik super-mulus. ⚠️ TANGAN PRESENTER KOSONG dan bergerak natural saat bicara: ia TIDAK memegang/mengoperasikan kamera, HP, gimbal, tripod, atau tongsis, dan perangkat semacam itu TIDAK BOLEH terlihat di frame. Tulis sebagai POSISI KAMERA ("camera at arm\'s length, selfie perspective"), JANGAN sebagai aksi subjek ("holding a camera") — frasa terakhir membuat model menggambarkan orang yang menenteng perangkat. Energi tinggi, hangat, seperti teman yang sedang me-review rumah.',
  },
  {
    id: 'pov_walkthrough',
    label: 'POV Walkthrough + Voiceover',
    emoji: '🚶',
    ringkas: 'Sudut mata orang pertama, gimbal super-mulus, dituntun voiceover.',
    presenterMode: 'voiceover_only',
    narrationPOV: 'first_person_pov',
    defaults: { visualStyle: 'cinematic_film', tone: 'calm_soothing', expression: 'auto', useCharacter: false },
    cameraGrammar: [
      { move: 'gimbal_glide',   speed: 'slow',   ease: 'ease-out',   motivation: 'immersive first-person entry' },
      { move: 'fpv_flythrough', speed: 'medium', ease: 'linear',     motivation: 'seamlessly connect adjacent spaces' },
      { move: 'tilt_up',        speed: 'slow',   ease: 'ease-in-out', motivation: 'reveal ceiling height / vertical grandeur' },
      { move: 'orbit',          speed: 'slow',   ease: 'ease-in-out', motivation: 'showcase a centerpiece area' },
    ],
    pacing: 'relaxed',
    shotGrammarNote: 'POV orang pertama TANPA talent di layar — penonton seolah berjalan sendiri menyusuri properti. Gerakan gimbal super-halus & sinematik, transisi antar ruang mengalir tanpa potongan kasar. Narasi HANYA voiceover yang menuntun perhatian; jangan pernah deskripsikan orang tampil di frame.',
  },
  {
    id: 'cinematic_broll',
    label: 'Sinematik B-Roll (Faceless)',
    emoji: '🎬',
    ringkas: 'Faceless, sinematik mewah, fokus keindahan properti + VO.',
    presenterMode: 'faceless_broll',
    narrationPOV: 'first_person_pov',
    defaults: { visualStyle: 'luxury_premium', tone: 'luxurious_exclusive', expression: 'auto', useCharacter: false },
    cameraGrammar: [
      { move: 'crane_up',      speed: 'slow',   ease: 'ease-out',    motivation: 'grand establishing reveal' },
      { move: 'slow_push',     speed: 'slow',   ease: 'ease-in-out', motivation: 'linger on a luxury detail' },
      { move: 'orbit',         speed: 'slow',   ease: 'ease-in-out', motivation: 'hero shot of a signature space' },
      { move: 'pull_back',     speed: 'medium', ease: 'ease-out',    motivation: 'majestic closing reveal' },
    ],
    pacing: 'relaxed',
    shotGrammarNote: 'Sinematik mewah tanpa talent: rangkaian b-roll estetik dengan color grade premium, depth of field dangkal, komposisi terkurasi. Setiap shot terasa seperti iklan properti high-end. Narasi voiceover eksklusif, tempo tenang & aspiratif.',
  },
  {
    id: 'agent_broll_hybrid',
    label: 'Agen + Cutaway B-Roll (Hybrid)',
    emoji: '✂️',
    ringkas: 'Agen bicara ke kamera, disela cutaway full b-roll properti di SETIAP scene.',
    presenterMode: 'on_camera',
    narrationPOV: 'agent_to_camera',
    defaults: { visualStyle: 'modern_sleek', tone: 'professional_formal', expression: 'confident_auth', useCharacter: true, register: 'formal' },
    // Semua beat di sini HANYA merepresentasikan gerakan kamera untuk bagian
    // B-ROLL CUTAWAY (bagian kedua tiap scene). Desain ini SENGAJA menghindari pola
    // A/B bergantian dalam array (mis. [A,B,A,B]) karena rotasi
    // compileCameraChoreography (ordered[(sceneIndex+i)%len]) bisa mengubah beat
    // pertama yang terpilih tergantung sceneIndex — kalau sebagian beat berlabel
    // "A-ROLL" dan sebagian "B-ROLL", scene tertentu bisa kebagian urutan terbalik
    // (B dulu baru A) dan bertentangan dengan shotGrammarNote yang menetapkan
    // urutan TETAP (A-roll selalu duluan).
    //
    // KOREKSI 2026-08-02: dulu bagian A-ROLL tidak direpresentasikan SAMA SEKALI,
    // dengan alasan "selalu static/steady jadi tidak perlu". Itu keliru — akibatnya
    // bagian presenter hanya hidup di prosa shotGrammarNote yang global, dan model
    // mengabaikannya karena kalah konkret dari arahan kamera per-Part. Sekarang
    // bagian A-ROLL ada di `leadInCamera` di bawah: SELALU posisi pertama, TIDAK
    // PERNAH ikut dirotasi — jadi kekhawatiran urutan-terbalik di atas tetap
    // teratasi tanpa mengorbankan kejelasan bagian presenter.
    cameraGrammar: [
      { move: 'slow_push',     speed: 'slow',   ease: 'ease-in-out', motivation: 'B-ROLL CUTAWAY: aesthetic push-in on the scene area, no presenter' },
      { move: 'orbit',         speed: 'slow',   ease: 'ease-in-out', motivation: 'B-ROLL CUTAWAY: aesthetic orbit around the scene area, no presenter' },
      { move: 'pull_back',     speed: 'medium', ease: 'ease-out',    motivation: 'B-ROLL CUTAWAY: aesthetic pull-back reveal of the scene area, no presenter' },
      { move: 'lateral_track', speed: 'slow',   ease: 'ease-in-out', motivation: 'B-ROLL CUTAWAY: aesthetic lateral track across the scene area, no presenter' },
    ],
    leadInCamera: 'A-ROLL TALKING HEAD: steady near-static medium shot, presenter speaks straight to camera and fills roughly one third of the frame, the area from the reference image clearly visible behind, only subtle natural breathing motion',
    pacing: 'flowing',
    allowMultiShotPerScene: true,
    shotGrammarNote: 'SETIAP scene WAJIB dibagi 2 bagian VISUAL berurutan dengan durasi kurang-lebih sama: BAGIAN 1 = A-ROLL/TALKING HEAD — agen tampil menghadap kamera dengan framing static/steady, latar belakang sesuai area foto referensi scene ini (bagian ini SELALU tampil lebih dulu, tidak pernah dibalik). BAGIAN 2 = B-ROLL CUTAWAY — potongan VISUAL (hard cut, BUKAN gerakan kamera menerus dari bagian 1) ke rekaman PENUH area yang sama TANPA agen tampil DI FRAME, dengan gerakan kamera sinematik/estetik sesuai KOREOGRAFI KAMERA PER SCENE di bawah (koreografi itu KHUSUS untuk Bagian 2 — Bagian 1 tidak perlu gerakan kamera, cukup frame diam). PENTING — AUDIO TIDAK IKUT TERPOTONG: narasi/suara agen (script_narration/dialog_karakter) mengalir TERUS-MENERUS tanpa jeda melintasi kedua bagian visual tersebut (agen tetap TERDENGAR bicara selama cutaway berlangsung, seperti VO yang menjembatani potongan gambar) — HANYA gambarnya yang cut ke b-roll, suaranya TIDAK berhenti. Word count narasi TETAP mengikuti budget durasi PENUH scene ini (jangan dipotong setengah). Pola talking-head→cutaway-VISUAL INI WAJIB berulang di SETIAP scene tanpa kecuali, bukan cuma sebagian. Tuliskan pembagian dua bagian VISUAL ini secara eksplisit di dalam teks prompt video tiap scene (mis. "first half: ...; hard cut to (visual only, audio continues); second half: ..."), sementara narasi/dialog tetap satu kesatuan utuh untuk keseluruhan durasi scene.',
  },
  {
    id: 'selfie_luxury_hybrid',
    label: 'Vlog Tongsis Mewah (Selfie + Cutaway Elegan)',
    emoji: '💎',
    ringkas: 'Agen selfie tongsis/gimbal, disela cutaway b-roll properti dengan gerakan kamera elegan/mewah.',
    presenterMode: 'on_camera',
    narrationPOV: 'vlogger_handheld',
    defaults: { visualStyle: 'luxury_premium', tone: 'luxurious_exclusive', expression: 'confident_auth', useCharacter: true, register: 'santai' },
    // Sama seperti agent_broll_hybrid: seluruh beat di sini HANYA untuk bagian
    // B-ROLL CUTAWAY (bagian kedua tiap scene) — bagian selfie/tongsis (bagian
    // pertama) tidak direpresentasikan di sini agar rotasi compileCameraChoreography
    // tidak pernah membalik urutan tekstual yang mengikat (lihat catatan panjang
    // di agent_broll_hybrid). Beda dari agent_broll_hybrid: gerakan di sini SENGAJA
    // lambat & megah (crane/orbit/slow push), bukan whip-pan energik ala vlog biasa —
    // mencerminkan kesan mewah/mahal yang diminta, bukan energi UGC/vlog kasual.
    cameraGrammar: [
      { move: 'crane_up',      speed: 'slow',   ease: 'ease-out',    motivation: 'B-ROLL CUTAWAY: grand elegant reveal of the scene area, no presenter' },
      { move: 'slow_push',     speed: 'slow',   ease: 'ease-in-out', motivation: 'B-ROLL CUTAWAY: luxurious lingering push-in on the scene area, no presenter' },
      { move: 'orbit',         speed: 'slow',   ease: 'ease-in-out', motivation: 'B-ROLL CUTAWAY: hero-shot orbit around the scene area, no presenter' },
      { move: 'pull_back',     speed: 'slow',   ease: 'ease-out',    motivation: 'B-ROLL CUTAWAY: majestic pull-back reveal of the scene area, no presenter' },
    ],
    // Frasa "selfie-stick" WAJIB eksplisit di sini — inilah satu-satunya arahan
    // KONKRET per-Part yang membuat model benar-benar merender gaya vlogger
    // bertongsis. Tetap patuh larangan lama di shotGrammarNote: perspektifnya saja,
    // tongsis/tangan pemegang JANGAN digambarkan di dalam frame.
    // ⚠️ DITULIS SEBAGAI POSISI KAMERA, BUKAN AKSI SUBJEK (koreksi 2026-08-02).
    // Versi sebelumnya berbunyi "presenter holds the camera at arm's length" —
    // itu menyuruh model MENGGAMBARKAN orang yang sedang memegang kamera, dan
    // hasilnya persis begitu: talent tampak menenteng perangkat (diperparah karena
    // foto referensi talent memang memegang GoPro+tongsis, sehingga dua alat muncul
    // di dua tangan). Larangan yang dulu ditaruh dalam kurung ikut hilang saat AI
    // memparafrase. Framing selfie adalah properti POSISI KAMERA; tangan talent
    // harus BEBAS. Jangan tulis ulang jadi kalimat beraksi "memegang kamera".
    leadInCamera: 'SELFIE PERSPECTIVE: the camera itself is positioned at arm\'s length in front of the presenter and angled slightly downward toward her face, as if she were filming herself; she looks straight into the lens while talking and fills roughly 40% of the frame, with the area from the reference image visible behind her; natural handheld micro-jitter. Her hands are EMPTY and gesture naturally as she speaks — she is NOT holding or operating any camera, phone, gimbal, tripod or stick, and no such equipment is visible anywhere in frame',
    pacing: 'relaxed',
    allowMultiShotPerScene: true,
    shotGrammarNote: 'SETIAP scene WAJIB dibagi 2 bagian VISUAL berurutan dengan durasi kurang-lebih sama: BAGIAN 1 = PERSPEKTIF SELFIE — POSISI KAMERA sejauh lengan di depan agen dan sedikit menunduk ke wajahnya (seolah ia merekam dirinya sendiri), agen menghadap lensa langsung sambil bicara dengan energi vlog yang hangat dan personal, latar belakang sesuai area foto referensi scene ini (bagian ini SELALU tampil lebih dulu, tidak pernah dibalik). ⚠️ TANGAN AGEN KOSONG dan bergerak natural — ia TIDAK memegang kamera/HP/gimbal/tripod/tongsis dan perangkat semacam itu TIDAK BOLEH terlihat di frame. Tulis sebagai posisi kamera, JANGAN sebagai aksi "holding a camera". BAGIAN 2 = B-ROLL CUTAWAY MEWAH — potongan VISUAL (hard cut, BUKAN gerakan kamera menerus dari bagian 1) ke rekaman PENUH area yang sama TANPA agen tampil DI FRAME, dengan gerakan kamera LAMBAT, ELEGAN, dan MEGAH (crane/orbit/slow push — BUKAN whip-pan atau gerakan cepat ala vlog) sesuai KOREOGRAFI KAMERA PER SCENE di bawah — kesan yang diinginkan adalah properti terlihat mewah/eksklusif/mahal, seperti cuplikan iklan properti high-end, kontras dengan energi santai di Bagian 1. PENTING — AUDIO TIDAK IKUT TERPOTONG: narasi/suara agen (script_narration/dialog_karakter) mengalir TERUS-MENERUS tanpa jeda melintasi kedua bagian visual tersebut (agen tetap TERDENGAR bicara selama cutaway berlangsung) — HANYA gambarnya yang cut ke b-roll, suaranya TIDAK berhenti. Word count narasi TETAP mengikuti budget durasi PENUH scene ini. Pola selfie→cutaway-mewah INI WAJIB berulang di SETIAP scene tanpa kecuali. Tuliskan pembagian dua bagian VISUAL ini secara eksplisit di dalam teks prompt video tiap scene (mis. "first half: camera at arm\'s length in selfie perspective, presenter faces the lens, her hands empty and gesturing ...; hard cut to; second half: slow elegant crane/orbit b-roll ..."), sementara narasi/dialog tetap satu kesatuan utuh untuk keseluruhan durasi scene.',
  },
  {
    id: 'kinetic_typography',
    label: 'Kinetic Typography (Teks Dinamis)',
    emoji: '🔤',
    ringkas: 'Faceless, teks animasi bold kata-per-kata tersinkron VO — didesain buat ditonton TANPA suara.',
    presenterMode: 'faceless_broll',
    narrationPOV: 'text_driven',
    defaults: { visualStyle: 'minimalist_clean', tone: 'informative_educational', expression: 'auto', useCharacter: false },
    cameraGrammar: [
      { move: 'slow_push',     speed: 'slow',   ease: 'ease-in-out', motivation: 'steady backdrop movement, leaves room for bold on-screen text' },
      { move: 'static_locked', speed: 'slow',   ease: 'linear',      motivation: 'locked frame so kinetic text stays fully legible' },
      { move: 'tilt_up',       speed: 'slow',   ease: 'ease-in-out', motivation: 'gentle reveal without competing with text overlay' },
      { move: 'lateral_track', speed: 'slow',   ease: 'ease-in-out', motivation: 'subtle lateral motion, text remains the visual anchor' },
    ],
    pacing: 'punchy',
    shotGrammarNote: 'Faceless total — footage properti HANYA jadi latar visual, bukan fokus utama. Fokus utama adalah TEKS ON-SCREEN bergaya kinetic typography: setiap on_screen_text WAJIB ditulis sebagai potongan kalimat pendek yang tampil kata-per-kata atau frasa-per-frasa dengan animasi bold (pop-in/scale/highlight warna), tersinkron KETAT dengan timing script_narration — bukan satu baris subtitle statis. Video ini didesain untuk ditonton TANPA suara (mayoritas viewer FYP/Reels scroll tanpa audio aktif): pesan inti HARUS tetap tersampaikan penuh hanya lewat teks, VO adalah pendukung bukan satu-satunya jalur informasi. CATATAN TEMPO/PACING "punchy" DI ATAS MERUJUK PADA RITME PERGANTIAN SCENE (scene singkat & cepat berganti), BUKAN kecepatan gerakan kamera DI DALAM satu shot — gerakan kamera DI DALAM tiap scene WAJIB tetap MINIMAL dan stabil (lihat KOREOGRAFI KAMERA) supaya tidak mengganggu keterbacaan teks; jangan pernah gerakan kamera cepat/whip-pan di dalam satu scene meskipun ritme antar-scene-nya cepat. Kontras warna tinggi antara teks dan footage (drop shadow/outline/background block) WAJIB disebutkan di ai_ready_prompt agar teks tetap terbaca di footage apa pun.',
  },
  {
    id: 'client_testimonial',
    label: 'Testimoni Klien (Bukan Agen)',
    emoji: '🙋',
    ringkas: 'Penghuni/pembeli asli cerita pengalaman — bukan agen jualan, trust lebih tinggi.',
    presenterMode: 'on_camera',
    narrationPOV: 'client_testimonial',
    defaults: { visualStyle: 'ugc_authentic', tone: 'storytelling_emotional', expression: 'warm_friendly', useCharacter: true, register: 'santai' },
    cameraGrammar: [
      { move: 'static_locked', speed: 'slow',   ease: 'linear',      motivation: 'intimate interview-style framing, client speaks candidly' },
      { move: 'slow_push',     speed: 'slow',   ease: 'ease-in-out', motivation: 'gentle push-in during an emotional/key statement' },
      { move: 'lateral_track', speed: 'slow',   ease: 'ease-in-out', motivation: 'cutaway b-roll of the property while testimonial voice continues over it' },
      { move: 'pull_back',     speed: 'medium', ease: 'ease-out',    motivation: 'closing reveal returning to the client in the space they just described' },
    ],
    pacing: 'relaxed',
    shotGrammarNote: 'Presenter BUKAN agen properti — dia adalah penghuni/pembeli/penyewa ASLI yang menceritakan pengalaman nyatanya tinggal atau membeli properti ini, gaya bicara natural/tidak scripted seperti wawancara santai (BUKAN nada jualan/sales pitch). Framing interview-style (duduk santai atau berdiri natural di properti), kontak mata hangat ke kamera. Boleh ada cutaway singkat ke b-roll properti SAMBIL narasi testimoni tetap berlanjut sebagai voice-over yang menjembatani (bukan hard-cut senyap seperti gaya agen) — penonton tetap dengar cerita klien selama cutaway berlangsung. Hindari klaim USP yang terdengar seperti copywriting; gunakan bahasa personal ("saya", "keluarga saya", pengalaman konkret) agar terasa otentik dan credible, bukan seperti iklan.',
  },
];

export const ARCHETYPE_CUSTOM_ID = 'custom';

export function findArchetype(id: string | undefined | null): VideoArchetype | null {
  if (!id || id === ARCHETYPE_CUSTOM_ID) return null;
  return ARCHETYPES.find(a => a.id === id) ?? null;
}
