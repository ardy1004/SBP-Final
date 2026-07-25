/**
 * Cache response di edge lewat Cache API Cloudflare.
 *
 * KENAPA INI ADA
 * Paket Cloudflare Free memberi **10 ms CPU per request**. `renderToString` React
 * untuk halaman SSR di project ini tidak muat di 10 ms, sehingga sebagian request
 * dibunuh runtime dengan Error 1102 ("Worker exceeded resource limits").
 *
 * Bukti (smoke 320 probe ke produksi, 2026-07-26, konkurensi 10):
 *   /api/properties, /api/tracking-config  → 80/80 LOLOS
 *   /admin/login (skeleton clientOnly)     → 40/40 LOLOS
 *   /, /properties, detail properti        → gagal ~42% masing-masing
 *   /sitemap.xml (Function, rangkai 533+)  → gagal 47,5%
 * Semuanya di Worker yang sama. Yang lolos adalah yang CPU-nya kecil, yang gagal
 * adalah yang CPU-nya besar → batas yang kena adalah CPU per-request, BUKAN startup
 * dan BUKAN ukuran bundle.
 *
 * Cache hit melewatkan render/rangkai sepenuhnya. Biayanya tinggal lookup cache +
 * salin header — jauh di bawah 10 ms.
 *
 * CATATAN PENTING soal `Cache-Control` biasa: di model Cloudflare, Worker berjalan
 * SEBELUM cache CDN. Menyetel header `Cache-Control` pada response TIDAK mencegah
 * Worker dijalankan lagi, jadi tidak menolong sama sekali terhadap batas CPU.
 * Hanya Cache API (`caches.default`) yang menolong, dan itulah yang dipakai di sini.
 *
 * ATURAN: allowlist, bukan blocklist. Lihat NEVER_CACHE_PREFIXES.
 */

/**
 * Path yang TIDAK BOLEH masuk cache dalam kondisi apa pun.
 * - /sign   : merender NIK terdekripsi (PII). Kebocoran ke cache bersama = insiden data.
 * - /admin  : konten per-sesi.
 * - /api    : dinamis; sebagian menulis. (Tidak lewat catch-all, tapi didaftarkan
 *             di sini supaya aturannya satu tempat bila helper dipakai di endpoint lain.)
 * - /titip-jual : alur form multi-langkah dengan state.
 */
export const NEVER_CACHE_PREFIXES = ['/admin', '/api', '/sign', '/titip-jual'];

/**
 * Parameter yang hanya menandai sumber trafik dan tidak mengubah HTML sedikit pun.
 * Dibuang dari cache key supaya trafik iklan Meta (setiap klik membawa fbclid unik)
 * tidak melahirkan satu entri cache per klik — tanpa ini hit rate iklan = 0%.
 */
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'msclkid', 'igshid', 'ttclid', 'mc_cid', 'mc_eid',
];

/** Normalisasi URL menjadi cache key yang stabil. */
export function cacheKeyUrl(rawUrl) {
  const u = new URL(rawUrl);
  for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
  u.searchParams.sort();   // ?a=1&b=2 dan ?b=2&a=1 harus satu entri
  u.hash = '';
  return u.toString();
}

/** Boleh dilayani/disimpan dari cache? Dievaluasi atas REQUEST. */
export function bolehDicache(request) {
  if (request.method !== 'GET') return false;

  let pathname;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return false;   // URL tak terparse → jangan ambil risiko
  }

  // Cocokkan segmen penuh, bukan awalan string mentah: '/administrasi' JANGAN
  // ikut tersaring oleh '/admin', tapi '/admin' dan '/admin/leads' harus tersaring.
  for (const p of NEVER_CACHE_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + '/')) return false;
  }

  // Pengunjung dengan sesi admin aktif tidak boleh dilayani dari cache bersama,
  // dan response-nya tidak boleh mengisi cache bersama.
  const cookie = request.headers.get('Cookie') || '';
  if (cookie.includes('sbp_session')) return false;

  return true;
}

/** Boleh disimpan? Dievaluasi atas RESPONSE. */
function responseLayakSimpan(response) {
  if (response.status !== 200) return false;              // 5xx/redirect/404 jangan diabadikan
  if (response.headers.has('Set-Cookie')) return false;   // jangan bagikan cookie ke pengunjung lain
  return true;
}

/** Tandai response dengan status cache. Header response dari cache immutable → salin dulu. */
function tandai(response, status) {
  const out = new Response(response.body, response);
  out.headers.set('X-SBP-Cache', status);
  return out;
}

/**
 * Bungkus produksi response dengan cache edge.
 *
 * @param {object} context  Pages Functions context (butuh .request dan .waitUntil)
 * @param {{ ttl: number }} opts  ttl dalam detik
 * @param {() => Promise<Response>} produce  penghasil response asli (mahal)
 *
 * Header `X-SBP-Cache` yang dikembalikan:
 *   HIT    dilayani dari cache, render dilewati
 *   MISS   dirender lalu disimpan
 *   SKIP   dirender, tidak layak disimpan (status ≠ 200 atau ada Set-Cookie)
 *   BYPASS path/metode/cookie tidak memenuhi syarat cache
 *   OFF    Cache API tidak tersedia di runtime ini (dev lokal, *.pages.dev)
 */
export async function withEdgeCache(context, opts, produce) {
  const { request } = context;

  if (!bolehDicache(request)) {
    return tandai(await produce(), 'BYPASS');
  }

  // Cache API tidak ada di sebagian runtime (miniflare lokal, dan diduga *.pages.dev).
  // Jangan sampai itu menjatuhkan situs — cukup lewati cache.
  const cache = globalThis.caches && globalThis.caches.default;
  if (!cache) {
    return tandai(await produce(), 'OFF');
  }

  const key = new Request(cacheKeyUrl(request.url), { method: 'GET' });

  try {
    const hit = await cache.match(key);
    if (hit) return tandai(hit, 'HIT');
  } catch {
    // Kegagalan lookup bukan alasan menggagalkan request — lanjut render saja.
  }

  const response = await produce();
  if (!responseLayakSimpan(response)) {
    return tandai(response, 'SKIP');
  }

  // s-maxage mengatur umur entri di dalam Cache API. max-age=0 menjaga browser
  // tetap merevalidasi supaya pengunjung tidak memegang HTML basi di disk sendiri.
  const cacheable = new Response(response.body, response);
  cacheable.headers.set('Cache-Control', `public, max-age=0, s-maxage=${opts.ttl}`);

  try {
    // clone() sebelum header X-SBP-Cache dipasang, supaya salinan di cache tidak
    // ikut membawa 'MISS' dan melaporkan MISS selamanya pada request berikutnya.
    context.waitUntil(cache.put(key, cacheable.clone()));
  } catch {
    // put gagal (mis. body sudah dikonsumsi) → tetap layani pengunjung.
  }

  cacheable.headers.set('X-SBP-Cache', 'MISS');
  return cacheable;
}
