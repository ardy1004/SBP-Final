// Konstanta bersama ViralFrame — sumber tunggal untuk value/label yang dipakai
// lintas Jalur A (Step 1-3) dan Jalur C (AIGenerateTab). Jangan duplikasi
// deklarasi ini di komponen manapun — import dari sini.
//
// PLATFORM_OPTIONS values (tiktok/ig_reels/yt_shorts/fb_reels) SENGAJA sama
// persis dengan PLATFORMS di viralframe/options.ts (dipakai Step 1) agar
// s1.platforms tetap kompatibel tanpa migrasi data.

export interface PlatformOption { value: string; label: string; rasio: string; durasi: number }
export const PLATFORM_OPTIONS: PlatformOption[] = [
  { value: 'tiktok', label: '📱 TikTok', rasio: '9:16', durasi: 8 },
  { value: 'ig_reels', label: '📸 Instagram Reels', rasio: '9:16', durasi: 8 },
  { value: 'yt_shorts', label: '▶️ YouTube Shorts', rasio: '9:16', durasi: 10 },
  { value: 'fb_reels', label: '👥 Facebook Reels', rasio: '9:16', durasi: 8 },
];

export interface AiToolOption { value: string; label: string }
export const AI_TOOL_OPTIONS: AiToolOption[] = [
  { value: 'Veo3', label: '🎬 Veo 3 (Google)' },
  { value: 'Kling', label: '🎥 Kling AI' },
  { value: 'Wan', label: '🌊 Wan (SiliconFlow)' },
];

export interface BahasaOption { value: string; label: string }
export const BAHASA_OPTIONS: BahasaOption[] = [
  { value: 'Indonesia', label: '🇮🇩 Bahasa Indonesia' },
  { value: 'English', label: '🇬🇧 English' },
  { value: 'Jawa', label: '🏛️ Bahasa Jawa' },
];

export interface MusikOption { value: string; label: string; prompt: string }
export const MUSIK_OPTIONS: MusikOption[] = [
  { value: 'corporate', label: '🎵 Professional Corporate', prompt: 'Background audio: subtle upbeat corporate instrumental music, confident professional atmosphere, moderate tempo, clean cinematic mix, no lyrics.' },
  { value: 'chill', label: '🌊 Chill & Elegant', prompt: 'Background audio: soft ambient piano melody, relaxed sophisticated atmosphere, slow gentle tempo, soothing, no lyrics.' },
  { value: 'energetic', label: '⚡ Energetic Modern', prompt: 'Background audio: upbeat modern pop instrumental, dynamic youthful energy, fast-paced rhythm, no lyrics.' },
  { value: 'acoustic', label: '🎸 Acoustic Warm', prompt: 'Background audio: warm acoustic guitar melody, friendly inviting home atmosphere, moderate tempo, no lyrics.' },
  { value: 'none', label: '🔇 Tanpa Musik', prompt: '' },
];

export interface FotoLabelOption { value: string; label: string; deskripsi: string }
export const FOTO_LABEL_OPTIONS: FotoLabelOption[] = [
  { value: 'fasad', label: '🏠 Fasad / Eksterior', deskripsi: 'tampak depan/fasad bangunan' },
  { value: 'kamar_tidur', label: '🛏️ Kamar Tidur', deskripsi: 'kamar tidur' },
  { value: 'kamar_mandi', label: '🚿 Kamar Mandi', deskripsi: 'kamar mandi' },
  { value: 'dapur', label: '🍳 Dapur', deskripsi: 'dapur' },
  { value: 'ruang_tamu', label: '🛋️ Ruang Tamu', deskripsi: 'ruang tamu' },
  { value: 'ruang_santai', label: '🎮 Ruang Santai', deskripsi: 'ruang santai atau ruang keluarga' },
  { value: 'balkon', label: '🌿 Balkon', deskripsi: 'balkon' },
  { value: 'kolam_renang', label: '🏊 Kolam Renang', deskripsi: 'kolam renang' },
  { value: 'koridor_tangga', label: '🪜 Koridor / Tangga', deskripsi: 'koridor atau area tangga' },
  { value: 'parkir', label: '🚗 Area Parkir', deskripsi: 'area parkir' },
  { value: 'view_sekitar', label: '🌆 View / Lingkungan', deskripsi: 'pemandangan atau lingkungan sekitar' },
  { value: 'lainnya', label: '📷 Lainnya', deskripsi: 'area properti' },
];
