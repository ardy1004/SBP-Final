// Validator JSON Part hasil AI eksternal — ViralFrame Part-as-Generate-Unit (refactor 2026-08-01).
// NON-BLOCKING: hanya JSON invalid (Step A) & field wajib hilang (Step B) = hard error.
// Sisanya (jumlah Part, field kosong, word_count, char limit) = warning saja.
//
// ─── REFACTOR 2026-08-01 ───────────────────────────────────────────────────
// Skema output BLOK 5 (masterPromptCompiler.ts, Agent 3 Gelombang 2) berubah dari
// `data.scenes[]` (1 scene = 1 foto) menjadi `data.parts[]` (1 Part = 1 generate
// call, `cuts[]` di dalamnya adalah potongan visual DI DALAM Part itu). Field
// tunggal `ai_ready_prompt` per scene TIDAK ADA lagi di skema baru — Part
// menyimpan field terstruktur (`dialog`, `cuts[]`, `reference_images[]`, dst),
// jadi `partPromptText()` di bawah merangkainya jadi SATU blok teks siap-tempel
// per Part (menggantikan peran `promptToText(ai_ready_prompt)` lama).

import { AI_TOOLS, getLipsync, isNativeAudioTool, getClipMaxSec, MAX_REF_IMAGES_PER_PART, type PartDef } from './options';

export interface ParsedCut {
  t?: string;
  photo?: string;
  action?: string;
  gesture?: string;
  emotion?: string;
  camera?: string;
}
export interface ParsedDialogue { speaker?: string; language?: string; line?: string; voice?: string; delivery?: string }

export interface ParsedPart {
  part?: number;
  role?: string;
  duration_sec?: number;
  vo_duration_sec?: number;
  /** Intent akting Part ini ("kenapa dia bicara begini"), BUKAN mode presenter —
   * lihat catatan di masterPromptCompiler BLOK 5. */
  presentation?: string;
  reference_images?: string[];
  cuts?: ParsedCut[];
  dialog?: string;
  dialogue?: ParsedDialogue;
  negative_prompt?: string;
  on_screen_text?: string[];
  audio?: string;
  transition_to_next?: string;
  [k: string]: unknown;
}

export interface ParsedJSON {
  video_metadata?: Record<string, unknown>;
  global_style?: Record<string, unknown>;
  character_sheet?: Record<string, unknown>;
  parts?: ParsedPart[];
  production_notes?: {
    caption?: string;
    hashtags?: string[];
    thumbnail_concept?: string;
    posting_time_suggestion?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface ValidateExpected {
  /** PartDef milik user (durationSec/voDurationSec/role terkunci) — dipakai
   * membandingkan invarian jumlah & durasi terhadap jawaban AI eksternal. */
  parts: PartDef[];
  aiTool: string;
}

export interface ValidateResult {
  ok: boolean;
  data: ParsedJSON | null;
  errors: string[];
  warnings: string[];
}

const REQUIRED_TOP = ['video_metadata', 'global_style', 'character_sheet', 'parts', 'production_notes'] as const;

/**
 * Teks siap-tempel untuk SATU Part (1 Part = 1 generate call), dirangkai dari
 * field terstruktur BLOK 5 — pengganti `promptToText(ai_ready_prompt)` skema
 * scene lama (yang punya satu field string/objek tunggal). Dipakai baik oleh
 * validator (cek panjang vs char limit tool) maupun PartCards (tombol Copy).
 */
export function partPromptText(p: ParsedPart): string {
  const L: string[] = [];
  if (Array.isArray(p.reference_images) && p.reference_images.length > 0) {
    L.push('REFERENCE IMAGES:');
    p.reference_images.forEach((f, i) => L.push(`${i + 1}. ${f}`));
    L.push('');
  }
  if (p.presentation) L.push(`Presentasi: ${p.presentation}`);
  if (Array.isArray(p.cuts) && p.cuts.length > 0) {
    for (const c of p.cuts) {
      const extra = [
        c.gesture ? `gesture: ${c.gesture}` : '',
        c.emotion ? `emotion: ${c.emotion}` : '',
        c.camera ? `camera: ${c.camera}` : '',
      ].filter(Boolean).join(', ');
      L.push(`${c.t ?? ''} — ${c.photo ?? ''}: ${c.action ?? ''}${extra ? ` (${extra})` : ''}`.trim());
    }
    L.push('');
  }
  if (p.dialog) L.push(`Dialog/Narasi: ${p.dialog}`);
  if (p.dialogue?.line) L.push(`Dialogue line (audio native): ${p.dialogue.line}`);
  if (p.audio) L.push(`Audio: ${p.audio}`);
  if (Array.isArray(p.on_screen_text) && p.on_screen_text.length > 0) L.push(`On-screen text (editor): ${p.on_screen_text.join(' / ')}`);
  if (p.transition_to_next) L.push(`Transisi: ${p.transition_to_next}`);
  if (p.negative_prompt) L.push(`Negative prompt: ${p.negative_prompt}`);
  return L.join('\n').trim();
}

/** Σ durasi cut dari field "t" (mis. "0-4s", "4-7s") — dipakai memverifikasi
 * invarian Σ durasi cut = duration_sec Part terhadap jawaban AI eksternal.
 * Toleran terhadap format t yang tidak konsisten (kembalikan 0 bila tak terparse). */
function sumDurasiDariT(cuts: ParsedCut[]): number {
  return cuts.reduce((s, c) => {
    const m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(c.t ?? '');
    return s + (m ? Math.max(0, parseFloat(m[2]) - parseFloat(m[1])) : 0);
  }, 0);
}

export function validatePartJson(raw: string, expected: ValidateExpected): ValidateResult {
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
  if (!Array.isArray(parsed.parts)) {
    errors.push('Field "parts" harus berupa array.');
  }
  if (errors.length > 0) {
    return { ok: false, data: null, errors, warnings };
  }

  const parts = parsed.parts ?? [];

  // ── Step C — jumlah Part (warning) ──
  if (parts.length !== expected.parts.length) {
    warnings.push(`Jumlah Part tidak sesuai. Diharapkan ${expected.parts.length}, dapat ${parts.length}.`);
  }

  const charLimit = AI_TOOLS.find(t => t.value === expected.aiTool)?.charLimit ?? 1000;
  const nativeAudio = isNativeAudioTool(expected.aiTool);
  const clipMax = getClipMaxSec(expected.aiTool);

  parts.forEach((p, i) => {
    // Pakai "part" (nomor) kalau ada & valid — sama alasannya dengan scene_number
    // lama: AI yang men-skip/reorder Part akan membuat cek berikutnya salah sasaran
    // kalau hanya mengandalkan posisi array.
    const declared = Number(p.part);
    const n = Number.isInteger(declared) && declared >= 1 && declared <= expected.parts.length ? declared : i + 1;
    const exp = expected.parts[n - 1];

    // ── Step D — field Part tidak kosong (warning) ──
    if (!Array.isArray(p.cuts) || p.cuts.length === 0) warnings.push(`Part ${n}: cuts kosong.`);
    if (!Array.isArray(p.reference_images) || p.reference_images.length === 0) warnings.push(`Part ${n}: reference_images kosong.`);
    if (Array.isArray(p.reference_images) && p.reference_images.length > MAX_REF_IMAGES_PER_PART) {
      warnings.push(`Part ${n}: reference_images (${p.reference_images.length}) melebihi kuota MAX_REF_IMAGES_PER_PART (${MAX_REF_IMAGES_PER_PART}).`);
    }
    if (!p.dialog?.toString().trim()) warnings.push(`Part ${n}: dialog kosong.`);
    if (!p.transition_to_next?.toString().trim()) warnings.push(`Part ${n}: transition_to_next kosong.`);

    // ── Step D2 — CTA WAJIB punya on_screen_text (kanal satu-satunya utk harga/spec) ──
    const role = exp?.role ?? p.role;
    if (role === 'CTA' && (!Array.isArray(p.on_screen_text) || p.on_screen_text.filter(t => t?.toString().trim()).length === 0)) {
      warnings.push(`Part ${n} (CTA): on_screen_text kosong — ini satu-satunya kanal untuk menampilkan harga/spec sesuai aturan CLAUDE.md.`);
    }

    // ── Step E — word_count (dialog) vs lipsync dari voDurationSec (toleransi +10%) ──
    const voDurasi = exp?.voDurationSec ?? Number(p.vo_duration_sec) ?? 8;
    const maxWords = getLipsync(voDurasi).maxWords;
    const wc = p.dialog ? p.dialog.trim().split(/\s+/).filter(Boolean).length : 0;
    if (wc > Math.ceil(maxWords * 1.1)) {
      warnings.push(`Part ${n}: dialog ${wc} kata melebihi target ${maxWords} kata (VO ${voDurasi}s).`);
    }

    // ── Step F — panjang prompt gabungan Part vs char limit tool (warning) ──
    const promptLen = partPromptText(p).length;
    if (promptLen > charLimit) {
      warnings.push(`Part ${n}: prompt gabungan ${promptLen} karakter melebihi batas tool (±${charLimit}).`);
    }

    // ── Step F2 — Σ durasi cut (dari field "t") vs duration_sec Part (invarian) ──
    if (exp && Array.isArray(p.cuts) && p.cuts.length > 0) {
      const sumCuts = sumDurasiDariT(p.cuts);
      if (sumCuts > 0 && Math.abs(sumCuts - exp.durationSec) > 1) {
        warnings.push(`Part ${n}: Σ durasi cut dari field "t" (${sumCuts}s) tidak sama dengan durasi Part (${exp.durationSec}s).`);
      }
    }

    // ── Step G — audio native (Veo/Flow): dialog HARUS ada di dialogue.line ──
    if (nativeAudio) {
      const narasi = (p.dialog ?? '').toString().trim();
      const line = (p.dialogue?.line ?? '').toString().trim();
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const cocok = (a: string, b: string) => { const A = norm(a), B = norm(b); return !A || !B || A.includes(B) || B.includes(A); };
      if (!line) {
        warnings.push(`Part ${n}: dialogue.line kosong — video akan BISU di Veo/Flow.`);
      } else if (narasi && !cocok(line, narasi)) {
        warnings.push(`Part ${n}: dialogue.line berbeda dari dialog — yang terucap di video akan beda dari naskah.`);
      }
      if (!p.negative_prompt?.toString().trim()) {
        warnings.push(`Part ${n}: negative_prompt kosong — Veo/Flow rawan membakar subtitle ke dalam frame.`);
      }
    }

    // ── Step H — durasi Part melebihi batas satu klip tool ──
    if (clipMax != null && exp && exp.durationSec > clipMax) {
      warnings.push(`Part ${n}: durasi ${exp.durationSec}s melebihi batas ${clipMax}s per klip untuk tool ini — perlu disambung lewat fitur Extend.`);
    }
  });

  return { ok: errors.length === 0, data: parsed, errors, warnings };
}
