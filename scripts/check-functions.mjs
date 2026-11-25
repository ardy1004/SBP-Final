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
  'from viralframe_agent_videos': [],
};

// `override` menimpa/menambah kunci FIXTURE HANYA untuk satu skenario — dipakai
// skenario `jalankan.js` (rencana v2) yang butuh baris `viralframe_orders`
// dengan `status` berbeda dari fixture bersama di atas, tanpa mengubah fixture
// bersama yang dipakai skenario lain.
function buatDB(override = {}) {
  const fixture = { ...FIXTURE, ...override };
  const cocok = (sql) => {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    for (const [pola, nilai] of Object.entries(fixture)) if (s.includes(pola)) return nilai;
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
// MEDIA tiruan: head() mengembalikan objek (= key ada) kecuali ditimpa skenario.
const env = (override, media = {}) => ({ DB: buatDB(override), MEDIA: { get: async () => null, head: async () => ({}), delete: async () => {}, ...media } });
const req = (url, body, method = 'POST') => new Request(url, {
  method, headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// Skenario per endpoint. `params` = parameter route ([id] dsb). `file` relatif
// terhadap functions/api/admin/viralframe.
//
// 2026-11-21: skenario meja kerja (orders/*, bahan, status, jalankan) DIBUANG
// bersama endpoint-nya. Diganti endpoint ViralFrame yang MASIH hidup dan paling
// sering diubah — penjadwal & metrik — supaya gate tetap menjalankan kode nyata.
// Semua tanpa jaringan: kredensial scheduler kosong di D1 tiruan, jadi jalurnya
// berhenti sebelum memanggil Buffer/Zernio.
const BLOK_TEMPLATE_UJI = [{ judul: 'OBJEK', isi: 'Fee {fee_persen}% untuk {jenis_transaksi}.', berlaku: { listing: ['open', 'exclusive'], tujuan: ['jual', 'sewa', 'jual_sewa'] } }];
const FIXTURE_TEMPLATE_V2 = { 'from perjanjian_template': [{ versi: 2, blok_json: JSON.stringify(BLOK_TEMPLATE_UJI), catatan: null, dibuat_oleh: 'gate', dibuat_at: '2026-11-21 00:00:00' }] };
const FIXTURE_AGREEMENT = { 'from agreements a': [{
  id: 7, kode_perjanjian: 'SBP-AGR-GATE', status: 'draft', jenis_listing: 'open', durasi_kontrak: null, fee_persen: 3,
  pasal_json: null, pasal_kustom: 0, pasal_template_versi: null, pasal_diubah_oleh: null, pasal_diubah_at: null,
  tujuan: 'dijual', jenis_properti: 'Rumah', alamat: 'Jl. Uji', kelurahan: 'Tamantirto', kecamatan: 'Kasihan', kabupaten: 'Bantul',
  provinsi: 'DIY', legalitas: 'SHM', harga: 850000000, harga_sewa_tahun: null, nego: 1, nett: 0,
}] };
// Ganti foto portofolio (2026-11-22, "Tutup bagian sensitif" pada foto tersimpan).
const UUID_LAMA = '11111111-1111-4111-8111-111111111111';
const UUID_BARU = '22222222-2222-4222-8222-222222222222';
const BARIS_PORTFOLIO = { id: 5, kategori: 'ajb', foto_key: `portfolio/${UUID_LAMA}.webp`, thumb_key: `portfolio/${UUID_LAMA}-t.webp`,
  keterangan: 'AJB uji', lokasi: null, tanggal: null, property_id: null, tampil: 1, aman_dikonfirmasi: 1, urutan: 0 };
const FIXTURE_PORTFOLIO = {
  'select * from portfolio_items where id': [BARIS_PORTFOLIO],
  'from portfolio_items where (foto_key': [],
  'from portfolio_items pi left join': [BARIS_PORTFOLIO],
  'select foto_key, thumb_key, tampil from portfolio_items': [BARIS_PORTFOLIO],
};
const reqInternal = (url) => new Request(url, { method: 'POST', headers: { 'X-Purge-Secret': 'uji-gate' } });
const envInternal = () => ({ ...env(), VIRALFRAME_PURGE_SECRET: 'uji-gate' });

// ─── Varian ukuran foto properti (2026-11-25, _lib/ukuranFoto.js) ──────────
// R2 tiruan yang MENCATAT put/delete, supaya skenario bisa memeriksa kunci yang
// benar-benar ditulis/dihapus — bukan sekadar "tidak 5xx".
const objekR2 = (isi = 'x', ct = 'image/webp') => ({ arrayBuffer: async () => new TextEncoder().encode(isi).buffer, httpMetadata: { contentType: ct }, httpEtag: '"e"' });
function mediaPencatat(ada = {}) {
  const log = { put: [], delete: [] };
  return {
    log,
    get: async (k) => (k in ada ? objekR2(ada[k]) : null),
    head: async (k) => (k in ada ? {} : null),
    put: async (k) => { log.put.push(k); },
    delete: async (k) => { log.delete.push(...[].concat(k)); },
    list: async () => ({ objects: Object.keys(ada).map(key => ({ key, uploaded: new Date(key.includes('baru') ? Date.now() : Date.now() - 3 * 864e5) })), truncated: false }),
  };
}
const WEBP_MINI = 'data:image/webp;base64,' + Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 ' + 'x'.repeat(14), 'latin1').toString('base64');
const PNG_MINI = 'data:image/webp;base64,' + Buffer.from('\x89PNG\r\n\x1a\nxxxx', 'latin1').toString('base64');
const BESAR = 'data:image/webp;base64,' + Buffer.alloc(2 * 1024 * 1024 + 10, 0x52).toString('base64');
let mediaUji;
const envMedia = (ada, override) => { mediaUji = mediaPencatat(ada); return { ...env(override), MEDIA: mediaUji }; };
const SKENARIO = [
  { file: 'performa.js', fn: 'onRequestGet', nama: 'GET /performa',
    ctx: () => ({ request: req('https://x/performa?hari=30', undefined, 'GET'), env: env() }) },
  { file: 'agent-accounts/index.js', fn: 'onRequestGet', nama: 'GET /agent-accounts',
    ctx: () => ({ env: env() }) },
  { file: '../../internal/viralframe/auto-schedule.js', fn: 'onRequestPost', nama: 'POST internal/auto-schedule (dry, semua agent)',
    ctx: () => ({ request: reqInternal('https://x/auto-schedule?dry=1'), env: envInternal() }) },
  { file: '../../internal/viralframe/auto-schedule.js', fn: 'onRequestPost', nama: 'POST internal/auto-schedule (secret salah → 403)',
    ctx: () => ({ request: new Request('https://x/auto-schedule', { method: 'POST', headers: { 'X-Purge-Secret': 'salah' } }), env: envInternal() }) },
  { file: '../../internal/viralframe/tarik-metrik.js', fn: 'onRequestPost', nama: 'POST internal/tarik-metrik (dry)',
    ctx: () => ({ request: reqInternal('https://x/tarik-metrik?dry=1'), env: envInternal() }) },
  // ─── Portofolio (2026-11-21, migrasi 0062) ───────────────────────────────
  { file: '../portfolio/index.js', fn: 'onRequestGet', nama: 'GET /portfolio (admin)',
    ctx: () => ({ env: env() }) },
  { file: '../portfolio/index.js', fn: 'onRequestPost', nama: 'POST /portfolio (key tidak sah → 400)',
    ctx: () => ({ request: req('https://x/portfolio', { foto_key: 'signatures/x.png', thumb_key: 'x' }), env: env() }) },
  { file: '../portfolio/index.js', fn: 'onRequestPost', nama: 'POST /portfolio (sah)',
    ctx: () => ({ request: req('https://x/portfolio', { foto_key: 'portfolio/123e4567-e89b-12d3-a456-426614174000.webp', thumb_key: 'portfolio/123e4567-e89b-12d3-a456-426614174000-t.webp', kategori: 'ajb', keterangan: 'uji' }), env: env() }) },
  { file: '../portfolio/[id].js', fn: 'onRequestPatch', nama: 'PATCH /portfolio/:id (tidak ada → 404)',
    ctx: () => ({ request: req('https://x/portfolio/1', { tampil: true }), env: env(), params: { id: '1' } }) },
  { file: '../portfolio/[id].js', fn: 'onRequestPatch', nama: 'PATCH /portfolio/:id (ganti foto sah)',
    ctx: () => ({ request: req('https://x/portfolio/5', { foto_key: `portfolio/${UUID_BARU}.webp`, thumb_key: `portfolio/${UUID_BARU}-t.webp` }, 'PATCH'), env: env(FIXTURE_PORTFOLIO), params: { id: '5' } }) },
  { file: '../portfolio/[id].js', fn: 'onRequestPatch', nama: 'PATCH /portfolio/:id (ganti foto, pasangan beda uuid → 400)',
    ctx: () => ({ request: req('https://x/portfolio/5', { foto_key: `portfolio/${UUID_BARU}.webp`, thumb_key: `portfolio/${UUID_LAMA}-t.webp` }, 'PATCH'), env: env(FIXTURE_PORTFOLIO), params: { id: '5' } }) },
  { file: '../portfolio/[id].js', fn: 'onRequestPatch', nama: 'PATCH /portfolio/:id (ganti foto, belum terunggah → 400)',
    ctx: () => ({ request: req('https://x/portfolio/5', { foto_key: `portfolio/${UUID_BARU}.webp`, thumb_key: `portfolio/${UUID_BARU}-t.webp` }, 'PATCH'), env: env(FIXTURE_PORTFOLIO, { head: async () => null }), params: { id: '5' } }) },
  { file: '../portfolio/[id].js', fn: 'onRequestPatch', nama: 'PATCH /portfolio/:id (ubah keterangan item tampil)',
    ctx: () => ({ request: req('https://x/portfolio/5', { keterangan: 'AJB rumah di Ngaglik' }, 'PATCH'), env: env(FIXTURE_PORTFOLIO), params: { id: '5' } }) },
  { file: '../portfolio/[id].js', fn: 'onRequestDelete', nama: 'DELETE /portfolio/:id',
    ctx: () => ({ request: req('https://x/portfolio/5', undefined, 'DELETE'), env: env(FIXTURE_PORTFOLIO), params: { id: '5' } }) },
  { file: '../portfolio/urutan.js', fn: 'onRequestPost', nama: 'POST /portfolio/urutan',
    ctx: () => ({ request: req('https://x/portfolio/urutan', { ids: [3, 1, 2] }), env: env() }) },
  // ─── Isi perjanjian (C2/C3, 2026-11-21, migrasi 0063–0065) ───────────────
  // configure & pasal memanggil templateAktif() (async, baca D1) — dijalankan
  // dengan tabel template kosong (→ v1) DAN berisi versi 2.
  { file: '../perjanjian-template/index.js', fn: 'onRequestGet', nama: 'GET /perjanjian-template (kosong → v1)',
    ctx: () => ({ request: req('https://x/perjanjian-template', undefined, 'GET'), env: env() }) },
  { file: '../perjanjian-template/index.js', fn: 'onRequestGet', nama: 'GET /perjanjian-template?versi=2',
    ctx: () => ({ request: req('https://x/perjanjian-template?versi=2', undefined, 'GET'), env: env(FIXTURE_TEMPLATE_V2) }) },
  { file: '../perjanjian-template/index.js', fn: 'onRequestPost', nama: 'POST /perjanjian-template (sah)',
    ctx: () => ({ request: req('https://x/perjanjian-template', { blok: BLOK_TEMPLATE_UJI, catatan: 'uji' }), env: env(FIXTURE_TEMPLATE_V2), data: { admin: { nama: 'gate' } } }) },
  { file: '../perjanjian-template/index.js', fn: 'onRequestPost', nama: 'POST /perjanjian-template (varian kosong → 422)',
    ctx: () => ({ request: req('https://x/perjanjian-template', { blok: [{ ...BLOK_TEMPLATE_UJI[0], berlaku: { listing: ['open'], tujuan: ['jual'] } }] }), env: env() }) },
  { file: '../agreements/[id]/configure.js', fn: 'onRequestPost', nama: 'POST /agreements/:id/configure (template v2)',
    ctx: () => ({ request: req('https://x/agreements/7/configure', { jenis_listing: 'exclusive', fee_persen: 3, durasi_kontrak: 6 }), env: env({ ...FIXTURE_AGREEMENT, ...FIXTURE_TEMPLATE_V2 }), params: { id: '7' } }) },
  { file: '../agreements/[id]/pasal.js', fn: 'onRequestGet', nama: 'GET /agreements/:id/pasal',
    ctx: () => ({ env: env(FIXTURE_AGREEMENT), params: { id: '7' } }) },
  { file: '../agreements/[id]/pasal.js', fn: 'onRequestPut', nama: 'PUT /agreements/:id/pasal (reset, template v2)',
    ctx: () => ({ request: req('https://x/agreements/7/pasal', { reset: true }, 'PUT'), env: env({ ...FIXTURE_AGREEMENT, ...FIXTURE_TEMPLATE_V2 }), params: { id: '7' }, data: { admin: { nama: 'gate' } } }) },
  // ─── Varian ukuran foto (2026-11-25) — `status` & `cek` WAJIB cocok ─────────
  { file: '../../media.js', fn: 'onRequestGet', nama: 'GET /api/media varian ADA → 640, immutable', status: 200,
    ctx: () => ({ request: req('https://x/api/media?key=property-photos%2F640%2Fa.webp', undefined, 'GET'), env: envMedia({ 'property-photos/640/a.webp': 'v', 'property-photos/a.webp': 'd' }) }),
    cek: async (r) => r.headers.get('x-sbp-ukuran') === '640' && /immutable/.test(r.headers.get('cache-control')) && (await r.text()) === 'v' },
  { file: '../../media.js', fn: 'onRequestGet', nama: 'GET /api/media varian BELUM ada → foto dasar, cache 1 jam', status: 200,
    ctx: () => ({ request: req('https://x/api/media?key=property-photos%2F1280%2Fa.webp', undefined, 'GET'), env: envMedia({ 'property-photos/a.webp': 'd' }) }),
    cek: async (r) => r.headers.get('x-sbp-ukuran') === 'asli' && r.headers.get('cache-control') === 'public, max-age=3600' && (await r.text()) === 'd' },
  { file: '../../media.js', fn: 'onRequestGet', nama: 'GET /api/media varian & dasar tidak ada → 404', status: 404,
    ctx: () => ({ request: req('https://x/api/media?key=property-photos%2F640%2Fhilang.webp', undefined, 'GET'), env: envMedia({}) }) },
  { file: '../../media.js', fn: 'onRequestGet', nama: 'GET /api/media foto dasar biasa (tanpa header ukuran)', status: 200,
    ctx: () => ({ request: req('https://x/api/media?key=property-photos%2Fa.webp', undefined, 'GET'), env: envMedia({ 'property-photos/a.webp': 'd' }) }),
    cek: async (r) => r.headers.get('x-sbp-ukuran') === null && /immutable/.test(r.headers.get('cache-control')) },
  { file: '../properties/[id]/photos/ukuran.js', fn: 'onRequestGet', nama: 'GET /photos/ukuran → hanya foto yang kurang varian', status: 200,
    ctx: () => ({ env: envMedia({ 'property-photos/640/a.webp': 'v', 'property-photos/1280/a.webp': 'v', 'property-photos/640/b.webp': 'v' }), params: { id: '1025' } }),
    cek: async (r) => { const j = await r.json(); return JSON.stringify(j.data.foto) === JSON.stringify([{ id: 12, url_webp: 'property-photos/b.webp', kurang: [1280] }]); } },
  { file: '../properties/[id]/photos/[imageId]/ukuran.js', fn: 'onRequestPut', nama: 'PUT /photos/:id/ukuran sah → tulis ke kunci varian', status: 200,
    ctx: () => ({ request: req('https://x/u', { 640: WEBP_MINI, 1280: WEBP_MINI }, 'PUT'), env: envMedia({}), params: { id: '1025', imageId: '11' } }),
    cek: async () => JSON.stringify(mediaUji.log.put.sort()) === JSON.stringify(['property-photos/1280/a.webp', 'property-photos/640/a.webp']) },
  { file: '../properties/[id]/photos/[imageId]/ukuran.js', fn: 'onRequestPut', nama: 'PUT /photos/:id/ukuran isi bukan WebP/JPEG → 415, tak menulis', status: 415,
    ctx: () => ({ request: req('https://x/u', { 640: WEBP_MINI, 1280: PNG_MINI }, 'PUT'), env: envMedia({}), params: { id: '1025', imageId: '11' } }),
    cek: async () => mediaUji.log.put.length === 0 },
  { file: '../properties/[id]/photos/[imageId]/ukuran.js', fn: 'onRequestPut', nama: 'PUT /photos/:id/ukuran > 2 MB → 413', status: 413,
    ctx: () => ({ request: req('https://x/u', { 640: BESAR }, 'PUT'), env: envMedia({}), params: { id: '1025', imageId: '11' } }) },
  { file: '../properties/[id]/photos/[imageId]/ukuran.js', fn: 'onRequestPut', nama: 'PUT /photos/:id/ukuran foto milik properti lain → 404', status: 404,
    ctx: () => ({ request: req('https://x/u', { 640: WEBP_MINI }, 'PUT'), env: envMedia({}, { 'from property_images': [] }), params: { id: '1', imageId: '11' } }) },
  { file: '../properties/[id]/photos/[imageId]/index.js', fn: 'onRequestDelete', nama: 'DELETE /photos/:id → dasar + 2 varian ikut terhapus', status: 200,
    ctx: () => ({ env: envMedia({}), params: { id: '1025', imageId: '11' } }),
    cek: async () => ['property-photos/a.webp', 'property-photos/640/a.webp', 'property-photos/1280/a.webp'].every(k => mediaUji.log.delete.includes(k)) },
  // 🔥 Sapuan yatim: varian dinilai lewat DASAR-nya. a & b dirujuk D1 → varian
  // keduanya WAJIB selamat; c tak dirujuk → yatim; "baru" (< 24 jam) tak disentuh.
  { file: '../../internal/viralframe/purge-trash.js', fn: 'onRequestPost', nama: 'POST internal/purge-trash → varian foto dirujuk TIDAK dihapus', status: 200,
    ctx: () => ({ request: reqInternal('https://x/purge-trash'), env: { ...envMedia({
      'property-photos/a.webp': 'd', 'property-photos/640/a.webp': 'v', 'property-photos/1280/a.webp': 'v',
      'property-photos/1280/b.webp': 'v', 'property-photos/640/c.webp': 'v', 'property-photos/c.webp': 'd',
      'property-photos/640/baru-d.webp': 'v' }), VIRALFRAME_PURGE_SECRET: 'uji-gate' } }),
    cek: async () => JSON.stringify(mediaUji.log.delete.filter(k => k.startsWith('property-photos/')).sort())
      === JSON.stringify(['property-photos/640/c.webp', 'property-photos/c.webp']) },
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
        // `harap` menandai skenario yang MEMANG mengharapkan 5xx tertentu (mis.
        // stasiun AI gagal terkontrol karena harness ini tanpa API key sungguhan)
        // — lihat komentar di skenario `jalankan.js`. Status lain di rentang 5xx
        // tetap GAGAL: itu tandanya crash/TDZ, bukan kegagalan yang diharapkan.
        if (s.harap && status === s.harap) {
          console.log(`  ✓ ${String(status).padEnd(4)} ${s.nama} (diharapkan — tanpa API key AI di harness ini)`);
          continue;
        }
        try { pesan = (await res.clone().json())?.error ?? ''; } catch { /* bukan JSON */ }
        catat(`${s.nama} — HTTP ${status} ${pesan}`);
        continue;
      }
      // Skenario ber-`status`/`cek` menuntut perilaku PERSIS, bukan cuma "tidak 5xx".
      if (s.status && status !== s.status) {
        try { pesan = (await res.clone().json())?.error ?? ''; } catch { /* bukan JSON */ }
        catat(`${s.nama} — HTTP ${status}, diharapkan ${s.status} ${pesan}`);
        continue;
      }
      if (s.cek && !(await s.cek(res.clone()))) { catat(`${s.nama} — isi/efek tidak sesuai harapan`); continue; }
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
    // AdminViralFramePage.tsx (meja kerja) dihapus 2026-11-21.
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
