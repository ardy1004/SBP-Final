// Opsi dropdown ViralFrame — Fase V2 (Parameter Video).
// Nilai disusun dari contoh yang disebut di PRD ringkas instruksi fase.
// value = key disimpan ke state/params_json; label = teks UI.

export interface Opt { value: string; label: string }

// (d) AI Video Tool — 10 pilihan + perkiraan batas karakter prompt
export interface AiTool extends Opt { charLimit: number }
export const AI_TOOLS: AiTool[] = [
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

// (c) Platform Distribusi
export const PLATFORMS: Opt[] = [
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'ig_reels',  label: 'Instagram Reels' },
  { value: 'yt_shorts', label: 'YouTube Shorts' },
  { value: 'fb_reels',  label: 'Facebook Reels' },
];

// Step 2 — Label Foto per Scene
export const PHOTO_LABELS: string[] = [
  'Fasad', 'Ruang Tamu', 'Kamar Tidur', 'Kamar Mandi', 'Dapur',
  'Taman/Halaman', 'Carport/Garasi', 'Balkon/Teras', 'Kolam Renang',
  'Ruang Usaha', 'Tampak Lokasi/Lingkungan', 'Lainnya',
];

// Peran scene berdasarkan posisi (scene 1 = Hook, terakhir = CTA, sisanya = Body)
export function sceneRole(index: number, total: number): 'Hook' | 'Body' | 'CTA' {
  if (index === 0) return 'Hook';
  if (index === total - 1) return 'CTA';
  return 'Body';
}

// ════════════════════════════════════════════════════════════════════════════
// LOOKUP DATA untuk Master Prompt Compiler (Fase V4) — disiapkan di V3, belum dipakai.
// ════════════════════════════════════════════════════════════════════════════

// (a) Format spec prompt per AI tool (PRD 7.4) + dukungan reference image.
//     Veo3 / Sora / CogVideoX = TIDAK mendukung reference image (text-to-video murni).
export interface ToolSpec { formatSpec: string; supportsRefImage: boolean }
export const AI_TOOL_FORMAT_SPEC: Record<string, ToolSpec> = {
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
  'Ruang Tamu': 'area duduk utama, sofa, meja, dekorasi ruang tamu',
  'Kamar Tidur': 'kasur, headboard, pencahayaan kamar, suasana istirahat',
  'Kamar Mandi': 'kloset, wastafel, shower, keramik, area mandi',
  'Dapur': 'kitchen set, kompor, kabinet, area memasak',
  'Taman/Halaman': 'rumput, tanaman, ruang terbuka hijau, area outdoor',
  'Carport/Garasi': 'tempat parkir kendaraan, kanopi/garasi, akses mobil',
  'Balkon/Teras': 'area teras/balkon, tempat duduk santai, pemandangan',
  'Kolam Renang': 'kolam renang, deck, area berenang, suasana resort',
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
export interface LipsyncRow { minSec: number; maxSec: number; maxWords: number; pace: string; instruksi: string }
export const LIPSYNC_TABLE: LipsyncRow[] = [
  { minSec: 2,  maxSec: 3,  maxWords: 8,   pace: 'ultra_fast',    instruksi: 'Ucapan sangat cepat, 1 kalimat pendek punchy, tanpa jeda.' },
  { minSec: 4,  maxSec: 5,  maxWords: 16,  pace: 'fast',          instruksi: 'Ucapan cepat, 1–2 kalimat ringkas, jeda minimal.' },
  { minSec: 6,  maxSec: 8,  maxWords: 26,  pace: 'normal',        instruksi: 'Tempo natural, 2 kalimat, jeda wajar antar frasa.' },
  { minSec: 9,  maxSec: 12, maxWords: 44,  pace: 'medium',        instruksi: 'Tempo sedang, 2–3 kalimat, ada penekanan kata kunci.' },
  { minSec: 13, maxSec: 20, maxWords: 72,  pace: 'relaxed',       instruksi: 'Tempo santai, 3–4 kalimat, ruang untuk storytelling.' },
  { minSec: 21, maxSec: 30, maxWords: 108, pace: 'slow_dramatic', instruksi: 'Tempo lambat dramatis, jeda sengaja untuk emosi.' },
];

export function getLipsync(durasiDetik: number): LipsyncRow {
  const d = Math.max(2, Math.min(30, Math.round(durasiDetik || 0)));
  for (const row of LIPSYNC_TABLE) {
    if (d >= row.minSec && d <= row.maxSec) return row;
  }
  // d di antara range (mis. tidak mungkin karena kontigu) → fallback terdekat
  return d <= 3 ? LIPSYNC_TABLE[0] : LIPSYNC_TABLE[LIPSYNC_TABLE.length - 1];
}

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

// Deskripsi ekspresi singkat dalam English untuk injeksi ke prompt karakter.
export const EXPRESSION_EN: Record<string, string> = {
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

// ─── Penamaan file aset (dipakai Master Prompt + ZIP export Fase V4b) ─────────
// PENTING (requirement Fase V4b): ZIP generation WAJIB memakai sceneFileName() &
// characterFileName() yang SAMA PERSIS dengan compiler agar nama file di prompt
// selaras dengan file yang ada di ZIP. Jangan duplikasi logika penamaan di tempat lain.
export function slugifyLabel(label: string): string {
  return (label || '')
    .toLowerCase()
    .replace(/[\s/]+/g, '-')        // spasi & slash → '-'
    .replace(/[^a-z0-9-]/g, '')     // buang non-alfanumerik selain '-'
    .replace(/-+/g, '-')            // rapikan '-' beruntun
    .replace(/^-+|-+$/g, '')        // trim '-' di tepi
    || 'untitled';
}

// scene01_fasad.webp, scene02_kamar-tidur.webp
export function sceneFileName(sceneIndex: number, label: string): string {
  return `scene${String(sceneIndex + 1).padStart(2, '0')}_${slugifyLabel(label)}.webp`;
}

// character_vina.webp
export function characterFileName(nama: string): string {
  return `character_${slugifyLabel(nama)}.webp`;
}
