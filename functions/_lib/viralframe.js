// ViralFrame — kosakata bersama, versi BANGUN ULANG (2026-09-04).
//
// Menggantikan `viralframe-shared.js` + `viralframe/options.ts` + `archetypes.ts`
// yang dihapus saat fitur ini dibangun ulang dari nol. File lama memuat seluruh
// kosakata mesin prompt (arketipe, koreografi kamera, tabel lipsync, aturan
// realisme) — semuanya milik wizard yang sudah tidak ada.
//
// ⚠️ File ini SENGAJA dimulai minimal: HANYA yang benar-benar dipakai kode yang
// masih hidup. Jangan memindahkan konstanta lama ke sini "supaya tidak hilang" —
// git menyimpannya, dan menyalinnya kembali tanpa pemakai adalah cara lama
// tumbuh jadi 466 baris. Tambahkan saat stasiun barunya benar-benar dibangun.
//
// Ditempatkan di functions/_lib/ (bukan src/app) mengikuti pola yang sudah ada:
// backend Functions mengimpornya natif, frontend lewat Vite. Plain JS tanpa
// React / API browser supaya aman di runtime Workers.

/**
 * Kosakata label ruangan/aspek foto properti.
 *
 * Dipakai DI LUAR ViralFrame juga — `PropertyPhotosCard.tsx` (Detail Properti)
 * memakainya untuk dropdown label foto, dan kolom `property_images.label_ruangan`
 * di produksi berisi nilai-nilai ini. Karena itu daftarnya TIDAK boleh berubah
 * sembarangan: mengganti string berarti membuat label yang sudah tersimpan
 * (529 foto) tidak lagi cocok dengan pilihan yang tersedia.
 *
 * ⚠️ Seluruhnya berorientasi RUANGAN, jadi tidak cocok untuk tanah/lahan kosong
 * (61 listing). Kosakata per-niche adalah pekerjaan stasiun Material saat
 * dibangun — jangan menambal daftar ini dengan istilah tanah tanpa memisahkannya.
 */
export const PHOTO_LABELS = [
  'Fasad', 'Foyer/Lobby', 'Ruang Tamu', 'Ruang Keluarga', 'Ruang Makan',
  'Kamar Tidur', 'Walk-in Closet', 'Kamar Mandi', 'Dapur', 'Ruang Cuci/Jemur',
  'Ruang Kerja/Study', 'Gym/Fitness', 'Koridor/Tangga', 'Void/Plafon Tinggi',
  'Taman/Halaman', 'Carport/Garasi', 'Balkon/Teras', 'Rooftop', 'Kolam Renang',
  'Musholla', 'Gudang', 'Ruang Usaha', 'Tampak Lokasi/Lingkungan', 'Lainnya',
];

/**
 * Label tampilan untuk kolom `viralframe_agent_videos.gaya` milik video LAMA.
 *
 * Bukan kosakata untuk video baru — ini murni agar 573 baris yang sudah ada
 * tetap terbaca manusiawi di Konten Agent & Overview setelah arketipe lama
 * dihapus. Diambil dari nilai yang BENAR-BENAR ada di D1 produksi (diukur
 * 2026-09-04), bukan dari daftar arketipe lama yang sebagian tak pernah dipakai:
 *   custom 529 · selfie_luxury_hybrid 43 · agent_broll_hybrid 1
 *
 * Nilai di luar daftar ini ditampilkan apa adanya oleh `labelGaya()`.
 */
/**
 * Padanan Inggris tiap label ruangan, untuk prompt Google Flow.
 *
 * ⚠️ Prompt Veo berbahasa Inggris; menyisipkan label Indonesia apa adanya
 * menghasilkan "Context: the ruang tamu" — model tidak mengenalinya sebagai
 * ruangan dan konteks cut-nya hilang tanpa error apa pun. Kuncinya WAJIB sama
 * persis dengan PHOTO_LABELS; yang tak terpetakan jatuh ke 'interior space'
 * (netral, bukan salah).
 */
const LABEL_EN = {
  'Fasad': 'house facade seen from the street',
  'Foyer/Lobby': 'entrance foyer',
  'Ruang Tamu': 'living room',
  'Ruang Keluarga': 'family room',
  'Ruang Makan': 'dining room',
  'Kamar Tidur': 'bedroom',
  'Walk-in Closet': 'walk-in closet',
  'Kamar Mandi': 'bathroom',
  'Dapur': 'kitchen',
  'Ruang Cuci/Jemur': 'laundry area',
  'Ruang Kerja/Study': 'home office',
  'Gym/Fitness': 'home gym',
  'Koridor/Tangga': 'hallway and staircase',
  'Void/Plafon Tinggi': 'double-height void with high ceiling',
  'Taman/Halaman': 'garden yard',
  'Carport/Garasi': 'carport',
  'Balkon/Teras': 'terrace',
  'Rooftop': 'rooftop deck',
  'Kolam Renang': 'swimming pool',
  'Musholla': 'small prayer room',
  'Gudang': 'storage room',
  'Ruang Usaha': 'commercial space',
  'Tampak Lokasi/Lingkungan': 'surrounding neighbourhood',
  'Lainnya': 'interior space',
};

/** Label ruangan dalam bahasa Inggris untuk prompt; netral bila tak dikenal. */
export function labelInggris(label) {
  return LABEL_EN[String(label ?? '').trim()] ?? 'interior space';
}

const GAYA_LAMA = {
  custom: 'Custom',
  selfie_luxury_hybrid: 'Selfie Vlog Mewah',
  agent_broll_hybrid: 'Agen + B-roll',
};

/** Label gaya yang aman ditampilkan; nilai tak dikenal dikembalikan apa adanya. */
export function labelGaya(id) {
  if (!id) return '';
  return GAYA_LAMA[id] ?? String(id);
}

// ════════════════════════════════════════════════════════════════════════════
// LAPIS 1 — KONSTANTA. Ditentukan platform, bukan selera.
// ════════════════════════════════════════════════════════════════════════════
// Kuota Google Flow mode gratis: 10 detik per generate · 3 generate per akun.
// Satu video = 3 Part = 3 generate, jadi bentuk videonya sudah ditentukan
// kuotanya: 3 Part × 10 detik = 30 detik, dan itu persis Hook / Body / CTA.
//
// ⚠️ BATAS REFERENCE IMAGE — dua sumber, dan keduanya sengaja dipertahankan.
// Dokumentasi resmi Google (Flow Help, Google Vids, blog Veo 3.1 "Ingredients to
// Video", catatan rilis Flow Feb 2026) konsisten menyebut **3 ingredient per
// prompt**. Pemilik akun melaporkan **7** dari layar Flow-nya sendiri (2026-09-04);
// kemungkinan besar itu batas aset yang bisa disimpan di satu Scene, bukan yang
// dikirim ke satu generate.
//
// Diselesaikan tanpa menebak: storyboard boleh memilih sampai `refImagePerPart`
// foto, TAPI renderer memberi PERINGKAT dan menandai `refImageUtama` teratas
// sebagai wajib. Kalau Flow ternyata 3, tiga foto teratas sudah cukup dan sisanya
// diabaikan; kalau 7, semuanya terpakai. Nol deploy ulang saat kenyataannya beda.
export const FLOW = {
  detikPerPart: 10,
  partPerVideo: 3,
  refImagePerPart: 7,
  refImageUtama: 3,
  rasio: '9:16',
};

/** Durasi voiceover baku = 80% durasi klip — menyisakan napas awal & ekor penutup. */
export function voDetikBaku(detikPart = FLOW.detikPerPart) {
  return Math.max(2, Math.round(detikPart * 0.8));
}

/**
 * Anggaran kata untuk sebuah durasi VO.
 *
 * 2,5 kata/detik — dikalibrasi ke 6 storyboard rujukan yang videonya sudah
 * terbukti bagus (VO 8 detik berisi 19–22 kata = 2,38–2,75; dipakai mediannya).
 * Angka ini SATU-SATUNYA yang selamat dari kosakata prompt lama, karena ia
 * diukur dari hasil nyata, bukan dari asumsi.
 */
export function anggaranKata(voDetik) {
  return Math.max(4, Math.round(voDetik * 2.5));
}

// ════════════════════════════════════════════════════════════════════════════
// LAPIS 3 — SUMBU VARIASI. Dipilih SISTEM, bukan AI dan bukan manusia.
// ════════════════════════════════════════════════════════════════════════════
// Kenapa sistem: LLM adalah pencari modus. Diminta "pilih gaya terbaik" 100 kali
// dengan prompt yang sama, ia memilih 3–4 gaya yang itu-itu saja; menaikkan
// temperature menghasilkan kebisingan, bukan keragaman. Menyerahkan lapis ini ke
// AI membuat aturan rotasi gagal — dan gagalnya senyap: tiap storyboard "beda"
// di teks, seragam di layar.
//
// ⚠️ DOMINAN vs KOSMETIK adalah pembedaan yang menentukan seluruh mesin rotasi.
// Sumbu DOMINAN = yang benar-benar terlihat penonton dalam 2 detik pertama.
// Sumbu KOSMETIK (tone, register, ekspresi) sengaja TIDAK ikut `variation_key`:
// dua video yang cuma beda `tone` terlihat kembar di feed, dan menghitungnya
// sebagai "variasi baru" akan membuat plafon 100 tercapai tanpa satu pun video
// yang benar-benar berbeda.

/** Mesin cerita seluruh video — BUKAN sekadar pembukaannya. */
export const MEKANISME = [
  { id: 'curiosity_gap',   label: 'Rasa penasaran',      arahan: 'buka celah informasi di awal dan baru tutup di detik terakhir' },
  { id: 'before_after',    label: 'Sebelum–sesudah',     arahan: 'kontraskan keadaan awal dengan keadaan akhir secara visual' },
  { id: 'hidden_feature',  label: 'Fitur tersembunyi',   arahan: 'tunjukkan satu hal yang tidak terlihat dari foto listing biasa' },
  { id: 'myth_busting',    label: 'Bantah anggapan',     arahan: 'angkat satu anggapan umum tentang properti seperti ini, lalu patahkan dengan fakta yang ada' },
  { id: 'pov_penghuni',    label: 'POV penghuni',        arahan: 'penonton seolah menjalani satu momen sehari-hari di properti ini' },
  { id: 'tur_cepat',       label: 'Tur cepat',           arahan: 'susuri ruang demi ruang dengan tempo tinggi, satu kalimat per ruang' },
  // ⚠️ "harga" SENGAJA tidak disebut di sini. Aturan keras kita melarang nominal
  // harga DIUCAPKAN (harga tampil lewat teks layar), jadi arahan yang menyuruh
  // menjadikannya tulang cerita membuat AI melanggar aturan kita sendiri —
  // dan `retensi.js` akan menandainya sebagai cacat pada setiap video bermekanisme ini.
  { id: 'hitung_angka',    label: 'Bicara angka',        arahan: 'jadikan angka nyata (LT/LB, jumlah kamar, lantai, lebar jalan) sebagai tulang cerita — TANPA menyebut nominal harga' },
  // ⚠️ "kelas harga" SENGAJA dihindari. Arahan lama berbunyi "bandingkan dengan
  // pilihan lain di kelas harga yang sama" — itu menyeret AI membicarakan harga
  // padahal aturan keras melarang nominal DIUCAPKAN, lalu `retensi.js` menandai
  // kepatuhannya sebagai cacat. Kontradiksi yang sama pernah ada di
  // `hitung_angka`. Pembandingnya sekarang non-harga.
  { id: 'perbandingan',    label: 'Perbandingan',        arahan: 'bandingkan dengan properti sejenis di area yang sama pada ukuran, kondisi, atau akses — JANGAN menyebut harga' },
  { id: 'satu_ruang',      label: 'Fokus satu ruang',    arahan: 'habiskan hampir seluruh durasi pada SATU ruang paling kuat' },
  { id: 'kejutan_akhir',   label: 'Kejutan di akhir',    arahan: 'simpan elemen terbaik properti untuk cut terakhir' },
  { id: 'cerita_lokasi',   label: 'Cerita lokasi',       arahan: 'jadikan lingkungan sekitar dan akses sebagai inti cerita' },
  { id: 'checklist',       label: 'Checklist',           arahan: 'susun sebagai daftar syarat yang dicari pembeli, lalu centang satu per satu' },
];

/** Struktur 2 detik pertama. Kategori pembuka, bukan mesin ceritanya. */
export const HOOK = [
  { id: 'pertanyaan',   label: 'Pertanyaan terbuka',  arahan: 'buka dengan pertanyaan yang jawabannya baru muncul belakangan' },
  { id: 'fakta_kaget',  label: 'Fakta mengejutkan',   arahan: 'buka dengan satu angka atau fakta yang bikin berhenti scroll' },
  { id: 'pernyataan',   label: 'Pernyataan berani',   arahan: 'buka dengan klaim tegas yang harus dibuktikan sisa video' },
  { id: 'pemecah_pola', label: 'Pemecah pola',        arahan: 'buka dengan visual atau kalimat yang tidak diduga untuk jenis konten ini' },
  { id: 'cuplikan',     label: 'Cuplikan akhir',      arahan: 'buka dengan potongan momen terbaik, lalu mundur menceritakan awalnya' },
  { id: 'daftar',       label: 'Daftar berangka',     arahan: 'buka dengan menyebut jumlah poin yang akan ditunjukkan' },
];

/**
 * Ritme potongan DI DALAM satu Part 10 detik.
 *
 * ⚠️ Ini sumbu dominan TERPENTING sekarang. Karena kuota Flow mengunci kerangka
 * ke 3 Part × 10 detik, struktur videonya tidak bisa lagi divariasikan — yang
 * tersisa justru ritme di dalamnya. Sepuluh detik itu panjang untuk video
 * vertikal: bisa satu talking-head penuh, bisa montase lima potongan. Dua video
 * dengan susunan Part identik tapi ritme berbeda terasa seperti dua video lain.
 */
export const RITME = [
  { id: 'tunggal',      label: 'Satu shot penuh', cutPerPart: 1, arahan: 'satu shot utuh 10 detik, kamera stabil, tanpa potongan' },
  { id: 'dua_bagian',   label: 'Dua bagian',      cutPerPart: 2, arahan: 'dua potongan seimbang, satu hard cut di tengah' },
  { id: 'montase',      label: 'Montase',         cutPerPart: 3, arahan: 'tiga potongan, tempo sedang, tiap potongan punya satu poin' },
  { id: 'montase_cepat',label: 'Montase cepat',   cutPerPart: 5, arahan: 'lima potongan pendek, tempo tinggi, ritme seperti drum' },
];

/**
 * Mood warna + musik — satu tema untuk seluruh video.
 *
 * `arahan` (Indonesia) dibaca AI penyusun storyboard; `warna` dan `musik`
 * (Inggris) dipakai renderer prompt Veo. Dipisah SENGAJA: renderer harus
 * deterministik, dan membelah `arahan` dengan operasi string untuk memisahkan
 * bagian warna dari bagian musik adalah bentuk logika yang rapuh persis di
 * tempat yang paling tidak boleh rapuh.
 */
export const MOOD = [
  { id: 'hangat',    label: 'Hangat',    arahan: 'warna hangat keemasan, musik akustik lembut',
    warna: 'warm golden color grade, soft afternoon light',       musik: 'soft acoustic guitar, gentle and unhurried' },
  { id: 'sinematik', label: 'Sinematik', arahan: 'kontras tinggi, bayangan dalam, musik orkestral menahan',
    warna: 'high-contrast cinematic grade, deep shadows',          musik: 'restrained orchestral swell, low strings' },
  { id: 'cerah',     label: 'Cerah',     arahan: 'terang, putih bersih, musik pop ringan',
    warna: 'bright airy grade, clean whites, lifted shadows',      musik: 'light upbeat pop, bright plucked keys' },
  { id: 'tenang',    label: 'Tenang',    arahan: 'palet lembut rendah saturasi, musik ambient',
    warna: 'muted low-saturation palette, soft diffused light',    musik: 'calm ambient pad, minimal percussion' },
  { id: 'energik',   label: 'Energik',   arahan: 'saturasi tinggi, musik beat cepat',
    warna: 'high-saturation punchy grade, crisp highlights',       musik: 'fast modern beat, driving rhythm' },
];

/** Sumbu yang membentuk `variation_key`. Urutannya BAGIAN DARI kunci — jangan diacak. */
export const SUMBU_DOMINAN = ['mekanisme', 'hook', 'ritme', 'mood', 'pembukaan'];

const KATALOG = { mekanisme: MEKANISME, hook: HOOK, ritme: RITME, mood: MOOD };

/** Cari entri kosakata; mengembalikan null bila id tidak dikenal (data lama). */
export function entriSumbu(sumbu, id) {
  return (KATALOG[sumbu] ?? []).find(x => x.id === id) ?? null;
}

/**
 * Kunci variasi — sidik jari kombinasi sumbu dominan.
 *
 * Sengaja teks yang BISA DIBACA MANUSIA, bukan hash: kolomnya terlihat di layar
 * antrean dan di log, dan "kenapa video ini begini" harus bisa dijawab tanpa
 * membuka tabel lain. Panjangnya masih jauh di bawah batas index SQLite.
 */
export function kunciVariasi(v) {
  return SUMBU_DOMINAN.map(s => `${s}:${v[s] ?? '-'}`).join('|');
}

/**
 * Berapa variasi yang MASUK AKAL untuk sebuah listing.
 *
 * Diturunkan dari material, bukan dipatok rata 100. Alasannya jujur: median
 * properti hanya punya 4 label foto unik, dan 100 video yang benar-benar berbeda
 * dari 4 foto itu mustahil — mulai variasi ke-7 yang berubah cuma urutan dan
 * kata-katanya. Angka ini ditampilkan ke user ("Rotasi 7 dari 14") supaya
 * batasnya jujur, sekaligus jadi dorongan menambah foto berlabel.
 */
export const PLAFON_VARIASI = 100;
export function maksVariasi(jumlahLabelUnik) {
  const n = Number(jumlahLabelUnik) || 0;
  if (n <= 0) return 0;
  return Math.min(PLAFON_VARIASI, Math.max(6, n * 6));
}
