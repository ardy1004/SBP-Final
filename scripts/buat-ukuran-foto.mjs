#!/usr/bin/env node
// scripts/buat-ukuran-foto.mjs — backfill varian ukuran foto properti (640 & 1280).
//
//   node scripts/buat-ukuran-foto.mjs                 → DRY-RUN (bawaan): hitung & uji buat, TANPA unggah
//   node scripts/buat-ukuran-foto.mjs --tulis         → unggah varian yang belum ada ke R2 produksi
//   node scripts/buat-ukuran-foto.mjs --tulis --batas 10   → hanya 10 foto pertama (uji kecil)
//   node scripts/buat-ukuran-foto.mjs --tulis --timpa      → buat ULANG semua varian (mis. setelah MUTU diubah)
//
// KENAPA ADA (2026-11-25). Halaman publik memakai varian tetap
// property-photos/<640|1280>/<nama> (lihat functions/_lib/ukuranFoto.js), bukan
// lagi Cloudflare Image Transformations yang kuotanya habis. Foto baru dibuatkan
// varian di browser admin; foto LAMA (2.675 per 24 Nov) dibuatkan sekali di sini.
//
// Aman dijalankan berulang: varian yang sudah ada dilewati. Hanya MENAMBAH
// objek R2 baru — tidak menghapus apa pun dan tidak menulis D1.
//
// Status varian dibaca dari header X-SBP-Ukuran /api/media: "asli" = varian
// belum ada (dan body-nya adalah foto dasar — dipakai langsung sebagai sumber,
// satu request untuk keduanya). Header itu baru ada setelah media.js versi
// 2026-11-25 ter-deploy; tanpanya skrip berhenti.
//
// Pola pemanggilan wrangler mengikuti skill d1-migrations-and-scripts: node
// langsung ke wrangler.js (tanpa npx/shell).

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const jalankan = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const BUCKET = 'sbp-media';
const BASE = 'https://salambumi.xyz';
const UKURAN = [640, 1280];
// q68, sama dengan pembuat di browser admin (src/app/lib/ukuranFoto.ts). Diukur
// 2026-11-25 pada 60 foto: q82 = 1,5× ukuran AVIF Cloudflare lama dan LCP
// halaman detail 2× lebih lambat (4G 0,9 → 1,9 dtk); q65–68 ≈ setara AVIF lama
// (PSNR ±39 dB — tak terlihat bedanya di layar HP).
const MUTU = { 640: 68, 1280: 68 };
const POLA_DASAR = /^property-photos\/[^/]+$/;
const KONKUREN = 6;

const args = process.argv.slice(2);
const TULIS = args.includes('--tulis');
// --timpa: buat ulang varian yang SUDAH ada (mis. setelah MUTU berubah).
const TIMPA = args.includes('--timpa');
const iBatas = args.indexOf('--batas');
const BATAS = iBatas >= 0 ? Number(args[iBatas + 1]) : Infinity;
// --mulai N: lewati N foto pertama (urutan id) — untuk mengulang rentang yang gagal.
const iMulai = args.indexOf('--mulai');
const MULAI = iMulai >= 0 ? Number(args[iMulai + 1]) : 0;
// --simpan-gagal <berkas>: tulis daftar LENGKAP kunci dasar yang gagal (JSON).
const iSimpan = args.indexOf('--simpan-gagal');
const SIMPAN_GAGAL = iSimpan >= 0 ? args[iSimpan + 1] : null;

const kunciUkuran = (dasar, w) => `property-photos/${w}/${dasar.slice('property-photos/'.length)}`;
const urlMedia = k => `${BASE}/api/media?key=${encodeURIComponent(k)}`;

function bacaDaftar() {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'd1-baca.mjs'), '--json',
    "SELECT url_webp FROM property_images WHERE url_webp LIKE 'property-photos/%' ORDER BY id"],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  return [...new Set(JSON.parse(out).map(r => r.url_webp).filter(k => POLA_DASAR.test(k)))];
}

async function unggah(kunci, buf) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sbp-ukuran-'));
  const berkas = path.join(dir, 'v.webp');
  writeFileSync(berkas, buf);
  try {
    for (let coba = 1; ; coba++) {
      try {
        await jalankan(process.execPath, [WRANGLER, 'r2', 'object', 'put', `${BUCKET}/${kunci}`,
          '--file', berkas, '--content-type', 'image/webp', '--remote'], { cwd: ROOT, maxBuffer: 1 << 24 });
        return;
      } catch (err) {
        if (coba >= 3) throw new Error(String(err.stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' | '));
        await new Promise(r => setTimeout(r, 1500 * coba));
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Isi varian: hasil kompres ulang, KECUALI foto asli sudah WebP, lebarnya ≤ target,
 * tanpa orientasi EXIF, dan LEBIH KECIL — itu dipakai apa adanya. Diukur
 * 2026-11-25: 17% varian q82 dari foto ≤1280 px justru lebih besar dari aslinya.
 */
async function pilihIsi(sumber, meta, w) {
  const enc = await sharp(sumber).rotate()
    .resize({ width: w, withoutEnlargement: true })
    .webp({ quality: MUTU[w] })
    .toBuffer();
  const asliCocok = meta.format === 'webp' && meta.width <= w && (!meta.orientation || meta.orientation === 1);
  return asliCocok && sumber.length <= enc.length ? { buf: sumber, asli: true } : { buf: enc, asli: false };
}

async function prosesSatu(dasar, stat) {
  let sumber = null, meta = null;
  for (const w of UKURAN) {
    const kunci = kunciUkuran(dasar, w);
    const res = await fetch(urlMedia(kunci));
    const status = res.headers.get('x-sbp-ukuran');
    if (res.status === 404) { await res.body?.cancel(); stat.dasarHilang.push(dasar); return; }
    if (!status) { await res.body?.cancel(); throw new Error('Header X-SBP-Ukuran tidak ada — deploy media.js versi 2026-11-25 dulu.'); }
    if (status !== 'asli' && !TIMPA) { await res.body?.cancel(); stat.sudahAda++; continue; }
    if (!sumber) {
      if (status === 'asli') {
        sumber = Buffer.from(await res.arrayBuffer()); // body fallback = foto dasar
      } else {
        await res.body?.cancel();
        const r = await fetch(urlMedia(dasar));
        if (!r.ok) { await r.body?.cancel(); stat.dasarHilang.push(dasar); return; }
        sumber = Buffer.from(await r.arrayBuffer());
      }
      meta = await sharp(sumber).metadata();
    } else {
      await res.body?.cancel();
    }
    const hasil = await pilihIsi(sumber, meta, w);
    stat.byte[w] += hasil.buf.length;
    if (hasil.asli) stat.pakaiAsli++;
    if (TULIS) {
      try {
        await unggah(kunci, hasil.buf);
        stat.dibuat++;
      } catch (err) {
        stat.gagal.push(`${kunci}: ${err.message}`.slice(0, 200));
      }
    } else {
      stat.akanDibuat++;
    }
  }
}

const daftar = bacaDaftar().slice(MULAI, MULAI + BATAS);
console.error(`${daftar.length} foto dasar · mode ${TULIS ? 'TULIS (unggah ke R2 produksi)' : 'DRY-RUN'}${TIMPA ? ' · TIMPA varian yang ada' : ''} · mutu ${JSON.stringify(MUTU)}`);
const stat = { sudahAda: 0, akanDibuat: 0, dibuat: 0, pakaiAsli: 0, gagal: [], dasarHilang: [], byte: { 640: 0, 1280: 0 } };
const t0 = Date.now();
let i = 0, selesai = 0;
async function pekerja() {
  while (i < daftar.length) {
    const dasar = daftar[i++];
    try { await prosesSatu(dasar, stat); }
    catch (err) {
      if (/X-SBP-Ukuran/.test(err.message)) { console.error('BERHENTI:', err.message); process.exit(2); }
      stat.gagal.push(`${dasar}: ${String(err.message).slice(0, 160)}`);
    }
    if (++selesai % 100 === 0) console.error(`${selesai}/${daftar.length} · dibuat ${stat.dibuat} · gagal ${stat.gagal.length} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}
await Promise.all(Array.from({ length: KONKUREN }, pekerja));

console.log(JSON.stringify({
  mode: TULIS ? 'tulis' : 'dry-run',
  foto: daftar.length,
  varian_sudah_ada: stat.sudahAda,
  varian_akan_dibuat: stat.akanDibuat,
  varian_dibuat: stat.dibuat,
  varian_pakai_foto_asli: stat.pakaiAsli,
  total_MB: { 640: +(stat.byte[640] / 1048576).toFixed(1), 1280: +(stat.byte[1280] / 1048576).toFixed(1) },
  dasar_hilang: stat.dasarHilang.length,
  gagal: stat.gagal.length,
  contoh_gagal: stat.gagal.slice(0, 10),
  detik: Math.round((Date.now() - t0) / 1000),
}, null, 2));
if (SIMPAN_GAGAL) {
  // Kunci DASAR unik dari setiap kegagalan (varian → dasar), siap dipakai ulang.
  const dasarGagal = [...new Set(stat.gagal.map(g => g.split(':')[0].replace(/^property-photos\/(?:640|1280)\//, 'property-photos/')))];
  writeFileSync(SIMPAN_GAGAL, JSON.stringify({ dasar: dasarGagal, pesan: stat.gagal }, null, 1));
}
process.exit(stat.gagal.length ? 1 : 0);
