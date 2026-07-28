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
  {
    field: 'sequences',
    note: 'beat bertimecode Fase 6 — wajib tersambung ke ZIP & tampilan, bukan cuma diminta ke AI',
    files: [
      'src/app/components/admin/AdminViralFrameWorkspacePage.tsx',
      'src/app/components/admin/viralframe/SceneCards.tsx',
      'src/app/components/admin/viralframe/jsonValidator.ts',
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

console.log('Penjaga kelengkapan Prompt Rulebook & field Scene ViralFrame');
console.log('='.repeat(60));

if (problems.length > 0) {
  console.error(`\nGAGAL — ${problems.length} masalah:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nRujukan: functions/_lib/viralframe-shared.js (komentar header).');
  process.exit(1);
}

console.log('\nLULUS — semua jalur prompt-engine mengimpor kosakata/aturan wajib.');
