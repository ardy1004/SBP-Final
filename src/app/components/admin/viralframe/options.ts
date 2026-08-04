// Opsi dropdown ViralFrame — Fase V2 (Parameter Video).
// Nilai disusun dari contoh yang disebut di PRD ringkas instruksi fase.
// value = key disimpan ke state/params_json; label = teks UI.

// Konstanta lipsync & ekspresi = sumber tunggal bersama dengan backend (Fase 4 dedup).
// Ditempatkan di functions/_lib agar backend Functions bisa mengimpornya natif.
import {
  LIPSYNC_TABLE as SHARED_LIPSYNC_TABLE,
  getLipsync as sharedGetLipsync,
  EXPRESSION_EN as SHARED_EXPRESSION_EN,
  isNativeAudioTool as sharedIsNativeAudioTool,
  getClipMaxSec as sharedGetClipMaxSec,
  NEGATIVE_PROMPT_VIDEO as SHARED_NEGATIVE_PROMPT_VIDEO,
  REALISM_QUALITY_CUES as SHARED_REALISM_QUALITY_CUES,
  REALISM_BANNED_QUALITY_PHRASES as SHARED_REALISM_BANNED_QUALITY_PHRASES,
  RULEBOOK_VERSION as SHARED_RULEBOOK_VERSION,
  namaFileKarakter as sharedNamaFileKarakter,
  MAX_REF_IMAGES_PER_PART as SHARED_MAX_REF_IMAGES_PER_PART,
  EMOTION_ARC_BY_ROLE as SHARED_EMOTION_ARC_BY_ROLE,
  getEmotionForRole as sharedGetEmotionForRole,
  PERFORMANCE_INTENT_BY_ROLE as SHARED_PERFORMANCE_INTENT_BY_ROLE,
  VOICE_PERSONA_HINT as SHARED_VOICE_PERSONA_HINT,
  CTA_SPOKEN_EXAMPLE as SHARED_CTA_SPOKEN_EXAMPLE,
  defaultVoDurationSec as sharedDefaultVoDurationSec,
  VOICE_PRIORITY_NOTE as SHARED_VOICE_PRIORITY_NOTE,
} from '../../../../../functions/_lib/viralframe-shared.js';

export interface Opt { value: string; label: string }

// (d) AI Video Tool — 11 pilihan + perkiraan batas karakter prompt
export interface AiTool extends Opt { charLimit: number }
export const AI_TOOLS: AiTool[] = [
  { value: 'google_flow', label: 'Google Flow (Veo 3.1)', charLimit: 1500 },
  { value: 'veo3',      label: 'Veo 3 (Google)',        charLimit: 1000 },
  { value: 'kling',     label: 'Kling AI',              charLimit: 2500 },
  { value: 'minimax',   label: 'Minimax / Hailuo',      charLimit: 2000 },
  { value: 'runway',    label: 'Runway Gen-4',          charLimit: 1000 },
  { value: 'luma',      label: 'Luma Dream Machine',    charLimit: 1000 },
  { value: 'pika',      label: 'Pika Labs',             charLimit: 512  },
  { value: 'sora',      label: 'Sora (OpenAI)',         charLimit: 1500 },
  { value: 'jianying',  label: 'Bytedance Jianying',    charLimit: 1000 },
  { value: 'wan21',     label: 'Wan 2.1',               charLimit: 800  },
  { value: 'cogvideox', label: 'CogVideoX',             charLimit: 800  },
];

// (e) Rasio Video
export const RATIOS: Opt[] = [
  { value: '9:16', label: '9:16 (Vertikal / Reels)' },
  { value: '16:9', label: '16:9 (Horizontal)' },
  { value: '1:1',  label: '1:1 (Persegi)' },
  { value: '4:5',  label: '4:5 (Portrait Feed)' },
  { value: '3:4',  label: '3:4 (Portrait)' },
];

// (f) Bahasa Narasi
export const LANGUAGES: Opt[] = [
  { value: 'id',    label: 'Bahasa Indonesia' },
  { value: 'en',    label: 'English' },
  { value: 'id_en', label: 'Bilingual ID + EN' },
  { value: 'en_id', label: 'Bilingual EN + ID' },
  { value: 'jw',    label: 'Bahasa Jawa' },
];

// (g) Tipe Hook (Scene 1) — 13 pilihan (PRD 3.11)
export const HOOK_TYPES: Opt[] = [
  { value: 'auto',              label: 'Auto (AI pilih terbaik)' },
  { value: 'shocking_fact',     label: 'Shocking Fact (Fakta Mengejutkan)' },
  { value: 'open_question',     label: 'Open Question (Pertanyaan Terbuka)' },
  { value: 'bold_statement',    label: 'Bold Statement (Pernyataan Berani)' },
  { value: 'problem_agitation', label: 'Problem–Agitation (Masalah Diperbesar)' },
  { value: 'curiosity_gap',     label: 'Curiosity Gap (Rasa Penasaran)' },
  { value: 'pattern_interrupt', label: 'Pattern Interrupt (Pemecah Pola)' },
  { value: 'relatable_pain',    label: 'Relatable Pain (Keluhan Relatable)' },
  { value: 'number_list',       label: 'Number / List (Daftar Angka)' },
  { value: 'before_after',      label: 'Before–After (Sebelum–Sesudah)' },
  { value: 'story_teaser',      label: 'Story Teaser (Cuplikan Cerita)' },
  { value: 'controversial',     label: 'Controversial (Kontroversial)' },
  { value: 'fomo_scarcity',     label: 'FOMO / Scarcity (Takut Ketinggalan)' },
];

// (h) Call to Action (Scene Terakhir) — 11 pilihan (PRD 3.12)
export const CTA_TYPES: Opt[] = [
  { value: 'auto',           label: 'Auto (AI pilih terbaik)' },
  { value: 'dm_info',        label: 'DM untuk Info Lengkap' },
  { value: 'comment_keyword', label: 'Komen [KEYWORD]' },
  { value: 'visit_link_bio', label: 'Kunjungi Link di Bio' },
  { value: 'save_post',      label: 'Simpan Postingan Ini' },
  { value: 'share_friend',   label: 'Bagikan ke Teman' },
  { value: 'whatsapp_now',   label: 'WhatsApp Sekarang' },
  { value: 'book_viewing',   label: 'Jadwalkan Survei / Viewing' },
  { value: 'follow_more',    label: 'Follow untuk Listing Lain' },
  { value: 'limited_offer',  label: 'Penawaran Terbatas' },
  { value: 'ask_question',   label: 'Tanya di Kolom Komentar' },
];

// (i) Gaya Visual — 12 pilihan (PRD 3.15)
export const VISUAL_STYLES: Opt[] = [
  { value: 'auto',            label: 'Auto' },
  { value: 'ugc_authentic',   label: 'UGC / Authentic' },
  { value: 'cinematic_film',  label: 'Cinematic Film' },
  { value: 'luxury_premium',  label: 'Luxury / Premium' },
  { value: 'bright_airy',     label: 'Bright & Airy' },
  { value: 'moody_dramatic',  label: 'Moody / Dramatic' },
  { value: 'documentary',     label: 'Documentary' },
  { value: 'vlog_handheld',   label: 'Vlog / Handheld' },
  { value: 'aerial_drone',    label: 'Aerial / Drone' },
  { value: 'minimalist_clean', label: 'Minimalist / Clean' },
  { value: 'warm_cozy',       label: 'Warm & Cozy' },
  { value: 'modern_sleek',    label: 'Modern / Sleek' },
];

// (j) Tone Narasi — 10 pilihan (PRD 3.17)
export const TONES: Opt[] = [
  { value: 'auto',                   label: 'Auto' },
  { value: 'persuasive_selling',     label: 'Persuasif / Selling' },
  { value: 'friendly_casual',        label: 'Ramah / Santai' },
  { value: 'professional_formal',    label: 'Profesional / Formal' },
  { value: 'enthusiastic_energetic', label: 'Antusias / Energik' },
  { value: 'calm_soothing',          label: 'Tenang / Menenangkan' },
  { value: 'luxurious_exclusive',    label: 'Mewah / Eksklusif' },
  { value: 'urgent_fomo',            label: 'Urgent / FOMO' },
  { value: 'storytelling_emotional', label: 'Storytelling / Emosional' },
  { value: 'informative_educational', label: 'Informatif / Edukatif' },
];

// Register / Gaya Bahasa — memengaruhi dialog_karakter & narasi (lintas semua arketipe).
// "gaul" = kunci untuk konten UGC/selfie vlog yang relatable di TikTok/Reels.
export const LANGUAGE_REGISTERS: Opt[] = [
  { value: 'auto',        label: 'Auto (ikut tone)' },
  { value: 'formal',      label: 'Formal / Baku' },
  { value: 'santai',      label: 'Santai / Ramah' },
  { value: 'gaul',        label: 'Gaul (anak muda)' },
  { value: 'jawa_halus',  label: 'Jawa Halus (Krama)' },
];
export const REGISTER_INSTRUCTION: Record<string, string> = {
  auto:       '',
  formal:     'Gunakan Bahasa Indonesia formal & baku, sopan dan profesional.',
  santai:     'Gunakan bahasa santai & ramah dengan sapaan akrab, seolah sedang mengobrol dengan teman.',
  gaul:       'Gunakan bahasa gaul anak muda Indonesia yang natural dan relatable (mis. "guys", "nih", "banget", "worth it parah", "gaskeun") — energik dan akrab, TETAPI tetap sopan dan tidak alay berlebihan. Sangat cocok untuk TikTok/Reels.',
  jawa_halus: 'Gunakan Bahasa Jawa Krama (halus) yang sopan dan santun.',
};

// (c) Platform Distribusi
export const PLATFORMS: Opt[] = [
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'ig_reels',  label: 'Instagram Reels' },
  { value: 'yt_shorts', label: 'YouTube Shorts' },
  { value: 'fb_reels',  label: 'Facebook Reels' },
];

// Step 2 — Label Foto per Scene
export const PHOTO_LABELS: string[] = [
  'Fasad', 'Foyer/Lobby', 'Ruang Tamu', 'Ruang Keluarga', 'Ruang Makan',
  'Kamar Tidur', 'Walk-in Closet', 'Kamar Mandi', 'Dapur', 'Ruang Cuci/Jemur',
  'Ruang Kerja/Study', 'Gym/Fitness', 'Koridor/Tangga', 'Void/Plafon Tinggi',
  'Taman/Halaman', 'Carport/Garasi', 'Balkon/Teras', 'Rooftop', 'Kolam Renang',
  'Musholla', 'Gudang', 'Ruang Usaha', 'Tampak Lokasi/Lingkungan', 'Lainnya',
];

// Peran scene berdasarkan posisi (scene 1 = Hook, terakhir = CTA, sisanya = Body)
export function sceneRole(index: number, total: number): 'Hook' | 'Body' | 'CTA' {
  if (index === 0) return 'Hook';
  if (index === total - 1) return 'CTA';
  return 'Body';
}

// ─── Part — unit generate (refactor 2026-08-01) ────────────────────────────────
// Model LAMA (Fase ≤6): Part mengelompokkan N `scene` berurutan dari array
// `scenes[]` flat; 1 foto = 1 panggilan generate. Ternyata keliru — alur nyata
// user: prompt di-paste ke Google Flow dengan BEBERAPA foto referensi sekaligus
// (maks 7 didukung Flow, kita pakai `MAX_REF_IMAGES_PER_PART = 5` sebagai margin).
// Konsekuensinya: **1 Part = 1 generate call**, dan `cuts[]` adalah potongan
// (cut) DI DALAM satu generate itu — bukan lagi array `scenes[]` terpisah.
//
// Draft/riwayat lama (`{sceneCount, durationMode, uniformDuration/manualDurations,
// scenes[], parts[] ber-sceneCount}`) TIDAK dibaca langsung oleh state baru —
// WAJIB dilewatkan konversiDraftLama() dulu (lihat di bawah) saat applyConfig()
// merehidrasi draft/riwayat, karena params_json lama sudah tersimpan di D1
// (viralframe_generations) dan tidak boleh membuat halaman rusak.
export interface CutDef {
  /** id property_images — foto sumber cut ini. */
  photoId: number;
  /** Label ruangan foto ini (disalin dari label_ruangan saat cut dibuat, supaya
   * nama file ZIP & rujukan di prompt tidak perlu join balik ke daftar foto). */
  label: string;
  /** Durasi cut ini (detik). Σ durasiDetik seluruh cuts dalam 1 Part = durationSec Part. */
  durasiDetik: number;
  /** Aksi/kamera singkat opsional untuk cut ini, mis. "pan kiri ke kanan". */
  aksi?: string;
}

export interface PartDef {
  role: 'Hook' | 'Body' | 'CTA';
  /** Durasi TOTAL part ini (detik) — satu panggilan generate. WAJIB ≤ getClipMaxSec(aiTool). */
  durationSec: number;
  /** Durasi voiceover di dalam part ini (detik). Bisa < durationSec (sisa untuk
   * hook text/transisi/end card tanpa VO) — WAJIB ≤ durationSec, divalidasi hilir. */
  voDurationSec: number;
  /** Foto referensi yang DILAMPIRKAN ke generate call ini (id property_images),
   * unik, urutan = urutan lampir. Foto KARAKTER ikut dihitung ke kuota
   * MAX_REF_IMAGES_PER_PART oleh konsumen (bukan disimpan di sini). */
  refPhotoIds: number[];
  /** Potongan (cut) di dalam generate call ini — beberapa cut boleh berbagi 1 foto. */
  cuts: CutDef[];
  /** Label naratif opsional, mis. "Interior Tour". */
  label?: string;
  /** Alasan singkat AI memilih susunan ini (Tahap 2 — AI Rancang Storyboard bervisi). */
  rationale?: string;
}

/** Σ durationSec seluruh Part (0 bila tidak ada Part). */
export function totalDurationOfParts(parts?: PartDef[]): number {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((s, p) => s + (Number.isFinite(p.durationSec) && p.durationSec > 0 ? p.durationSec : 0), 0);
}

/** Total jumlah cut lintas semua Part (dipakai UI/validasi ringkas). */
export function totalCutCountOfParts(parts?: PartDef[]): number {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((s, p) => s + (Array.isArray(p.cuts) ? p.cuts.length : 0), 0);
}

/** Σ durasiDetik satu daftar cut — dibandingkan dengan durationSec Part-nya untuk
 * memvalidasi invarian "Σ durasi cut = durasi Part" (dipakai Tahap 3 Catatan Produksi). */
export function sumDurasiCuts(cuts: CutDef[] | undefined): number {
  if (!Array.isArray(cuts)) return 0;
  return cuts.reduce((s, c) => s + (Number.isFinite(c.durasiDetik) && c.durasiDetik > 0 ? c.durasiDetik : 0), 0);
}

/**
 * Distribusi durasi rata ke N cut dari total durasi (fallback/reset — cuts[].durasiDetik
 * dari AI atau editan user adalah sumber kanonik, ini HANYA dipakai saat perlu
 * menurunkan durasi cut baru, mis. reset manual atau konversi draft lama).
 * Sisa pembagian dibagikan satu-satu ke cut-cut AWAL (10s / 3 cut → 4,3,3).
 */
export function distribusiDurasiCut(durationSec: number, jumlahCut: number): number[] {
  const n = Math.max(0, Math.floor(jumlahCut));
  if (n === 0) return [];
  const total = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : n;
  const dasar = Math.floor(total / n);
  const sisa = total - dasar * n;
  return Array.from({ length: n }, (_, i) => dasar + (i < sisa ? 1 : 0));
}

// ─── Konversi bentuk lama → Part baru (kompatibilitas mundur wajib) ────────────

/** Bentuk lama satu scene di array `scenes[]` flat (Fase ≤6). */
export interface DraftLamaScene { photoId?: number | null; label?: string }

/** Bentuk lama PartDef (Fase 6) — ber-`sceneCount`, tanpa `cuts[]`. */
export interface DraftLamaPart {
  role: 'Hook' | 'Body' | 'CTA';
  sceneCount: number;
  label?: string;
  durationSec?: number;
}

/** Subset Step1State lama yang relevan untuk konversi (longgar/opsional supaya
 * draft dari versi manapun — termasuk sebelum Fase 6 tanpa `parts` sama sekali —
 * tetap diterima tanpa error). */
export interface DraftLamaS1 {
  durationMode?: 'uniform' | 'manual' | 'part' | string;
  uniformDuration?: number;
  manualDurations?: number[];
  parts?: DraftLamaPart[];
}

/**
 * Konversi bentuk lama `{s1: {sceneCount, durationMode, uniformDuration,
 * manualDurations, parts?}, scenes: DraftLamaScene[]}` (Fase ≤6, tersimpan di
 * `params_json` D1 `viralframe_generations` & draft `localStorage`) menjadi
 * `PartDef[]` model baru (1 Part = 1 generate call, `cuts[]` di dalamnya).
 *
 * WAJIB dipanggil `applyConfig()` saat merehidrasi draft/riwayat lama — TIDAK
 * boleh membuat halaman rusak/crash untuk `params_json` lama apa pun.
 *
 * Aturan konversi:
 * 1. Durasi per scene lama dihitung ulang dari `durationMode` (manual → per-scene
 *    apa adanya; part lama → didistribusikan dari durationSec Part via
 *    distribusiDurasiCut(); selain itu/fallback → uniformDuration rata ke semua scene).
 * 2. Pengelompokan: kalau `s1.parts` lama valid (Σ sceneCount === jumlah scene),
 *    pakai pengelompokan & role-nya. Kalau tidak, SEMUA scene dianggap satu
 *    kelompok (role ditentukan di langkah 4).
 * 3. Tiap kelompok dipecah lagi jadi beberapa Part BARU secukupnya supaya patuh
 *    `MAX_REF_IMAGES_PER_PART` (maks foto per Part) DAN `clipMaxSec` (maks durasi
 *    per Part, dari `getClipMaxSec(aiTool)` — fallback 10 detik/google_flow bila
 *    `aiTool` tak dikenal) — batas mana pun yang lebih dulu tercapai.
 * 4. Kalau tidak ada `parts` lama valid, Part pertama hasil pecahan diberi role
 *    'Hook' dan Part terakhir 'CTA' (meniru sceneRole() posisi lama); sisanya 'Body'.
 * 5. Scene tanpa `photoId` (belum diisi foto) DILEWATI — tidak menghasilkan cut
 *    kosong. Part yang jadi kosong akibat ini (semua scene-nya belum berfoto)
 *    ikut dilewati (tidak masuk hasil).
 * 6. `refPhotoIds` Part = photoId unik dari cuts miliknya (foto karakter TIDAK
 *    disertakan di sini — itu ditambahkan konsumen hilir saat menghitung kuota
 *    gabungan MAX_REF_IMAGES_PER_PART).
 * 7. `voDurationSec` awal = `defaultVoDurationSec(durationSec)` ≈ 80% durasi klip.
 *    DULU = durasi PENUH, yang berarti kita meminta orang berbicara tanpa henti
 *    sepanjang klip. Storyboard rujukan yang hasilnya bagus justru menyisakan
 *    ruang (klip 10 dtk, VO 8 dtk) untuk napas awal, jeda, dan ekor penutup.
 *    User bisa mengoreksi di UI. Nilai yang SUDAH tersimpan tidak diubah.
 */
/**
 * Paksa sembarang bentuk `parts` tersimpan menjadi `PartDef[]` yang AMAN dirender.
 *
 * ⚠️ WAJIB dipakai di SETIAP jalur rehidrasi (autosave localStorage `vf_draft_<id>`
 * MAUPUN riwayat D1 `params_json`) — bukan hanya jalur yang terdeteksi "lama".
 *
 * Latar belakang (insiden 2026-08-01): `applyConfig()` men-spread JSON tersimpan
 * langsung ke state tanpa normalisasi, dan deteksi legacy-nya hanya melihat
 * `durationMode`/`scenes`. Draft yang tersimpan DI TENGAH refactor — `parts` sudah
 * ada tapi masih ber-`sceneCount`, tanpa `cuts`/`refPhotoIds` — lolos deteksi itu,
 * masuk state apa adanya, lalu render meledak di `p.refPhotoIds.length`
 * ("Cannot read properties of undefined") dan seluruh halaman jadi layar putih.
 *
 * Aturannya: state persisten adalah input TIDAK TEPERCAYA. Bentuknya bisa berasal
 * dari build versi mana pun yang pernah dipakai user. Jangan pernah mengasumsikan
 * field baru sudah ada di sana.
 */
export function normalisasiParts(raw: unknown, aiTool?: string): PartDef[] {
  if (!Array.isArray(raw)) return [];
  const clipMax = (aiTool ? getClipMaxSec(aiTool) : null) ?? 10;

  return raw.map((p): PartDef => {
    const o = (p ?? {}) as Record<string, unknown>;
    const role: PartDef['role'] =
      o.role === 'Hook' || o.role === 'Body' || o.role === 'CTA' ? o.role : 'Body';

    const durNum = Number(o.durationSec);
    const durationSec = Number.isFinite(durNum) && durNum > 0 ? Math.min(durNum, clipMax) : clipMax;

    const voNum = Number(o.voDurationSec);
    // Nilai tersimpan dihormati apa adanya (draft/riwayat lama tidak boleh berubah
    // diam-diam); hanya Part TANPA nilai yang memakai default baru ~80%.
    const voDurationSec = Number.isFinite(voNum) && voNum >= 0
      ? Math.min(voNum, durationSec)
      : defaultVoDurationSec(durationSec);

    const cuts: CutDef[] = Array.isArray(o.cuts)
      ? (o.cuts as unknown[]).flatMap((c): CutDef[] => {
          const co = (c ?? {}) as Record<string, unknown>;
          const photoId = Number(co.photoId);
          if (!Number.isFinite(photoId)) return [];   // cut tanpa foto = tidak bisa dirender
          const d = Number(co.durasiDetik);
          return [{
            photoId,
            label: typeof co.label === 'string' ? co.label : '',
            durasiDetik: Number.isFinite(d) && d > 0 ? d : 1,
            ...(typeof co.aksi === 'string' && co.aksi ? { aksi: co.aksi } : {}),
          }];
        })
      : [];

    // refPhotoIds diturunkan ulang dari cuts bila tidak tersimpan/rusak — inilah
    // invarian yang dipegang UI (kuota) dan ZIP (daftar lampiran).
    const refTersimpan = Array.isArray(o.refPhotoIds)
      ? (o.refPhotoIds as unknown[]).map(Number).filter(n => Number.isFinite(n))
      : [];
    const refPhotoIds = refTersimpan.length > 0
      ? [...new Set(refTersimpan)]
      : [...new Set(cuts.map(c => c.photoId))];

    return {
      role, durationSec, voDurationSec, refPhotoIds, cuts,
      ...(typeof o.label === 'string' && o.label ? { label: o.label } : {}),
      ...(typeof o.rationale === 'string' && o.rationale ? { rationale: o.rationale } : {}),
    };
  });
}

export function konversiDraftLama(
  s1: DraftLamaS1,
  scenes: DraftLamaScene[],
  aiTool?: string,
): PartDef[] {
  const total = Array.isArray(scenes) ? scenes.length : 0;
  if (total === 0) return [];

  // Batas durasi satu generate call untuk tool ini — dipakai DUA kali: memotong
  // durasi tiap cut (di bawah) dan mengelompokkan cut jadi Part (langkah 3).
  const clipMaxKonv = (aiTool ? sharedGetClipMaxSec(aiTool) : null) ?? 10;

  // 1) Durasi per scene ala model lama.
  const durasiPerSceneMentah: number[] = (() => {
    if (s1.durationMode === 'manual' && Array.isArray(s1.manualDurations)) {
      const fallback = Number.isFinite(s1.uniformDuration) && (s1.uniformDuration as number) > 0
        ? (s1.uniformDuration as number) : 8;
      return Array.from({ length: total }, (_, i) => {
        const d = s1.manualDurations![i];
        return Number.isFinite(d) && d > 0 ? d : fallback;
      });
    }
    if (s1.durationMode === 'part' && Array.isArray(s1.parts)) {
      const sumSceneCount = s1.parts.reduce((sum, p) => sum + (p.sceneCount || 0), 0);
      if (sumSceneCount === total) {
        const fallback = Number.isFinite(s1.uniformDuration) && (s1.uniformDuration as number) > 0
          ? (s1.uniformDuration as number) : 8;
        const out: number[] = [];
        for (const p of s1.parts) {
          const n = p.sceneCount || 0;
          if (n <= 0) continue;
          const totalPart = Number.isFinite(p.durationSec) && (p.durationSec as number) > 0
            ? (p.durationSec as number) : fallback * n;
          out.push(...distribusiDurasiCut(totalPart, n));
        }
        if (out.length === total) return out;
      }
    }
    const u = Number.isFinite(s1.uniformDuration) && (s1.uniformDuration as number) > 0
      ? (s1.uniformDuration as number) : 8;
    return Array.from({ length: total }, () => u);
  })();

  // Draft lama bisa memuat scene lebih panjang dari batas klip tool yang dipakai
  // sekarang (mis. scene 10 detik pada veo3 yang batasnya 8). Satu cut TIDAK bisa
  // dipecah lagi jadi Part terpisah, jadi durasinya DIPOTONG ke batas — kalau
  // dibiarkan, hasil konversi langsung melanggar invarian "durasi Part ≤ clipMax"
  // dan user mendapat draft yang ditolak validasi tanpa cara memperbaikinya.
  const durasiPerScene: number[] = durasiPerSceneMentah.map(d => Math.min(d, clipMaxKonv));

  // 2) Kelompok awal: pakai `parts` lama kalau valid, else satu kelompok besar.
  interface Grup { role: 'Hook' | 'Body' | 'CTA'; label?: string; mulai: number; akhir: number }
  const sumSceneCountParts = Array.isArray(s1.parts) ? s1.parts.reduce((s, p) => s + (p.sceneCount || 0), 0) : 0;
  const partsLamaValid = Array.isArray(s1.parts) && s1.parts.length > 0 && sumSceneCountParts === total;

  let groups: Grup[];
  if (partsLamaValid) {
    groups = [];
    let cursor = 0;
    for (const p of s1.parts!) {
      const n = p.sceneCount || 0;
      if (n > 0) groups.push({ role: p.role, label: p.label, mulai: cursor, akhir: cursor + n - 1 });
      cursor += n;
    }
  } else {
    groups = [{ role: 'Body', mulai: 0, akhir: total - 1 }];
  }

  // 3) Pecah tiap kelompok supaya patuh MAX_REF_IMAGES_PER_PART & clipMaxSec.
  const partsBaru: PartDef[] = [];
  for (const g of groups) {
    let mulai = g.mulai;
    while (mulai <= g.akhir) {
      let akhir = mulai;
      let durTotal = durasiPerScene[mulai] ?? 8;
      let jumlahFoto = 1;
      while (
        akhir + 1 <= g.akhir
        && jumlahFoto < MAX_REF_IMAGES_PER_PART
        && durTotal + (durasiPerScene[akhir + 1] ?? 8) <= clipMaxKonv
      ) {
        akhir += 1;
        durTotal += durasiPerScene[akhir] ?? 8;
        jumlahFoto += 1;
      }

      const cuts: CutDef[] = [];
      const refIds: number[] = [];
      for (let idx = mulai; idx <= akhir; idx++) {
        const sc = scenes[idx];
        if (sc?.photoId == null) continue; // scene belum berfoto — tidak jadi cut kosong
        cuts.push({ photoId: sc.photoId, label: sc.label || '', durasiDetik: durasiPerScene[idx] ?? 8 });
        if (!refIds.includes(sc.photoId)) refIds.push(sc.photoId);
      }
      if (cuts.length > 0) {
        partsBaru.push({
          role: g.role,
          durationSec: durTotal,
          voDurationSec: defaultVoDurationSec(durTotal),
          refPhotoIds: refIds,
          cuts,
          label: g.label,
        });
      }
      mulai = akhir + 1;
    }
  }

  // 4) Tanpa `parts` lama valid: koreksi role ujung meniru sceneRole() posisi lama.
  if (!partsLamaValid && partsBaru.length > 0) {
    if (partsBaru.length === 1) {
      partsBaru[0].role = 'Hook';
    } else {
      partsBaru[0].role = 'Hook';
      partsBaru[partsBaru.length - 1].role = 'CTA';
    }
  }

  return partsBaru;
}

// ════════════════════════════════════════════════════════════════════════════
// LOOKUP DATA untuk Master Prompt Compiler (Fase V4) — disiapkan di V3, belum dipakai.
// ════════════════════════════════════════════════════════════════════════════

// (a) Format spec prompt per AI tool (PRD 7.4) + dukungan reference image.
//     Veo3 / Sora / CogVideoX = TIDAK mendukung reference image (text-to-video murni).
export interface ToolSpec { formatSpec: string; supportsRefImage: boolean }
export const AI_TOOL_FORMAT_SPEC: Record<string, ToolSpec> = {
  google_flow: {
    formatSpec: 'Natural language cinematic dengan dukungan reference image (Ingredients). Subject + action + environment + lighting + camera movement + mood. Native audio & dialog lip-sync didukung. End with: [X]s, [ratio] vertical frame. English.',
    supportsRefImage: true,
  },
  veo3: {
    formatSpec: 'Natural language cinematic. Subject + action + environment + lighting + camera movement + mood. End with: [X]s, [ratio] vertical frame. English.',
    supportsRefImage: false,
  },
  kling: {
    formatSpec: 'Structured prompt + negative prompt. [Main subject], [motion], [camera], [style]. Reference image as first frame. Duration [X]s, ratio [ratio].',
    supportsRefImage: true,
  },
  minimax: {
    formatSpec: 'Concise cinematic description + camera directive. Reference image guides subject. [Action], [shot type], [mood]. [X]s, [ratio].',
    supportsRefImage: true,
  },
  runway: {
    formatSpec: 'Gen-4: short directive prompt + image input. [Camera move]: [subject doing action], [style]. Keep under ~1000 chars. [ratio].',
    supportsRefImage: true,
  },
  luma: {
    formatSpec: 'Dream Machine: natural language scene + keyframe image. Describe motion & camera flow. [X]s, [ratio].',
    supportsRefImage: true,
  },
  pika: {
    formatSpec: 'Short prompt + image. [subject], [action], [camera], -ar [ratio] -motion [1-4]. Keep under ~512 chars.',
    supportsRefImage: true,
  },
  sora: {
    formatSpec: 'Rich narrative cinematic paragraph. Detailed subject, environment, lighting, lens, camera choreography, mood. English. [X]s, [ratio].',
    supportsRefImage: false,
  },
  jianying: {
    formatSpec: 'Jianying/CapCut AI: simple descriptive prompt + reference image. [subject] [action] [scene], [style]. [ratio].',
    supportsRefImage: true,
  },
  wan21: {
    formatSpec: 'Wan 2.1: structured prompt + optional image. [subject], [motion], [environment], [camera]. Concise. [ratio].',
    supportsRefImage: true,
  },
  cogvideox: {
    formatSpec: 'CogVideoX: detailed English text-to-video paragraph. Subject + action + setting + camera + lighting. No image input. [X]s, [ratio].',
    supportsRefImage: false,
  },
};

// (b) Platform behavior note (PRD 7.3) — keyed by nilai PLATFORMS.
export const PLATFORM_BEHAVIOR: Record<string, string> = {
  tiktok: 'Hook 0–2 detik wajib kuat; native/UGC look; teks on-screen besar; trend-audio friendly; fast cut.',
  ig_reels: 'Estetika rapi & aspiratif; transisi mulus; caption ringkas + CTA save/share; cocok luxury showcase.',
  yt_shorts: 'Retensi penuh penting; struktur jelas hook-value-CTA; boleh sedikit lebih informatif/edukatif.',
  fb_reels: 'Audiens lebih dewasa/keluarga; pesan jelas & langsung; subtitle wajib (sering ditonton tanpa suara).',
};

// (c) Konteks niche real_estate (fixed).
export const REAL_ESTATE_CONTEXT = {
  psikografis: 'Calon pembeli dalam fase riset, butuh keyakinan sebelum keputusan besar',
  painPoint: 'Takut salah investasi, proses beli properti terasa rumit dan menakutkan',
} as const;

// (d) Hint visual per label foto (membantu AI menggambarkan scene).
export const PHOTO_LABEL_HINT: Record<string, string> = {
  'Fasad': 'tampak depan bangunan, pintu masuk utama, halaman depan, eksterior',
  'Foyer/Lobby': 'area masuk/foyer, lobby, kesan pertama saat masuk',
  'Ruang Tamu': 'area duduk utama, sofa, meja, dekorasi ruang tamu',
  'Ruang Keluarga': 'ruang berkumpul keluarga, sofa santai, TV, suasana hangat',
  'Ruang Makan': 'meja makan, kursi, area bersantap, pencahayaan hangat',
  'Kamar Tidur': 'kasur, headboard, pencahayaan kamar, suasana istirahat',
  'Walk-in Closet': 'lemari pakaian besar, walk-in closet, area rias',
  'Kamar Mandi': 'kloset, wastafel, shower, keramik, area mandi',
  'Dapur': 'kitchen set, kompor, kabinet, area memasak',
  'Ruang Cuci/Jemur': 'area cuci, mesin cuci, tempat jemur, service area',
  'Ruang Kerja/Study': 'meja kerja, rak buku, area belajar/WFH yang tenang',
  'Gym/Fitness': 'area gym/fitness, alat olahraga, ruang latihan',
  'Koridor/Tangga': 'koridor penghubung, tangga, railing, transisi antar ruang',
  'Void/Plafon Tinggi': 'void, plafon tinggi, kesan lega dan mewah vertikal',
  'Taman/Halaman': 'rumput, tanaman, ruang terbuka hijau, area outdoor',
  'Carport/Garasi': 'tempat parkir kendaraan, kanopi/garasi, akses mobil',
  'Balkon/Teras': 'area teras/balkon, tempat duduk santai, pemandangan',
  'Rooftop': 'area atap, rooftop lounge, pemandangan kota/sekitar dari atas',
  'Kolam Renang': 'kolam renang, deck, area berenang, suasana resort',
  'Musholla': 'ruang sholat/musholla, sajadah, suasana khusyuk dan bersih',
  'Gudang': 'ruang penyimpanan, gudang, area utilitas',
  'Ruang Usaha': 'area komersial/usaha, ruang display, etalase, ruang kerja',
  'Tampak Lokasi/Lingkungan': 'jalan akses, lingkungan sekitar, landmark terdekat, suasana area',
  'Lainnya': 'detail tambahan properti yang relevan',
};

// (e) Ekspresi & Emosi Karakter (PRD 3.14).
export interface ExprOpt extends Opt { desc: string }
export const EXPRESSIONS: ExprOpt[] = [
  { value: 'auto',          label: 'Auto',                     desc: 'AI menyesuaikan ekspresi dengan tone & peran scene' },
  { value: 'excited_joyful', label: 'Excited & Joyful',        desc: 'antusias, gembira, energi tinggi, senyum lebar' },
  { value: 'confident_auth', label: 'Confident & Authoritative', desc: 'percaya diri, berwibawa, meyakinkan' },
  { value: 'surprised_amazed', label: 'Surprised & Amazed',     desc: 'terkejut, takjub, mata terbuka lebar' },
  { value: 'warm_friendly',  label: 'Warm & Friendly',          desc: 'hangat, ramah, mengundang, approachable' },
  { value: 'urgent_intense', label: 'Urgent & Intense',         desc: 'mendesak, serius, penuh tekanan waktu' },
  { value: 'empathetic',     label: 'Empathetic & Relatable',   desc: 'empati, memahami, relatable dengan penonton' },
  { value: 'playful_humor',  label: 'Playful & Humorous',       desc: 'jenaka, santai, menghibur' },
  { value: 'mysterious',     label: 'Mysterious & Dramatic',    desc: 'misterius, dramatis, membangun rasa penasaran' },
  { value: 'curious_invest', label: 'Curious & Investigative',  desc: 'penasaran, menelusuri, mengajak eksplorasi' },
];

// (f) Sub-form karakter (PRD 3.13).
export const ETHNIC_OPTIONS: Opt[] = [
  { value: 'asia_tenggara', label: 'Asia Tenggara' },
  { value: 'asia_timur',    label: 'Asia Timur' },
  { value: 'asia_selatan',  label: 'Asia Selatan' },
  { value: 'kaukasia',      label: 'Kaukasia' },
  { value: 'afrika',        label: 'Afrika' },
  { value: 'latin',         label: 'Latin' },
  { value: 'timur_tengah',  label: 'Timur Tengah' },
  { value: 'mixed',         label: 'Mixed' },
];

export const STYLE_OPTIONS: Opt[] = [
  { value: 'kasual_modern', label: 'Kasual Modern' },
  { value: 'profesional',   label: 'Profesional' },
  { value: 'trendy',        label: 'Trendy / Streetwear' },
  { value: 'tradisional',   label: 'Tradisional' },
  { value: 'sporty',        label: 'Sporty' },
  { value: 'glamour',       label: 'Glamour' },
];

export const GENDER_OPTIONS: Opt[] = [
  { value: 'Pria',   label: 'Pria' },
  { value: 'Wanita', label: 'Wanita' },
  { value: 'Duo',    label: 'Duo' },
];

// Tabel lipsync (PRD 3.8) — sinkronisasi durasi klip ↔ jumlah kata narasi.
// Sumber tunggal ada di functions/_lib/viralframe-shared.js (dedup Fase 4);
// di sini hanya di-re-export dengan tipe TS agar konsumen tetap type-safe.
export interface LipsyncRow { minSec: number; maxSec: number; maxWords: number; pace: string; instruksi: string }
export const LIPSYNC_TABLE: LipsyncRow[] = SHARED_LIPSYNC_TABLE as LipsyncRow[];
export const getLipsync: (durasiDetik: number) => LipsyncRow = sharedGetLipsync;

// Mapping value Indonesia → label English untuk injeksi deskripsi karakter (PRD 3.13).
export const ETHNIC_EN: Record<string, string> = {
  asia_tenggara: 'Southeast Asian',
  asia_timur:    'East Asian',
  asia_selatan:  'South Asian',
  kaukasia:      'Caucasian',
  afrika:        'African',
  latin:         'Latino',
  timur_tengah:  'Middle Eastern',
  mixed:         'mixed-race',
};

export const STYLE_EN: Record<string, string> = {
  kasual_modern: 'casual modern outfit',
  profesional:   'professional business attire',
  trendy:        'trendy streetwear',
  tradisional:   'traditional attire',
  sporty:        'sporty athletic wear',
  glamour:       'glamorous elegant outfit',
};

// Deskripsi ekspresi singkat English — sumber tunggal di viralframe-shared.js.
export const EXPRESSION_EN: Record<string, string> = SHARED_EXPRESSION_EN;

// Audio native, batas klip, & negative prompt — sumber tunggal di viralframe-shared.js
// (dipakai backend ai-generate.js secara natif). Di sini hanya di-re-export bertipe.
/** Tool dengan audio native + lip-sync (Veo family): dialog WAJIB ditanam di dalam prompt. */
export const isNativeAudioTool: (toolId: string) => boolean = sharedIsNativeAudioTool;
/** Batas panjang satu klip (detik) untuk tool ini, atau null bila tidak dibatasi. */
export const getClipMaxSec: (toolId: string) => number | null = sharedGetClipMaxSec;
/** Batas foto referensi per Part (karakter ikut dihitung). Sumber tunggal:
 * functions/_lib/viralframe-shared.js — JANGAN duplikasi angkanya di tempat lain. */
export const MAX_REF_IMAGES_PER_PART: number = SHARED_MAX_REF_IMAGES_PER_PART;
export const NEGATIVE_PROMPT_VIDEO: string = SHARED_NEGATIVE_PROMPT_VIDEO;
/** Kosakata realisme fisik kamera (lensa/grain/imperfection) — pengganti frasa kualitas generik. */
export const REALISM_QUALITY_CUES: string[] = SHARED_REALISM_QUALITY_CUES;
/** Frasa penutup kualitas yang DILARANG (terbukti mendorong hasil CGI-like). */
export const REALISM_BANNED_QUALITY_PHRASES: string[] = SHARED_REALISM_BANNED_QUALITY_PHRASES;
/** Versi "Prompt Rulebook" — stempel ke params_json riwayat generate untuk traceability
 * (generate lama bisa dibandingkan dengan aturan yang berlaku saat itu dibuat). */
export const RULEBOOK_VERSION: string = SHARED_RULEBOOK_VERSION;
/** Nama berkas foto karakter di ZIP Jalur C — sinkron dengan ai-generate.js. */
export const namaFileKarakter: (nama: string) => string = sharedNamaFileKarakter;

// Busur emosi & intent akting per peran Part (Hook/Body/CTA) + hint suara —
// sumber tunggal di viralframe-shared.js. Di sini hanya di-re-export bertipe.
export const EMOTION_ARC_BY_ROLE: Record<string, string> = SHARED_EMOTION_ARC_BY_ROLE;
export const getEmotionForRole: (role: string, baseExpressionEn?: string) => string | undefined = sharedGetEmotionForRole;
export const PERFORMANCE_INTENT_BY_ROLE: Record<string, string> = SHARED_PERFORMANCE_INTENT_BY_ROLE;
export const VOICE_PERSONA_HINT: string = SHARED_VOICE_PERSONA_HINT;
/** Contoh KALIMAT TERUCAP per tipe CTA (keyed by CTA_TYPES.value). Dikirim ke
 * backend bersama label — label saja membuat AI mengarang ajakan kabur yang tidak
 * menyebut objek ajakannya (audit 2026-08-04). */
export const CTA_SPOKEN_EXAMPLE: Record<string, string> = SHARED_CTA_SPOKEN_EXAMPLE;
/** Durasi VO baku sebuah Part (~80% durasi klip) — menyisakan ruang napas.
 * Dulu nilainya = durasi penuh, sehingga model disuruh bicara tanpa henti. */
export const defaultVoDurationSec: (durationSec: number) => number = sharedDefaultVoDurationSec;
export const VOICE_PRIORITY_NOTE: string = SHARED_VOICE_PRIORITY_NOTE;

// ─── Penamaan file aset (dipakai Master Prompt + ZIP export) ─────────────────
// PENTING: ZIP generation WAJIB memakai buildZipNames() (foto properti) &
// characterFileName() (foto karakter) yang SAMA PERSIS dengan compiler, agar nama
// file yang DISEBUT di PROMPT.txt identik dengan file yang ADA di folder LAMPIRKAN/.
// Salah nama = user melampirkan ruangan yang keliru ke Google Flow.
// Jangan duplikasi logika penamaan di tempat lain.
// ⚠️ JANGAN hidupkan lagi penamaan bergaya `scene01_fasad.webp`. Format itu dibuang
// pada refactor 2026-08-01 justru atas keluhan user: saat melampirkan foto referensi
// secara manual di Google Flow, nomor scene tidak memberi tahu ruangan apa isinya.
// Penamaan kanonik sekarang deskriptif: `fasad.webp`, `kamar_mandi1.webp`.
// ⚠️ Pemisah GARIS BAWAH (bukan strip) — keputusan refactor 2026-08-01 (rencana
// "Part-as-Generate-Unit"). Nama file ZIP dilampirkan manual oleh user ke Google
// Flow; garis bawah terbaca lebih jelas sebagai satu nama utuh (`kamar_tidur.webp`)
// dibanding strip. Diverifikasi hanya dipakai 3 tempat, semuanya nama file
// ViralFrame — TIDAK terkait `slugify()` slug URL/SEO backend (jangan disamakan).
export function slugifyLabel(label: string): string {
  return (label || '')
    .toLowerCase()
    .replace(/[\s/]+/g, '_')        // spasi & slash → '_'
    .replace(/[^a-z0-9_]/g, '')     // buang non-alfanumerik selain '_'
    .replace(/_+/g, '_')            // rapikan '_' beruntun
    .replace(/^_+|_+$/g, '')        // trim '_' di tepi
    || 'untitled';
}

// character_vina.webp
export function characterFileName(nama: string): string {
  return `character_${slugifyLabel(nama)}.webp`;
}

// ─── Penamaan ZIP Foto Berlabel (dipindah dari LabelFotoStep.tsx, Tahap 1) ────
// Sumber tunggal supaya semua jalur ZIP (Label Foto Step, dan nanti Storyboard
// per-Part di Tahap 4) memakai penamaan yang SAMA PERSIS.
export interface ZipSourceImage { id: number; label_ruangan?: string | null }

/** Nama file ZIP per foto: label unik → "fasad.webp"; label dengan >1 foto →
 *  "fasad1.webp", "fasad2.webp" (urutan sesuai urutan foto). */
export function buildZipNames(images: ZipSourceImage[]): Map<number, string> {
  const groups = new Map<string, ZipSourceImage[]>();
  for (const im of images) {
    const label = (im.label_ruangan ?? '').trim();
    if (!label) continue;
    const arr = groups.get(label) ?? [];
    arr.push(im);
    groups.set(label, arr);
  }
  const names = new Map<number, string>();
  for (const [label, arr] of groups) {
    const slug = slugifyLabel(label);
    arr.forEach((im, i) => {
      names.set(im.id, arr.length > 1 ? `${slug}${i + 1}.webp` : `${slug}.webp`);
    });
  }
  return names;
}
