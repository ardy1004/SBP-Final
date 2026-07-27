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

// AI_TOOL_OPTIONS DIHAPUS (audit 2026-07-26): tidak pernah dipakai, dan nilainya
// menyimpang dari AI_TOOLS di viralframe/options.ts ('Veo3' vs 'veo3',
// tanpa 'google_flow'). Kalau sempat tersambung, isNativeAudioTool() akan gagal
// diam-diam dan video kembali bisu. Pakai AI_TOOLS dari options.ts.

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
  { value: 'foyer', label: '🚪 Foyer / Lobby', deskripsi: 'area masuk/foyer' },
  { value: 'kamar_tidur', label: '🛏️ Kamar Tidur', deskripsi: 'kamar tidur' },
  { value: 'walk_in_closet', label: '👗 Walk-in Closet', deskripsi: 'lemari pakaian/walk-in closet' },
  { value: 'kamar_mandi', label: '🚿 Kamar Mandi', deskripsi: 'kamar mandi' },
  { value: 'dapur', label: '🍳 Dapur', deskripsi: 'dapur' },
  { value: 'laundry', label: '🧺 Ruang Cuci/Jemur', deskripsi: 'area cuci/jemur' },
  { value: 'ruang_tamu', label: '🛋️ Ruang Tamu', deskripsi: 'ruang tamu' },
  { value: 'ruang_santai', label: '👨‍👩‍👧 Ruang Keluarga', deskripsi: 'ruang keluarga/santai' },
  { value: 'ruang_makan', label: '🍽️ Ruang Makan', deskripsi: 'ruang makan' },
  { value: 'ruang_kerja', label: '💻 Ruang Kerja/Study', deskripsi: 'ruang kerja/study' },
  { value: 'gym', label: '🏋️ Gym / Fitness', deskripsi: 'area gym/fitness' },
  { value: 'void', label: '🔼 Void / Plafon Tinggi', deskripsi: 'void/plafon tinggi' },
  { value: 'balkon', label: '🌿 Balkon / Teras', deskripsi: 'balkon' },
  { value: 'taman', label: '🌳 Taman / Halaman', deskripsi: 'taman/halaman' },
  { value: 'rooftop', label: '🏙️ Rooftop', deskripsi: 'area rooftop' },
  { value: 'kolam_renang', label: '🏊 Kolam Renang', deskripsi: 'kolam renang' },
  { value: 'musholla', label: '🕌 Musholla', deskripsi: 'musholla/ruang sholat' },
  { value: 'gudang', label: '📦 Gudang', deskripsi: 'gudang/penyimpanan' },
  { value: 'ruang_usaha', label: '🏪 Ruang Usaha', deskripsi: 'ruang usaha/komersial' },
  { value: 'koridor_tangga', label: '🪜 Koridor / Tangga', deskripsi: 'koridor atau area tangga' },
  { value: 'parkir', label: '🚗 Carport / Garasi', deskripsi: 'area parkir' },
  { value: 'view_sekitar', label: '🌆 View / Lingkungan', deskripsi: 'pemandangan atau lingkungan sekitar' },
  { value: 'lainnya', label: '📷 Lainnya', deskripsi: 'area properti' },
];
