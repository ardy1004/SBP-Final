// POST /api/admin/viralframe/ai-generate — Jalur C: generate N video prompt via DeepSeek
// Body: { property_id, jumlah_scene, platform, ai_tool, bahasa, tone, visual_style, hook_type,
//         cta_type, scene_roles, musik_value, musik_prompt, karakter_id, foto_assignments,
//         supports_ref_image, expression }
// foto_assignments: [{ scene: 1, foto_url: '...', foto_label: '...' }, ...] — dipilih manual oleh user, bukan auto-pick.
// tone/visual_style/hook_type/cta_type: label sudah diresolve di frontend dari Step 1
// (options.ts TONES/VISUAL_STYLES/HOOK_TYPES/CTA_TYPES) — "Auto" berarti tidak ada instruksi tambahan.
// scene_roles: [{ scene: 1, role: 'Hook'|'Body'|'CTA' }, ...] — dari sceneRole() (options.ts), sama dengan Jalur A.
// parts (opsional): [{ role, sceneCount, label }] — batas babak dari Part designer Step 1.
//   Hanya dipakai bila jumlah sceneCount = jumlah_scene; selain itu diabaikan (bukan error).
// Opsional REGENERATE SATU SCENE: { regenerate_scene: N, existing_scenes: [{scene,kamera,dialog_karakter}] }
//   → AI hanya membuat ulang scene N (variasi baru) dengan konteks scene lain agar narasi nyambung.
// Respons SUKSES = streaming NDJSON (heartbeat 2s + baris {done,data|error}) — latensi
// Gemini dari dalam Worker bisa >22s bahkan untuk output kecil, pola "tunggu lalu balas"
// menabrak wall-clock 30s → 502 (lihat youtube-long.js). Error validasi awal tetap JSON.
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonError, handleOptions } from '../../_shared/response.js';
// Konstanta lipsync & ekspresi = sumber tunggal bersama dengan frontend (Fase 4).
import {
  getMaxWords, EXPRESSION_EN,
  isNativeAudioTool, getClipMaxSec, NEGATIVE_PROMPT_VIDEO,
  REALISM_QUALITY_CUES, REALISM_BANNED_QUALITY_PHRASES, RULEBOOK_VERSION,
  namaFileKarakter,
} from '../../../_lib/viralframe-shared.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

const PLATFORM_DURASI = {
  tiktok: 8,
  ig_reels: 8,
  yt_shorts: 10,
  fb_reels: 8,
};

const LABEL_MAP = {
  fasad: 'tampak depan/fasad bangunan',
  foyer: 'area masuk/foyer/lobby',
  kamar_tidur: 'kamar tidur',
  walk_in_closet: 'walk-in closet/lemari pakaian',
  kamar_mandi: 'kamar mandi',
  dapur: 'dapur',
  laundry: 'area cuci/jemur',
  ruang_tamu: 'ruang tamu',
  ruang_santai: 'ruang keluarga/santai',
  ruang_makan: 'ruang makan',
  ruang_kerja: 'ruang kerja/study',
  gym: 'area gym/fitness',
  void: 'void/plafon tinggi',
  balkon: 'balkon',
  taman: 'taman/halaman',
  rooftop: 'area rooftop',
  musholla: 'musholla/ruang sholat',
  gudang: 'gudang/penyimpanan',
  ruang_usaha: 'ruang usaha/komersial',
  kolam_renang: 'kolam renang',
  koridor_tangga: 'koridor atau area tangga',
  parkir: 'area parkir',
  view_sekitar: 'pemandangan atau lingkungan sekitar',
  lainnya: 'area properti',
};

const KAMERA_PER_LABEL = {
  fasad: 'cinematic drone pull-back shot revealing full building facade from street level',
  kamar_tidur: 'smooth interior dolly shot gliding through bedroom, warm ambient lighting',
  kamar_mandi: 'elegant interior tracking shot panning across bathroom details and fixtures',
  dapur: 'smooth interior reveal shot starting from window light, tracking across kitchen',
  ruang_tamu: 'wide interior establishing shot with slow zoom-in toward seating area',
  ruang_santai: 'steady interior tracking shot moving through cozy family living room',
  ruang_makan: 'smooth interior dolly across dining table setting, warm inviting lighting',
  ruang_kerja: 'calm interior push-in toward tidy home-office desk and shelves',
  foyer: 'welcoming push-in through the entrance foyer into the home',
  walk_in_closet: 'smooth pan across organized walk-in closet shelves and mirror',
  laundry: 'simple functional interior shot of clean laundry/service area',
  gym: 'dynamic interior tracking shot across home gym equipment',
  void: 'slow tilt-up revealing high ceiling void and vertical space',
  balkon: 'reveal shot pushing through doorway onto balcony, expanding view outside',
  taman: 'smooth low glide across garden greenery and open outdoor space',
  rooftop: 'cinematic aerial rise revealing rooftop area and city/neighborhood view',
  musholla: 'gentle steady interior shot of clean serene prayer room',
  gudang: 'simple functional interior shot showing storage/utility space',
  ruang_usaha: 'wide interior establishing shot of commercial/business space',
  kolam_renang: 'low-angle smooth glide along pool surface toward far end',
  koridor_tangga: 'smooth forward tracking shot ascending staircase or moving through corridor',
  parkir: 'wide exterior establishing shot showing parking area and building access',
  view_sekitar: 'slow aerial orbit revealing surrounding neighborhood and environment',
  lainnya: 'elegant cinematic reveal shot showing property space with smooth motion',
};


function formatRupiah(n) {
  if (n === null || n === undefined) return 'Hubungi agen';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function isAutoValue(label) {
  return !label || label.trim().toLowerCase().startsWith('auto');
}

function buildSystemPrompt({ jumlahScene, bahasa, musikValue, musikPrompt, tone, visualStyle, hookType, ctaType, excludedHooks, excludedCtas, maxWords, supportsRefImage, expressionLabel, presenterMode, registerInstruction, multiShotScene, cutawayExcludedScenes, nativeAudio, durasiSeragam, ratio, platformBehavior, toolFormatSpec, aiTool, clipMaxSec }) {
  // Budget kata kini PER SCENE (audit 2026-07-26). Bila semua scene berdurasi
  // sama, sebut angkanya langsung supaya instruksinya sekonkret dulu; bila
  // berbeda-beda, arahkan ke kolom 'Maks kata' milik masing-masing scene.
  const batasKata = durasiSeragam ? `${maxWords} kata` : `batas "Maks kata" scene tersebut`;
  const registerLine = registerInstruction ? `\nGAYA BAHASA WAJIB: ${registerInstruction}\n` : '';
  // Mode voiceover/faceless: karakter = NARATOR yang terdengar tapi TIDAK tampil
  // di frame. Video prompt fokus pada visual properti POV/sinematik tanpa orang.
  const isVoiceover = presenterMode === 'voiceover_only' || presenterMode === 'faceless_broll';
  const karakterBlock = isVoiceover
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5] MODE VOICEOVER — NARATOR TIDAK TAMPIL DI LAYAR (WAJIB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Karakter berperan sebagai NARATOR VOICEOVER: suaranya terdengar, tetapi WAJIB TIDAK PERNAH tampil di frame video.
  • Field 'prompt' (video) DILARANG menampilkan orang/talent/manusia manapun — subjek visual adalah RUANG & elemen properti dari sudut POV/sinematik (gerakan kamera + ruangan + pencahayaan + mood), BUKAN karakter.
  • Field 'dialog_karakter' = TEKS VOICEOVER narator (tetap ikut pola delivery [4] & batas ${batasKata}) — nada bicara konsisten dengan ekspresi '${expressionLabel}'.
  • Konsistensi: satu persona suara narator di semua scene (bukan konsistensi visual karakter, karena tidak ada karakter di layar).
Abaikan instruksi "SUBJEK: karakter" di [3] — untuk mode ini SUBJEK visual = properti/ruang, orang tidak boleh muncul.`
    : `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5] KONSISTENSI KARAKTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Karakter HARUS muncul di SETIAP scene dengan identitas yang KONSISTEN:
  • Nama yang sama di setiap scene
  • Pakaian yang sama di setiap scene (jika tidak disebutkan: 'baju profesional gelap')
  • Aksi berbeda per scene sesuai jenis foto (berdiri di fasad, duduk di ruang tamu, dll)
Gunakan deskripsi fisik karakter yang diberikan di data. Jika NULL → 'professional property consultant, formal attire'.
Ekspresi/emosi karakter WAJIB konsisten '${expressionLabel}' di SEMUA scene — pengaruhi juga pemilihan kata dan energi pada dialog_karakter (bukan cuma deskripsi visual di prompt), supaya nada bicara terasa sesuai ekspresi yang dipilih, bukan datar/formal.`;
  // Bagian [8] MUSIK: rule abstrak di bawah butuh teks musik konkret disisipkan
  // agar bisa benar-benar dieksekusi DeepSeek — tanpa ini instruksi "tambahkan
  // tepat seperti yang diberikan" tidak merujuk ke apapun.
  const musikSection = musikValue === 'none'
    ? `Jika musik = none → JANGAN tambahkan instruksi audio apapun.`
    : `Jika musik tersedia, tambahkan di AKHIR setiap prompt, tepat seperti berikut ini (JANGAN dimodifikasi):
    ${musikPrompt}`;

  // Tone/Gaya Visual: label sudah diresolve di frontend dari TONES/VISUAL_STYLES
  // (options.ts) — backend cuma menyisipkan teks, tidak perlu daftar terjemahan baru.
  // 'Auto' berarti biarkan DeepSeek memilih sendiri — tidak perlu instruksi tambahan.
  const toneLine = isAutoValue(tone)
    ? ''
    : `Tone/nada narasi WAJIB: ${tone}. Terapkan konsisten di setiap dialog_karakter dan pemilihan kata dalam prompt.\n`;
  const visualStyleLine = isAutoValue(visualStyle)
    ? ''
    : `Gaya visual WAJIB: ${visualStyle}. Terapkan konsisten di setiap scene (pencahayaan, komposisi, mood).\n`;
  const hookLine = isAutoValue(hookType)
    ? (excludedHooks?.length
        ? `Scene berperan HOOK: pilih gaya opening yang paling sesuai dengan properti ini, TAPI JANGAN memakai gaya yang baru dipakai di video-video sebelumnya: ${excludedHooks.join(', ')}. Variasikan supaya konten tidak terasa monoton/generik dan tidak terdeteksi berulang oleh algoritma media sosial.\n`
        : '')
    : `Scene berperan HOOK WAJIB memakai gaya opening: ${hookType}.\n`;
  const ctaLine = isAutoValue(ctaType)
    ? (excludedCtas?.length
        ? `Scene berperan CTA: pilih gaya ajakan yang paling sesuai dengan properti ini, TAPI JANGAN memakai gaya yang baru dipakai di video-video sebelumnya: ${excludedCtas.join(', ')}. Variasikan supaya konten tidak terasa monoton/generik dan tidak terdeteksi berulang oleh algoritma media sosial.\n`
        : '')
    : `Scene berperan CTA WAJIB memakai gaya ajakan: ${ctaType}.\n`;
  const toneStyleSection = (toneLine + visualStyleLine + hookLine + ctaLine).trim();
  const toneStyleBlock = toneStyleSection
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[2b] TONE, GAYA VISUAL & PERAN SCENE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${toneStyleSection}\nSetiap scene punya peran (Hook/Body/CTA, lihat "Role" di user prompt) — sesuaikan penekanan narasi dengan peran itu.\n`
    : '';

  // Anti-halusinasi posisi karakter: perilaku beda tergantung apakah AI tool
  // tujuan mendukung reference image (AI_TOOL_FORMAT_SPEC.supportsRefImage di
  // options.ts) — kalau ya, jangan re-describe elemen statis yang sudah
  // terlihat di foto; kalau tidak, deskripsikan ruangan detail tapi karakter
  // tetap "sudah ada", bukan "muncul".
  const antiHalusinasiPosisiBlock = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2c] ANTI-HALUSINASI POSISI KARAKTER — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Karakter WAJIB dideskripsikan SUDAH BERADA di posisi/aktivitasnya sejak detik pertama shot dimulai.
DILARANG MUTLAK mendeskripsikan proses karakter masuk, muncul, keluar, atau melintasi elemen ruangan manapun (pintu, dinding, cermin, sudut ruangan) — ini menghasilkan visual yang fisik tidak mungkin dan terlihat jelas sebagai AI generation yang buruk.
✗ SALAH: 'Ayu walks in through the door and stands near the window'
✗ SALAH: 'Character emerges from behind the wall into the bedroom'
✓ BENAR: 'Ayu already standing near the window, gestures warmly toward the room'
${supportsRefImage
    ? `Tool AI tujuan MENDUKUNG reference image (foto scene jadi acuan visual langsung) — fokuskan prompt HANYA pada motion/aksi yang terjadi PADA foto referensi tersebut, JANGAN re-describe elemen statis ruangan yang sudah terlihat di foto (dinding, warna cat, furnitur latar belakang, dll).`
    : `Tool AI tujuan TIDAK mendukung reference image (text-to-video murni) — deskripsikan ruangan SEDETAIL MUNGKIN (warna, furnitur, pencahayaan, tata letak) karena AI tidak punya gambar acuan, TAPI karakter tetap harus dideskripsikan 'sudah ada' di posisinya, bukan 'muncul' atau 'masuk'.`
}
`;

  // Anchoring wajib ke reference image (hanya untuk tool yang mendukungnya).
  // Tanpa ini model teks (yang TIDAK melihat foto) mengarang visual dari label
  // ("massive facade" dll) yang kontradiktif dengan foto yang dilampirkan user
  // ke AI video generator → hasil tidak konsisten / gagal render.
  const refAnchorBlock = supportsRefImage
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2d] ANCHORING KE REFERENCE IMAGE — WAJIB, PELANGGARAN = OUTPUT DITOLAK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene akan dieksekusi dengan DUA gambar terlampir: foto ruangan/area scene + foto karakter. Kamu TIDAK melihat foto itu, maka:
  • SETIAP field 'prompt' WAJIB memuat frasa anchoring lingkungan, mis. 'the exact ${'{'}room/area{'}'} shown in the attached scene reference image' — jangan menjabarkan arsitektur/furnitur spesifik yang tidak bisa kamu pastikan.
  • SETIAP field 'prompt' WAJIB memuat frasa anchoring karakter: 'the exact same person as the attached character reference image — identical face, hair, and outfit' (boleh diparafrase tipis, kata 'reference' wajib ada).
  • DILARANG mengarang kata sifat skala/arsitektur yang tidak terverifikasi dari foto: massive, huge, grand, towering, spacious, multi-story, modern facade, dsb. Cukup sebut jenis area sesuai label + rujuk ke reference image.
  • Aksi/gerak karakter dan kamera = satu-satunya hal yang kamu tambahkan di atas foto referensi.
✗ SALAH: 'Lisa stands in front of a massive 16-room boarding house facade'
✓ BENAR: 'Lisa — the exact same person as the attached character reference image (identical face, hair, and outfit) — already standing in the exact front area shown in the attached scene reference image, greeting the viewer selfie-style'

GERAKAN KAMERA WAJIB TETAP DI DALAM BINGKAI FOTO:
Foto referensi hanya memuat apa yang terlihat di dalam bingkainya. Gerakan yang membawa
kamera KELUAR dari bingkai memaksa AI mengarang area yang tidak ada di foto — itulah
penyebab hasil melenceng dari referensi.
  • AMAN (tetap di sekitar subjek): slow push-in, pull-back ringan, orbit sempit,
    tilt/pan kecil, handheld micro-movement, dolly maju-mundur pendek.
  • HINDARI untuk scene ber-reference image: lateral tracking "across the property",
    fly-through antar ruangan, crane naik tinggi, drone sweep lebar, whip-pan ke area lain.
  • Kalau instruksi Kamera per scene memuat gerakan berisiko itu, TERJEMAHKAN jadi versi
    yang tertahan di bingkai — mis. 'lateral track across the property' → 'slow lateral
    drift across the same facade, staying within the framing of the reference image'.
  • Selalu tambahkan penegasan seperti 'camera stays within the framing of the reference
    image' pada bagian b-roll/cutaway.
✗ SALAH: 'smooth lateral tracking shot across the property'
✓ BENAR: 'slow lateral drift across the same facade, staying within the framing of the reference image'
`
    : '';

  // ── [7] KATA TERLARANG — SADAR PILIHAN USER ──
  // Daftar lama melarang 'luxury/mewah', 'exclusive/eksklusif', dan 'dramatic'
  // TANPA SYARAT. Padahal ketiganya adalah nilai yang bisa DIPILIH user di UI:
  // Gaya Visual "Luxury / Premium" & "Moody / Dramatic", Tone "Mewah / Eksklusif".
  // Akibatnya AI disuruh menerapkan kemewahan sekaligus dilarang menyebutnya, lalu
  // berkelit ke frasa netral — terlihat pada uji 2026-07-28: gaya Luxury/Premium
  // dipilih, tapi promptnya hanya "professional real estate videography".
  // Sekarang larangan yang bentrok dengan pilihan user OTOMATIS dicabut.
  const pilihanGaya = `${tone ?? ''} ${visualStyle ?? ''}`.toLowerCase();
  const TERLARANG = [
    { teks: "luxury/mewah berlebihan → 'dirancang dengan cermat' / 'berkualitas tinggi'", bentrok: /luxury|mewah|premium/ },
    { teks: "exclusive/eksklusif → 'well-appointed' / 'terawat baik'",                      bentrok: /exclusive|eksklusif/ },
    { teks: "dramatic/shocking → 'captivating' / 'menawan'",                                bentrok: /dramatic|dramatis|moody/ },
    { teks: "berlari/melompat → 'berjalan dengan percaya diri' / 'melangkah elegan'" },
    { teks: 'sexy/sensual → DILARANG MUTLAK' },
    { teks: "terbaik/nomor 1 → 'berkualitas' / 'terpercaya'" },
    { teks: 'nama orang nyata/brand nyata → DILARANG' },
  ];
  const dicabut = TERLARANG.filter(t => t.bentrok && t.bentrok.test(pilihanGaya));
  const daftarTerlarang = [
    ...TERLARANG.filter(t => !dicabut.includes(t)).map(t => `  ${t.teks}`),
    ...(dicabut.length > 0
      ? ['', `  CATATAN: larangan kata mewah/eksklusif/dramatis DICABUT untuk permintaan ini karena user`,
            `  memang memilih gaya "${(visualStyle ?? '').trim()}" / tone "${(tone ?? '').trim()}".`,
            '  Pakai kata itu bila memang tepat — tetap hindari hiperbola kosong tanpa dasar dari data properti.']
      : []),
  ].join('\n');

  // ── [6] VARIASI ANTAR SCENE ──
  // Versi lama TANPA SYARAT menyuruh "N scene → N suasana berbeda (golden hour,
  // natural daylight, warm ambient, dramatic sunset)". Itu BERTABRAKAN LANGSUNG
  // dengan aturan anchoring [2d] saat tool memakai reference image: mengubah
  // pencahayaan berarti menyuruh Veo MENGGAMBAR ULANG properti di bawah cahaya
  // lain, sehingga hasilnya melenceng dari foto.
  //
  // Terbukti pada uji nyata 2026-07-28: dua scene memakai foto fasad yang sama,
  // scene 1 dapat "Natural daylight", scene 2 dapat "Warm ambient lighting"
  // (persis contoh yang ditulis di blok lama) — properti di scene 2 tidak lagi
  // konsisten dengan foto yang dilampirkan.
  //
  // Untuk tool ber-reference image, variasi kini dibatasi pada hal yang TIDAK
  // mengubah isi frame: gerakan kamera, angle, jarak, dan aksi karakter.
  const variasiBlock = supportsRefImage
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6] VARIASI ANTAR SCENE — TERBATAS (mode reference image)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene HARUS terasa berbeda, TAPI hanya lewat hal yang tidak mengubah isi frame:
  • gerakan kamera & kecepatannya
  • angle dan jarak (wide / medium / close)
  • posisi, gestur, dan aksi karakter
  • penekanan pada elemen berbeda dari area yang sama
JANGAN copy-paste struktur kalimat prompt yang sama antar scene.

DILARANG memvariasikan PENCAHAYAAN, WAKTU HARI, CUACA, atau COLOR GRADE antar scene.
Foto referensi sudah menentukan cahayanya; mengubahnya memaksa AI menggambar ulang
properti sehingga hasilnya TIDAK LAGI SESUAI foto yang dilampirkan user.
  ✗ SALAH: scene 1 "natural daylight", scene 2 "warm ambient lighting" / "golden hour"
  ✓ BENAR: semua scene memakai deskripsi cahaya yang SAMA dan netral, sesuai kondisi
    yang terlihat di foto (mis. "natural daylight consistent with the reference image")
Jika dua scene atau lebih memakai area/label foto yang SAMA, deskripsi lingkungannya
WAJIB identik — yang boleh berbeda hanya kamera, angle, dan aksi karakter.

`
    : `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6] VARIASI ANTAR SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene HARUS berbeda dalam: gerakan kamera, posisi karakter, angle, pencahayaan.
JANGAN copy-paste struktur prompt yang sama antar scene.
Jika ada ${jumlahScene} scene → ${jumlahScene} suasana berbeda (misal: golden hour, natural daylight, warm ambient, dramatic sunset).

`;

  // Struktur retensi psikologis: versi simplified (scene sedikit, tidak ada ruang
  // untuk open loop penuh) vs versi lengkap (open loop di scene 1, rehook di scene
  // tengah, payoff sebelum CTA di scene terakhir).
  const retensiBlock = jumlahScene <= 3
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6b] STRUKTUR RETENSI PSIKOLOGIS — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Versi simplified (jumlah scene ≤ 3 — TANPA open loop/rehook, ruang terlalu sempit):
  • Scene 1: field 'kamera' HARUS berupa pattern interrupt (gerakan/angle yang langsung menarik perhatian di detik pertama).
  • Scene tengah: sisipkan MINIMAL 1 micro-reward konkret (fakta/angka nyata properti yang terasa seperti temuan baru).
  • Scene terakhir: payoff singkat (tegaskan nilai properti) LANGSUNG diikuti CTA — JANGAN buka open loop baru yang tidak terjawab.

`
    : `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6b] STRUKTUR RETENSI PSIKOLOGIS — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Versi lengkap (jumlah scene ≥ 4):
  • Scene 1 (Hook): field 'kamera' HARUS pattern interrupt, dan 'dialog_karakter' WAJIB membuka 1 open loop — janjikan sesuatu (info/reveal) yang BELUM dijawab di scene ini.
  • Scene tengah (Body): 'dialog_karakter' WAJIB diawali kalimat rehook yang menyambung dari scene sebelumnya (bukan mulai topik baru begitu saja), lalu sisipkan 1 micro-reward konkret (fakta/angka nyata properti).
  • Scene terakhir (CTA): WAJIB menjawab/menutup open loop dari Scene 1 (payoff) SEBELUM menyampaikan CTA — jangan biarkan open loop menggantung tanpa jawaban.

`;

  // Tool ber-audio native (Veo 3.x / Google Flow) mengucapkan HANYA teks yang ada
  // DI DALAM field 'prompt'. Selama ini dialog cuma tinggal di 'dialog_karakter'
  // (field tetangga) sehingga video keluar BISU — temuan utama audit 2026-07-26.
  // Blok ini memaksa dialognya ditanam ulang ke dalam 'prompt' sebagai kutipan.
  const nativeAudioBlock = nativeAudio
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4b] AUDIO NATIVE — DIALOG WAJIB DITANAM DI DALAM 'prompt'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI video tujuan menghasilkan AUDIO NATIVE: kalimat yang ditulis DI DALAM field 'prompt' akan BENAR-BENAR DIUCAPKAN karakter dengan lip-sync. Kalimat yang hanya ada di 'dialog_karakter' TIDAK akan terdengar sama sekali.
Karena itu, di SETIAP scene:
  • Field 'prompt' WAJIB memuat bagian dialog (teks SETELAH "mengatakan:" pada 'dialog_karakter') secara UTUH di dalam TANDA KUTIP GANDA, didahului kata kerja ucap bahasa Inggris.
    Pola: ... she says in ${bahasa}: "<dialog persis>" ...
  • Teks dalam tanda kutip WAJIB IDENTIK dengan bagian dialog di 'dialog_karakter' — TETAP dalam ${bahasa}, JANGAN diterjemahkan ke Inggris, jangan diringkas, jangan diparafrase. Hanya kalimat di LUAR tanda kutip yang berbahasa Inggris.
  • Sebutkan karakter suara singkat di luar kutipan (mis. 'warm confident female voice, natural conversational pace') agar timbre konsisten antar scene.
  • Untuk mode voiceover/faceless: tetap tanam narasinya, pola '... voiceover in ${bahasa} says: "<dialog persis>" ...'.
✗ SALAH: prompt tanpa kutipan sama sekali (video jadi bisu meski dialog_karakter terisi)
✗ SALAH: '... she says: "Welcome to your dream home"' (dialog diterjemahkan, padahal bahasa dialog = ${bahasa})
✓ BENAR: '... warm confident female voice, she says in ${bahasa}: "Selamat datang di hunian impian Anda." ...'

LARANGAN TEKS DI FRAME: tool ini cenderung MEMBAKAR subtitle ke dalam gambar begitu ada dialog.
  • Field 'prompt' DILARANG meminta teks, caption, subtitle, tulisan, atau papan nama muncul di dalam frame.
  • Field 'on_screen_text' adalah untuk EDITOR (ditambahkan belakangan di CapCut), BUKAN untuk dibakar AI — JANGAN pernah menyebut isinya di dalam 'prompt'.

`
    : '';

  // ── [0] TARGET TEKNIS ──
  // Rasio, perilaku platform, dan format spec tool SELAMA INI TIDAK PERNAH sampai
  // ke prompt jalur ini (audit 2026-07-28) — user memilih 9:16 & TikTok, AI tidak
  // pernah tahu. Master Prompt sudah menyertakan ketiganya sejak awal; jalur ini
  // tertinggal. Baris hanya muncul bila nilainya benar-benar ada.
  const targetBaris = [
    ratio ? `RASIO VIDEO      : ${ratio}. Susun komposisi, framing, dan penempatan subjek untuk bingkai ini. Sebutkan rasio di akhir setiap field 'prompt'.` : '',
    clipMaxSec ? `BATAS KLIP TOOL  : ${clipMaxSec} detik per sekali generate. Deskripsi aksi tiap scene harus muat dalam durasi itu.` : '',
    toolFormatSpec ? `FORMAT PROMPT    : ${toolFormatSpec}` : '',
    platformBehavior ? `PERILAKU PLATFORM: ${platformBehavior}` : '',
  ].filter(Boolean);
  const targetBlock = targetBaris.length > 0
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[0] TARGET TEKNIS — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI VIDEO TOOL    : ${aiTool ?? '-'}
${targetBaris.join('\n')}

`
    : '';

  return `Kamu adalah direktur kreatif video properti profesional Indonesia dengan keahlian sinematografi, copywriting, dan digital marketing. Tugasmu: buat ${jumlahScene} video prompt terpisah untuk AI video generator.

${targetBlock}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1] ANTI-HALUSINASI — WAJIB DIPATUHI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANYA gunakan informasi yang SECARA EKSPLISIT ada di data properti.
JANGAN mengarang, mengasumsikan, atau menambahkan fitur yang tidak disebutkan.
✗ SALAH: menyebut 'rooftop garden' jika tidak ada di data
✗ SALAH: menyebut 'pemandangan gunung' jika tidak ada di data
✓ BENAR: hanya sebut fitur yang tercantum di bagian Data Properti
Jika data minim → buat prompt berdasarkan foto yang dipilih dan lokasi kota saja.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2] KONSISTENSI FOTO PER SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap scene memiliki JENIS FOTO dan GERAKAN KAMERA YANG SUDAH DITENTUKAN.
Kamu WAJIB mengikuti gerakan kamera yang diberikan per scene.
Kamu WAJIB membuat prompt yang sesuai dengan jenis foto scene tersebut.
✗ SALAH: scene kamar tidur → prompt menyebut eksterior bangunan
✓ BENAR: scene kamar tidur → prompt fokus pada interior, pencahayaan hangat, detail furnitur
JANGAN mendeskripsikan konten yang tidak mungkin ada di foto tersebut.

${toneStyleBlock}${antiHalusinasiPosisiBlock}${refAnchorBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3] STRUKTUR PROMPT WAJIB PER SCENE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setiap field 'prompt' HARUS mengandung SEMUA elemen ini secara natural:
  • KAMERA: gerakan kamera yang sudah ditentukan (ikuti persis dari instruksi scene)
  • SUBJEK: karakter + aksi spesifik + ekspresi/gestur
  • PROPERTI: 1-2 fitur nyata yang terlihat sesuai jenis foto
  • PENCAHAYAAN: kondisi cahaya yang sesuai (golden hour / warm ambient / natural daylight)
  • MOOD: atmosfer emosional yang diinginkan (inviting / professional / homey / aspirational)
  • KUALITAS: pilih 1-2 dari KOSAKATA REALISME FISIK berikut (boleh diparafrase, jaga maknanya) — BUKAN kata sifat generik:
${REALISM_QUALITY_CUES.map(c => `      - ${c}`).join('\n')}
    DILARANG menutup prompt dengan frasa generik seperti: ${REALISM_BANNED_QUALITY_PHRASES.join(', ')}. Frasa ini terbukti mendorong model video menghasilkan visual yang terlalu mulus/menyerupai CGI-render, bukan rekaman kamera sungguhan — hasilnya "kelihatan AI banget".
✗ SALAH prompt: 'A building exterior shot.' (terlalu generik, < 30 kata)
✗ SALAH kualitas: '...Professional real estate videography, cinematic 4K.' (frasa generik dilarang, lihat larangan KUALITAS di atas)
${supportsRefImage
    ? `✓ BENAR prompt: 'Steady handheld selfie-stick shot. Ayu — the exact same person as the attached character reference image, identical face, hair, and outfit — already standing in the exact front area shown in the attached scene reference image, gesturing warmly toward it with a confident smile. Warm natural daylight with soft practical falloff, subtle handheld micro-jitter, shallow depth of field.' (spesifik pada aksi & kamera, setia ke reference image, kualitas pakai kosakata fisik bukan generik, > 50 kata)`
    : `✓ BENAR prompt: 'Cinematic drone pull-back revealing the modern 4-story boarding house facade in Depok, Sleman. Property consultant Ayu in black SBP uniform stands at entrance, gestures warmly toward the building with a confident smile. Warm golden hour lighting, natural film grain, shot on mirrorless camera look with shallow depth of field.' (spesifik, kualitas pakai kosakata fisik bukan generik, > 50 kata)`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4] BAHASA & TEMPO DIALOG KARAKTER — WAJIB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Field 'dialog_karakter' WAJIB dalam ${bahasa}.${registerLine}
Bagian dialog (setelah klausa delivery di bawah) WAJIB MAKSIMAL sebanyak "Maks kata" yang tertera pada instruksi scene tersebut di user prompt — ini BATAS KETAT, bukan saran, dan BERBEDA-BEDA per scene mengikuti durasinya. Klip video pendek; dialog kepanjangan akan terlihat dipercepat/tidak sinkron dengan gerak bibir.
${durasiSeragam
    ? `Semua scene di permintaan ini berdurasi sama, jadi batasnya ${maxWords} kata untuk setiap scene.`
    : `PERHATIAN: durasi scene BERBEDA-BEDA di permintaan ini. Baca "Maks kata" pada tiap scene satu per satu — JANGAN memakai satu angka yang sama untuk semua scene. Batas terbesar yang muncul adalah ${maxWords} kata.`}
Field 'dialog_karakter' WAJIB berupa SATU KESATUAN TEKS (klausa delivery + dialog digabung, BUKAN dialog polos saja) dengan pola persis:
  "[Nama karakter] berbicara cepat, artikulasi jelas, tanpa jeda atau gagap, mengatakan: [dialog]"
Klausa delivery ("[Nama karakter] berbicara cepat...") WAJIB selalu ada di depan — hanya bagian [dialog] setelah "mengatakan:" yang dihitung ke batas ${batasKata}.
✗ SALAH: 'Selamat datang di hunian impian Anda, rumah nyaman dengan tiga kamar tidur yang luas dan taman yang asri di belakang.' (dialog polos tanpa klausa delivery, tidak ada instruksi tempo, melebihi batas kata scene itu)
✗ SALAH (jika bahasa = Indonesia): 'Welcome to our property'
✓ BENAR: 'Ayu berbicara cepat, artikulasi jelas, tanpa jeda atau gagap, mengatakan: Selamat datang di hunian impian Anda.'
Dialog harus: natural diucapkan, menyebut 1 fitur properti nyata, maksimal ${batasKata}.
JIKA bahasa = Indonesia: gunakan Bahasa Indonesia formal yang hangat.
JIKA bahasa = English: gunakan English professional (klausa delivery tetap wajib, diterjemahkan proporsional, mis. "[Name] speaks quickly, clear articulation, no pauses or stutters, saying:").
JIKA bahasa = Jawa: gunakan Bahasa Jawa Krama yang sopan.

${nativeAudioBlock}${karakterBlock}

${variasiBlock}${retensiBlock}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[7] KATA/FRASA TERLARANG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DILARANG menggunakan kata/frasa ini (ganti dengan alternatif):
${daftarTerlarang}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[8] MUSIK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${musikSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[9] FORMAT OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respond HANYA dengan JSON array murni.
TIDAK ADA teks, komentar, penjelasan, atau markdown (\`\`\`) di luar JSON.
Format yang diharapkan:
[
  {
    "scene": 1,
    "kamera": "nama singkat gerakan kamera dalam 3-5 kata",
    "prompt": "teks prompt lengkap bahasa Inggris minimum 50 kata",
    "dialog_karakter": "klausa delivery + dialog karakter dalam ${bahasa}, sesuai pola wajib di [4], maksimal ${batasKata} untuk bagian dialog",
    "on_screen_text": "teks overlay singkat untuk scene ini — kosongkan string \\"\\" jika arketipe/gaya tidak menekankan teks on-screen"${nativeAudio ? `,
    "sequences": [{ "sequence": 1, "timestamp": "00:00-00:0Xs", "action": "aksi/kamera beat ini (Inggris)", "audio": "opsional" }]` : ''}
  }
]
Field WAJIB ada dan non-empty: scene (integer), kamera (string), prompt (string min 50 kata), dialog_karakter (string, format sesuai [4]). on_screen_text WAJIB ada di setiap object tapi BOLEH string kosong "" jika tidak relevan untuk gaya video ini.
${nativeAudio ? `
FIELD OPSIONAL 'sequences' — HANYA untuk scene berdurasi > 6 detik (cek "Durasi" di user prompt):
  • Array beat bertimecode, environment/subjek/karakter WAJIB SAMA di semua elemen — HANYA aksi/gerakan kamera yang berubah per beat (JANGAN ganti lokasi/foto antar beat, tool video-gen tidak mendukung itu dalam satu generate).
  • Timecode berurutan tanpa celah, total menutup penuh durasi scene.
  • Scene ≤ 6 detik: field ini BOLEH dikosongkan/diisi 1 elemen saja, TIDAK wajib dipecah.
  • 'dialog_karakter' TETAP 1 nilai untuk keseluruhan scene, TIDAK ikut dipecah per sequence.` : ''}

ATURAN TAMBAHAN FIELD 'prompt' — WAJIB, PELANGGARAN = OUTPUT DITOLAK:
  ${nativeAudio
    ? `• 'prompt' WAJIB bahasa Inggris di SEMUA scene TERMASUK scene terakhir/CTA, KECUALI teks di dalam TANDA KUTIP GANDA — kutipan dialog itu justru WAJIB tetap dalam ${bahasa} sesuai [4b]. Di luar tanda kutip: Inggris seluruhnya.`
    : `• 'prompt' WAJIB 100% bahasa Inggris di SEMUA scene TERMASUK scene terakhir/CTA — jangan terbawa bahasa dialog_karakter (hanya 'dialog_karakter' yang memakai bahasa dialog).`}
  ${nativeAudio ? `• 'prompt' WAJIB memuat tepat satu kutipan dialog dalam tanda kutip ganda (lihat [4b]). Prompt tanpa kutipan = video bisu = DITOLAK.` : ''}
  ${multiShotScene
    ? `• Untuk SEMUA scene${cutawayExcludedScenes?.length ? ` KECUALI Scene ${cutawayExcludedScenes.join(', ')} (lihat pengecualian di bawah)` : ''}: 'prompt' WAJIB mendeskripsikan TEPAT DUA shot berurutan dalam SATU scene ini (arketipe hybrid A-roll/B-roll — ikuti ARAHAN GAYA VIDEO di atas): Shot 1 = talking head presenter; HARD CUT (bukan gerakan kamera menerus, potongan visual tegas) ke Shot 2 = cutaway penuh area yang sama TANPA presenter, memakai koreografi kamera yang diberikan. Tulis KEDUA shot secara eksplisit dan berurutan di dalam SATU field 'prompt' (mis. 'Shot 1: [presenter talking head] ...; hard cut to; Shot 2: [full b-roll cutaway, no presenter] ...'). Pengecualian ini MENGGANTIKAN aturan "satu shot utuh" yang berlaku untuk arketipe lain.`
    : `• 'prompt' WAJIB mendeskripsikan SATU shot utuh yang bisa berdiri sendiri dari foto referensi. Jika koreografi kamera menyebut transisi (whip-pan, whip cut, dsb), tulis sebagai gabungan, mis. 'fast whip-pan settling into a steady selfie-stick shot of ...' — DILARANG menulis hanya nama transisinya tanpa shot stabil yang bisa ditahan sepanjang durasi.`}
  ${cutawayExcludedScenes?.length
    ? `• PENGECUALIAN — KHUSUS Scene ${cutawayExcludedScenes.join(', ')}: 'prompt' WAJIB mendeskripsikan SATU shot talking-head/selfie utuh SAJA sepanjang durasi scene (kamera stabil/steady mengikuti presenter) — TIDAK ADA hard cut, TIDAK ADA cutaway b-roll di scene ini, meskipun arketipe hybrid berlaku di scene lain. Perlakukan scene ini seperti penutup/closing personal.`
    : ''}`;
}

// Batas babak (PART) — dirancang user di Step 1, dikirim client apa adanya.
// Tujuannya supaya narasi menyambung DI DALAM satu babak dan pergantian nada
// hanya terjadi di batas antar-PART (dulu AI hanya melihat scene lepas-lepas).
function buildPartBlock(parts, sceneDurations, durasiFallback) {
  if (!Array.isArray(parts) || parts.length === 0) return '';
  const durasiByScene = new Map((sceneDurations ?? []).map(d => [Number(d.scene), Number(d.durasi)]));
  const baris = [];
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    const n = parseInt(parts[i]?.sceneCount, 10);
    if (!Number.isInteger(n) || n <= 0) return '';
    const mulai = acc + 1;
    const akhir = acc + n;
    let total = 0;
    // Client lama tidak mengirim scene_durations → jatuh ke durasi platform,
    // supaya blok ini tidak pernah menulis "0 detik" ke prompt.
    for (let s = mulai; s <= akhir; s++) total += durasiByScene.get(s) ?? durasiFallback ?? 0;
    const label = typeof parts[i].label === 'string' && parts[i].label ? `: ${parts[i].label}` : '';
    baris.push(`- PART ${i + 1} — ${parts[i].role}${label} (${total} detik, Scene ${mulai === akhir ? mulai : `${mulai}-${akhir}`})`);
    acc = akhir;
  }
  return `STRUKTUR BABAK (PART) — satu PART = satu babak naratif yang UTUH:
${baris.join('\n')}
Dialog scene-scene dalam SATU part harus menyambung (kalimat berlanjut, jangan mengulang pembuka tiap scene). Pergantian nada/topik hanya di batas antar-PART.

`;
}

function buildUserPrompt({ property, karakterDesc, jumlahScene, fotoAssignments, durasiDetik, sceneDurations, sceneRoles, cameraDirectives, archetypeNote, parts, regenerateScene, existingScenes }) {
  const durasiByScene = new Map((sceneDurations ?? []).map(d => [Number(d.scene), Number(d.durasi)]));
  const fasilitas = 'tidak disebutkan';
  const deskripsi = (property.deskripsi ?? '').slice(0, 200);
  const hargaLabel = `${formatRupiah(property.harga)}${property.nego ? ' (nego)' : property.nett ? ' (nett)' : ''}`;

  const roleByScene = new Map((sceneRoles ?? []).map(r => [Number(r.scene), r.role]));
  // Koreografi kamera arketipe (dihitung di client) — string siap-pakai per scene.
  const cameraByScene = new Map((cameraDirectives ?? []).map(c => [Number(c.scene), String(c.camera ?? '')]));

  const sceneLines = fotoAssignments
    .slice()
    .sort((a, b) => a.scene - b.scene)
    .map(a => {
      const fotoDeskripsi = LABEL_MAP[a.foto_label] ?? LABEL_MAP.lainnya;
      // Bila arketipe menyediakan koreografi kamera untuk scene ini, pakai itu
      // (lebih koheren dgn gaya video). Kalau tidak, fallback ke hint per-label.
      const kameraHint = cameraByScene.get(a.scene) || KAMERA_PER_LABEL[a.foto_label] || KAMERA_PER_LABEL.lainnya;
      const role = roleByScene.get(a.scene) ?? 'Body';
      // Durasi & budget kata PER SCENE. Sebelum audit 2026-07-26 keduanya dipaku
      // ke satu angka per platform, sehingga pengaturan durasi di Step 1 tidak
      // pernah berpengaruh apa pun di jalur ini.
      const d = durasiByScene.get(a.scene) ?? durasiDetik;
      return `Scene ${a.scene}:\n  Foto      : ${fotoDeskripsi} (${a.foto_label})\n  Kamera    : ${kameraHint}\n  Durasi    : ${d} detik\n  Maks kata : ${getMaxWords(d)} kata untuk bagian dialog\n  Role      : ${role}`;
    })
    .join('\n\n');

  const archetypeBlock = archetypeNote
    ? `ARAHAN GAYA VIDEO (ARKETIPE) — WAJIB dipatuhi di semua scene:\n${archetypeNote}\n\n`
    : '';
  const partBlock = buildPartBlock(parts, sceneDurations, durasiDetik);

  // Mode regenerate satu scene: AI hanya membuat ulang scene N dengan variasi baru,
  // sambil menjaga kesinambungan dengan dialog scene lain yang sudah final.
  let closingInstruction = `Buat ${jumlahScene} video prompt sesuai aturan system prompt.`;
  let regenBlock = '';
  if (regenerateScene) {
    const prev = (existingScenes ?? []).find(s => Number(s.scene) === regenerateScene);
    const others = (existingScenes ?? [])
      .filter(s => Number(s.scene) !== regenerateScene && s.dialog_karakter)
      .map(s => `  Scene ${s.scene}: "${String(s.dialog_karakter).slice(0, 200)}"`)
      .join('\n');
    regenBlock = `
PERINTAH KHUSUS — REGENERATE SATU SCENE:
User meminta HANYA Scene ${regenerateScene} dibuat ulang dengan VARIASI BARU yang segar.
${prev ? `Versi sebelumnya Scene ${regenerateScene} (JANGAN mengulangi pendekatan yang sama — buat gerakan kamera, angle, dan kalimat dialog yang BERBEDA):
  kamera sebelumnya : ${String(prev.kamera ?? '').slice(0, 150)}
  dialog sebelumnya : "${String(prev.dialog_karakter ?? '').slice(0, 250)}"
` : ''}${others ? `Scene lain SUDAH FINAL dan TIDAK diubah — jaga kesinambungan narasi (jangan buat dialog yang bertabrakan/duplikat dengan ini):
${others}
` : ''}`;
    closingInstruction = `Buat ulang HANYA Scene ${regenerateScene}. Output: JSON array berisi TEPAT 1 objek scene dengan field "scene" = ${regenerateScene}, mengikuti semua aturan system prompt (kamera & foto sesuai instruksi Scene ${regenerateScene} di atas, peran scene tetap sama).`;
  }

  return `${archetypeBlock}${partBlock}Data properti:
- Jenis: ${property.jenis_properti}
- Judul: ${property.title}
- Lokasi: ${property.kecamatan}, ${property.kabupaten}
- Harga: ${hargaLabel}
- Luas Tanah: ${property.luas_tanah ?? '-'} m² | Luas Bangunan: ${property.luas_bangunan ?? '-'} m²
- Kamar Tidur: ${property.jumlah_kamar_tidur ?? '-'} | Kamar Mandi: ${property.jumlah_kamar_mandi ?? '-'}
- Legalitas: ${property.legalitas ?? '-'}
- Fasilitas: ${fasilitas}
- Deskripsi singkat: ${deskripsi || '-'}

Karakter: ${karakterDesc}

Instruksi per scene (kamera & durasi sudah ditentukan, WAJIB diikuti):
${sceneLines}
${regenBlock}
${closingInstruction}`;
}

function describeKarakter(k) {
  const parts = [];
  if (k.gender) parts.push(k.gender);
  if (k.usia) parts.push(`${k.usia} tahun`);
  if (k.etnik) parts.push(k.etnik);
  if (k.style) parts.push(`gaya ${k.style}`);
  if (k.ciri_fisik) parts.push(k.ciri_fisik);
  return parts.join(', ') || 'tidak ada deskripsi khusus';
}

// Khusus untuk userPrompt DeepSeek — beda dari describeKarakter() di atas
// (yang dipakai untuk field karakter.deskripsi di response API): sertakan
// nama karakter langsung, dan fallback teks jika ciri_fisik NULL.
function describeKarakterUntukPrompt(k, expression) {
  return [
    k.nama,
    k.gender ?? null,
    k.usia ? `usia sekitar ${k.usia} tahun` : null,
    k.etnik ?? null,
    k.style ?? null,
    k.ciri_fisik ?? 'penampilan profesional, pakaian formal gelap',
    `ekspresi ${EXPRESSION_EN[expression] ?? EXPRESSION_EN.auto}`,
  ].filter(Boolean).join(', ');
}

function validateFotoAssignments(fotoAssignments, jumlahScene) {
  if (!Array.isArray(fotoAssignments) || fotoAssignments.length !== jumlahScene) {
    return { ok: false, error: `foto_assignments harus berisi tepat ${jumlahScene} item` };
  }
  const scenesSeen = new Set();
  for (const a of fotoAssignments) {
    const sceneNum = Number(a?.scene);
    if (!Number.isInteger(sceneNum) || sceneNum < 1 || sceneNum > jumlahScene) {
      return { ok: false, error: 'foto_assignments punya nomor scene tidak valid' };
    }
    if (typeof a?.foto_url !== 'string' || !a.foto_url.trim()) {
      return { ok: false, error: `Scene ${sceneNum} belum punya foto terpilih` };
    }
    if (typeof a?.foto_label !== 'string' || !a.foto_label.trim()) {
      return { ok: false, error: `Scene ${sceneNum} belum punya label foto` };
    }
    scenesSeen.add(sceneNum);
  }
  if (scenesSeen.size !== jumlahScene) {
    return { ok: false, error: 'Semua scene harus punya foto terpilih' };
  }
  return { ok: true };
}

function isValidScene(s) {
  return typeof s === 'object' && s !== null &&
    Number.isInteger(s.scene) &&
    typeof s.kamera === 'string' && s.kamera.trim().length >= 3 &&
    typeof s.prompt === 'string' && s.prompt.trim().split(/\s+/).length >= 50 &&
    typeof s.dialog_karakter === 'string' && s.dialog_karakter.trim().length >= 10;
}

// Heuristik deteksi field 'prompt' yang keluar dalam Bahasa Indonesia (model kadang
// terbawa bahasa dialog_karakter, terutama di scene CTA/terakhir) — prompt non-Inggris
// membuat AI video generator eksternal sering gagal. ≥3 stopword khas ID = ditolak.
const ID_STOPWORDS = ['yang', 'dengan', 'dan', 'untuk', 'dari', 'berbicara', 'terlihat', 'menghadap', 'berdiri', 'rumah', 'pemirsa', 'sebuah'];
// PENTING: pada tool ber-audio native, 'prompt' SENGAJA memuat kutipan dialog
// berbahasa Indonesia (lihat [4b]) — tanpa membuang isi tanda kutip lebih dulu,
// detektor ini akan menolak setiap output yang justru sudah benar.
function stripKutipan(text) {
  return String(text).replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ');
}
function looksIndonesian(text, abaikanKutipan = false) {
  const t = ` ${(abaikanKutipan ? stripKutipan(text) : String(text)).toLowerCase()} `;
  let hits = 0;
  for (const w of ID_STOPWORDS) { if (t.includes(` ${w} `)) hits++; if (hits >= 3) return true; }
  return false;
}

function parseSceneJson(raw, expectedCount, requireRefAnchor = false, nativeAudio = false) {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Ekstraksi tahan-banting: '[' pertama sampai ']' terakhir (model kadang menambah teks).
  const first = text.indexOf('['), last = text.lastIndexOf(']');
  if (first > 0 || (last >= 0 && last < text.length - 1)) text = text.slice(first, last + 1);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Respons AI bukan JSON valid' };
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedCount || !parsed.every(isValidScene)) {
    return {
      ok: false,
      error: `Output AI tidak valid. Dapat ${Array.isArray(parsed) ? parsed.length : 'non-array'} scene, butuh ${expectedCount}. Setiap scene wajib: scene (int), kamera (≥3 karakter), prompt (≥50 kata), dialog_karakter (≥10 karakter).`,
    };
  }
  // Cegah nomor scene duplikat/di luar rentang — sebelumnya lolos validasi lalu membuat
  // referensi foto & nama file ZIP salah sasaran (audit 2026-07-28). Rentang 1..expectedCount
  // HANYA ditegakkan untuk generate penuh (expectedCount>1) — mode regenerate (expectedCount=1)
  // sengaja dilewati karena nomor scene DIPAKSA ulang ke nilai yang diminta setelah fungsi ini
  // return (lihat `sceneData[0].scene = regenerateScene` di pemanggil), jadi validasi rentang
  // di sini justru bisa menolak output yang benar.
  const sceneNums = parsed.map(s => s.scene);
  if (new Set(sceneNums).size !== sceneNums.length) {
    return { ok: false, error: `Output AI memuat nomor scene duplikat: ${sceneNums.join(', ')}.` };
  }
  if (expectedCount > 1) {
    const outOfRange = sceneNums.filter(n => n < 1 || n > expectedCount);
    if (outOfRange.length > 0) {
      return { ok: false, error: `Output AI memuat nomor scene di luar rentang 1-${expectedCount}: ${outOfRange.join(', ')}.` };
    }
  }
  const idScene = parsed.find(s => looksIndonesian(s.prompt, nativeAudio));
  if (idScene) {
    return { ok: false, error: `Scene ${idScene.scene}: field prompt keluar dalam Bahasa Indonesia (wajib Inggris untuk AI video generator)` };
  }
  // Audio native: tanpa kutipan dialog di dalam 'prompt', Veo/Flow menghasilkan
  // video BISU walau dialog_karakter terisi rapi. Perlakukan sebagai kegagalan
  // provider agar fallback berantai mencoba provider lain, bukan diloloskan.
  if (nativeAudio) {
    const tanpaKutipan = parsed.find(s => !/"[^"]{4,}"|“[^”]{4,}”/.test(String(s.prompt)));
    if (tanpaKutipan) {
      return { ok: false, error: `Scene ${tanpaKutipan.scene}: prompt tidak memuat dialog dalam tanda kutip (video akan bisu di Veo/Flow)` };
    }
  }
  if (requireRefAnchor) {
    const noAnchor = parsed.find(s => !/reference/i.test(s.prompt));
    if (noAnchor) {
      return { ok: false, error: `Scene ${noAnchor.scene}: prompt tidak meng-anchor ke reference image (wajib untuk tool ber-reference image)` };
    }
  }
  return { ok: true, data: parsed };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  const jumlahScene = parseInt(body.jumlah_scene, 10);
  const {
    platform, ai_tool: aiTool, bahasa, musik_value: musikValue,
    tone, visual_style: visualStyle, hook_type: hookType, cta_type: ctaType,
  } = body;
  const sceneRoles = Array.isArray(body.scene_roles) ? body.scene_roles : [];
  // Batas babak (opsional). Client hanya mengirimnya bila rancangan Part konsisten
  // dengan jumlah scene; di sini tetap divalidasi ulang (sum harus = jumlahScene)
  // supaya pembagian timpang tidak pernah sampai ke teks prompt.
  const partsRaw = Array.isArray(body.parts) ? body.parts : [];
  const partsSum = partsRaw.reduce((s, p) => s + (parseInt(p?.sceneCount, 10) || 0), 0);
  const parts = partsRaw.length > 0 && partsSum === jumlahScene
    ? partsRaw
        .filter(p => ['Hook', 'Body', 'CTA'].includes(p?.role))
        .map(p => ({
          role: p.role,
          sceneCount: parseInt(p.sceneCount, 10),
          label: typeof p.label === 'string' ? p.label.slice(0, 80) : '',
        }))
    : [];
  const musikPrompt = typeof body.musik_prompt === 'string' ? body.musik_prompt : '';
  const karakterId = parseInt(body.karakter_id, 10);
  const fotoAssignments = body.foto_assignments;
  const supportsRefImage = body.supports_ref_image === true;
  const expression = typeof body.expression === 'string' ? body.expression : 'auto';
  // Arketipe (opsional) — string siap-pakai dari client (client compute, backend consume).
  // Cap dinaikkan dari 600→2000: arketipe baru (agent_broll_hybrid, kinetic_typography,
  // client_testimonial) punya shotGrammarNote lebih detail (hingga ~1480 char) — 600 char
  // memotong instruksi krusial di tengah kalimat (mis. klarifikasi audio-tidak-terpotong
  // pada agent_broll_hybrid jatuh SETELAH byte ke-600, jadi tidak pernah sampai ke LLM).
  const archetypeNote = typeof body.archetype_note === 'string' ? body.archetype_note.slice(0, 2000) : '';
  const PRESENTER_VALID = ['on_camera', 'voiceover_only', 'faceless_broll'];
  const presenterMode = PRESENTER_VALID.includes(body.presenter_mode) ? body.presenter_mode : 'on_camera';
  // Arketipe hybrid A-roll/B-roll (agent_broll_hybrid, selfie_luxury_hybrid) butuh
  // 2 shot dalam 1 scene — merelaksasi aturan default "satu shot utuh" (buildSystemPrompt).
  const multiShotScene = body.multi_shot_scene === true;
  // Scene (1-based) dikecualikan dari cutaway hybrid — jadi talking-head/selfie
  // murni (mis. scene CTA/penutup). Divalidasi terhadap rentang jumlahScene di bawah.
  const cutawayExcludedScenes = Array.isArray(body.cutaway_excluded_scenes)
    ? [...new Set(body.cutaway_excluded_scenes.map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n >= 1 && n <= jumlahScene))].sort((a, b) => a - b).slice(0, 12)
    : [];
  const registerInstruction = typeof body.register_instruction === 'string' ? body.register_instruction.slice(0, 400) : '';
  // Tiga parameter Step 1 yang sebelumnya TIDAK PERNAH masuk prompt (audit 2026-07-28):
  // rasio video, perilaku platform primer, dan format spec khas AI tool.
  const ratio = typeof body.ratio === 'string' ? body.ratio.slice(0, 12) : '';
  const platformBehavior = typeof body.platform_behavior === 'string' ? body.platform_behavior.slice(0, 300) : '';
  const toolFormatSpec = typeof body.tool_format_spec === 'string' ? body.tool_format_spec.slice(0, 400) : '';
  // Provider AI + model (default gemini). Fallback otomatis ke provider lain bila kuota habis.
  const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';
  const chosenModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null;
  const cameraDirectives = Array.isArray(body.camera_directives)
    ? body.camera_directives
        .filter(c => c && Number.isInteger(Number(c.scene)) && typeof c.camera === 'string')
        .map(c => ({ scene: Number(c.scene), camera: c.camera.slice(0, 400) }))
    : [];

  // Mode regenerate satu scene (opsional)
  const regenerateScene = Number.isInteger(parseInt(body.regenerate_scene, 10)) && parseInt(body.regenerate_scene, 10) > 0
    ? parseInt(body.regenerate_scene, 10)
    : null;
  const existingScenes = Array.isArray(body.existing_scenes)
    ? body.existing_scenes
        .filter(s => s && Number.isInteger(Number(s.scene)))
        .map(s => ({
          scene: Number(s.scene),
          kamera: typeof s.kamera === 'string' ? s.kamera.slice(0, 200) : '',
          dialog_karakter: typeof s.dialog_karakter === 'string' ? s.dialog_karakter.slice(0, 300) : '',
        }))
        .slice(0, 12)
    : [];

  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib diisi', 422);
  if (!Number.isInteger(jumlahScene) || jumlahScene < 2 || jumlahScene > 12) return jsonError('jumlah_scene harus 2-12', 422);
  if (regenerateScene != null && regenerateScene > jumlahScene) return jsonError('regenerate_scene di luar rentang jumlah scene', 422);
  if (!platform || typeof platform !== 'string') return jsonError('platform wajib diisi', 422);
  if (!aiTool || typeof aiTool !== 'string') return jsonError('ai_tool wajib diisi', 422);
  if (!bahasa || typeof bahasa !== 'string') return jsonError('bahasa wajib diisi', 422);
  if (!Number.isInteger(karakterId) || karakterId <= 0) return jsonError('karakter_id wajib diisi', 422);

  const fotoCheck = validateFotoAssignments(fotoAssignments, jumlahScene);
  if (!fotoCheck.ok) return jsonError(fotoCheck.error, 422);

  let property;
  try {
    property = await env.DB.prepare(`
      SELECT id, kode_listing, title, jenis_properti, harga, nego, nett,
             jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan,
             legalitas, kecamatan, kabupaten, deskripsi
      FROM properties WHERE id = ?
    `).bind(propertyId).first();
  } catch (err) {
    console.error('[viralframe ai-generate property]', err.message);
    return jsonError('Gagal mengambil data properti', 500);
  }
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  let karakter;
  try {
    karakter = await env.DB.prepare(`
      SELECT id, nama, foto_url, gender, usia, etnik, style, ciri_fisik
      FROM viralframe_characters WHERE id = ?
    `).bind(karakterId).first();
  } catch (err) {
    console.error('[viralframe ai-generate karakter]', err.message);
    return jsonError('Gagal mengambil data karakter', 500);
  }
  if (!karakter) return jsonError('Karakter tidak ditemukan', 404);

  const durasiDetik = PLATFORM_DURASI[platform] ?? 8;
  // Durasi PER SCENE dari Step 1. Sebelum audit 2026-07-26 jalur ini memaku durasi
  // ke PLATFORM_DURASI, sehingga pengaturan durasi Step 1 tidak berpengaruh apa pun:
  // budget kata selalu dihitung dari 8 detik walau user menyetel 20 detik.
  // Tetap toleran bila client lama tidak mengirimnya → jatuh ke perilaku lama.
  const sceneDurations = Array.isArray(body.scene_durations)
    ? body.scene_durations
        .map(d => ({ scene: parseInt(d?.scene, 10), durasi: parseInt(d?.durasi, 10) }))
        .filter(d => Number.isInteger(d.scene) && d.scene >= 1 && d.scene <= jumlahScene
                  && Number.isInteger(d.durasi) && d.durasi >= 2 && d.durasi <= 30)
    : [];
  const daftarDurasi = sceneDurations.length > 0
    ? sceneDurations.map(d => d.durasi)
    : [durasiDetik];
  const durasiSeragam = new Set(daftarDurasi).size <= 1;
  // Batas kata yang disebut di system prompt = yang TERBESAR, supaya angka global
  // tidak pernah lebih ketat dari budget scene mana pun (per-scene tetap mengikat).
  const maxWords = Math.max(...daftarDurasi.map(getMaxWords));
  const expressionLabel = EXPRESSION_EN[expression] ?? EXPRESSION_EN.auto;
  const deskripsiKarakter = describeKarakter(karakter);
  const karakterDesc = describeKarakterUntukPrompt(karakter, expression);

  // Tool ber-audio native (Veo 3.x / Google Flow): dialog harus tertanam di dalam
  // field 'prompt', dan setiap scene diberi negative_prompt untuk menekan subtitle
  // bakar. Lihat functions/_lib/viralframe-shared.js.
  const nativeAudio = isNativeAudioTool(aiTool);
  const clipMaxSec = getClipMaxSec(aiTool);

  // Hook/CTA "Auto" — sebelum audit 2026-08-01 ini berarti "tanpa instruksi tambahan",
  // jadi AI cenderung jatuh ke pola paling generik berulang-ulang. Sekarang: kalau Auto,
  // ambil hook/cta yang BARU dipakai (lintas seluruh katalog, bukan cuma properti ini —
  // penonton feed sosmed melihat semua listing bercampur) dari riwayat generate, lalu
  // instruksikan AI untuk TIDAK memakainya lagi. Gagal-aman: query gagal → tetap 'auto' tanpa exclusion.
  let excludedHooks = [];
  let excludedCtas = [];
  if (isAutoValue(hookType) || isAutoValue(ctaType)) {
    try {
      const histRes = await env.DB.prepare(
        `SELECT params_json FROM viralframe_generations ORDER BY created_at DESC LIMIT 8`
      ).all();
      for (const row of histRes.results ?? []) {
        let p;
        try { p = JSON.parse(row.params_json); } catch { continue; }
        if (p?.hookType && !isAutoValue(p.hookType) && !excludedHooks.includes(p.hookType) && excludedHooks.length < 5) {
          excludedHooks.push(p.hookType);
        }
        if (p?.ctaType && !isAutoValue(p.ctaType) && !excludedCtas.includes(p.ctaType) && excludedCtas.length < 5) {
          excludedCtas.push(p.ctaType);
        }
      }
    } catch (err) {
      console.error('[viralframe ai-generate hook/cta history]', err.message);
    }
  }

  const systemPrompt = buildSystemPrompt({ jumlahScene, bahasa, musikValue, musikPrompt, tone, visualStyle, hookType, ctaType, excludedHooks, excludedCtas, maxWords, supportsRefImage, expressionLabel, presenterMode, registerInstruction, multiShotScene, cutawayExcludedScenes, nativeAudio, durasiSeragam, ratio, platformBehavior, toolFormatSpec, aiTool, clipMaxSec });
  const userPrompt = buildUserPrompt({ property, karakterDesc, jumlahScene, fotoAssignments, durasiDetik, sceneDurations, sceneRoles, cameraDirectives, archetypeNote, parts, regenerateScene, existingScenes });

  // ── Panggil AI dengan fallback berantai, respons streaming NDJSON ──────────
  // Urutan: provider pilihan user dulu, lalu sisanya (yang punya key). Heartbeat
  // tiap 2s membuat response "mengalir" sejak awal sehingga bebas wall-clock 30s;
  // tiap provider dapat waktu penuh (55s) tanpa anggaran 26s lagi.
  const expectedCount = regenerateScene != null ? 1 : jumlahScene;
  // Mode multi-shot (agent_broll_hybrid): field 'prompt' mendeskripsikan 2 shot per
  // scene (~2× lebih panjang) — beri budget token per scene lebih besar agar output
  // 10-12 scene tidak terpotong di tengah JSON (parse gagal → semua provider "gagal").
  const perSceneTokens = multiShotScene ? 520 : 350;
  const maxTokens = regenerateScene != null
    ? (multiShotScene ? 1300 : 900)
    : Math.min(6000, 500 + jumlahScene * perSceneTokens);
  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(p => p !== chosenProvider)];

  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n')).catch(() => {});

  const work = (async () => {
    const heartbeat = setInterval(() => send({ status: 'progress' }), 2000);
    try {
      let sceneData = null;
      let usedProvider = null;
      let usedModel = null;
      const attempts = [];

      for (const provider of tryOrder) {
        const key = await getProviderKey(env, provider);
        if (!key) { attempts.push({ provider, skipped: 'no_key' }); continue; }
        const model = provider === chosenProvider && chosenModel ? chosenModel : PROVIDERS[provider].defaultModel;

        const result = await callChatCompletion({
          provider, apiKey: key, model, systemPrompt, userPrompt, maxTokens,
          // Gemini = model thinking: tanpa 'none', token reasoning tersembunyi bikin lambat.
          reasoningEffort: provider === 'gemini' ? 'none' : undefined,
          timeoutMs: 55000,
        });
        if (!result.ok) {
          attempts.push({ provider, error: result.error?.slice(0, 140), quota: result.quotaExhausted === true });
          console.error(`[ai-generate] ${provider} gagal:`, result.error?.slice(0, 160));
          continue;
        }
        // Output tidak valid (JSON rusak / jumlah scene salah / prompt berbahasa
        // Indonesia / tanpa anchoring reference) = kegagalan provider juga →
        // coba provider berikutnya, jangan langsung menyerah dengan error ke user.
        const parsed = parseSceneJson(result.content, expectedCount, supportsRefImage, nativeAudio);
        if (!parsed.ok) {
          attempts.push({ provider, error: parsed.error.slice(0, 140) });
          console.error(`[ai-generate] ${provider} output tidak valid:`, parsed.error.slice(0, 160));
          continue;
        }
        sceneData = parsed.data;
        usedProvider = provider;
        usedModel = model;
        break;
      }

      if (!sceneData) {
        const allNoKey = attempts.length > 0 && attempts.every(a => a.skipped === 'no_key');
        if (allNoKey) {
          send({ done: true, error: 'Belum ada API key AI yang diatur. Buka menu Pengaturan → AI Providers dan simpan minimal satu API key.' });
          return;
        }
        const detail = attempts
          .map(a => `${a.provider}: ${a.error || a.skipped || 'gagal'}`)
          .join(' | ');
        send({ done: true, error: `Semua provider AI gagal. ${detail}`.slice(0, 480) });
        return;
      }

      // Mode regenerate: paksa nomor scene = yang diminta (model kadang salah nomor).
      if (regenerateScene != null) sceneData[0].scene = regenerateScene;

      const fotoByScene = new Map(fotoAssignments.map(a => [Number(a.scene), a]));
      // Nama file referensi mengikuti isi ZIP (handleDownloadZip di frontend):
      // foto scene = sceneN_foto.webp, foto karakter = <Nama_Karakter>.webp —
      // supaya user/tool tahu persis gambar mana milik scene mana.
      const karakterFile = namaFileKarakter(karakter.nama);
      const enrichedScenes = sceneData.map(s => {
        const assignment = fotoByScene.get(s.scene);
        return {
          ...s,
          // Sanitasi tipe — on_screen_text tidak divalidasi ketat oleh isValidScene()
          // (opsional/best-effort), pastikan selalu string agar tidak bocor undefined/tipe lain ke frontend/ZIP.
          on_screen_text: typeof s.on_screen_text === 'string' ? s.on_screen_text.trim() : '',
          foto_label: assignment?.foto_label ?? null,
          foto_deskripsi: assignment ? (LABEL_MAP[assignment.foto_label] ?? LABEL_MAP.lainnya) : null,
          // negative_prompt disuntik SERVER, bukan diminta ke AI — nilainya tetap dan
          // deterministik, jadi tidak ada gunanya membakar token & risiko model lupa.
          ...(nativeAudio
            ? { negative_prompt: NEGATIVE_PROMPT_VIDEO, max_clip_sec: clipMaxSec }
            : {}),
          ...(supportsRefImage ? { reference_image: `scene${s.scene}_foto.webp`, character_reference: karakterFile } : {}),
        };
      });

      const fotoUrls = fotoAssignments
        .slice()
        .sort((a, b) => a.scene - b.scene)
        .map(a => a.foto_url);

      send({
        done: true,
        data: {
          scenes: enrichedScenes,
          foto_urls: fotoUrls,
          karakter: { nama: karakter.nama, deskripsi: deskripsiKarakter, foto_url: karakter.foto_url },
          metadata: {
            platform, ai_tool: aiTool, bahasa,
            musik_value: musikValue,
            judul_properti: property.title,
            kode_listing: property.kode_listing,
            generated_at: new Date().toISOString(),
            // rulebook_version (Stage 3) — traceability aturan realisme/anti-halusinasi
            // yang berlaku saat generate ini dibuat, lihat viralframe-shared.js.
            rulebook_version: RULEBOOK_VERSION,
            regenerated_scene: regenerateScene,
            // Info provider yang benar-benar dipakai (untuk indikator fallback di UI)
            provider_used: usedProvider,
            model_used: usedModel,
            provider_requested: chosenProvider,
            fell_back: usedProvider !== chosenProvider,
          },
        },
      });
    } catch (err) {
      console.error('[ai-generate] stream', err.message);
      send({ done: true, error: 'Terjadi kesalahan internal saat generate. Coba lagi.' });
    } finally {
      clearInterval(heartbeat);
      await writer.close().catch(() => {});
    }
  })();
  context.waitUntil?.(work);

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
