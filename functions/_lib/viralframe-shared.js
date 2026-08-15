// ViralFrame — konstanta & helper bersama (Fase 4, dedup).
//
// SATU sumber kebenaran untuk data yang dulu diduplikasi manual antara
// functions/api/admin/viralframe/ai-generate.js (backend) dan
// src/app/components/admin/viralframe/options.ts (frontend). Duplikasi itu
// sempat menyebabkan drift (lihat commit tempo dialog & ekspresi).
//
// Ditempatkan di functions/_lib/ (bukan src/app) supaya:
//   - backend Functions mengimpornya secara natif (../../../_lib/...)
//   - frontend Vite mengimpornya lintas-direktori (di-bundle dari root)
// File ini WAJIB plain JS tanpa React / API browser agar aman di Workers runtime.
//
// ⚠️ SATU SUMBER KEBENARAN untuk aturan kualitas video ("Prompt Rulebook") yang
// dipakai KETIGA jalur prompt-engine: masterPromptCompiler.ts (Jalur A),
// ai-generate.js buildSystemPrompt() (Jalur C), youtube-long.js. Ketiganya punya
// bentuk skema output BERBEDA (objek terstruktur vs string tertanam) sehingga
// PROSA instruksi sengaja TIDAK dipaksa jadi satu fungsi (nuansa per-konteks
// hilang kalau dipaksakan) — tapi VOKABULARI/KONSTANTA di file ini WAJIB jadi
// satu-satunya sumber yang diimpor ketiganya. Bug nyata 2026-07-28: youtube-long.js
// sama sekali tidak mengimpor REALISM_* saat itu ditambahkan ke 2 jalur lain —
// dicegah terulang lewat scripts/check-viralframe-rulebook.mjs (jalankan sebelum
// deploy, sama seperti check-bundle-budget.mjs).
export const RULEBOOK_VERSION = '2026-08-16.2';

// Tabel lipsync (PRD 3.8) — sinkronisasi durasi klip ↔ jumlah kata narasi.
//
// ⚠️ DIKALIBRASI ULANG 2026-07-28 setelah uji video nyata pertama.
// Versi lama memberi `maxWords` TETAP per rentang (mis. 44 kata untuk 9–12 detik).
// Dua cacatnya:
//   1. Lajunya mustahil. 44 kata / 10 detik = 246 kata/menit; presenter manusia
//      tercepat ~180–200 wpm. Di 13 detik, 72 kata = 332 wpm.
//   2. Budget per RENTANG, bukan per detik — scene 9 detik dapat jatah sama dengan
//      12 detik, jadi ujung pendek tiap rentang paling parah.
// Akibat nyata: narasi 41 kata untuk klip 10 detik TERPOTONG di Google Flow.
//
// Sekarang `maxWords` DIHITUNG dari durasi: `durasi × kataPerDetik`, dengan
// kataPerDetik yang sudah memuat margin nafas di awal/akhir klip. Tabel ini
// tinggal menyimpan sifat kualitatif (pace + instruksi) dan lajunya.
//
// Angka laju berasal dari satu titik data nyata (41 kata @10s = terpotong), jadi
// ini perkiraan konservatif — kalau uji berikutnya menyisakan hening di akhir,
// naikkan `kataPerDetik`, jangan kembalikan tabel tetap.
//
// ⚠️ DINAIKKAN 2026-08-04 — uji itu terjadi. User melaporkan Part CTA "belibet dan
// berulang, kurang panjang kalimatnya": laju 2,2 terlalu RENDAH, sehingga dialog
// selesai jauh sebelum klip habis dan Veo mengisi sisanya dengan mengulang.
// Dikalibrasi ke 6 storyboard ChatGPT milik user yang hasil videonya SUDAH TERBUKTI
// bagus (Part CTA, VO 8 detik):
//   Lisa 22 kata = 2,75 · Ayu/Vina/Angel 20 = 2,50 · Hana/Cindy 19 = 2,38
//   → median 2,50 kata/detik. Keluaran kita saat gagal: 17 kata / 10 s = 1,70.
// Dipakai 2,5 (median), BUKAN 2,75 (batas atas hanya satu sampel). Masih jauh di
// bawah 4,1 kata/detik yang dulu terbukti terpotong, jadi tidak mengulang bug lama.
// Rentang pendek (2–5 dtk) TIDAK dinaikkan: di sana masalahnya memang kepadatan,
// bukan kekosongan. Rentang panjang dinaikkan lebih hati-hati.
const LIPSYNC_ROWS = [
  { minSec: 2,  maxSec: 3,  kataPerDetik: 2.4, pace: 'ultra_fast',    instruksi: 'Ucapan sangat cepat, 1 kalimat pendek punchy, tanpa jeda.' },
  { minSec: 4,  maxSec: 5,  kataPerDetik: 2.4, pace: 'fast',          instruksi: 'Ucapan cepat, 1 kalimat ringkas, jeda minimal.' },
  { minSec: 6,  maxSec: 8,  kataPerDetik: 2.5, pace: 'normal',        instruksi: 'Tempo natural, 1–2 kalimat, jeda wajar antar frasa.' },
  { minSec: 9,  maxSec: 12, kataPerDetik: 2.5, pace: 'medium',        instruksi: 'Tempo sedang, 2 kalimat mengalir, ada penekanan kata kunci.' },
  { minSec: 13, maxSec: 20, kataPerDetik: 2.4, pace: 'relaxed',       instruksi: 'Tempo santai, 2–3 kalimat, ruang untuk storytelling.' },
  { minSec: 21, maxSec: 30, kataPerDetik: 2.0, pace: 'slow_dramatic', instruksi: 'Tempo lambat dramatis, jeda sengaja untuk emosi.' },
];

/**
 * Durasi VO baku untuk sebuah Part = ~80% durasi klip.
 *
 * ⚠️ Dulu nilai awalnya = durationSec PENUH (`options.ts`: "voDurationSec awal =
 * durationSec"), artinya kita meminta orang berbicara TANPA HENTI sepanjang klip.
 * Storyboard ChatGPT yang hasilnya bagus justru sengaja menyisakan ruang: klip 10
 * detik dengan `voiceover.duration: 8 seconds` — 2 detik untuk napas awal, jeda,
 * dan ekor penutup. Arsitektur kita sudah punya konsep sisa itu (`sisaDetik`,
 * ringkasan "3×8s VO = 24s, sisa 6s"), hanya nilai awalnya yang menutupnya.
 *
 * Minimal 2 detik supaya Part sangat pendek tidak jadi 0 dan mematikan lipsync.
 */
export function defaultVoDurationSec(durationSec) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.max(2, Math.round(d * 0.8));
}

function barisLipsync(d) {
  for (const row of LIPSYNC_ROWS) {
    if (d >= row.minSec && d <= row.maxSec) return row;
  }
  return d <= 3 ? LIPSYNC_ROWS[0] : LIPSYNC_ROWS[LIPSYNC_ROWS.length - 1];
}

/**
 * Baris lipsync untuk sebuah durasi, dengan `maxWords` yang SUDAH dihitung dari
 * durasi itu sendiri — bukan angka tetap per rentang. Bentuk kembaliannya sengaja
 * dipertahankan (`{minSec,maxSec,maxWords,pace,instruksi}`) agar seluruh pemakai
 * lama (compiler, validator, SceneCards, ai-generate) tidak perlu diubah.
 */
export function getLipsync(durasiDetik) {
  const d = Math.max(2, Math.min(30, Math.round(durasiDetik || 0)));
  const row = barisLipsync(d);
  return {
    minSec: row.minSec,
    maxSec: row.maxSec,
    maxWords: Math.max(4, Math.round(d * row.kataPerDetik)),
    pace: row.pace,
    instruksi: row.instruksi,
  };
}

export function getMaxWords(durasiDetik) {
  return getLipsync(durasiDetik).maxWords;
}

// Dipertahankan untuk kompatibilitas konsumen lama yang mengimpor tabelnya langsung
// (options.ts me-re-export bertipe). `maxWords` di sini memakai durasi TERPANJANG
// rentangnya — untuk angka yang benar per scene, selalu pakai getLipsync(durasi).
export const LIPSYNC_TABLE = LIPSYNC_ROWS.map(r => ({
  minSec: r.minSec,
  maxSec: r.maxSec,
  maxWords: Math.max(4, Math.round(r.maxSec * r.kataPerDetik)),
  pace: r.pace,
  instruksi: r.instruksi,
}));

// ════════════════════════════════════════════════════════════════════════════
// AUDIO NATIVE & BATAS KLIP PER TOOL (Tahap 1 — perbaikan audit 2026-07-26)
// ════════════════════════════════════════════════════════════════════════════

// Tool yang menghasilkan AUDIO NATIVE (dialog terucap + lip-sync) dari teks prompt.
// Untuk tool ini dialog WAJIB ditanam DI DALAM teks prompt video; menaruhnya di
// field terpisah = audionya tidak pernah dibuat dan videonya jadi bisu.
// Inilah temuan utama audit ViralFrame 2026-07-26: seluruh LIPSYNC_TABLE dihitung,
// ditegakkan, dan divalidasi — lalu dibuang di langkah terakhir karena README ZIP
// menyuruh user menempel field 'prompt' saja.
export const NATIVE_AUDIO_TOOLS = ['google_flow', 'veo3'];

export function isNativeAudioTool(toolId) {
  return NATIVE_AUDIO_TOOLS.includes(toolId);
}

// Batas panjang SATU klip per generate, dalam detik. Durasi lebih panjang harus
// disusun dari beberapa klip/Extend, bukan diminta sekaligus. Tool yang tidak
// terdaftar = tidak ada batas keras yang kita tegakkan (null).
//
// ⚠️ ANGKA INI BERUBAH SEIRING VERSI TOOL — jangan diisi dari asumsi.
// google_flow = 10 detik, diverifikasi langsung oleh pemilik akun di Google Flow
// (2026-07-28). Sebelumnya diisi 8 berdasarkan dugaan saya tentang Veo 3, dan itu
// SALAH: skema youtube-long.js aslinya sudah benar memakai 10, lalu saya turunkan
// ke 8 karena mengira ada kontradiksi. Kalau ragu, tanya — jangan tebak.
export const CLIP_MAX_SEC = {
  google_flow: 10,
  // Veo 3 standalone (labs.google/video) BELUM diverifikasi ulang — masih 8.
  // Kalau ternyata juga 10, cukup ubah angka ini: enam pemakainya membaca dari sini.
  veo3: 8,
};

export function getClipMaxSec(toolId) {
  return CLIP_MAX_SEC[toolId] ?? null;
}

// ════════════════════════════════════════════════════════════════════════════
// MODEL PART-AS-GENERATE-UNIT (refactor 2026-08-01) — 1 Part = 1 generate call
// ════════════════════════════════════════════════════════════════════════════

// Batas foto referensi (reference image) per Part. Google Flow menerima maksimal
// 7 reference image per generate call; disisakan margin jadi 5. Foto KARAKTER
// IKUT TERHITUNG dalam kuota ini — bukan kuota terpisah. SATU sumber kebenaran:
// backend (suggest-storyboard.js, ai-generate.js) mengimpor ini secara natif,
// frontend (options.ts) me-re-export dengan tipe. JANGAN duplikasi angkanya.
export const MAX_REF_IMAGES_PER_PART = 5;

// ════════════════════════════════════════════════════════════════════════════
// KOSAKATA REALISME TEKNIS (audit kualitas video 2026-07-29)
// ════════════════════════════════════════════════════════════════════════════
// Ditemukan: instruksi kualitas lama (Jalur C, ai-generate.js) menyuruh AI
// menutup SETIAP prompt scene dengan 'cinematic 4K, smooth motion, professional
// real estate videography' — frasa generik ini menjadi SINYAL bagi model video
// generatif untuk membuat visual yang terlalu mulus/sempurna, mendekati CGI/
// render 3D, bukan rekaman kamera sungguhan ("kelihatan AI banget").
// Perbaikan: ganti sinyal "sempurna" dengan sinyal FISIK KAMERA NYATA (lensa,
// depth of field, grain) + ketidaksempurnaan kecil yang disengaja (micro-jitter,
// practical lighting) — dipakai KEDUA jalur (Master Prompt manual & AI Generate).
export const REALISM_QUALITY_CUES = [
  'shot on mirrorless camera look, natural lens equivalent, shallow depth of field',
  'subtle natural film grain, not overly clean digital sharpness',
  'natural handheld micro-jitter (not gimbal-perfect), organic camera motion',
  'practical light sources visible in frame, realistic falloff and soft shadow',
];

// Frasa penutup kualitas yang DILARANG — generik dan terbukti mendorong hasil
// video ke arah CGI/plastic (lihat catatan REALISM_QUALITY_CUES di atas).
export const REALISM_BANNED_QUALITY_PHRASES = [
  'cinematic 4K', '8K', 'UHD', 'hyperrealistic', 'ultra high quality', 'perfect quality',
];

// Term negatif anti-CGI/plastic — digabung ke NEGATIVE_PROMPT_VIDEO di bawah.
const REALISM_NEGATIVE_TERMS = [
  'CGI render', 'video game graphics', 'plastic skin', 'waxy texture',
  'over-smoothed skin', 'symmetrical perfect face', 'studio-flat lighting',
  'oversaturated colors', 'artificial rim light glow', '3D animation look',
  'uncanny valley', 'overly stabilized robotic motion',
];

// Negative prompt inti untuk video generator berbasis teks (Veo/Flow dan sejenis).
// BEDA dari NEG_CORE di submit-video.js yang khusus image-to-video SiliconFlow
// (fokus mencegah adegan berubah dari foto). Yang di sini fokus pada tiga hal:
//   1. 'subtitles/captions/burned-in text' — Veo punya kebiasaan MEMBAKAR subtitle
//      ke frame begitu ada dialog di prompt. Tanpa ini, menanam dialog (perbaikan
//      di atas) justru menghasilkan video berteks acak yang tidak bisa dihapus.
//   2. artefak umum yang merusak kesan profesional.
//   3. REALISM_NEGATIVE_TERMS — menekan hasil yang terlihat CGI/plastic/render.
// Perangkat rekam di tangan/frame (2026-08-02). Gaya selfie vlog menyebut
// "arm's length / selfie perspective", dan model gemar menerjemahkannya jadi orang
// yang MENENTENG kamera. Diperparah bila foto referensi talent kebetulan memegang
// GoPro/tongsis — hasilnya talent tampak membawa dua alat sekaligus di dua tangan
// (dilaporkan user). Framing selfie itu POSISI KAMERA, alatnya tidak boleh terlihat.
const EQUIPMENT_NEGATIVE_TERMS = [
  'selfie stick', 'gimbal', 'tripod', 'camera in hand', 'phone in hand',
  'holding a camera', 'holding a smartphone', 'visible camera rig', 'action camera in frame',
];

export const NEGATIVE_PROMPT_VIDEO = [
  'subtitles, captions, burned-in text, on-screen text, watermark, logo, distorted hands, extra fingers, morphing, warping, deformed face, flickering, blurry, low quality, extra people',
  ...REALISM_NEGATIVE_TERMS,
  ...EQUIPMENT_NEGATIVE_TERMS,
].join(', ');

/**
 * Nama berkas foto karakter di dalam ZIP Jalur C (AI Generate).
 *
 * Dipakai backend (`reference_image`/`character_reference`), entri ZIP, dan README —
 * ketiganya WAJIB memakai fungsi ini agar tidak pernah berbeda.
 *
 * Sebelumnya tiap tempat menulis `nama.replace(/\s+/g,'_')` sendiri, yang meloloskan
 * karakter apa pun selain spasi. Nama seperti "Ayu / Vina" menghasilkan
 * "Ayu_/_Vina.webp" — garis miring itu ditafsirkan JSZip sebagai pemisah folder,
 * sehingga fotonya mendarat di subfolder tak terduga dan tidak cocok lagi dengan
 * nama yang disebut di prompt. Nama normal tetap menghasilkan keluaran yang sama
 * persis seperti dulu, jadi ZIP lama tidak berubah bentuk.
 */
export function namaFileKarakter(nama) {
  const bersih = String(nama ?? '')
    .trim()
    .replace(/[^\w\s-]/g, '')  // buang '/', '\', ':', dsb yang merusak path ZIP
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  return `${bersih || 'karakter'}.webp`;
}

// Deskripsi ekspresi singkat English untuk injeksi ke prompt karakter (PRD 3.13/3.14).
export const EXPRESSION_EN = {
  auto:            'expression adapted to scene tone',
  excited_joyful:  'excited and joyful, big smile, high energy',
  confident_auth:  'confident and authoritative, assured',
  surprised_amazed: 'surprised and amazed, wide eyes',
  warm_friendly:   'warm and friendly, approachable',
  urgent_intense:  'urgent and intense, serious',
  empathetic:      'empathetic and relatable',
  playful_humor:   'playful and humorous, light-hearted',
  mysterious:      'mysterious and dramatic',
  curious_invest:  'curious and investigative',
};

// ════════════════════════════════════════════════════════════════════════════
// DELIVERY CLAUSE TERHITUNG DARI DURASI (perbaikan audit 2026-08-04)
// ════════════════════════════════════════════════════════════════════════════
// Ditemukan: ai-generate.js MENULIS TETAP "berbicara cepat, artikulasi jelas,
// tanpa jeda atau gagap" di SETIAP dialog — bertentangan langsung dengan
// getLipsync() di atas, yang untuk Part 9–12 detik justru memberi pace 'medium'
// ("Tempo sedang, ada penekanan kata kunci"). Akibatnya suara terdengar
// terburu-buru/robotik walau tabel lipsync sudah menghitung tempo yang benar.
// Rujukan prompt ChatGPT yang terbukti bagus di Google Flow TIDAK PERNAH
// menyuruh "cepat" — ia mengendalikan KARAKTER SUARA (voice_style/tone) +
// ANGGARAN WAKTU (duration), lalu membiarkan model mengatur tempo sendiri.
// Perbaikan struktural: klausa delivery WAJIB dihitung dari getLipsync(durasi),
// bukan string tetap — sehingga Part pendek dan panjang otomatis berbeda.

// Busur emosi per peran Part, disaring dari pola konsisten di 6 storyboard
// rujukan (Hook menarik perhatian, Body meyakinkan lewat detail, CTA menutup).
export const EMOTION_ARC_BY_ROLE = {
  Hook: 'curious and enthusiastic, drawing the viewer in',
  Body: 'impressed and informative, genuinely engaged with the details',
  CTA:  'convincing and persuasive, warm urgency without pressure',
};

// Menggabungkan (BUKAN mengganti) ekspresi dasar pilihan user dengan busur emosi
// per peran. Project ini sudah 3x kena bug "nilai hardcoded membuang pilihan
// user" — baseExpressionEn WAJIB tetap muncul di hasil.
export function getEmotionForRole(role, baseExpressionEn) {
  const arc = EMOTION_ARC_BY_ROLE[role];
  if (!arc || !baseExpressionEn) return baseExpressionEn;
  return `${baseExpressionEn}; for this Part: ${arc}`;
}

// Intent akting ("kenapa dia bicara begini"), bukan aksi fisik ("apa yang
// dilakukan tangan/tubuh") — pola diambil dari rujukan ChatGPT yang terbukti
// menghasilkan delivery natural, bukan pembacaan skrip.
export const PERFORMANCE_INTENT_BY_ROLE = {
  Hook: 'she feels like she is sharing a hidden gem discovery with her followers',
  Body: 'she talks like she is personally showing a friend around her own home',
  CTA:  'she talks like she is personally recommending a valuable opportunity',
};

// ════════════════════════════════════════════════════════════════════════════
// PERAN EFEKTIF PART (2026-08-16) — beda dari `role` mentah (Hook/Body/CTA,
// satu nilai eksklusif)
// ════════════════════════════════════════════════════════════════════════════
// Kedua jalur prompt-engine SUDAH lama memaksa duti PENUTUP (ajakan CTA) ke
// Part TERAKHIR apa pun `role`-nya: "Part ber-role CTA, ATAU Part TERAKHIR bila
// tidak ada Part ber-role CTA, WAJIB memakai gaya ajakan X" (hookLine/ctaLine
// ai-generate.js, ARAHAN CTA TERUCAP masterPromptCompiler.ts). Tapi instruksi
// EMOSI/INTENT AKTING selama ini masih murni dibaca dari `role` mentah lewat
// getEmotionForRole()/PERFORMANCE_INTENT_BY_ROLE[role] — KONTRADIKSI nyata saat
// hanya ada 1 Part: kontennya dipaksa menutup dengan CTA, tapi emosinya tetap
// arc "Hook" datar sepanjang durasi tanpa sinyal eskalasi. Dilaporkan user
// 2026-08-16: Part tunggal 10 detik berlabel "Hook" saja, padahal semestinya
// sekaligus mengandung hook awal + body + penutup CTA di dalam cuts-nya sendiri.
//
// `partDuties()` menghitung peran EFEKTIF (bisa gabungan) dari posisi Part,
// bukan cuma label mentahnya — untuk kasus normal (Hook di Part 1, CTA di Part
// terakhir, Body di tengah) hasilnya SAMA PERSIS seperti sebelumnya (masing-
// masing Part cuma dapat satu duty true, nol regresi). Hanya saat sebuah Part
// SEKALIGUS jadi posisi pertama dan posisi penutup (paling umum: total 1 Part)
// duti-nya jadi gabungan.
export function partDuties(role, index, totalParts, hasCtaRolePart) {
  return {
    hook: role === 'Hook' || index === 0,
    cta: role === 'CTA' || (index === totalParts - 1 && !hasCtaRolePart),
  };
}

/**
 * Ekspresi/emosi untuk peran EFEKTIF — pola sama seperti getEmotionForRole()
 * (menggabung, bukan mengganti, ekspresi dasar pilihan user), tapi saat duti-nya
 * gabungan (hook+cta), instruksinya eksplisit menyuruh energi BERGESER di
 * dalam cuts Part itu sendiri alih-alih satu arc statis sepanjang durasi.
 */
export function getEmotionForDuties(duties, baseExpressionEn) {
  if (duties.hook && duties.cta) {
    if (!baseExpressionEn) return baseExpressionEn;
    return `${baseExpressionEn}; for this Part: starts ${EMOTION_ARC_BY_ROLE.Hook}, escalating by the final cuts to ${EMOTION_ARC_BY_ROLE.CTA} — energy must visibly shift across this Part's own cuts, not stay flat`;
  }
  return getEmotionForRole(duties.cta ? 'CTA' : duties.hook ? 'Hook' : 'Body', baseExpressionEn);
}

/** Intent akting untuk peran EFEKTIF — pola sama dengan getEmotionForDuties(). */
export function getIntentForDuties(duties) {
  if (duties.hook && duties.cta) {
    return `${PERFORMANCE_INTENT_BY_ROLE.Hook} — then, as the Part reaches its final cuts, ${PERFORMANCE_INTENT_BY_ROLE.CTA}`;
  }
  return duties.cta ? PERFORMANCE_INTENT_BY_ROLE.CTA : duties.hook ? PERFORMANCE_INTENT_BY_ROLE.Hook : PERFORMANCE_INTENT_BY_ROLE.Body;
}

// Karakter suara narator (selaras dengan pola "dialogue.voice" di
// youtube-long.js, yang sudah terbukti dipakai di produksi). JANGAN bikin gaya
// baru; kalau pola di youtube-long.js berubah, selaraskan lagi di sini.
//
// ⚠️ NILAI MURNI — DILARANG menyisipkan instruksi ke dalam string ini.
// Ketiga pemanggil memakainya sebagai CONTOH ISI field `dialogue.voice`/
// `narration_voice` DI DALAM TANDA KUTIP, jadi apa pun yang ada di sini akan
// disalin AI apa adanya ke output yang dikirim ke Google Flow. Versi pertama
// (2026-08-04) sempat menempelkan "— gunakan deskripsi suara yang SAMA di setiap
// Part" di ekornya, sehingga kalimat perintah berbahasa Indonesia ikut masuk ke
// field voice. Aturan "wajib sama di semua Part" adalah INSTRUKSI dan sudah
// ditulis di masing-masing pemanggil — biarkan di sana, jangan digabung ke nilai.
export const VOICE_PERSONA_HINT = 'warm confident young Indonesian female voice, natural documentary pace';

// Prioritas mixing audio — dipakai bersama VOICE_PERSONA_HINT agar dialog tidak
// tenggelam oleh backsound saat AI menyusun prompt akhir.
export const VOICE_PRIORITY_NOTE = 'voice clear and mixed above background music';

/**
 * Contoh KALIMAT TERUCAP per tipe CTA, dikunci ke `value` di CTA_TYPES (options.ts).
 *
 * ⚠️ LATAR (2026-08-04): sebelumnya kita hanya mengirim NAMA KATEGORI ke AI
 * ("Kunjungi Link di Bio"), lalu menyuruhnya mengarang kalimatnya sendiri. Hasil
 * nyata: user memilih "Kunjungi Link di Bio", dialog yang keluar "Yuk jadwalkan
 * waktu buat lihat langsung, jangan sampai ketinggalan info menariknya ya!" —
 * TIDAK menyebut link di bio sama sekali, DAN memakai frasa urgensi yang aturan
 * kita sendiri larang. Bandingkan uji ChatGPT user yang berhasil: di sana yang
 * dikirim adalah KATA-KATANYA ("link ada di bio ya gaes"), bukan nama kategori.
 *
 * Kalimat di bawah SUDAH DISARING terhadap aturan kebijakan: tanpa nominal harga,
 * tanpa penumpukan urgensi/kelangkaan. AI boleh memvariasikan diksinya, tapi
 * MAKSUD dan objek ajakannya wajib sama — itulah gunanya contoh ini.
 */
export const CTA_SPOKEN_EXAMPLE = {
  dm_info:         'DM aku ya, nanti aku kirim detail lengkapnya.',
  comment_keyword: 'Komen kata kuncinya di bawah ya, nanti aku balas satu-satu.',
  visit_link_bio:  'Yuk jadwalkan survei lokasi, klik link di bio ya gaes!',
  save_post:       'Simpan dulu video ini biar nggak lupa pas mau survei.',
  share_friend:    'Bagikan ke temanmu yang lagi cari properti kayak gini.',
  whatsapp_now:    'Yuk chat aku buat lihat unitnya langsung.',
  book_viewing:    'Yuk jadwalkan survei lokasi, biar bisa lihat sendiri kondisinya.',
  follow_more:     'Follow aku ya, masih banyak listing menarik lainnya.',
  limited_offer:   'Cek detail penawarannya ya, mumpung masih tersedia.',
  ask_question:    'Kalau ada yang mau ditanyain, tulis di kolom komentar ya.',
};

// Frasa delivery lama yang DILARANG ditulis tetap — terbukti bertentangan
// dengan getLipsync() dan membuat suara terdengar terburu-buru/robotik.
export const BANNED_DELIVERY_PHRASES = [
  'berbicara cepat', 'tanpa jeda atau gagap', 'speaks quickly', 'no pauses or stutters',
];

/**
 * Klausa delivery untuk SATU Part, DIHITUNG dari durasi VO-nya lewat
 * getLipsync() — bukan string "cepat" tetap. Pace & instruksi otomatis
 * berbeda antara Part pendek (mis. 3 detik → ultra_fast) dan Part panjang
 * (mis. 8 detik → normal), jadi tempo yang diminta selalu cocok dengan waktu
 * yang tersedia untuk diucapkan.
 *
 * [VOICE_PERSONA] adalah placeholder yang diisi AI dengan VOICE_PERSONA_HINT —
 * dipertahankan sebagai placeholder (bukan langsung disuntik) agar pemanggil
 * bisa menaruh deskripsi suara final di titik yang tepat dalam kalimatnya.
 *
 * Anchor "mengatakan:" WAJIB tetap di ujung — ai-generate.js:360 memakainya
 * sebagai pemisah untuk menyalin dialog ke dalam tanda kutip di field 'prompt'.
 */
export function buildDeliveryClause(nama, voDurasiDetik) {
  const { pace, instruksi } = getLipsync(voDurasiDetik);
  return `${nama} ([VOICE_PERSONA]), durasi VO ${voDurasiDetik} detik, pace ${pace}: ${instruksi}, mengatakan:`;
}

// ════════════════════════════════════════════════════════════════════════════
// HOOK: LARANGAN PEMBUKA GENERIK (2026-08-16 — adopsi pola storyboard ChatGPT
// rujukan user, folder "Format Struktur Promp Chat GPT" / Series A)
// ════════════════════════════════════════════════════════════════════════════
// Storyboard rujukan itu eksplisit melarang membuka video dengan sapaan/
// perkenalan diri ("Halo guys, saya Lisa...") karena 2-3 detik pertama video
// ADALAH hook-nya — basa-basi di situ membuang jatah waktu paling berharga dan
// membuat video terasa seperti iklan, bukan konten organik yang di-scroll orang
// dengan sukarela. HOOK_TYPES kita (options.ts: open_question, curiosity_gap,
// shocking_fact, dst) sudah menyediakan KATEGORI pembuka yang tepat — yang
// belum ada adalah larangan eksplisit untuk pola pembuka generik yang sering
// jadi default sebuah LLM kalau tidak dilarang gamblang, apa pun tipe hook yang
// dipilih user.
export const BANNED_HOOK_OPENERS = [
  'Halo guys / hai semua / halo teman-teman (sapaan generik tanpa substansi)',
  'Perkenalkan, saya [nama] (perkenalan diri di awal video)',
  'Hari ini saya mau kasih tahu kalian tentang... (basa-basi sebelum masuk isi)',
  'Selamat datang di video/channel saya (pembuka gaya channel intro)',
];

export const HOOK_OPENER_EXAMPLE = {
  salah: 'Halo guys, kenalin aku Lisa, hari ini aku mau kasih tau kalian soal rumah bagus ini.',
  benar: 'Rumah 4,5 miliar ini... sebenarnya dapat apa aja?',
};

// ════════════════════════════════════════════════════════════════════════════
// FIDELITAS STRUKTUR PROPERTI (2026-08-16 — sumber rujukan sama)
// ════════════════════════════════════════════════════════════════════════════
// [1] ANTI-HALUSINASI (ai-generate.js) sudah melarang mengarang FITUR dari data
// properti (landmark, furnished, dst — lihat CLAUDE.md "Pola berulang:
// PLACEHOLDER HARDCODED"). Storyboard rujukan menunjukkan kelas halusinasi yang
// bersebelahan: bukan fakta dari data, tapi ELEMEN ARSITEKTUR yang dikarang saat
// mendeskripsikan VISUAL cut (menambah lantai, kolam renang, mengubah jumlah
// jendela/bentuk atap). Ini wajar terjadi karena anchoring reference-image
// (ai-generate.js [2d]) bekerja TEXT-ONLY — AI penulis prompt tidak melihat
// fotonya — sehingga rentan "memperkaya" prosa dengan elemen yang tidak pasti
// ada. Aturan anchoring yang sudah ada melarang KATA SIFAT skala yang tidak
// terverifikasi (massive/huge/grand); daftar ini melarang ELEMEN STRUKTUR yang
// dikarang — kelas berbeda yang belum tercakup.
export const PROPERTY_STRUCTURAL_NEGATIVES = [
  'add floors', 'remove floors', 'add a swimming pool',
  'change the number or shape of windows', 'change the roof shape or the facade',
  'invent additional rooms', 'invent furniture not implied by the photo label',
];
