#!/usr/bin/env node
/**
 * Penjaga anggaran bundle Worker — mencegah terulangnya Error 1102.
 *
 * LATAR BELAKANG INSIDEN (2026-07-25)
 * Produksi mati total: SEMUA route (halaman SSR, /api/*, /sitemap.xml) membalas 503
 * "Worker exceeded resource limits". Log invocation NOL → gagal saat STARTUP Worker,
 * sebelum kode apa pun jalan. Gejalanya BERKEDIP (URL sama kadang 200 kadang 503),
 * ciri khas kegagalan cold-start. Ukuran bundle: baik 5,50 MB, rusak 5,51 MB —
 * selisih ~10 KB sudah cukup menjatuhkan produksi.
 *
 * YANG SEBENARNYA PENUH: bukan ruang, tapi ANGGARAN CPU SAAT STARTUP.
 * Bukti: gzip bundle hanya ~1,12 MB, jauh di bawah batas ukuran skrip Cloudflare
 * (10 MB). Yang mahal adalah mengevaluasi badan modul saat isolate lahir.
 *
 * KENAPA IMPORT DINAMIS MENOLONG (terverifikasi di bundle nyata):
 * wrangler mengeluarkan satu index.js dan meng-INLINE import dinamis, tapi
 * membungkusnya dalam initialiser malas `__esm(...)` + `init_*()`. Bundle ini sudah
 * berisi 616 wrapper semacam itu. Jadi mengubah import statis → dinamis nyaris tidak
 * mengurangi byte, tetapi MEMINDAHKAN badan modul keluar dari evaluasi startup —
 * dan itulah yang ditagih.
 *
 * KARENA ITU ASERSI A ADALAH YANG PALING TAJAM. Byte hanyalah proksi kasar;
 * daftar import top-level SSR adalah pengukuran langsung atas permukaan eager.
 *
 * FILOSOFI ANGGARAN — PENTING
 * Karena baik=5,50 MB dan rusak=5,51 MB, anggaran yang dipatok di angka hari ini
 * BUKAN margin aman — itu alarm tepi jurang. Tugasnya sekarang hanya "jangan tumbuh".
 * Angka ini WAJIB diturunkan (ratchet) setiap kali sebuah tahap berhasil memangkas
 * permukaan eager. Baru setelah itu ia mewakili headroom sungguhan.
 *
 * Pemakaian: node scripts/check-bundle-budget.mjs   (jalankan SETELAH `npm run build`)
 */

import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// ANGGARAN — turunkan setiap kali sebuah tahap memangkas permukaan eager.
//
// 2026-07-25  baseline pasca-insiden (Tahap 0):
//             SSR main chunk 1.205.877 B · Functions index.js 5.769.307 B (gzip 1.171.268 B)
//             Nilai di bawah = baseline + margin kecil. Ini "jangan tumbuh", bukan headroom.
// ─────────────────────────────────────────────────────────────────────────────
const BUDGET_SSR_MAIN_CHUNK = 1_270_000;  // baseline +5%
const BUDGET_FUNCTIONS_RAW  = 5_900_000;  // baseline +2,3%
const BUDGET_FUNCTIONS_GZIP = 8_000_000;  // jauh di bawah batas 10 MB; alarm jaring pengaman saja

/**
 * Paket yang BOLEH dievaluasi eager di entry SSR.
 *
 * Menambah nama ke daftar ini berarti menyetujui paket tersebut dievaluasi saat
 * setiap isolate Worker lahir. JANGAN tambahkan hanya supaya CI hijau — perbaiki
 * import-nya jadi dinamis (lihat src/app/lib/clientOnly.tsx).
 *
 * 2026-07-25: recharts/papaparse/react-grid-layout masih di sini HANYA karena
 * warisan; ketiganya dijadwalkan keluar di Tahap 3 dan harus dihapus dari daftar
 * ini begitu itu selesai.
 */
const SSR_IMPORT_ALLOWLIST = new Set([
  'react/jsx-runtime',
  'react-dom/server',
  'react-router',
  'react',
  'react-dom',
  'lucide-react',
  'clsx',
  'tailwind-merge',
  'embla-carousel-react',   // publik (HomePage, PropertyDetailPage) — sah
  'recharts',               // TODO Tahap 3: keluarkan (AdminOverviewPage)
  'papaparse',              // TODO Tahap 3: keluarkan (CsvImportModal)
  'react-grid-layout',      // TODO Tahap 3: keluarkan (AdminSettingsPage)
]);

const SSR_INDEX = 'dist/server/index.js';
const SSR_ASSETS = 'dist/server/assets';
const FN_OUTDIR = '.bundle-check';

const problems = [];
const notes = [];

function fmt(n) {
  return `${n.toLocaleString('en-US')} B (${(n / 1048576).toFixed(2)} MB)`;
}

function pct(actual, budget) {
  return `${((actual / budget) * 100).toFixed(1)}% dari anggaran`;
}

// ── Asersi A — allowlist import top-level SSR ────────────────────────────────
function assertSsrImports() {
  if (!existsSync(SSR_INDEX)) {
    problems.push(`${SSR_INDEX} tidak ada — jalankan \`npm run build\` dulu.`);
    return;
  }
  const src = readFileSync(SSR_INDEX, 'utf8');
  const found = [...src.matchAll(/^import\s+"([^"]+)";/gm)].map(m => m[1]);

  const unexpected = found.filter(p => !SSR_IMPORT_ALLOWLIST.has(p));
  const gone = [...SSR_IMPORT_ALLOWLIST].filter(p => !found.includes(p));

  console.log(`\n[A] Import top-level SSR — ${found.length} paket dievaluasi eager`);
  for (const p of found) console.log(`      ${unexpected.includes(p) ? '✗' : '·'} ${p}`);

  if (unexpected.length > 0) {
    problems.push(
      `Paket BARU dievaluasi eager di entry SSR: ${unexpected.join(', ')}\n` +
      `      Ini persis kelas kegagalan yang menjatuhkan produksi pada 2026-07-25.\n` +
      `      Perbaiki dengan membuat import-nya dinamis — bungkus komponennya lewat\n` +
      `      src/app/lib/clientOnly.tsx, atau pindahkan \`await import()\` ke dalam handler.\n` +
      `      JANGAN sekadar menambahkannya ke SSR_IMPORT_ALLOWLIST agar CI hijau.`
    );
  }
  // Paket yang hilang dari allowlist = kemajuan; ingatkan agar allowlist di-ratchet.
  if (gone.length > 0) {
    notes.push(`Sudah TIDAK eager lagi: ${gone.join(', ')} — hapus dari SSR_IMPORT_ALLOWLIST (ratchet).`);
  }
}

// ── Asersi B — byte chunk SSR utama ──────────────────────────────────────────
function assertSsrChunk() {
  if (!existsSync(SSR_ASSETS)) {
    problems.push(`${SSR_ASSETS} tidak ada — jalankan \`npm run build\` dulu.`);
    return;
  }
  const files = readdirSync(SSR_ASSETS)
    .filter(f => f.endsWith('.js'))
    .map(f => ({ f, size: statSync(join(SSR_ASSETS, f)).size }))
    .sort((a, b) => b.size - a.size);

  if (files.length === 0) { problems.push('Tidak ada chunk .js di dist/server/assets.'); return; }

  const main = files[0];
  console.log(`\n[B] Chunk SSR utama — ${main.f}`);
  console.log(`      ${fmt(main.size)}  ·  ${pct(main.size, BUDGET_SSR_MAIN_CHUNK)}`);
  console.log(`      chunk malas (tidak dievaluasi saat startup): ${files.length - 1}`);
  for (const x of files.slice(1)) console.log(`        · ${x.f} — ${x.size.toLocaleString('en-US')} B`);

  if (main.size > BUDGET_SSR_MAIN_CHUNK) {
    problems.push(
      `Chunk SSR utama ${fmt(main.size)} melampaui anggaran ${fmt(BUDGET_SSR_MAIN_CHUNK)}.`
    );
  }
}

// ── Asersi C & D — bundle Functions (mentah + gzip) ──────────────────────────
function assertFunctionsBundle() {
  try {
    rmSync(FN_OUTDIR, { recursive: true, force: true });
    // npx.cmd di Windows — hindari shell:true (argumen tidak ter-escape).
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    execFileSync(npx, ['wrangler', 'pages', 'functions', 'build', `--outdir=${FN_OUTDIR}`], {
      stdio: 'pipe',
    });
  } catch (err) {
    // Bila wrangler butuh kredensial di CI, jangan gagalkan build — laporkan saja.
    // Asersi A dan B sudah menangkap kelas kegagalan utama tanpa wrangler.
    notes.push(
      `Asersi C/D DILEWATI — \`wrangler pages functions build\` gagal di lingkungan ini ` +
      `(${String(err.message).split('\n')[0].slice(0, 120)}). ` +
      `Jalankan pemeriksaan ini secara lokal sebelum deploy.`
    );
    return;
  }

  const p = join(FN_OUTDIR, 'index.js');
  if (!existsSync(p)) { notes.push('Asersi C/D dilewati — index.js tidak dihasilkan.'); return; }

  const buf = readFileSync(p);
  const gz = gzipSync(buf).length;
  const lazy = (buf.toString('utf8').match(/__esm\(/g) ?? []).length;

  console.log(`\n[C] Bundle Functions (mentah) — ${fmt(buf.length)}  ·  ${pct(buf.length, BUDGET_FUNCTIONS_RAW)}`);
  console.log(`[D] Bundle Functions (gzip)   — ${fmt(gz)}  ·  ${pct(gz, BUDGET_FUNCTIONS_GZIP)}`);
  console.log(`      wrapper malas __esm( : ${lazy}  ← makin banyak makin sedikit yang dievaluasi saat startup`);

  if (buf.length > BUDGET_FUNCTIONS_RAW) {
    problems.push(`Bundle Functions ${fmt(buf.length)} melampaui anggaran ${fmt(BUDGET_FUNCTIONS_RAW)}.`);
  }
  if (gz > BUDGET_FUNCTIONS_GZIP) {
    problems.push(`Bundle Functions gzip ${fmt(gz)} melampaui anggaran ${fmt(BUDGET_FUNCTIONS_GZIP)}.`);
  }

  rmSync(FN_OUTDIR, { recursive: true, force: true });
}

// ── Jalankan ────────────────────────────────────────────────────────────────
console.log('Penjaga anggaran bundle Worker — batas STARTUP Cloudflare (Error 1102)');
console.log('='.repeat(74));

assertSsrImports();
assertSsrChunk();
assertFunctionsBundle();

console.log(`\n${'='.repeat(74)}`);

for (const n of notes) console.log(`CATATAN: ${n}`);

if (problems.length > 0) {
  console.error(`\nGAGAL — ${problems.length} masalah:\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  console.error('Rujukan: CLAUDE.md → "Batas startup Worker Cloudflare (Error 1102)".');
  process.exit(1);
}

console.log('\nLULUS — permukaan evaluasi eager masih dalam anggaran.');
