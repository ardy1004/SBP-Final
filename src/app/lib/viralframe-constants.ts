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

/**
 * ⚠️ Nilai `value` di sini TERSIMPAN di riwayat (`params_json.musik_value`) dan
 * dipakai ZIP untuk meresolve label. JANGAN mengubah/menghapus value lama —
 * hanya boleh MENAMBAH. Menghapus value akan membuat riwayat lama tidak bisa
 * di-resolve labelnya.
 *
 * Kolamnya diperluas 2026-08-02 (4 → 8 karakter musik). Alasannya: string musik
 * bersifat BEKU per opsi dan ditempel di akhir SETIAP prompt dengan perintah
 * "JANGAN dimodifikasi", sehingga seluruh video di akun memakai karakter audio
 * yang identik. Dengan `auto` (rotasi least-recently-used) kolam sekecil 4 akan
 * terasa berulang dengan cepat.
 */
export const MUSIK_OPTIONS: MusikOption[] = [
  // Rotasi otomatis — backend memilih di antara opsi non-'auto'/'none' memakai
  // pola least-recently-used yang sama dengan rotasi foto di suggest-storyboard.js.
  { value: 'auto', label: '🎲 Otomatis (rotasi)', prompt: '' },
  { value: 'corporate', label: '🎵 Professional Corporate', prompt: 'Background audio: subtle upbeat corporate instrumental music, confident professional atmosphere, moderate tempo, clean cinematic mix, no lyrics.' },
  { value: 'chill', label: '🌊 Chill & Elegant', prompt: 'Background audio: soft ambient piano melody, relaxed sophisticated atmosphere, slow gentle tempo, soothing, no lyrics.' },
  { value: 'energetic', label: '⚡ Energetic Modern', prompt: 'Background audio: upbeat modern pop instrumental, dynamic youthful energy, fast-paced rhythm, no lyrics.' },
  { value: 'acoustic', label: '🎸 Acoustic Warm', prompt: 'Background audio: warm acoustic guitar melody, friendly inviting home atmosphere, moderate tempo, no lyrics.' },
  { value: 'cinematic', label: '🎬 Cinematic Strings', prompt: 'Background audio: gentle cinematic string swell, aspirational and premium atmosphere, slow build, no lyrics.' },
  { value: 'lofi', label: '🎧 Lo-fi Santai', prompt: 'Background audio: mellow lo-fi hip hop beat, calm everyday-life atmosphere, laid-back tempo, soft vinyl texture, no lyrics.' },
  { value: 'tropical', label: '🌴 Tropical Bright', prompt: 'Background audio: bright tropical house instrumental, fresh airy optimistic atmosphere, light percussion, moderate tempo, no lyrics.' },
  { value: 'minimal', label: '⬜ Minimal Clean', prompt: 'Background audio: minimal ambient pad with sparse soft piano notes, clean understated atmosphere, very slow tempo, no lyrics.' },
  { value: 'none', label: '🔇 Tanpa Musik', prompt: '' },
];

/** Opsi yang boleh dipilih rotasi `auto` — 'auto' & 'none' dikecualikan. */
export const MUSIK_ROTASI_VALUES: string[] = MUSIK_OPTIONS
  .filter(m => m.value !== 'auto' && m.value !== 'none')
  .map(m => m.value);

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
