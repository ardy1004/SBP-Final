#!/usr/bin/env node
/**
 * Penjaga kelengkapan "Prompt Rulebook" + field Scene ViralFrame — mencegah
 * drift terulang. 2 bagian: (1) impor kosakata/aturan wajib per jalur prompt-
 * engine, (2) field Scene penting yang harus tersambung ke exporter/renderer
 * jalur yang sama (lihat komentar BAGIAN 2 di bawah untuk rasional lengkap).
 *
 * LATAR BELAKANG (2026-07-28): ViralFrame punya 3 jalur prompt-engine paralel
 * (masterPromptCompiler.ts, ai-generate.js buildSystemPrompt(), youtube-long.js)
 * yang harus sama-sama mengirim kosakata/aturan tertentu (realisme anti-CGI,
 * negative prompt) ke AI. Konstanta sumbernya sudah SATU (viralframe-shared.js),
 * tapi youtube-long.js sempat SAMA SEKALI tidak mengimpornya saat kosakata
 * realisme ditambahkan ke 2 jalur lain — tidak ada error build, tidak ada
 * warning, cuma video yang diam-diam terlihat lebih "AI banget" di 1 dari 3
 * jalur. Backend Functions (plain JS) tidak punya typecheck yang bisa menangkap
 * "identifier dipakai tapi tidak diimpor" sebelum runtime — script ini
 * mengisi celah itu secara statis, tanpa perlu menjalankan apa pun.
 *
 * ATURAN: setiap file di REQUIRED_IMPORTS WAJIB mengimpor SEMUA nama di
 * daftarnya — baik langsung dari viralframe-shared.js, atau lewat re-export
 * options.ts (frontend). Dicek dengan mencari nama itu di dalam blok
 * `import { ... } from ...` mana pun di file (regex sederhana, bukan parser
 * AST — cukup untuk gaya import project ini, lihat catatan di bawah).
 *
 * KAPAN MENAMBAH ENTRI BARU:
 *   - File prompt-engine baru dibuat (jalur AI generate lain) → tambah ke
 *     REQUIRED_IMPORTS dengan daftar konstanta wajibnya.
 *   - Aturan/kosakata baru ditambahkan ke viralframe-shared.js yang WAJIB
 *     dipakai semua jalur (seperti REALISM_* dulu) → tambahkan namanya ke
 *     SETIAP entri yang relevan di REQUIRED_IMPORTS.
 *
 * BATASAN YANG DISADARI: regex ini hanya membuktikan identifier ADA di suatu
 * import block — tidak membuktikan dipakai dengan benar di teks prompt akhir.
 * Itu di luar cakupan script statis; verifikasi isi prompt tetap manual/uji
 * generate nyata (lihat memory project_viralframe_architecture.md).
 *
 * Pemakaian: node scripts/check-viralframe-rulebook.mjs
 */

import { readFileSync } from 'node:fs';

const REQUIRED_IMPORTS = {
  'src/app/components/admin/viralframe/masterPromptCompiler.ts': [
    'REALISM_QUALITY_CUES', 'REALISM_BANNED_QUALITY_PHRASES', 'NEGATIVE_PROMPT_VIDEO',
    // Ditambahkan audit 2026-08-04 (delivery clause terhitung dari durasi, bukan
    // string "cepat" tetap) — lihat komentar BAGIAN 5 di bawah untuk latar penuh.
    // Diimpor lewat re-export './options' (frontend), bukan langsung dari
    // viralframe-shared.js — VERIFIKASI ke masterPromptCompiler.ts kalau nama
    // re-export berubah.
    'getEmotionForRole', 'PERFORMANCE_INTENT_BY_ROLE', 'VOICE_PERSONA_HINT',
    // Contoh kalimat CTA terucap — label kategori saja membuat model menulis ajakan
    // umum yang tidak menyebut objeknya sama sekali (audit 2026-08-04).
    'CTA_SPOKEN_EXAMPLE',
    // Adopsi pola storyboard ChatGPT rujukan user (2026-08-16): larangan pembuka
    // hook generik ("Halo guys, saya...") + larangan mengarang elemen struktur
    // properti (lantai/kolam/jendela tambahan) di deskripsi visual cut.
    'BANNED_HOOK_OPENERS', 'HOOK_OPENER_EXAMPLE', 'PROPERTY_STRUCTURAL_NEGATIVES',
  ],
  'functions/api/admin/viralframe/ai-generate.js': [
    'REALISM_QUALITY_CUES', 'REALISM_BANNED_QUALITY_PHRASES', 'NEGATIVE_PROMPT_VIDEO', 'RULEBOOK_VERSION',
    'getEmotionForRole', 'PERFORMANCE_INTENT_BY_ROLE', 'buildDeliveryClause',
    'VOICE_PERSONA_HINT', 'VOICE_PRIORITY_NOTE',
    'BANNED_HOOK_OPENERS', 'HOOK_OPENER_EXAMPLE', 'PROPERTY_STRUCTURAL_NEGATIVES',
  ],
  'functions/api/admin/viralframe/youtube-long.js': [
    'REALISM_QUALITY_CUES', 'REALISM_BANNED_QUALITY_PHRASES', 'NEGATIVE_PROMPT_VIDEO', 'RULEBOOK_VERSION',
    // Jalur ini TIDAK butuh getEmotionForRole/PERFORMANCE_INTENT_BY_ROLE/
    // buildDeliveryClause (skema dialogue-nya beda, tidak berbasis Part/peran) —
    // yang wajib disamakan hanya karakter suara & prioritas mixing audio.
    // BANNED_HOOK_OPENERS juga SENGAJA tidak wajib di sini: video YouTube long-form
    // punya blok "opening" host yang legitimately butuh intro (beda konteks dari
    // hook 3-detik short-form vertikal) — lihat catatan di ai-generate.js.
    'VOICE_PERSONA_HINT', 'VOICE_PRIORITY_NOTE',
  ],
};

const problems = [];

function importedNames(src) {
  const blocks = src.match(/import\s*\{([^}]*)\}\s*from/g) ?? [];
  return blocks.join('\n');
}

for (const [file, names] of Object.entries(REQUIRED_IMPORTS)) {
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    problems.push(`${file}: file tidak ditemukan — perbarui REQUIRED_IMPORTS di script ini kalau file dipindah/dihapus/di-rename.`);
    continue;
  }
  const importText = importedNames(src);
  for (const name of names) {
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(importText)) {
      problems.push(`${file}: TIDAK mengimpor "${name}" — kosakata/aturan ini tidak akan sampai ke AI di jalur ini.`);
    }
    // Dipakai (referenced) tapi tidak diimpor = ReferenceError runtime (bug nyata
    // yang baru saja terjadi di file ini sendiri saat menulis script ini,
    // 2026-07-28 — dipakai duluan sebelum sadar belum diimpor).
    const usedElsewhere = new RegExp(`[^.\\w]${name}\\b`).test(src.replace(importText, ''));
    if (usedElsewhere && !re.test(importText)) {
      problems.push(`${file}: "${name}" DIPAKAI di badan file tapi tidak diimpor — akan ReferenceError saat runtime.`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BAGIAN 2 — Kelengkapan field Scene lintas exporter/renderer (Stage 4, 2026-07-28)
// ════════════════════════════════════════════════════════════════════════════
// ViralFrame TIDAK punya 1 skema Scene kanonik — Jalur A (masterPromptCompiler.ts
// + jsonValidator.ts + SceneCards.tsx) dan Jalur C (ai-generate.js + AIScene
// interface + ZIP di AdminViralFrameWorkspacePage.tsx) punya bentuk BERBEDA
// (objek terstruktur vs flat string) untuk tujuan yang genuinely berbeda
// kompleksitasnya — SceneCards.tsx menangani validasi Veo-object/lipsync, render
// inline Jalur C sengaja sederhana. Memaksa keduanya jadi 1 komponen/exporter
// dinilai BERISIKO (regresi UI tak kelihatan tanpa uji browser langsung) untuk
// manfaat yang tidak jelas, jadi TIDAK dilakukan.
//
// Sebagai gantinya: field penting yang bisa "hilang senyap" (ada di skema tapi
// lupa disambungkan ke exporter/renderer JALUR YANG SAMA — persis kasus
// `sequences` hilang dari ZIP Jalur C sebelum diperbaiki Stage 1) dijaga di
// sini. Field baru yang ditambahkan ke SATU sisi (mis. field baru di AIScene)
// WAJIB juga ditambahkan ke daftar SCENE_FIELD_PARITY kalau field itu perlu
// terlihat user di exporter/renderer terkait.
const SCENE_FIELD_PARITY = [
  // 'sequences' (beat bertimecode per-scene, Fase 6) digantikan `cuts[]` saat
  // refactor Part-as-Generate-Unit (2026-08-01): unit generate berubah dari
  // "1 scene = 1 foto" jadi "1 Part = 1 generate call", dan berbeda dari
  // `sequences`, foto BOLEH berganti antar cut karena semua referensinya
  // dilampirkan sekaligus (maks MAX_REF_IMAGES_PER_PART).
  //
  // CATATAN: entri lama sempat dihapus dengan alasan "sequences tidak ada lagi
  // di skema manapun" — itu KELIRU saat ditulis, karena `ai-generate.js` masih
  // memintanya dan workspace masih menulisnya ke ZIP. Penjaganya dipulihkan di
  // sini dengan field pengganti supaya kelalaian yang sama tidak terulang:
  // `cuts` WAJIB tersambung ke exporter/renderer, bukan cuma diminta ke AI.
  {
    field: 'cuts',
    note: 'potongan visual dalam 1 generate call — wajib tersambung ke ZIP, tampilan, & validator, bukan cuma diminta ke AI',
    files: [
      'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
      'src/app/components/admin/viralframe/SceneCards.tsx',
      'src/app/components/admin/viralframe/jsonValidator.ts',
      'functions/api/admin/viralframe/ai-generate.js',
    ],
  },
  {
    field: 'reference_images',
    note: 'daftar foto yang WAJIB dilampirkan user di Google Flow — kalau tidak sampai ke ZIP/tampilan, user tidak tahu file mana yang dilampirkan',
    files: [
      'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
      'functions/api/admin/viralframe/ai-generate.js',
    ],
  },
  {
    field: 'negative_prompt',
    note: 'wajib terlihat/tervalidasi, bukan cuma disuntik server lalu diam-diam diabaikan UI',
    files: [
      'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
      'src/app/components/admin/viralframe/SceneCards.tsx',
    ],
  },
  // 'presentation' & 'gesture' (skema [9] ai-generate.js, audit 2026-08-04):
  // diminta ke AI sebagai "intent akting Part" (presentation) dan "gerak
  // tangan/tubuh karakter saat bicara" (gesture, per-cut) — persis kelas bug
  // `sequences` hilang senyap dari ZIP: field diminta ke AI, divalidasi longgar
  // di jsonValidator.ts, tapi kalau lupa disambungkan ke tampilan (SceneCards.tsx
  // / AdminViralFrameWorkspacePage.tsx) user tidak pernah melihatnya sama sekali
  // walau AI sudah repot-repot menghasilkannya.
  {
    field: 'presentation',
    note: 'intent akting per-Part (kenapa karakter bicara begini) — wajib tersambung ke tampilan Part, bukan cuma diminta ke AI & divalidasi',
    files: [
      'functions/api/admin/viralframe/ai-generate.js',
      'src/app/components/admin/viralframe/jsonValidator.ts',
      'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
    ],
  },
  {
    field: 'gesture',
    note: 'gerak tangan/tubuh per-cut saat bicara ("tangan diam saat bicara adalah penanda AI paling kentara") — wajib tersambung ke tampilan cut, bukan cuma diminta ke AI',
    files: [
      'functions/api/admin/viralframe/ai-generate.js',
      'src/app/components/admin/viralframe/jsonValidator.ts',
      'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
      'src/app/components/admin/viralframe/SceneCards.tsx',
    ],
  },
];

for (const { field, note, files } of SCENE_FIELD_PARITY) {
  for (const file of files) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; } // sudah tertangani Bagian 1 kalau relevan di sana
    if (!new RegExp(`\\b${field}\\b`).test(src)) {
      problems.push(`${file}: field "${field}" tidak disebut sama sekali (${note}) — kalau field ini memang tidak relevan lagi di file ini, hapus dari SCENE_FIELD_PARITY; kalau masih relevan, sambungkan.`);
    }
  }
}

// ─── BAGIAN 3: PARITAS KONTRAK NDJSON frontend ↔ backend ─────────────────────
// LATAR BELAKANG (insiden 2026-08-01, layar putih di /admin/viralframe/<id>):
// refactor Part-as-Generate-Unit mengganti field hasil ai-generate.js dari
// `scenes` menjadi `parts`, tapi frontend masih membaca `generatedResult.scenes`.
// TIDAK ADA gate yang menangkapnya:
//   - typecheck LULUS, karena readNdjsonFinal<T>() adalah CAST tanpa validasi —
//     TypeScript mempercayai bentuk JSON yang tidak pernah diperiksa;
//   - check:bundle & smoke LULUS, karena halamannya tetap 200;
//   - harness offline LULUS, karena ini ketidakcocokan ANTAR DUA FILE.
// Akibatnya: user menekan "Generate", backend sukses, lalu `data.parts` dibaca
// sebagai `data.scenes` → undefined → `undefined.length` saat render → seluruh
// halaman diganti error boundary. Regenerate satu Part juga ikut mati diam-diam.
//
// Cek di bawah bersifat tekstual (bukan parser), tapi cukup: ia memastikan nama
// field yang DIKIRIM backend benar-benar muncul di tipe/pembacaan frontend.
// KALAU MENGGANTI NAMA FIELD DI SALAH SATU SISI, ganti juga di sisi lain — dan
// perbarui entri di sini.
const NDJSON_CONTRACT = [
  {
    backend: 'functions/api/admin/viralframe/ai-generate.js',
    frontend: 'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
    // Nama field di dalam `send({ done:true, data:{ ... } })`.
    fields: ['parts', 'foto_urls', 'karakter', 'metadata'],
    tipeFrontend: 'AIGeneratedResult',
    note: 'hasil AI Generate (Jalur C)',
  },
  {
    backend: 'functions/api/admin/viralframe/suggest-storyboard.js',
    frontend: 'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
    fields: ['parts', 'provider_used', 'used_vision'],
    tipeFrontend: null,
    note: 'AI Rancang Storyboard (sutradara bervisi)',
  },
];

for (const { backend, frontend, fields, tipeFrontend, note } of NDJSON_CONTRACT) {
  let srcB, srcF;
  try { srcB = readFileSync(backend, 'utf8'); } catch { continue; }
  try { srcF = readFileSync(frontend, 'utf8'); } catch { continue; }

  for (const f of fields) {
    // Backend harus benar-benar mengirim field ini.
    if (!new RegExp(`\\b${f}\\s*[,:]`).test(srcB)) {
      problems.push(`${backend}: field kontrak "${f}" (${note}) tidak ditemukan di payload — kalau memang dihapus, perbarui NDJSON_CONTRACT di script ini DAN sisi frontend.`);
    }
    // Frontend harus membacanya dengan nama yang sama.
    if (!new RegExp(`\\b${f}\\b`).test(srcF)) {
      problems.push(`${frontend}: field kontrak "${f}" dari ${backend} (${note}) tidak disebut sama sekali — nama field frontend/backend TIDAK SINKRON. Inilah pola bug layar-putih 2026-08-01.`);
    }
  }

  // Tipe hasil wajib mendeklarasikan field utama (elemen pertama daftar).
  if (tipeFrontend) {
    const m = srcF.match(new RegExp(`interface\\s+${tipeFrontend}\\s*\\{[^}]*\\}`));
    if (!m) {
      problems.push(`${frontend}: interface ${tipeFrontend} tidak ditemukan — tidak bisa memverifikasi kontrak ${note}.`);
    } else if (!new RegExp(`\\b${fields[0]}\\s*:`).test(m[0])) {
      problems.push(`${frontend}: interface ${tipeFrontend} tidak mendeklarasikan "${fields[0]}" padahal ${backend} mengirimnya. readNdjsonFinal<T>() TIDAK memvalidasi bentuk — ketidakcocokan ini akan muncul sebagai layar putih saat runtime, bukan error build.`);
    }
  }
}

// ─── BAGIAN 4: ARKETIPE 2-BAGIAN & CAP PEMOTONGAN ────────────────────────────
// LATAR BELAKANG (insiden 2026-08-02): user memilih arketipe "Vlog Tongsis Mewah"
// tapi adegan agen tidak pernah terlihat seperti vlogger bertongsis. DUA sebab:
//   (a) `cameraGrammar` arketipe hybrid sengaja HANYA berisi beat b-roll, sehingga
//       bagian selfie cuma hidup di prosa `shotGrammarNote` yang global — dan model
//       mengikuti arahan per-Part yang konkret, mengabaikan prosa itu;
//   (b) backend memotong arahan kamera di 400 char, padahal 17 dari 18 kombinasi
//       peran x indeks pada arketipe hybrid menghasilkan 397-499 char. Ekornya —
//       justru FRAMESAFE_SUFFIX "camera stays within the framing of the reference
//       image" — terpotong di tengah kata pada hampir setiap generate.
// Keduanya LOLOS semua gate: typecheck hijau (tidak ada tipe yang salah), bundle
// hijau, smoke hijau. Hanya terlihat kalau memeriksa teks prompt akhir.
//
// Cek di bawah bersifat tekstual. Ia tidak menjalankan compileCameraChoreography,
// tapi memastikan dua invarian yang cukup untuk mencegah kambuhnya insiden itu.
{
  const fileArc = 'src/app/components/admin/viralframe/archetypes.ts';
  const fileGen = 'functions/api/admin/viralframe/ai-generate.js';
  let srcArc, srcGen;
  try { srcArc = readFileSync(fileArc, 'utf8'); } catch { srcArc = null; }
  try { srcGen = readFileSync(fileGen, 'utf8'); } catch { srcGen = null; }

  if (srcArc) {
    // (1) Setiap arketipe ber-allowMultiShotPerScene WAJIB punya leadInCamera.
    //     Tanpa itu, bagian presenter kembali tidak punya arahan kamera konkret.
    const blokArketipe = srcArc.split(/\n  \{\n/).slice(1);
    for (const blok of blokArketipe) {
      const idM = blok.match(/id:\s*'([^']+)'/);
      if (!idM) continue;
      const punyaMulti = /allowMultiShotPerScene:\s*true/.test(blok);
      const punyaLeadIn = /leadInCamera:\s*'/.test(blok);
      if (punyaMulti && !punyaLeadIn) {
        problems.push(`${fileArc}: arketipe "${idM[1]}" punya allowMultiShotPerScene:true tapi TIDAK punya leadInCamera — bagian presenter (BAGIAN 1) akan kehilangan arahan kamera konkret dan model akan mengabaikannya (insiden "tongsis hilang" 2026-08-02).`);
      }
    }
    // (2) Framing selfie WAJIB dirumuskan sebagai POSISI KAMERA, bukan aksi subjek.
    //     Insiden 2026-08-02 (lanjutan): setelah beat selfie berhasil masuk prompt,
    //     hasilnya justru talent MENENTENG perangkat — model menerjemahkan
    //     "holding a camera at arm's length" secara harfiah, dan karena foto
    //     referensi talent memang memegang GoPro+tongsis, muncul DUA alat di dua
    //     tangan. Cek ini menjaga rumusannya tetap "posisi kamera + tangan kosong".
    //
    //     CATATAN: versi pertama cek ini mencari string "selfie-stick" di sekitar
    //     blok arketipe dan HIJAU PALSU — yang cocok ternyata komentar kode, bukan
    //     nilai leadInCamera. Sekarang yang diperiksa NILAI leadInCamera-nya saja.
    const leadIns = [...srcArc.matchAll(/leadInCamera:\s*'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
    for (const li of leadIns) {
      if (/holding (a |the )?(camera|phone|smartphone|gimbal|selfie stick|tripod)/i.test(li)) {
        problems.push(`${fileArc}: leadInCamera memuat frasa "holding a camera/..." — framing selfie WAJIB ditulis sebagai POSISI KAMERA ("camera positioned at arm's length ... selfie perspective"), BUKAN aksi subjek. Frasa itu membuat model merender talent yang menenteng perangkat.`);
      }
    }
    const liSelfie = leadIns.find(l => /selfie perspective/i.test(l));
    if (leadIns.length > 0 && !liSelfie) {
      problems.push(`${fileArc}: tidak ada leadInCamera yang memakai frasa "selfie perspective" — rumusan posisi-kamera inilah pengganti "holding a camera" yang aman.`);
    }
    if (liSelfie && !/hands are empty|hands empty/i.test(liSelfie)) {
      problems.push(`${fileArc}: leadInCamera selfie tidak menegaskan tangan presenter KOSONG — tanpa itu model cenderung menambahkan kamera/tongsis di tangan talent.`);
    }
    // (2b) Vokabuler gerakan kamera tidak boleh mengembalikan frasa alat-di-tangan.
    if (/selfie_hold:\s*'[^']*selfie-stick shot/i.test(srcArc)) {
      problems.push(`${fileArc}: MOVE_PHRASE.selfie_hold kembali memakai "selfie-stick shot" — rumuskan sebagai posisi kamera ("camera held at arm's length ... selfie perspective"), bukan alat yang dipegang subjek.`);
    }
  }

  if (srcGen) {
    // (3) Cap arahan kamera tidak boleh diturunkan lagi ke ukuran yang memotong.
    //     Terpanjang terukur 852 char; apa pun di bawah 900 = pemotongan senyap.
    const capM = srcGen.match(/camera:\s*c\.camera\.slice\(0,\s*(\d+)\)/);
    if (!capM) {
      problems.push(`${fileGen}: tidak menemukan cap camera directive (c.camera.slice) — kalau dipindah, perbarui BAGIAN 4 di script ini.`);
    } else if (Number(capM[1]) < 900) {
      problems.push(`${fileGen}: cap camera directive = ${capM[1]}, terlalu kecil. Koreografi arketipe hybrid terpanjang terukur 852 char; cap di bawah 900 memotong ekor arahan kamera (termasuk instruksi kesetiaan-ke-foto) DI TENGAH KATA tanpa error apa pun.`);
    }
    const noteM = srcGen.match(/body\.archetype_note\.slice\(0,\s*(\d+)\)/);
    if (noteM && Number(noteM[1]) < 2500) {
      problems.push(`${fileGen}: cap archetype_note = ${noteM[1]}. shotGrammarNote terpanjang sudah 1.661 char — cap di bawah 2500 tidak menyisakan ruang aman dan akan memotong arahan arketipe diam-diam.`);
    }
  }
}

// ─── BAGIAN 5: RATCHET ANTI-REGRESI — FRASA DELIVERY YANG DILARANG ───────────
// LATAR BELAKANG (audit 2026-08-04): ai-generate.js dulu menghardcode klausa
// delivery TETAP — "berbicara cepat, artikulasi jelas, tanpa jeda atau gagap" —
// di SETIAP dialog, apa pun durasi Part-nya. Ini kontradiksi langsung dengan
// getLipsync() (viralframe-shared.js): untuk Part 9-12 detik, tabel itu memberi
// pace 'medium' dengan instruksi "Tempo sedang, ada penekanan kata kunci" —
// BUKAN cepat tanpa jeda. Menyuruh AI video audio-native (Veo/Google Flow)
// "bicara cepat tanpa jeda" menghasilkan suara terburu-buru/robotik, dan makin
// parah untuk Part yang lipsync-nya sendiri menuntut jeda wajar antar frasa.
// Perbaikan (Agent 1+2, 2026-08-04): klausa delivery kini DIHITUNG per Part
// lewat buildDeliveryClause()/getLipsync(), bukan string tetap.
//
// BANNED_DELIVERY_PHRASES adalah SUMBER TUNGGAL di viralframe-shared.js — dibaca
// DINAMIS di bawah (regex atas isi file), BUKAN disalin ulang ke sini, supaya
// daftar larangan di script ini tidak pernah drift dari definisi aslinya.
//
// ⚠️ FALSE POSITIVE YANG SUDAH DIPERIKSA: LIPSYNC_ROWS di viralframe-shared.js
// sah memuat frasa "tanpa jeda." untuk baris ultra_fast (klip 2-3 detik) — itu
// DATA tabel lipsync yang genuinely mendeskripsikan klip ultra-pendek, BUKAN
// hardcode delivery. Ini AMAN karena dua alasan sekaligus: (1) viralframe-shared.js
// bukan salah satu dari 3 file yang di-scan loop ini; (2) frasa yang dicari
// persis "tanpa jeda atau gagap" (4 kata), sedangkan data tabel hanya berbunyi
// "tanpa jeda." (2 kata + titik) — tidak pernah cocok sebagai substring persis.
// Loop di bawah HANYA membaca source code 3 file jalur prompt-engine secara
// tekstual; ia tidak mengeksekusi buildDeliveryClause(), jadi teks HASIL RUNTIME
// fungsi itu (yang bisa saja memuat kata "jeda" dari tabel) tidak pernah masuk
// ke pemeriksaan ini sama sekali — yang diperiksa cuma source code statis.
{
  const filesBanned = [
    'src/app/components/admin/viralframe/masterPromptCompiler.ts',
    'functions/api/admin/viralframe/ai-generate.js',
    'functions/api/admin/viralframe/youtube-long.js',
  ];
  let bannedPhrases = null;
  try {
    const sharedSrc = readFileSync('functions/_lib/viralframe-shared.js', 'utf8');
    const m = sharedSrc.match(/export const BANNED_DELIVERY_PHRASES\s*=\s*\[([\s\S]*?)\];/);
    if (m) bannedPhrases = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
  } catch { /* ditangani di bawah lewat bannedPhrases tetap null */ }

  if (!bannedPhrases || bannedPhrases.length === 0) {
    problems.push('functions/_lib/viralframe-shared.js: gagal membaca BANNED_DELIVERY_PHRASES (array kosong/format berubah) — perbarui regex BAGIAN 5 di script ini kalau definisinya dipindah/direformat.');
  } else {
    for (const file of filesBanned) {
      let src;
      try { src = readFileSync(file, 'utf8'); } catch { continue; } // sudah tertangani Bagian 1 kalau relevan
      const lines = src.split('\n');
      for (const phrase of bannedPhrases) {
        for (const l of lines) {
          if (!l.includes(phrase)) continue;
          // Sah dipertahankan: (a) CONTOH NEGATIF eksplisit ("JANGAN ... seperti
          // 'berbicara cepat, tanpa jeda'") yang justru MENGAJARI model untuk TIDAK
          // memakainya — kebalikan dari regresi; (b) komentar kode (baris diawali
          // '//') yang menjelaskan HISTORI bug lama, bukan teks yang dikirim ke AI.
          const trimmed = l.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          if (/JANGAN|✗\s*SALAH|dilarang/i.test(l)) continue;
          problems.push(`${file}: memuat frasa terlarang "${phrase}" (BANNED_DELIVERY_PHRASES, viralframe-shared.js) di luar konteks contoh-negatif/komentar — instruksi "bicara cepat/tanpa jeda" tetap menghasilkan suara robotik DAN bertentangan dengan getLipsync() yang untuk Part panjang justru meminta jeda wajar antar frasa. Pakai buildDeliveryClause()/getLipsync() untuk klausa delivery per Part, jangan hardcode string ini lagi (regresi ke bug audit 2026-08-04). Baris: ${l.trim().slice(0, 160)}`);
        }
      }
    }
  }
}

// ─── BAGIAN 6: GUARD KONTRADIKSI REGISTER (ai-generate.js) ───────────────────
// LATAR BELAKANG (audit 2026-08-04): ai-generate.js dulu punya baris TETAP
// "JIKA bahasa = Indonesia: WAJIB Bahasa Indonesia formal, sopan..." yang SELALU
// dikirim ke model terlepas dari registerInstruction (gaya bahasa pilihan user
// di Step 2 — santai/gaul/jawa/formal). Karena baris itu ditulis BELAKANGAN di
// system prompt (setelah registerLine menyuntik gaya pilihan user), model
// mengikuti instruksi TERAKHIR dan register non-formal yang dipilih user dibuang
// diam-diam. Ini kelas bug "nilai hardcoded membuang pilihan user" yang SUDAH
// 3x terjadi di project ini (lihat CLAUDE.md) — makanya di-ratchet, bukan cuma
// diperbaiki sekali.
//
// Perbaikan Agent 2: baris default (bahasaLine) sekarang di-kondisikan pada
// registerInstruction (ternary) — kalau ADA registerInstruction, baris itu
// EKSPLISIT bilang "JANGAN default ke formal, register pilihan user menang
// mutlak"; kalau TIDAK ADA, baru fallback ke "hangat dan sopan" (bukan "formal"
// lagi apa pun keadaannya).
//
// Guard di bawah TIDAK melarang kata "formal" sama sekali — itu justru dipakai
// sah di teks CONTOH few-shot ("✓ CONTOH register formal: ...") dan di deskripsi
// fallback penampilan/pakaian karakter ("professional ..., formal attire" /
// "pakaian formal gelap", tidak ada hubungannya dengan register BAHASA). Guard
// ini hanya menyalakan alarm untuk baris yang menyebut "formal" TANPA merujuk
// registerInstruction ATAU frasa "JANGAN default" — pola paling mungkin dipakai
// kalau hardcode lama itu kembali ditulis ulang.
{
  const file = 'functions/api/admin/viralframe/ai-generate.js';
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { src = null; }
  if (src) {
    const barisFormal = src.split('\n')
      .filter(l => /formal/i.test(l))
      // Komentar kode (baris diawali '//' atau '*') — menjelaskan HISTORI bug lama
      // ke pembaca manusia, bukan teks yang benar-benar dikirim ke AI sebagai
      // instruksi. Tanpa pengecualian ini, komentar yang mendokumentasikan bug
      // "dulu SELALU memaksa formal" akan salah dikira REGRESI dari bug itu sendiri.
      .filter(l => !/^\s*(\/\/|\*)/.test(l))
      // Contoh few-shot sah — bukan instruksi yang dikirim sebagai perintah tetap.
      .filter(l => !/CONTOH/i.test(l))
      // Deskripsi penampilan/pakaian karakter — soal wardrobe, bukan register bahasa.
      .filter(l => !/(attire|pakaian|penampilan|ciri_fisik)/i.test(l));

    if (barisFormal.length === 0) {
      problems.push(`${file}: tidak ada satu pun baris menyebut "formal" terkait register bahasa — kalau bahasaLine/registerLine sudah dihapus/di-refactor total, VERIFIKASI MANUAL bahwa kontradiksi register (audit 2026-08-04) tidak diam-diam kembali dalam bentuk lain, lalu perbarui/nonaktifkan BAGIAN 6 di script ini secara sadar.`);
    }
    for (const l of barisFormal) {
      const terjaga = /registerInstruction/.test(l) || /JANGAN default/i.test(l);
      if (!terjaga) {
        problems.push(`${file}: baris menyebut "formal" tanpa merujuk registerInstruction atau frasa "JANGAN default" — kemungkinan REGRESI kontradiksi register (audit 2026-08-04): baris ini akan memaksa "formal" walau user memilih register santai/gaul/jawa. Baris: ${l.trim().slice(0, 160)}`);
      }
    }
  }
}

console.log('Penjaga kelengkapan Prompt Rulebook & field Scene ViralFrame');
console.log('='.repeat(60));

if (problems.length > 0) {
  console.error(`\nGAGAL — ${problems.length} masalah:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nRujukan: functions/_lib/viralframe-shared.js (komentar header).');
  process.exit(1);
}

console.log('\nLULUS — semua jalur prompt-engine mengimpor kosakata/aturan wajib.');
