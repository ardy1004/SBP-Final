#!/usr/bin/env node
/**
 * Penjaga: halaman publik tidak boleh gagal hydration.
 *
 * LATAR BELAKANG (2026-08-30). Halaman publik melempar React #418 enam sampai
 * delapan kali lalu #423 — React membuang seluruh HTML hasil SSR dan merender
 * ulang di klien, pada SETIAP kunjungan, selama 13 hari.
 *
 * Yang bikin lolos begitu lama: TIDAK SATU PUN gate yang ada bisa melihatnya.
 * typecheck hijau (tipe benar), check:bundle hijau (ukuran wajar), smoke 0/320
 * hijau — karena smoke cuma memeriksa status HTTP, dan halaman yang hydration-nya
 * runtuh tetap membalas 200 dengan HTML lengkap. Rusaknya hanya terlihat di
 * console browser. Script ini menutup celah itu.
 *
 * PENYEBAB YANG DULU: snippet resmi Meta Pixel menyisipkan <script src=fbevents.js>
 * TEPAT SEBELUM script pertama di dokumen, saat parsing, sebelum React hydrate.
 * Di halaman ber-JSON-LD script pertama adalah <script type="application/ld+json">
 * milik <Meta /> React Router, sehingga React menemukan node bertipe null di
 * posisi yang ia harapkan "application/ld+json". Lihat komentar di
 * src/app/root.tsx (pixelScript).
 *
 * KENAPA HALAMAN KONTROL PENTING: dua halaman TANPA JSON-LD ikut diuji dan wajib
 * bersih. Kalau suatu saat SEMUA halaman merah, kemungkinan besar yang rusak
 * adalah script ini atau jaringan — bukan aplikasinya.
 *
 * ⚠️ KENAPA ADA ASERSI POSITIF (2026-08-30): versi pertama penjaga ini hanya
 * menghitung error, jadi ia LULUS pada halaman yang tidak hydrate SAMA SEKALI —
 * dibuktikan dengan memblokir bundel aplikasi: nol error, verdik "LULUS", React
 * tidak pernah jalan. Itu justru kegagalan yang paling mungkin terjadi di sini,
 * karena CLAUDE.md sendiri mencatat hash manifest server/klien bisa tidak
 * sinkron kalau build tidak bersih. "Tidak ada error" BUKAN bukti sehat; yang
 * jadi bukti adalah React benar-benar memasang fiber-nya ke DOM.
 *
 * Pemakaian:  node scripts/check-hydration.mjs [baseUrl]
 *             default https://salambumi.xyz — bisa diarahkan ke preview.
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = (process.argv[2] || 'https://salambumi.xyz').replace(/\/+$/, '');

// Playwright dipasang global di mesin ini (pola sama dengan take-screenshots.mjs).
let chromium;
try {
  ({ chromium } = require('C:/Users/PC/AppData/Roaming/npm/node_modules/playwright'));
} catch {
  try { ({ chromium } = require('playwright')); } catch {
    console.error('GAGAL — Playwright tidak ditemukan. Pasang dengan: npm i -g playwright');
    process.exit(1);
  }
}

// Slug diambil dari D1, JANGAN di-hardcode: properti/artikel bisa terhapus dan
// penjaga jadi merah karena 404, bukan karena hydration. (Pelajaran dari
// scripts/*.mjs lain yang path-nya hardcoded ke satu mesin.)
function d1(sql) {
  const out = execFileSync(
    process.execPath,
    [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'sbp-db', '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const m = out.match(/\[\s*\{\s*"results"/);
  return m ? JSON.parse(out.slice(m.index))[0].results : [];
}

let detailPath = null;
let blogPath = null;
try {
  const [p] = d1("SELECT jenis_properti j, tujuan t, provinsi pr, kabupaten kb, kecamatan kc, slug s FROM properties WHERE status_publish='published' AND slug IS NOT NULL LIMIT 1");
  if (p) {
    const seg = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, '-');
    detailPath = `/${seg(p.t)}/${seg(p.j)}/${seg(p.pr)}/${seg(p.kb)}/${seg(p.kc)}/${p.s}`;
  }
  const [b] = d1("SELECT slug s FROM blog_posts WHERE status='published' AND slug IS NOT NULL LIMIT 1");
  if (b) blogPath = `/blog/${b.s}`;
} catch (err) {
  console.error(`Peringatan: gagal membaca slug dari D1 (${err.message.slice(0, 80)}) — halaman detail dilewati.`);
}

// harusBersih=true untuk SEMUA; dua terakhir adalah KONTROL (dulu memang bersih
// walaupun bug-nya aktif, jadi berguna membedakan "aplikasi rusak" dari
// "pengukurannya rusak").
const HALAMAN = [
  { path: '/', label: 'beranda' },
  { path: '/properties', label: 'listing' },
  { path: '/faq', label: 'FAQ' },
  ...(detailPath ? [{ path: detailPath, label: 'detail properti' }] : []),
  ...(blogPath ? [{ path: blogPath, label: 'detail blog' }] : []),
  { path: '/about', label: 'about (kontrol)', kontrol: true },
  { path: '/titip-jual', label: 'titip-jual (kontrol)', kontrol: true },
];

const RE_HYDRATION = /invariant=41[89]|invariant=42[0-9]|Hydration failed|did not match/i;

console.log('Penjaga hydration halaman publik');
console.log('='.repeat(58));
console.log(`Target: ${BASE}\n`);

const browser = await chromium.launch({ headless: true });
const gagal = [];

for (const h of HALAMAN) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => { if (RE_HYDRATION.test(String(e.message))) errs.push(String(e.message)); });
  page.on('console', (m) => { if (m.type() === 'error' && RE_HYDRATION.test(m.text())) errs.push(m.text()); });

  // ⚠️ WAJIB membuang cache. Halaman publik di-cache edge 300 detik
  // (functions/_lib/edgeCache.js), jadi tepat setelah deploy penjaga ini akan
  // menguji HTML LAMA dan melaporkan hijau/merah yang salah — persis yang
  // terjadi saat penjaga ini pertama dipakai: /faq tampak "lulus" padahal yang
  // tersaji cuma salinan cache dari sebelum pixel dipasang. Param acak tidak
  // dibuang dari kunci cache (yang dibuang hanya utm_*/fbclid/dsb), jadi ini
  // selalu memaksa render segar.
  const sep = h.path.includes('?') ? '&' : '?';
  const url = `${BASE}${h.path}${sep}_hydcheck=${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = res?.status() ?? 0;
    // 4,5 detik, bukan 3: pemuat gtag/GTM tertunda menyisipkan <script> pada
    // detik ke-4 (deferredLoaderScript di src/app/root.tsx). Menunggu 3 detik
    // membuat jalur penyisipan itu berada DI LUAR jendela pengamatan penjaga —
    // padahal penyisipan node persis itulah yang dulu merusak hydration.
    await page.waitForTimeout(4500);
  } catch (err) {
    gagal.push(`${h.path}: tidak bisa dibuka — ${err.message.slice(0, 90)}`);
    await ctx.close();
    continue;
  }

  // Bukti POSITIF: React memasang properti fiber (__reactFiber$… /
  // __reactProps$…) pada node yang ia kelola. Ada = hydrateRoot benar-benar
  // berjalan. Tidak ada = halaman cuma HTML statis, dan nol error di atas tidak
  // berarti apa-apa. Lihat catatan di kepala file.
  let hydrated = false;
  try {
    hydrated = await page.evaluate(() => {
      const kandidat = [document.documentElement, document.body, ...document.body.children];
      return kandidat.some(el => el && Object.keys(el).some(k => k.startsWith('__react')));
    });
  } catch { /* evaluate gagal -> biarkan false, dilaporkan sebagai tidak hydrate */ }

  const ok = errs.length === 0 && status === 200 && hydrated;
  console.log(
    `  ${ok ? '✓' : '✗'} ${String(h.label).padEnd(22)} HTTP ${status}  ` +
    `hydrate: ${hydrated ? 'ya ' : 'TIDAK'}  error hydration: ${errs.length}`,
  );
  if (status !== 200) gagal.push(`${h.path}: HTTP ${status} (bukan 200)`);
  else if (!hydrated) {
    gagal.push(
      `${h.path}: React TIDAK PERNAH hydrate (nol error di sini bukan kabar baik) — ` +
      `curigai bundel klien gagal dimuat atau hash manifest server/klien tidak sinkron; ` +
      `clean build wajib: Remove-Item -Recurse -Force dist, .react-router && npm run build`,
    );
  } else if (errs.length > 0) {
    gagal.push(`${h.path}: ${errs.length} error hydration${h.kontrol ? ' — ini halaman KONTROL, curigai script penjaga/jaringan lebih dulu' : ''}`);
  }
  await ctx.close();
}

await browser.close();

if (gagal.length > 0) {
  console.error(`\nGAGAL — ${gagal.length} halaman bermasalah:\n`);
  for (const g of gagal) console.error(`  ✗ ${g}`);
  console.error('\nHydration gagal = React membuang HTML server dan merender ulang seluruh halaman.');
  console.error('Cara mencari sebabnya: jalankan `npm run dev`, buka halaman itu, baca pesan React');
  console.error('mode DEV di console — ia menyebut elemen persisnya (produksi hanya memberi nomor).');
  console.error('Rujukan: komentar pixelScript di src/app/root.tsx.');
  process.exit(1);
}

console.log('\nLULUS — semua halaman hydrate bersih.');
