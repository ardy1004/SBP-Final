// Validator JSON Scene hasil AI eksternal — ViralFrame Fase V4b.
// NON-BLOCKING: hanya JSON invalid (Step A) & field wajib hilang (Step B) = hard error.
// Sisanya (jumlah scene, field scene kosong, word_count, char limit) = warning saja.

import { AI_TOOLS, getLipsync, isNativeAudioTool, getClipMaxSec } from './options';

/**
 * Prompt terstruktur untuk tool ber-audio native (Veo 3.x / Google Flow).
 * `dialogue.line` adalah jalur audio native — tanpa itu videonya bisu.
 */
export interface VeoPrompt {
  shot?: string;
  subject?: string;
  action?: string;
  scene?: string;
  camera_movement?: string;
  lighting?: string;
  mood?: string;
  style?: string;
  dialogue?: { speaker?: string; language?: string; line?: string; voice?: string; delivery?: string };
  audio?: string;
  /** Beat bertimecode opsional (Fase 6, riset resmi Veo 3.1) — environment/foto SAMA di
   * semua elemen, hanya aksi/kamera yang berubah per timecode. Wajib untuk scene > 6 detik
   * (lihat BLOK 3e masterPromptCompiler.ts), opsional/1-elemen untuk scene lain. */
  sequences?: { sequence?: number; timestamp?: string; action?: string; audio?: string }[];
  negative_prompt?: string;
  duration_sec?: number;
  aspect_ratio?: string;
  [k: string]: unknown;
}

export interface ParsedScene {
  scene_number?: number;
  /** Part naratif opsional (Fase 6) — hanya ada bila Master Prompt dikompilasi dengan `parts`. */
  part_number?: number;
  role?: string;
  duration_sec?: number;
  photo_reference_label?: string;
  script_narration?: string;
  word_count?: number;
  /**
   * String untuk tool biasa; OBJEK untuk tool ber-audio native (Veo/Flow).
   * Bentuk string tetap diterima pada tool Veo demi riwayat generation lama
   * yang tersimpan di `viralframe_generations` sebelum Tahap 2.
   */
  ai_ready_prompt?: string | VeoPrompt;
  /** Bentuk lama Tahap 1 (top-level). Pada skema objek ia pindah ke dalam ai_ready_prompt. */
  negative_prompt?: string;
  on_screen_text?: string;
  transition_to_next?: string;
}

/** Objek prompt Veo, atau null bila scene ini masih memakai bentuk string. */
export function asVeoPrompt(p: ParsedScene['ai_ready_prompt']): VeoPrompt | null {
  return p != null && typeof p === 'object' && !Array.isArray(p) ? (p as VeoPrompt) : null;
}

/**
 * Teks yang benar-benar ditempel user ke tool video. Objek di-serialize apa adanya —
 * Veo/Flow menerima prompt berformat JSON sebagai teks, dan justru lebih patuh
 * dibanding paragraf bebas.
 */
export function promptToText(p: ParsedScene['ai_ready_prompt']): string {
  if (p == null) return '';
  return typeof p === 'string' ? p : JSON.stringify(p, null, 2);
}
export interface ParsedJSON {
  video_metadata?: Record<string, unknown>;
  global_style?: Record<string, unknown>;
  character_sheet?: Record<string, unknown>;
  scenes?: ParsedScene[];
  production_notes?: {
    caption?: string;
    hashtags?: string[];
    thumbnail_concept?: string;
    posting_time_suggestion?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface SceneAssignLite { photoId: number | null; label: string }
export interface ValidateExpected {
  sceneCount: number;
  aiTool: string;
  scenes: SceneAssignLite[];
  /** durasi per scene (detik) — untuk cek word_count vs lipsync */
  durations: number[];
}

export interface ValidateResult {
  ok: boolean;
  data: ParsedJSON | null;
  errors: string[];
  warnings: string[];
}

const REQUIRED_TOP = ['video_metadata', 'global_style', 'character_sheet', 'scenes', 'production_notes'] as const;

export function validateSceneJson(raw: string, expected: ValidateExpected): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Step A — parse (langsung, lalu auto-strip { … } bila gagal) ──
  let parsed: ParsedJSON | null = null;
  const tryParse = (s: string): ParsedJSON | null => {
    try { return JSON.parse(s) as ParsedJSON; } catch { return null; }
  };
  parsed = tryParse(raw);
  if (!parsed) {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      parsed = tryParse(raw.slice(first, last + 1));
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false, data: null,
      errors: ['JSON tidak valid. Pastikan AI eksternal hanya mengeluarkan JSON tanpa teks tambahan.'],
      warnings,
    };
  }

  // ── Step B — field wajib top-level ──
  for (const key of REQUIRED_TOP) {
    if (!(key in parsed) || parsed[key] == null) {
      errors.push(`Field wajib "${key}" tidak ditemukan di JSON.`);
    }
  }
  if (!Array.isArray(parsed.scenes)) {
    errors.push('Field "scenes" harus berupa array.');
  }
  // Hard error → stop, jangan lanjut cek scene.
  if (errors.length > 0) {
    return { ok: false, data: null, errors, warnings };
  }

  const scenes = parsed.scenes ?? [];

  // ── Step C — jumlah scene (warning) ──
  if (scenes.length !== expected.sceneCount) {
    warnings.push(`Jumlah scene tidak sesuai. Diharapkan ${expected.sceneCount}, dapat ${scenes.length}.`);
  }

  const charLimit = AI_TOOLS.find(t => t.value === expected.aiTool)?.charLimit ?? 1000;
  const nativeAudio = isNativeAudioTool(expected.aiTool);
  const clipMax = getClipMaxSec(expected.aiTool);

  scenes.forEach((sc, i) => {
    // Pakai scene_number kalau ada & valid (1..sceneCount) untuk mengambil durasi yang
    // BENAR — sebelumnya selalu dari posisi array (i+1), jadi scene yang di-skip/reorder
    // AI (lihat warning Step C bila jumlah scene tak sesuai) membuat SEMUA cek word-count
    // & lipsync sesudahnya salah sasaran (audit 2026-07-28).
    const declared = Number(sc.scene_number);
    const n = Number.isInteger(declared) && declared >= 1 && declared <= expected.sceneCount ? declared : i + 1;
    // ── Step D — field scene tidak kosong (warning) ──
    if (!sc.script_narration?.toString().trim()) warnings.push(`Scene ${n}: script_narration kosong.`);
    if (!promptToText(sc.ai_ready_prompt).trim()) warnings.push(`Scene ${n}: ai_ready_prompt kosong.`);
    if (!sc.photo_reference_label?.toString().trim()) warnings.push(`Scene ${n}: photo_reference_label kosong.`);
    if (!sc.transition_to_next?.toString().trim()) warnings.push(`Scene ${n}: transition_to_next kosong.`);

    // ── Step E — word_count vs lipsync (toleransi +10%) ──
    const durasi = expected.durations[n - 1] ?? expected.durations[0] ?? 6;
    const maxWords = getLipsync(durasi).maxWords;
    const wc = Number(sc.word_count) || (sc.script_narration ? sc.script_narration.trim().split(/\s+/).length : 0);
    if (wc > Math.ceil(maxWords * 1.1)) {
      warnings.push(`Scene ${n}: word_count ${wc} melebihi target ${maxWords} kata (durasi ${durasi}s).`);
    }

    // ── Step F — panjang ai_ready_prompt vs char limit (warning) ──
    const prompt = promptToText(sc.ai_ready_prompt);
    const promptLen = prompt.length;
    if (promptLen > charLimit) {
      warnings.push(`Scene ${n}: ai_ready_prompt ${promptLen} karakter melebihi batas tool (±${charLimit}).`);
    }

    // ── Step G — audio native (Veo/Flow): dialog HARUS ada di dalam prompt ──
    // Tanpa ini video keluar BISU walau script_narration terisi rapi, karena Veo
    // hanya mengucapkan teks yang ada di dalam prompt. Ini temuan utama audit
    // ViralFrame 2026-07-26.
    if (nativeAudio && promptLen > 0) {
      const narasi = (sc.script_narration ?? '').toString().trim();
      // Bandingkan longgar: abaikan beda tanda baca/kapital/spasi, agar perbedaan
      // sepele tidak memicu alarm palsu tapi terjemahan/ringkasan tetap tertangkap.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const cocok = (dialog: string) => {
        const a = norm(dialog), b = norm(narasi);
        return !a || !b || a.includes(b) || b.includes(a);
      };

      const veo = asVeoPrompt(sc.ai_ready_prompt);
      if (veo) {
        // Bentuk objek (Tahap 2) — dialog punya field sendiri, jauh lebih andal
        // daripada menebak lewat tanda kutip.
        const line = (veo.dialogue?.line ?? '').toString().trim();
        if (!line) {
          warnings.push(`Scene ${n}: ai_ready_prompt.dialogue.line kosong — video akan BISU di Veo/Flow.`);
        } else if (!cocok(line)) {
          warnings.push(`Scene ${n}: dialogue.line berbeda dari script_narration — yang terucap di video akan beda dari naskah.`);
        }
        if (!veo.negative_prompt?.toString().trim()) {
          warnings.push(`Scene ${n}: ai_ready_prompt.negative_prompt kosong — Veo/Flow rawan membakar subtitle ke dalam frame.`);
        }
        if (clipMax != null && Number(veo.duration_sec) > clipMax) {
          warnings.push(`Scene ${n}: ai_ready_prompt.duration_sec ${veo.duration_sec}s melebihi batas ${clipMax}s per klip.`);
        }
        // ── Step G1 — sequences[] (Fase 6): wajib untuk scene >6s, sebelumnya TIDAK
        // pernah dicek sama sekali walau BLOK 3e masterPromptCompiler.ts mewajibkannya
        // (audit 2026-07-28). Non-blocking (warning), sama seperti field lain di sini.
        if (durasi > 6) {
          if (!Array.isArray(veo.sequences) || veo.sequences.length === 0) {
            warnings.push(`Scene ${n}: ai_ready_prompt.sequences kosong padahal durasi ${durasi}s (>6s) — BLOK 3e mewajibkan beat bertimecode untuk scene sepanjang ini.`);
          } else {
            const rusak = veo.sequences.some(sq => !sq.timestamp?.toString().trim() || !sq.action?.toString().trim());
            if (rusak) warnings.push(`Scene ${n}: ada elemen sequences tanpa "timestamp" atau "action" terisi.`);
          }
        } else if (Array.isArray(veo.sequences) && veo.sequences.some(sq => !sq.timestamp?.toString().trim() || !sq.action?.toString().trim())) {
          warnings.push(`Scene ${n}: ada elemen sequences tanpa "timestamp" atau "action" terisi.`);
        }
      } else {
        // Bentuk string — riwayat lama atau AI yang mengabaikan skema objek.
        const kutipan = prompt.match(/"([^"]{4,})"|“([^”]{4,})”/);
        if (!kutipan) {
          warnings.push(`Scene ${n}: ai_ready_prompt tidak memuat dialog dalam tanda kutip — video akan BISU di Veo/Flow (audio native hanya mengucapkan teks di dalam prompt).`);
        } else if (narasi && !cocok(kutipan[1] ?? kutipan[2] ?? '')) {
          warnings.push(`Scene ${n}: dialog di ai_ready_prompt tidak cocok dengan script_narration — yang terucap di video akan beda dari naskah.`);
        }
        if (!sc.negative_prompt?.toString().trim()) {
          warnings.push(`Scene ${n}: negative_prompt kosong — Veo/Flow rawan membakar subtitle ke dalam frame.`);
        }
      }
    }

    // ── Step H — durasi melebihi batas satu klip tool ──
    if (clipMax != null && durasi > clipMax) {
      warnings.push(`Scene ${n}: durasi ${durasi}s melebihi batas ${clipMax}s per klip untuk tool ini — perlu disambung lewat fitur Extend.`);
    }
  });

  return { ok: errors.length === 0, data: parsed, errors, warnings };
}
