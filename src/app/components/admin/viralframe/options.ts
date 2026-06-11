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
