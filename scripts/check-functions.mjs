#!/usr/bin/env node
// check:functions — MENJALANKAN handler Pages Functions, bukan sekadar membacanya.
//
// ─── Kenapa gate ini ada ─────────────────────────────────────────────────────
// 2026-09-04: `POST /api/admin/viralframe/orders` gagal 500 SETIAP KALI karena
// dua `const ids` di fungsi yang sama — yang di dalam blok `try` menaungi yang
// di scope fungsi, sehingga pemakaian di antaranya jatuh ke temporal dead zone.
// Fitur "Buat Storyboard" mati total, dan LOLOS SEMUA GATE:
//   · `functions/` adalah JS polos → `npm run typecheck` tidak menyentuhnya
//   · esbuild membundel TDZ tanpa keluhan (sintaksnya memang sah)
//   · `npm run smoke` hanya GET halaman publik, tidak pernah POST ke admin
//   · check:bundle / check:turnstile / check:hydration tidak relevan
// Satu-satunya cara menangkapnya adalah MENJALANKAN kodenya.
//
// ─── Dua bagian ─────────────────────────────────────────────────────────────
//   BAGIAN 1  Panggil tiap handler dengan D1 tiruan. 5xx / exception = GAGAL.
//             4xx dianggap LULUS — itu penolakan yang memang disengaja.
//   BAGIAN 2  Pemindai TDZ statis, untuk cabang yang tidak dilewati BAGIAN 1.
//
// ⚠️ BAGIAN 2 WAJIB membuktikan dirinya. Versi pertama pemindai ini melaporkan
// "nol temuan" pada berkas yang JELAS mengandung bug, karena pelacakan
// kedalamannya cacat — kegagalan yang sama persis dengan `check:hydration` yang
// dulu lulus pada halaman yang tidak pernah hydrate. Karena itu ada `--swauji`
// yang menyuntikkan berkas cacat buatan dan menuntut pemindainya menemukannya.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VF = path.join(ROOT, 'functions/api/admin/viralframe');

let masalah = 0;
const catat = (pesan) => { console.log(`  ✗ ${pesan}`); masalah++; };

// ════════════════════════════════════════════════════════════════════════════
// D1 tiruan — bentuknya HARUS sama dengan D1 nyata (results[], meta.last_row_id),
// karena bentuk itulah yang diandalkan kode produksi.
// ════════════════════════════════════════════════════════════════════════════
const FIXTURE = {
  'from viralframe_characters': [{ id: 20, nama: 'monica vera', gender: 'Wanita', usia: 27, etnik: 'Javanese', style: 'blazer krem', ciri_fisik: 'rambut panjang', foto_url: 'viralframe-characters/x.jpg' }],
  'count(*) as n from viralframe_orders': [{ n: 0 }],
  'select property_id from viralframe_orders': [],
  'from properties where id': [{
    id: 1025, kode_listing: 'SBP-1', title: 'Rumah Uji', jenis_properti: 'rumah', tujuan: 'dijual',
    harga: 850000000, kelurahan: 'Tamantirto', kecamatan: 'Kasihan', kabupaten: 'Bantul',
    luas_tanah: 120, luas_bangunan: 90, jumlah_kamar_tidur: 3, jumlah_kamar_mandi: 2,
    lantai: 1, lebar_depan: '', lebar_jalan_m: 5, furnished: 'semi', legalitas: 'SHM',
    income_per_bulan: null, harga_sewa_kamar_bulan: 0, deskripsi: 'rumah bagus',
  }],
  'from property_images': [
    { id: 11, url_webp: 'property-photos/a.webp', label_ruangan: 'Fasad', vf_skor: 88, vf_catatan: 'fasad rapi', vf_dinilai_at: '2026-09-04', is_cover: 1 },
    { id: 12, url_webp: 'property-photos/b.webp', label_ruangan: 'Ruang Tamu', vf_skor: 70, vf_catatan: 'terang', vf_dinilai_at: '2026-09-04', is_cover: 0 },
  ],
  'count(*) as n from property_images': [{ n: 0 }],
  'from viralframe_orders o': [{
    id: 4, property_id: 1025, character_id: 20, status: 'menunggu_render',
    variation_key: 'mekanisme:tur_cepat|hook:fakta_kaget|ritme:montase|mood:hangat|pembukaan:Fasad',
    params_json: null, hasil_json: null, catatan: null, video_id: null, title: 'Rumah Uji',
  }],
  'select status, video_id from viralframe_orders': [{ status: 'baru', video_id: null }],
  'variation_key from viralframe_orders': [],
  'from viralframe_agent_videos': [],
};

function buatDB() {
  const cocok = (sql) => {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    for (const [pola, nilai] of Object.entries(FIXTURE)) if (s.includes(pola)) return nilai;
    return [];
  };
  const stmt = (sql) => ({
    bind: () => stmt(sql),
    first: async () => cocok(sql)[0] ?? null,
    all: async () => ({ results: cocok(sql) }),
    run: async () => ({ meta: { changes: 1, last_row_id: 999 } }),
  });
  return {
    prepare: stmt,
    batch: async (s) => s.map((_, i) => ({ meta: { changes: 1, last_row_id: 500 + i }, results: [] })),
  };
}
const env = () => ({ DB: buatDB(), MEDIA: { get: async () => null } });
const req = (url, body, method = 'POST') => new Request(url, {
  method, headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// Skenario per endpoint. `params` = parameter route ([id] dsb).
const SKENARIO = [
  { file: 'orders/index.js', fn: 'onRequestPost', nama: 'POST /orders',
    ctx: () => ({ request: req('https://x/orders', { character_id: 20, property_ids: [1025], params: { jumlah_part: 3, detik_per_part: 10, vo_detik_per_part: 8, cta: 'survei', platform: 'tiktok' } }), env: env() }) },
  { file: 'orders/index.js', fn: 'onRequestPost', nama: 'POST /orders (tanpa listing)',
    ctx: () => ({ request: req('https://x/orders', { character_id: 20, property_ids: [] }), env: env() }) },
  { file: 'orders/index.js', fn: 'onRequestGet', nama: 'GET /orders',
    ctx: () => ({ request: req('https://x/orders?status=terbuka', undefined, 'GET'), env: env() }) },
  { file: 'orders/[id]/index.js', fn: 'onRequestGet', nama: 'GET /orders/:id',
    ctx: () => ({ env: env(), params: { id: '4' } }) },
  { file: 'orders/[id]/index.js', fn: 'onRequestPatch', nama: 'PATCH /orders/:id (params)',
    ctx: () => ({ request: req('https://x/o/4', { params: { cta: 'wa' } }), env: env(), params: { id: '4' } }) },
  { file: 'orders/[id]/index.js', fn: 'onRequestPatch', nama: 'PATCH /orders/:id (hasil → render ulang)',
    ctx: () => ({ request: req('https://x/o/4', { hasil: {
      params: { jumlahPart: 1, detikPerPart: 10, voDetikPerPart: 8, cta: 'survei' },
      variasi: { mood: 'hangat', ritme: 'montase' },
      dna_agent: { nama: 'm', ciri: [], bahasaInggris: '27-year-old woman', suara: 'warm voice', fotoUrl: null },
      parts: [{ peran: 'Hook', dialog: 'Rumah 120 meter di Kasihan', teks_layar: 'LT 120', cuts: [
        { foto_id: 11, label: 'Fasad', detik: 5, skor: 88, kamera: 'Medium shot', aksi: 'walks' },
        { foto_id: 12, label: 'Ruang Tamu', detik: 5, skor: 70, kamera: 'Wide', aksi: 'points' }] }],
    } }), env: env(), params: { id: '4' } }) },
  { file: 'orders/[id]/index.js', fn: 'onRequestPatch', nama: 'PATCH /orders/:id (selesai)',
    ctx: () => ({ request: req('https://x/o/4', { status: 'selesai', video_id: 77 }), env: env(), params: { id: '4' } }) },
  { file: 'orders/[id]/index.js', fn: 'onRequestDelete', nama: 'DELETE /orders/:id',
    ctx: () => ({ env: env(), params: { id: '4' } }) },
  { file: 'bahan.js', fn: 'onRequestGet', nama: 'GET /bahan',
    ctx: () => ({ request: req('https://x/bahan?property_id=1025&character_id=20', undefined, 'GET'), env: env() }) },
  { file: 'status.js', fn: 'onRequestGet', nama: 'GET /status',
    ctx: () => ({ request: req('https://x/status', undefined, 'GET'), env: env() }) },
];

async function bagian1() {
  console.log('BAGIAN 1 — menjalankan handler dengan D1 tiruan\n');
  // console.error dibungkam: handler memang mencatat kegagalan yang disengaja.
  const errAsli = console.error;
  for (const s of SKENARIO) {
    let status = '-', pesan = '';
    try {
      const mod = await import(pathToFileURL(path.join(VF, s.file)).href);
      if (typeof mod[s.fn] !== 'function') { catat(`${s.nama} — ${s.fn} tidak diekspor`); continue; }
      console.error = () => {};
      const res = await mod[s.fn](s.ctx());
      console.error = errAsli;
      status = res?.status ?? '?';
      if (typeof status !== 'number') { catat(`${s.nama} — handler tidak mengembalikan Response`); continue; }
      if (status >= 500) {
        try { pesan = (await res.clone().json())?.error ?? ''; } catch { /* bukan JSON */ }
        catat(`${s.nama} — HTTP ${status} ${pesan}`);
        continue;
      }
      console.log(`  ✓ ${String(status).padEnd(4)} ${s.nama}`);
    } catch (e) {
      console.error = errAsli;
      catat(`${s.nama} — MELEDAK: ${e.message}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BAGIAN 2 — pemindai TDZ
// ════════════════════════════════════════════════════════════════════════════
function daftarBerkas(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) daftarBerkas(p, out);
    else if (/\.(js|ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

/** Ganti isi komentar & string dengan spasi supaya kurawal di dalamnya tak dihitung. */
function bersihkan(src) {
  const spasi = (m) => ' '.repeat(m.length);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, spasi)
    .replace(/^\s*\/\/[^\n]*/gm, spasi)
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, spasi)
    .replace(/'(?:[^'\\\n]|\\[\s\S])*'/g, spasi)
    .replace(/"(?:[^"\\\n]|\\[\s\S])*"/g, spasi);
}

/** @returns {Array<{nama,luar,dalam}>} kandidat TDZ dalam satu berkas. */
function pindaiTdz(asli) {
  const src = bersihkan(asli);
  const dekl = [];
  let depth = 0, cursor = 0, m;
  const re = /(?:^|[;{}()\s,])(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re.exec(src))) {
    for (let i = cursor; i < m.index; i++) {
      const c = src[i];
      if (c === '{') depth++; else if (c === '}') depth--;
    }
    cursor = m.index;
    dekl.push({ nama: m[1], pos: m.index, depth, baris: asli.slice(0, m.index).split('\n').length });
  }
  const perNama = {};
  for (const d of dekl) (perNama[d.nama] ??= []).push(d);
  const out = [];
  for (const [nama, ds] of Object.entries(perNama)) {
    if (ds.length < 2) continue;
    for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++) {
      const luar = ds[a], dalam = ds[b];
      if (dalam.depth <= luar.depth) continue;
      const antara = src.slice(luar.pos, dalam.pos);
      let d = luar.depth, keluar = false;
      for (const c of antara) {
        if (c === '{') d++;
        else if (c === '}') { d--; if (d < luar.depth) { keluar = true; break; } }
      }
      if (keluar) continue;
      if (new RegExp('\\b' + nama + '\\b').test(antara.slice(nama.length + 10))) {
        out.push({ nama, luar: luar.baris, dalam: dalam.baris });
      }
    }
  }
  return out;
}

// Berkas cacat buatan — pemindai WAJIB menemukannya, kalau tidak ia bohong.
const UJI_SWA = `
export async function onRequestPost({ env }) {
  const ids = [1, 2, 3];
  if (ids.length === 0) return null;
  try {
    const dipakai = ids.filter(x => x > 1);
    const ids = dipakai.map(x => x * 2);
    return ids;
  } catch (e) { return null; }
}`;

function bagian2() {
  console.log('\nBAGIAN 2 — pemindai temporal dead zone\n');
  const swa = pindaiTdz(UJI_SWA);
  if (swa.length === 0) {
    catat('SWA-UJI GAGAL: pemindai tidak menemukan TDZ pada berkas cacat buatan — '
      + 'hasil "nol temuan" di bawah TIDAK BISA DIPERCAYA.');
    return;
  }
  console.log('  ✓ swa-uji lulus (pemindai menemukan TDZ buatan)');

  const target = [
    ...daftarBerkas(path.join(ROOT, 'functions/_lib')),
    ...daftarBerkas(VF),
    ...daftarBerkas(path.join(ROOT, 'src/app/components/admin/viralframe')),
    path.join(ROOT, 'src/app/components/admin/AdminViralFramePage.tsx'),
  ];
  let n = 0;
  for (const f of target) {
    for (const t of pindaiTdz(readFileSync(f, 'utf8'))) {
      catat(`TDZ ${path.relative(ROOT, f).replace(/\\/g, '/')} — "${t.nama}" baris ${t.luar} dinaungi baris ${t.dalam}, dipakai di antaranya`);
      n++;
    }
  }
  if (n === 0) console.log(`  ✓ nol shadowing berisiko TDZ di ${target.length} berkas`);
}

await bagian1();
bagian2();

console.log('\n' + '='.repeat(74));
if (masalah === 0) {
  console.log('LULUS — semua handler membalas tanpa 5xx, nol TDZ.');
  process.exit(0);
}
console.log(`GAGAL — ${masalah} masalah.`);
process.exit(1);
