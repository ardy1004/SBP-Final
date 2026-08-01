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
  ],
  'functions/api/admin/viralframe/ai-generate.js': [
    'REALISM_QUALITY_CUES', 'REALISM_BANNED_QUALITY_PHRASES', 'NEGATIVE_PROMPT_VIDEO', 'RULEBOOK_VERSION',
  ],
  'functions/api/admin/viralframe/youtube-long.js': [
    'REALISM_QUALITY_CUES', 'REALISM_BANNED_QUALITY_PHRASES', 'NEGATIVE_PROMPT_VIDEO', 'RULEBOOK_VERSION',
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
    // (2) Arketipe selfie WAJIB menyebut frasa yang benar-benar mengikat model.
    if (/id:\s*'selfie_luxury_hybrid'/.test(srcArc)) {
      const blok = srcArc.slice(srcArc.indexOf("id: 'selfie_luxury_hybrid'"), srcArc.indexOf("id: 'selfie_luxury_hybrid'") + 3000);
      if (!/selfie-stick/i.test(blok)) {
        problems.push(`${fileArc}: selfie_luxury_hybrid tidak menyebut "selfie-stick" di leadInCamera — inilah frasa konkret yang membuat model merender gaya vlogger bertongsis.`);
      }
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

console.log('Penjaga kelengkapan Prompt Rulebook & field Scene ViralFrame');
console.log('='.repeat(60));

if (problems.length > 0) {
  console.error(`\nGAGAL — ${problems.length} masalah:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nRujukan: functions/_lib/viralframe-shared.js (komentar header).');
  process.exit(1);
}

console.log('\nLULUS — semua jalur prompt-engine mengimpor kosakata/aturan wajib.');
