/**
 * Klasifikasi parameter query — SATU SUMBER untuk backend (cache edge) dan
 * frontend (loader SSR). Diimpor natif oleh functions/, dan lewat Vite oleh
 * src/app/routes/ (pola CLAUDE.md, sama seperti waktu.js dan geoLandmarks.js).
 *
 * KENAPA DUA DAFTAR, BUKAN SATU
 * Keduanya menjawab pertanyaan yang berbeda dan TIDAK boleh disatukan:
 *
 *   TRACKING_PARAMS → "boleh dibuang dari CACHE KEY?"
 *       Dibuang supaya satu halaman tidak melahirkan satu entri cache per klik
 *       iklan. Tanpa ini hit rate trafik Meta Ads = 0%.
 *
 *   INERT_PARAMS    → "boleh diabaikan saat memutuskan SSR?"
 *       Superset dari TRACKING_PARAMS. Parameter di sini terbukti tidak
 *       memengaruhi hasil query, jadi kehadirannya tidak boleh membatalkan SSR.
 *
 * INSIDEN YANG MELAHIRKAN BERKAS INI (2026-07-26)
 * Cache key membuang `fbclid`, tapi loader /properties tetap melihatnya. Loader
 * menolak SSR untuk parameter yang tidak dikenal, sehingga pengunjung dari iklan
 * merender halaman KOSONG — dan halaman kosong itu tersimpan di bawah cache key
 * BERSIH lalu disajikan ke semua orang, termasuk Googlebot, selama TTL.
 * Terbukti: ?jenis=tanah&fbclid=X → 50 KB / 0 link properti, lalu ?jenis=tanah
 * bersih → HIT dengan isi kosong yang sama, sementara ?jenis=rumah yang belum
 * tersentuh → 258 KB / 40 link.
 *
 * Karena itu: apa pun yang dibuang dari cache key WAJIB juga inert bagi loader.
 * TRACKING_PARAMS ⊂ INERT_PARAMS adalah invarian, bukan kebetulan.
 */

/** Penanda sumber trafik. Tidak mengubah HTML sedikit pun. */
export const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'msclkid', 'igshid', 'ttclid', 'mc_cid', 'mc_eid',
];

/**
 * Parameter diagnostik milik kita sendiri. SENGAJA tidak masuk TRACKING_PARAMS:
 * scripts/smoke-deploy.mjs memakai `_smoke` untuk memaksa cache miss, jadi ia
 * HARUS tetap ada di cache key. Yang dibutuhkan hanyalah loader tidak
 * menganggapnya parameter asing — kalau tidak, smoke mengukur halaman kosong
 * yang murah alih-alih halaman penuh yang mahal (persis yang sempat terjadi).
 */
const DIAGNOSTIC_PARAMS = ['_smoke', '_v'];

/** Parameter yang kehadirannya tidak boleh membatalkan SSR. */
export const INERT_PARAMS = [...TRACKING_PARAMS, ...DIAGNOSTIC_PARAMS];

/** true bila param tidak memengaruhi hasil render sama sekali. */
export function isInertParam(key) {
  return INERT_PARAMS.includes(key);
}
