#!/usr/bin/env node
/**
 * Penjaga kelengkapan "Prompt Rulebook" ViralFrame — mencegah drift terulang.
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

console.log('Penjaga kelengkapan Prompt Rulebook ViralFrame');
console.log('='.repeat(60));

if (problems.length > 0) {
  console.error(`\nGAGAL — ${problems.length} masalah:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nRujukan: functions/_lib/viralframe-shared.js (komentar header).');
  process.exit(1);
}

console.log('\nLULUS — semua jalur prompt-engine mengimpor kosakata/aturan wajib.');
