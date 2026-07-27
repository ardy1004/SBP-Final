// Validator JSON Scene hasil AI eksternal — ViralFrame Fase V4b.
// NON-BLOCKING: hanya JSON invalid (Step A) & field wajib hilang (Step B) = hard error.
// Sisanya (jumlah scene, field scene kosong, word_count, char limit) = warning saja.

import { AI_TOOLS, getLipsync, isNativeAudioTool, getClipMaxSec } from './options';

export interface ParsedScene {
  scene_number?: number;
  role?: string;
  duration_sec?: number;
  photo_reference_label?: string;
  script_narration?: string;
  word_count?: number;
  ai_ready_prompt?: string;
  /** Hanya diminta untuk tool ber-audio native (Veo/Flow) — lihat BLOK 5 compiler. */
  negative_prompt?: string;
  on_screen_text?: string;
  transition_to_next?: string;
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
    const n = i + 1;
    // ── Step D — field scene tidak kosong (warning) ──
    if (!sc.script_narration?.toString().trim()) warnings.push(`Scene ${n}: script_narration kosong.`);
    if (!sc.ai_ready_prompt?.toString().trim()) warnings.push(`Scene ${n}: ai_ready_prompt kosong.`);
    if (!sc.photo_reference_label?.toString().trim()) warnings.push(`Scene ${n}: photo_reference_label kosong.`);
    if (!sc.transition_to_next?.toString().trim()) warnings.push(`Scene ${n}: transition_to_next kosong.`);

    // ── Step E — word_count vs lipsync (toleransi +10%) ──
    const durasi = expected.durations[i] ?? expected.durations[0] ?? 6;
    const maxWords = getLipsync(durasi).maxWords;
    const wc = Number(sc.word_count) || (sc.script_narration ? sc.script_narration.trim().split(/\s+/).length : 0);
    if (wc > Math.ceil(maxWords * 1.1)) {
      warnings.push(`Scene ${n}: word_count ${wc} melebihi target ${maxWords} kata (durasi ${durasi}s).`);
    }

    // ── Step F — panjang ai_ready_prompt vs char limit (warning) ──
    const prompt = (sc.ai_ready_prompt ?? '').toString();
    const promptLen = prompt.length;
    if (promptLen > charLimit) {
      warnings.push(`Scene ${n}: ai_ready_prompt ${promptLen} karakter melebihi batas tool (±${charLimit}).`);
    }

    // ── Step G — audio native (Veo/Flow): dialog HARUS tertanam di dalam prompt ──
    // Tanpa ini video keluar BISU walau script_narration terisi rapi, karena Veo
    // hanya mengucapkan teks yang ada di dalam prompt. Ini temuan utama audit
    // ViralFrame 2026-07-26.
    if (nativeAudio && promptLen > 0) {
      const narasi = (sc.script_narration ?? '').toString().trim();
      const kutipan = prompt.match(/"([^"]{4,})"|“([^”]{4,})”/);
      if (!kutipan) {
        warnings.push(`Scene ${n}: ai_ready_prompt tidak memuat dialog dalam tanda kutip — video akan BISU di Veo/Flow (audio native hanya mengucapkan teks di dalam prompt).`);
      } else if (narasi) {
        // Bandingkan longgar: abaikan beda tanda baca/kapital/spasi, agar parafrase
        // tipis tidak memicu alarm palsu tapi terjemahan/ringkasan tetap tertangkap.
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const isiKutipan = norm(kutipan[1] ?? kutipan[2] ?? '');
        if (isiKutipan && !norm(narasi).includes(isiKutipan) && !isiKutipan.includes(norm(narasi))) {
          warnings.push(`Scene ${n}: dialog di ai_ready_prompt tidak cocok dengan script_narration — yang terucap di video akan beda dari naskah.`);
        }
      }
      if (!sc.negative_prompt?.toString().trim()) {
        warnings.push(`Scene ${n}: negative_prompt kosong — Veo/Flow rawan membakar subtitle ke dalam frame.`);
      }
    }

    // ── Step H — durasi melebihi batas satu klip tool ──
    if (clipMax != null && durasi > clipMax) {
      warnings.push(`Scene ${n}: durasi ${durasi}s melebihi batas ${clipMax}s per klip untuk tool ini — perlu disambung lewat fitur Extend.`);
    }
  });

  return { ok: errors.length === 0, data: parsed, errors, warnings };
}
