#!/usr/bin/env node
/**
 * Smoke test pasca-deploy — dirancang khusus menangkap kegagalan startup Worker
 * (Cloudflare Error 1102) yang GEJALANYA BERKEDIP.
 *
 * KENAPA SCRIPT INI ADA
 * Pada insiden 2026-07-25, verifikasi pasca-deploy berupa satu curl per URL
 * MEMBERI LAMPU HIJAU PALSU — kebetulan mengenai isolate yang sudah panas —
 * padahal deployment-nya rusak dan produksi mati beberapa saat kemudian.
 * Kegagalan startup hanya muncul ketika request mendarat di isolate yang BELUM
 * ada. Karena itu probe harus MEMAKSIMALKAN LAHIRNYA ISOLATE DINGIN:
 *   - banyak request        (40 per kelas route)
 *   - konkurensi            (10 sekaligus → isolate dipaksa lahir paralel)
 *   - tersebar dalam waktu  (4 gelombang, jeda 20 detik → menangkap isolate yang sudah dievakuasi)
 *   - cache-bust            (tanpa ini CDN melayani cache dan probe tidak mengukur apa pun)
 *
 * BATASAN YANG HARUS DISADARI
 * 1. Dari satu mesin, umumnya hanya satu colo Cloudflare yang tersentuh. Cakupan
 *    geografisnya lemah. Jalankan juga dari jaringan lain sebelum promosi, dan
 *    ulangi ~30 menit setelah deploy saat churn isolate alami terjadi.
 * 2. Probe membuktikan TIDAK TERLIHAT GAGAL — bukan membuktikan adanya headroom.
 *    check-bundle-budget.mjs mengukur SEBAB; script ini hanya mencicipi GEJALA.
 *    SMOKE HIJAU TIDAK BOLEH MEMBATALKAN ANGGARAN YANG MERAH.
 *
 * KEAMANAN DATA: GET SAJA, tidak pernah POST. Deployment preview memakai binding
 * D1/R2 yang SAMA dengan produksi, jadi request tulis akan mengubah data nyata.
 *
 * DUA MODE — KEDUANYA PERLU DIUKUR
 * Sejak cache edge dipasang (functions/_lib/edgeCache.js), satu angka saja
 * menyesatkan, jadi jangan pernah melaporkan salah satunya sendirian:
 *
 *   default (cache-bust aktif) → setiap probe URL unik ⇒ SELALU cache miss.
 *       Ini SKENARIO TERBURUK: mengukur jalur render yang tidak ter-cache.
 *       Angka ini tidak akan membaik hanya karena cache dipasang, dan memang
 *       tidak boleh membaik — ia mengukur biaya render yang masih ada.
 *
 *   --cached → URL tetap sama di seluruh gelombang ⇒ gelombang 1 mengisi cache,
 *       gelombang 2-4 seharusnya HIT. Ini PENGALAMAN PENGGUNA NYATA, karena
 *       pengunjung sungguhan memang meminta URL yang sama berulang kali.
 *
 * Pemakaian:
 *   node scripts/smoke-deploy.mjs                                  → produksi, terburuk
 *   node scripts/smoke-deploy.mjs https://salambumi.xyz --cached    → produksi, nyata
 *   node scripts/smoke-deploy.mjs https://<hash>.sbp-final.pages.dev → kanari preview
 */

const ARGS = process.argv.slice(2);
const CACHED_MODE = ARGS.includes('--cached');
const BASE = (ARGS.find(a => a.startsWith('http')) ?? 'https://salambumi.xyz').replace(/\/$/, '');

const WAVES = 4;              // gelombang terpisah waktu
const PER_WAVE = 10;          // request per kelas per gelombang (juga = konkurensi)
const WAVE_GAP_MS = 20_000;   // jeda antar gelombang
const TIMEOUT_MS = 30_000;

/**
 * Kelas route sengaja mencakup Functions DAN halaman SSR. Pada insiden itu
 * /api/* dan /sitemap.xml ikut mati — memeriksa halaman saja tidak cukup.
 */
const ROUTES = [
  { name: 'SSR beranda',        path: '/' },
  { name: 'SSR listing',        path: '/properties' },
  { name: 'SSR detail properti', path: '/dijual/rumah/daerah-istimewa-yogyakarta/kota-yogyakarta/wirobrajan/rumah-cantik-minimalis-di-perum-pakuncen-15-menit-ke-malioboro-dan-alun-alun-1c85dc', allow404: true },
  { name: 'Function + D1',      path: '/api/properties?limit=1' },
  { name: 'Function kedua',     path: '/api/tracking-config' },
  { name: 'Function sitemap',   path: '/sitemap.xml' },
  { name: 'Shell admin',        path: '/admin/login' },
  { name: 'KONTROL (non-Worker)', path: '/robots.txt', control: true },
];

// Penanda halaman interstitial Cloudflare. WAJIB diperiksa di BODY — 1102
// disajikan sebagai HTML dan status-nya saja bisa menyesatkan.
const FAIL_MARKERS = [
  'worker exceeded resource limits',
  'error code: 1102',
  'error 1102',
];

// Mode --cached memakai SATU nonce untuk seluruh run, bukan per-probe. Tujuannya
// agar run ini dimulai dari cache yang benar-benar dingin (gelombang 1 = MISS)
// lalu mengukur gelombang 2-4 sebagai HIT. Tanpa nonce, sisa cache dari run
// sebelumnya membuat gelombang 1 ikut HIT dan biaya render tidak pernah terlihat.
const NONCE_RUN = crypto.randomUUID();

function bust(path) {
  const sep = path.includes('?') ? '&' : '?';
  const nonce = CACHED_MODE ? NONCE_RUN : crypto.randomUUID();
  return `${BASE}${path}${sep}_smoke=${nonce}`;
}

async function probe(route) {
  const url = bust(route.path);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',                       // GET saja — lihat catatan keamanan data di atas
      redirect: 'follow',
      signal: ctrl.signal,
      headers: CACHED_MODE
        // Jangan kirim no-cache di mode ini: tujuannya justru mengukur cache.
        ? { 'User-Agent': 'SBP-Smoke/1' }
        : { 'Cache-Control': 'no-cache', 'User-Agent': 'SBP-Smoke/1' },
    });
    const body = await res.text().catch(() => '');
    const low = body.toLowerCase();
    const marker = FAIL_MARKERS.find(m => low.includes(m));
    const statusOk = res.ok || (route.allow404 && res.status === 404);
    return {
      ok: statusOk && !marker,
      status: res.status,
      colo: (res.headers.get('cf-ray') ?? '').split('-')[1] ?? '?',
      cache: res.headers.get('x-sbp-cache') ?? '-',
      reason: marker ? `body memuat "${marker}"` : (statusOk ? null : `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, status: 0, colo: '?', cache: '-', reason: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = new Map(ROUTES.map(r => [r.path, { route: r, sent: 0, failed: 0, statuses: new Map(), cache: new Map(), colos: new Set(), reasons: new Set() }]));

console.log(`Smoke test — ${BASE}`);
console.log(CACHED_MODE
  ? 'MODE --cached: URL identik sepanjang run → mengukur PENGALAMAN PENGGUNA NYATA (cache aktif).'
  : 'MODE default: setiap probe URL unik → selalu cache miss → mengukur SKENARIO TERBURUK (jalur render).');
console.log(`${WAVES} gelombang × ${PER_WAVE} probe × ${ROUTES.length} kelas = ${WAVES * PER_WAVE * ROUTES.length} request total`);
console.log('='.repeat(74));

for (let w = 1; w <= WAVES; w++) {
  process.stdout.write(`Gelombang ${w}/${WAVES} `);
  // Semua kelas × PER_WAVE dilepas bersamaan → konkurensi maksimum → isolate dingin.
  const batch = ROUTES.flatMap(r => Array.from({ length: PER_WAVE }, () => probe(r).then(res => [r, res])));
  for (const [route, res] of await Promise.all(batch)) {
    const acc = results.get(route.path);
    acc.sent++;
    acc.statuses.set(res.status, (acc.statuses.get(res.status) ?? 0) + 1);
    acc.cache.set(res.cache, (acc.cache.get(res.cache) ?? 0) + 1);
    acc.colos.add(res.colo);
    if (!res.ok) { acc.failed++; if (res.reason) acc.reasons.add(res.reason); }
  }
  console.log('selesai');
  if (w < WAVES) await sleep(WAVE_GAP_MS);
}

console.log(`\n${'='.repeat(74)}`);
let totalFailed = 0;
let controlFailed = false;

for (const [, acc] of results) {
  const statuses = [...acc.statuses.entries()].map(([s, n]) => `${s}×${n}`).join(' ');
  const mark = acc.failed === 0 ? 'OK  ' : 'GAGAL';
  const cacheRingkas = [...acc.cache.entries()].map(([c, n]) => `${c}×${n}`).join(' ');
  console.log(`${mark} ${acc.route.name.padEnd(24)} ${String(acc.sent - acc.failed).padStart(3)}/${acc.sent}  [${statuses}]  cache:[${cacheRingkas}]  colo:${[...acc.colos].join(',')}`);
  if (acc.reasons.size > 0) console.log(`      sebab: ${[...acc.reasons].join(' | ')}`);
  totalFailed += acc.failed;
  if (acc.failed > 0 && acc.route.control) controlFailed = true;
}

const allColos = new Set([...results.values()].flatMap(a => [...a.colos]));
console.log(`\ncolo berbeda tersentuh: ${allColos.size} (${[...allColos].join(', ')})`);
if (allColos.size <= 1) {
  console.log('CATATAN: hanya satu colo tersentuh — cakupan geografis lemah. Ulangi dari jaringan lain dan ~30 menit lagi.');
}

if (controlFailed) {
  console.error('\nKONTROL /robots.txt ikut gagal — masalahnya kemungkinan besar di edge/DNS Cloudflare, BUKAN bundle Worker Anda.');
}

if (totalFailed > 0) {
  console.error(`\nGAGAL — ${totalFailed} dari ${WAVES * PER_WAVE * ROUTES.length} probe gagal. JANGAN promosikan deployment ini.`);
  process.exit(1);
}

console.log('\nLULUS — nol kegagalan. Ingat: ini membuktikan tidak terlihat gagal, bukan membuktikan headroom.');
