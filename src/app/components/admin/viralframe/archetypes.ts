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
  selfie_hold:     'handheld selfie-stick shot, arm-extended, subject facing the lens with natural micro-shake',
  selfie_walk:     'handheld selfie walk-and-talk, arm-extended, subject leads the camera through the space',
};

const SPEED_PHRASE: Record<CameraSpeed, string> = {
  slow: 'slow', medium: 'steady', fast: 'fast',
};

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
 */
export function compileCameraChoreography(
  grammar: CameraBeat[], role: 'Hook' | 'Body' | 'CTA', durationSec: number, sceneIndex: number,
  toolId?: string,
): string {
  const dialect: ToolDialect = (toolId && TOOL_DIALECT[toolId]) || 'cinematic';

  if (!grammar || grammar.length === 0) {
    return dialect === 'structured' ? '[camera: static]' : 'steady locked frame with subtle motion';
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

  return assembleDialect(dialect, picked);
}

// Rakit beat menjadi string sesuai dialek tool.
function assembleDialect(dialect: ToolDialect, beats: CameraBeat[]): string {
  switch (dialect) {
    case 'structured': {
      // Token ringkas dipisah panah — Kling/Wan/Minimax paham format ini.
      const tokens = beats.map(b => `${MOVE_TOKEN[b.move]} (${b.speed})`);
      return `[camera motion: ${tokens.join(' → ')}]`;
    }
    case 'directive': {
      // Instruksi singkat imperatif — Runway/Luma.
      const parts = beats.map(b => `${SPEED_PHRASE[b.speed]} ${MOVE_PHRASE[b.move]}`);
      return parts.join('; ');
    }
    case 'motion_strength': {
      // Frasa natural + parameter -motion (Pika).
      const parts = beats.map(b => `${MOVE_PHRASE[b.move]}`);
      const strength = speedToMotionStrength(beats.map(b => b.speed));
      return `${parts.join(', then ')} -motion ${strength}`;
    }
    case 'cinematic':
    default: {
      // Natural language kaya dengan motivasi — Veo3/Sora/Flow/CogVideoX.
      const phrases = beats.map(b => `${SPEED_PHRASE[b.speed]} ${MOVE_PHRASE[b.move]} (${b.motivation})`);
      return phrases.join(', then ');
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
export type NarrationPOV = 'agent_to_camera' | 'vlogger_handheld' | 'first_person_pov';

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
  pacing: 'punchy' | 'flowing' | 'relaxed';
  shotGrammarNote: string;         // instruksi diinjeksi ke compiler (BLOK 0)
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
    shotGrammarNote: 'Gaya selfie vlog REALISTIS: kamera dipegang tangan sendiri via tongsis/gimbal (arm-extended selfie framing), presenter mengisi ~40% frame menghadap lensa LANGSUNG sambil berjalan menjelajah properti; ruangan/properti bergerak natural di belakangnya. Ada sedikit goyangan tangan yang wajar agar terasa autentik/UGC — BUKAN sinematik super-mulus. DILARANG menggambarkan tongsis/tangan pemegang di dalam frame — cukup perspektifnya saja. Energi tinggi, hangat, seperti teman yang sedang me-review rumah.',
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
];

export const ARCHETYPE_CUSTOM_ID = 'custom';

export function findArchetype(id: string | undefined | null): VideoArchetype | null {
  if (!id || id === ARCHETYPE_CUSTOM_ID) return null;
  return ARCHETYPES.find(a => a.id === id) ?? null;
}
