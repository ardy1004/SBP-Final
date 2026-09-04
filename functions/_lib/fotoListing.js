// Foto listing untuk ViralFrame — SATU definisi, dua pemanggil.
//
// ─── Kenapa modul ini ada ───────────────────────────────────────────────────
// `bahan.js` (panel Bahan) dan `jalankan.js` (stasiun Storyboard) dulu menulis
// query fotonya SENDIRI-SENDIRI, dan keduanya melenceng dengan cara yang tidak
// kelihatan:
//
//   bahan.js     WHERE property_id = ?                          LIMIT 14
//   jalankan.js  WHERE property_id = ? AND label_ruangan <> ''  LIMIT 14
//
// `LIMIT` berlaku SEBELUM penyaringan label di `bahan.js`, jadi untuk listing
// dengan lebih dari 14 foto (terukur: 14 listing, terbanyak 20 foto) panel
// menampilkan HIMPUNAN BERBEDA dari yang benar-benar dipakai storyboard. User
// menyetujui satu set foto lalu videonya dibuat dari set yang lain.
//
// Hitungan materialnya melenceng lebih parah: `bahan.js` menghitung "belum
// dinilai" dari 14 baris yang sudah terpotong, sedangkan `jalankan.js`
// menghitung SELURUH foto — sehingga panel bisa bilang "semua sudah dinilai"
// lalu stasiun Material tetap berjalan.
//
// Query yang ditulis dua kali PASTI melenceng. Perbaikannya dedup, bukan
// menyamakan dua salinan — pola yang sama dipakai `inAppBrowser.js` dan
// `viralframe.js` untuk kosakata lintas backend↔frontend.

/**
 * Berapa foto teratas yang dipertimbangkan storyboard.
 *
 * Bukan seluruh foto: prompt punya batas panjang, dan foto berskor rendah cuma
 * menambah kebisingan. 14 memberi ruang lebih dari cukup untuk 3 Part × 7 foto.
 */
export const MAKS_FOTO_STORYBOARD = 14;

/**
 * Foto BERLABEL yang benar-benar dipakai storyboard, urut kualitas.
 *
 * Skor visi lebih dulu daripada `is_cover`: cover dipilih karena menjual di
 * katalog, belum tentu bagus untuk gerak kamera (terlalu sempit, menghadap
 * dinding, sudah ada teks tertempel).
 */
export async function ambilFotoListing(env, propertyId) {
  const r = await env.DB.prepare(
    `SELECT id, url_webp, label_ruangan, vf_skor, vf_catatan, vf_dinilai_at, is_cover
       FROM property_images
      WHERE property_id = ?
        AND label_ruangan IS NOT NULL AND TRIM(label_ruangan) != ''
      ORDER BY COALESCE(vf_skor, 50) DESC, is_cover DESC, urutan ASC
      LIMIT ${MAKS_FOTO_STORYBOARD}`
  ).bind(propertyId).all();
  return r.results ?? [];
}

/**
 * Keadaan material listing — dihitung atas SELURUH foto, TANPA limit.
 *
 * ⚠️ Tanpa limit adalah intinya. Ini yang jadi GERBANG stasiun Material
 * (`belumDinilai > 0`), dan gerbang yang menghitung dari daftar terpotong akan
 * menyatakan "sudah selesai" pada listing yang masih punya foto belum dinilai
 * di luar 14 teratas.
 */
export async function hitungMaterial(env, propertyId) {
  const [label, angka] = await env.DB.batch([
    env.DB.prepare(
      `SELECT DISTINCT TRIM(label_ruangan) AS label
         FROM property_images
        WHERE property_id = ? AND label_ruangan IS NOT NULL AND TRIM(label_ruangan) != ''`
    ).bind(propertyId),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN vf_dinilai_at IS NULL THEN 1 ELSE 0 END) AS belum,
              SUM(CASE WHEN label_ruangan IS NOT NULL AND TRIM(label_ruangan) != '' THEN 1 ELSE 0 END) AS berlabel
         FROM property_images WHERE property_id = ?`
    ).bind(propertyId),
  ]);
  const daftar = (label.results ?? []).map(x => x.label).filter(Boolean);
  const a = angka.results?.[0] ?? {};
  return {
    daftar,
    labelUnik: daftar.length,
    totalFoto: a.total ?? 0,
    berlabel: a.berlabel ?? 0,
    belumDinilai: a.belum ?? 0,
  };
}
