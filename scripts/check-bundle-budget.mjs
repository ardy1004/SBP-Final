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
 * APA YANG SEBENARNYA DIEVALUASI SAAT STARTUP — DIUKUR, BUKAN DIDUGA
 * wrangler mengeluarkan satu index.js dan meng-INLINE import dinamis, membungkusnya
 * dalam initialiser malas `__esm(...)` + `init_*()` (bundle ini punya 616 wrapper).
 * Dengan menghitung kedalaman kurawal tiap rantai `init_*()`, hanya SATU rantai yang
 * berada di scope modul (kedalaman 0) = benar-benar dievaluasi saat startup.
 * Isinya per 2026-07-25: tabel route Functions + ~99 modul ikon lucide-react,
 * lalu berlanjut ke paket-paket yang diimpor statis oleh entry SSR (embla, dll).
 *
 * KONSEKUENSI YANG PENTING DAN BERLAWANAN DENGAN DUGAAN AWAL:
 *   - `_lib/pdf.js` (pdf-lib) TIDAK ada di rantai eager meski diimpor statis oleh
 *     functions/api/sign/[token].js. Handler Pages Functions sudah malas dengan
 *     sendirinya. Mengubahnya jadi `await import()` TIDAK mengubah apa pun — sudah
 *     dicoba dan diukur: rantai eager tetap identik. Jangan ulangi percobaan itu.
 *   - Yang benar-benar menentukan adalah DAFTAR IMPORT TOP-LEVEL `dist/server/index.js`,
 *     karena entry SSR diimpor statis oleh functions/[[catchall]].js.
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
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// ANGGARAN — turunkan setiap kali sebuah tahap memangkas permukaan eager.
//
// 2026-07-25  baseline pasca-insiden (Tahap 0):
//             SSR main chunk 1.205.877 B · Functions index.js 5.769.307 B (gzip 1.171.268 B)
//             Nilai saat itu = baseline + margin kecil. "Jangan tumbuh", bukan headroom.
//
// 2026-07-25  RATCHET setelah Tahap 4 (seluruh 17 route admin jadi client-only):
//             SSR main chunk 503.003 B  (-702.874 B, -58%)  <- inilah yang dievaluasi startup
//             Functions index.js 5.709.994 B (-59.313 B)
//             Import top-level SSR 12 -> 8 paket.
//             Catatan: byte Functions turun sedikit saja karena kode admin tetap
//             ADA di bundle, hanya pindah ke chunk malas. Yang penting bukan byte
//             total melainkan porsi yang dievaluasi saat isolate lahir.
//
// 2026-07-29  NAIKKAN setelah endpoint baru `viralframe/transcribe.js` (proxy
//             Groq Whisper untuk fitur Auto Caption): Functions mentah 5.861.345 B
//             (+11.345 B dari batas lama). Endpoint ini adalah Pages Function route
//             handler — TERBUKTI lazy dengan sendirinya (lihat catatan `_lib/pdf.js`
//             di atas), dan Asersi A (import top-level SSR, penyebab ASLI insiden
//             1102) TETAP 8 paket, TIDAK berubah — dicek manual sebelum menaikkan
//             angka ini. Gzip juga masih jauh di bawah anggaran (15,1%), jauh di
//             bawah batas skrip Cloudflare sungguhan (10 MB). Byte mentah cuma
//             proksi kasar (lihat catatan di atas) — menaikkannya di sini sah
//             karena metrik yang benar-benar berbahaya tidak bergerak.
// ─────────────────────────────────────────────────────────────────────────────
const BUDGET_SSR_MAIN_CHUNK = 560_000;    // 503.003 +11% — headroom nyata, bukan tepi jurang
// Naik 6.050.000 → 6.150.000 pada 2026-08-12, disetujui user. Sebabnya perbaikan
// Titip Jual (autosave draft, endpoint prospek, telemetri 403/422, status
// Turnstile) — sebagian besar pertumbuhannya justru dari TitipJualPage.tsx yang
// ikut ter-bundle ke Functions lewat SSR, bukan dari kode backend baru.
// Metrik yang benar-benar berbahaya tidak bergerak: gzip 1,20 MB = 12% dari
// batas skrip Cloudflare yang sesungguhnya (10 MB).
// Naik 6.150.000 → 6.200.000 pada 2026-09-02, disetujui user. Pemicunya: CAPI
// Titip Jual (CompleteRegistration) menyisakan hanya 839 B, sementara perbaikan
// berikutnya — mencatat kegagalan CAPI ke error_logs — justru menutup titik buta
// yang KELASNYA sudah pernah memakan korban (Instagram gagal 14/14 berhari-hari
// tanpa ketahuan karena scheduler tidak memakai logServerError).
//
// Kenapa aman menaikkannya, bukan sekadar "menyerah pada ratchet":
//  · Yang dijaga angka MENTAH ini sebenarnya CPU startup, bukan ruang. Sejak
//    akun di Workers Paid (2026-08-01) batas CPU naik 10 ms → 30 detik, jadi
//    kekhawatiran aslinya jauh berkurang.
//  · Batas platform yang SESUNGGUHNYA diukur pada ukuran ter-gzip: 1,29 MB dari
//    10 MB = 13%. Masih sangat lapang.
//  · Penjaga yang benar-benar mengukur permukaan eager (Assertion A) TIDAK
//    disentuh dan tetap 8 paket. Itulah yang menjaga startup, bukan angka ini.
// Ratchet tetap berlaku untuk pertumbuhan berikutnya: pangkas dulu, menaikkan
// angka ini tetap keputusan user.
const BUDGET_FUNCTIONS_RAW  = 6_200_000;  // 6.149.161 (2026-09-02) + ruang ~51 KB
const BUDGET_FUNCTIONS_GZIP = 8_000_000;  // jauh di bawah batas 10 MB; alarm jaring pengaman saja

/**
 * Paket yang BOLEH dievaluasi eager di entry SSR.
 *
 * Menambah nama ke daftar ini berarti menyetujui paket tersebut dievaluasi saat
 * setiap isolate Worker lahir. JANGAN tambahkan hanya supaya CI hijau — perbaiki
 * import-nya jadi dinamis (lihat src/app/lib/clientOnly.tsx).
 *
 * 2026-07-25 pasca-Tahap 4: recharts, papaparse, react-grid-layout, dan react-dom
 * SUDAH keluar dari jalur eager karena seluruh route admin kini client-only.
 * Jangan pernah menambahkannya kembali ke daftar ini.
 */
const SSR_IMPORT_ALLOWLIST = new Set([
  'react/jsx-runtime',
  'react-dom/server',
  'react-router',
  'react',
  'lucide-react',
  'clsx',
  'tailwind-merge',
  'embla-carousel-react',   // publik (HomePage, PropertyDetailPage) — sah
]);

const SSR_INDEX = 'dist/server/index.js';
const SSR_ASSETS = 'dist/server/assets';
const FN_OUTDIR = '.bundle-check';

const CLIENT_ASSETS = 'dist/client/assets';
// Lantai ukuran CSS utama. Baseline sehat 2026-07-27 = 128.158 B; ambang ini
// sengaja jauh di bawahnya supaya tidak rewel saat CSS menyusut wajar, tapi
// tetap menangkap keruntuhan besar seperti 128 KB → 13 KB.
const CSS_MIN_BYTES = 80_000;
// Utility yang MUSTAHIL tidak ada di situs ini. Ukuran saja bisa menipu — Tailwind
// bisa menghasilkan belasan KB variabel tema tanpa satu pun kelas utility.
const CSS_PENANDA = ['.flex', '.grid', '.rounded'];

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
/**
 * Penjaga CSS — memastikan Tailwind benar-benar menemukan sumbernya.
 *
 * KENAPA ADA. Pada 2026-07-27 pola brace tak berpasangan (`*{`, `*}`) di .gitignore
 * membuat pemindai @source Tailwind v4 tidak menemukan satu pun kelas. CSS produksi
 * runtuh dari 128.021 B → 13.018 B dan situs tampil TANPA GAYA — sementara
 * `npm run build` exit 0, `check:bundle` LULUS, dan `smoke` 0/320 gagal. Tidak satu
 * pun gate melihat CSS: build hanya melihat exit code, penjaga ini dulu hanya
 * mengukur JS, dan smoke hanya melihat status HTTP.
 *
 * Dua pemeriksaan, karena masing-masing bisa ditipu sendirian:
 *   - ukuran di bawah lantai  → sumber tidak terpindai
 *   - tanpa utility inti      → terpindai tapi hasilnya bukan CSS yang dipakai situs
 */
function assertCssTerbangun() {
  if (!existsSync(CLIENT_ASSETS)) {
    problems.push(`Direktori ${CLIENT_ASSETS} tidak ada — jalankan \`npm run build\` lebih dulu.`);
    return;
  }
  const kandidat = readdirSync(CLIENT_ASSETS).filter(f => /^root-.*\.css$/.test(f));
  if (kandidat.length === 0) {
    problems.push(`Tidak ada ${CLIENT_ASSETS}/root-*.css — CSS utama tidak dihasilkan sama sekali.`);
    return;
  }

  for (const nama of kandidat) {
    const jalur = join(CLIENT_ASSETS, nama);
    const ukuran = statSync(jalur).size;
    const isi = readFileSync(jalur, 'utf8');
    const hilang = CSS_PENANDA.filter(k => !isi.includes(k));

    console.log(`\nCSS utama  : ${nama} — ${ukuran.toLocaleString('en-US')} B (lantai ${CSS_MIN_BYTES.toLocaleString('en-US')} B)`);

    if (ukuran < CSS_MIN_BYTES) {
      problems.push(
        `${nama} hanya ${ukuran.toLocaleString('en-US')} B, di bawah lantai ${CSS_MIN_BYTES.toLocaleString('en-US')} B. ` +
        'Tailwind kemungkinan besar tidak menemukan sumbernya — periksa .gitignore ' +
        '(pola brace seperti `*{` merusak pemindai @source) dan @source di src/styles/tailwind.css.'
      );
    }
    if (hilang.length > 0) {
      problems.push(
        `${nama} tidak memuat utility inti: ${hilang.join(', ')}. ` +
        'CSS terbangun tapi tanpa kelas yang dipakai situs — situs akan tampil tanpa gaya.'
      );
    }
  }
}

function assertFunctionsBundle() {
  try {
    rmSync(FN_OUTDIR, { recursive: true, force: true });
    // execSync (perintah satu string) — execFileSync tidak bisa menjalankan npx.cmd
    // di Windows tanpa shell (EINVAL). Tidak ada input dari luar di sini, jadi
    // string tetap sepenuhnya literal.
    execSync(`npx wrangler pages functions build --outdir=${FN_OUTDIR}`, { stdio: 'pipe' });
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
assertCssTerbangun();
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
