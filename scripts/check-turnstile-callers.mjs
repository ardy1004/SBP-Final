#!/usr/bin/env node
/**
 * Penjaga: setiap pemanggil endpoint ber-Turnstile WAJIB mengirim
 * `cf_turnstile_token`.
 *
 * LATAR BELAKANG. `functions/_lib/turnstile.js` bersifat FAIL-CLOSED begitu
 * TURNSTILE_SECRET terpasang (dan di produksi ia terpasang): request tanpa token
 * ditolak 403, titik. Artinya endpoint dan pemanggilnya adalah satu kontrak —
 * mengetatkan backend tanpa menyiapkan SEMUA pemanggilnya = form itu mati total.
 *
 * Kelas bug ini sudah terjadi TIGA KALI:
 *   - 12 Agu 2026 — TitipJualPage: widget ada tapi statusnya tidak ditampilkan.
 *   - 29 Agu 2026 — ContactAdminSheet & ChatWidget: sama.
 *   - 29 Agu 2026 — PropertyDetailPage (LeadForm) & ContactPage: token TIDAK
 *     PERNAH DIKIRIM SAMA SEKALI. Commit b3f9d8c (11 Juli) mengunci
 *     functions/api/leads.js lalu memasang widget di 3 komponen, melewatkan 2
 *     pemanggil /api/leads lainnya. Keduanya gagal 100% selama 49 HARI dengan
 *     typecheck, check:bundle, dan smoke SEMUANYA HIJAU — tidak satu pun gate
 *     yang ada memeriksa kontrak ini. Dampaknya nol lead pembeli sejak 13 Juli,
 *     dan Meta Pixel tidak pernah menerima event Lead (trackEvent ada di dalam
 *     `if (res.success)`).
 *
 * Yang bikin sulit ditangkap manusia: ContactPage memanggil `/api/leads` lewat
 * `fetch` MENTAH, sedangkan yang lain lewat helper `postLead()`. Menyapu satu
 * bentuk panggilan saja PASTI melewatkan bentuk yang lain — itu persis yang
 * terjadi saat perbaikan 985b0b0 disusun. Script ini menyapu keduanya.
 *
 * DAFTAR ENDPOINT TIDAK DI-HARDCODE. Diturunkan dari file di functions/api/**
 * yang benar-benar memanggil verifyTurnstile(), jadi endpoint fail-closed baru
 * otomatis ikut terjaga tanpa menyentuh script ini.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const problems = [];

function walk(dir, out = []) {
  for (const nama of readdirSync(dir)) {
    const p = path.join(dir, nama);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// ── 1. Endpoint fail-closed, diturunkan dari kode ────────────────────────────
// functions/api/leads.js -> /api/leads ; functions/api/a/b.js -> /api/a/b
const endpoints = new Set();
for (const file of walk(path.join(ROOT, 'functions', 'api'))) {
  if (!file.endsWith('.js')) continue;
  if (!/\bverifyTurnstile\s*\(/.test(readFileSync(file, 'utf8'))) continue;
  const p = rel(file).replace(/^functions/, '').replace(/\.js$/, '').replace(/\/index$/, '');
  endpoints.add(p);
}

if (endpoints.size === 0) {
  console.error('GAGAL — tidak menemukan satu pun endpoint yang memanggil verifyTurnstile().');
  console.error('Kalau Turnstile memang sengaja dicabut seluruhnya, hapus juga script ini beserta');
  console.error('entri check:turnstile di package.json — jangan biarkan penjaga yang tidak menjaga apa pun.');
  process.exit(1);
}

// ── 2. Helper di src/lib/api.ts yang membungkus endpoint itu ─────────────────
// `export async function postLead(...) { return apiFetch<...>('/leads', {...}) }`
// -> nama helper `postLead` dianggap setara pemanggilan `/api/leads`.
const apiTs = readFileSync(path.join(ROOT, 'src', 'lib', 'api.ts'), 'utf8');
const helpers = new Map(); // nama helper -> endpoint
for (const m of apiTs.matchAll(/export\s+(?:async\s+)?function\s+(\w+)[\s\S]{0,400}?apiFetch<[^>]*>\(\s*[`'"]([^`'"]+)/g)) {
  const [, nama, jalur] = m;
  const penuh = '/api' + (jalur.startsWith('/') ? jalur : '/' + jalur);
  if (endpoints.has(penuh)) helpers.set(nama, penuh);
}

// ── 3. Pemanggil di src/ ─────────────────────────────────────────────────────
// Hanya PEMANGGILAN yang dihitung. Navigasi (<Link to>, href, path:) BUKAN
// pemanggilan — tanpa pengecualian ini penjaga jadi berisik dan diabaikan orang.
const sumber = walk(path.join(ROOT, 'src')).filter(f => /\.(ts|tsx)$/.test(f));
const pemanggil = new Map(); // file -> Set<endpoint>

for (const file of sumber) {
  const r = rel(file);
  if (r === 'src/lib/api.ts') continue;           // definisi helper, bukan pemanggil
  const isi = readFileSync(file, 'utf8');

  for (const ep of endpoints) {
    // a. fetch mentah: fetch('/api/leads', ...) — juga menangkap kirimBerprogres('/api/titip-jual', ...)
    const fetchLangsung = new RegExp(`[('\`"]${ep}['\`"]`).test(isi)
      && new RegExp(`(fetch|\\w+)\\(\\s*['\`"]${ep}['\`"]`).test(isi);
    if (fetchLangsung) {
      if (!pemanggil.has(r)) pemanggil.set(r, new Set());
      pemanggil.get(r).add(ep);
    }
  }

  // b. lewat helper api.ts
  for (const [nama, ep] of helpers) {
    if (new RegExp(`\\b${nama}\\s*\\(`).test(isi)) {
      if (!pemanggil.has(r)) pemanggil.set(r, new Set());
      pemanggil.get(r).add(ep);
    }
  }
}

// ── 4. Setiap pemanggil wajib mengirim token ─────────────────────────────────
for (const [file, eps] of [...pemanggil].sort()) {
  const isi = readFileSync(path.join(ROOT, file), 'utf8');
  if (isi.includes('cf_turnstile_token')) continue;
  problems.push(
    `${file}: memanggil ${[...eps].join(', ')} (fail-closed) tapi TIDAK PERNAH mengirim `
    + `cf_turnstile_token — setiap kiriman dari sini akan ditolak 403. `
    + `Pasang <Turnstile> lalu sertakan tokennya di payload (contoh: src/app/components/ContactAdminSheet.tsx).`,
  );
}

console.log('Penjaga kontrak Turnstile: endpoint fail-closed vs pemanggilnya');
console.log('='.repeat(64));
console.log(`\nEndpoint fail-closed (${endpoints.size}): ${[...endpoints].sort().join(', ')}`);
console.log(`Helper api.ts (${helpers.size}): ${[...helpers.keys()].join(', ') || '—'}`);
console.log(`Pemanggil ditemukan (${pemanggil.size}):`);
for (const [file, eps] of [...pemanggil].sort()) {
  const ok = readFileSync(path.join(ROOT, file), 'utf8').includes('cf_turnstile_token');
  console.log(`  ${ok ? '✓' : '✗'} ${file}  →  ${[...eps].join(', ')}`);
}

if (problems.length > 0) {
  console.error(`\nGAGAL — ${problems.length} pemanggil tanpa token:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nRujukan: functions/_lib/turnstile.js (fail-closed) & CLAUDE.md bagian Turnstile.');
  process.exit(1);
}

console.log('\nLULUS — semua pemanggil endpoint fail-closed mengirim cf_turnstile_token.');
