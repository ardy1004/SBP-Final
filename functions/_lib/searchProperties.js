// Reusable property search untuk dipakai chat endpoint + future use.
// Logic filter diadaptasi dari functions/api/properties/index.js.

import { findLandmark, peringkatDekatLandmark } from './geoLandmarks.js';

const VALID_JENIS  = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
const VALID_TUJUAN = ['dijual','disewa','dijual_disewa'];
const ORDER_MAP    = {
  terbaru:  'p.properti_pilihan DESC, p.badge_premium DESC, p.published_at DESC',
  termurah: 'p.harga ASC, p.published_at DESC',
  termahal: 'p.harga DESC, p.published_at DESC',
  luas:     'p.luas_tanah DESC, p.published_at DESC',
};

/**
 * @param {object} env  - CF Workers env (env.DB = D1)
 * @param {object} params
 * @returns {Promise<object[]>} Array properti (max 10)
 */
export async function searchProperties(env, params = {}) {
  const conditions = ["p.status_publish = 'published'"];
  const bindings   = [];

  // tujuan
  const tujuan = VALID_TUJUAN.includes(params.tujuan) ? params.tujuan : null;
  if (tujuan) {
    if (tujuan === 'dijual') {
      conditions.push("(p.tujuan = 'dijual' OR p.tujuan = 'dijual_disewa')");
    } else if (tujuan === 'disewa') {
      conditions.push("(p.tujuan = 'disewa' OR p.tujuan = 'dijual_disewa')");
    } else {
      conditions.push("p.tujuan = ?");
      bindings.push(tujuan);
    }
  }

  // jenis (single)
  if (params.jenis && VALID_JENIS.includes(String(params.jenis).toLowerCase())) {
    conditions.push('p.jenis_properti = ?');
    bindings.push(String(params.jenis).toLowerCase());
  }

  // Landmark (mis. "dekat UGM") — radius asli lintas kecamatan, jauh lebih
  // akurat daripada AI menebak nama kecamatan dari pengetahuan umum. Terbukti
  // 2026-08-06: model menebak kecamatan='Sleman' untuk "kost dekat UGM",
  // padahal kost dekat UGM sebenarnya ada di Kecamatan Depok — kecamatan ibu
  // kota kabupaten (namanya sama dengan kabupatennya) itu jebakan tebakan
  // umum. Kalau landmark valid, filter administratif kabupaten/kecamatan
  // DIABAIKAN — radius yang menentukan, bukan batas kecamatan.
  const landmark = params.dekat_landmark ? findLandmark(String(params.dekat_landmark).toLowerCase()) : null;

  // lokasi — pakai LIKE agar cocok dengan "Kabupaten Sleman" maupun "Sleman".
  // Kalau kecamatan diisi, kabupaten DIABAIKAN — kecamatan sudah cukup presisi
  // (kecamatan selalu anak dari satu kabupaten tertentu), dan meng-AND-kan
  // keduanya berisiko kontradiksi kalau AI/user menebak kabupaten yang sedikit
  // meleset (mis. kecamatan='Sleman' + kabupaten='Yogyakarta' — Kecamatan Sleman
  // sebenarnya masuk Kabupaten Sleman, bukan Yogyakarta). Kontradiksi begini
  // selalu menghasilkan 0 baris walau datanya ada, dan chatbot AI terbukti
  // membuat kombinasi begini (diverifikasi 2026-08-06).
  if (!landmark) {
    if (params.kecamatan) {
      conditions.push('LOWER(p.kecamatan) LIKE ?');
      bindings.push(`%${String(params.kecamatan).toLowerCase()}%`);
    } else if (params.kabupaten) {
      conditions.push('LOWER(p.kabupaten) LIKE ?');
      bindings.push(`%${String(params.kabupaten).toLowerCase()}%`);
    }
  }

  // harga range
  const priceCol = tujuan === 'disewa' ? 'p.harga_sewa_tahun' : 'p.harga';
  const hargaMin = parseInt(params.harga_min, 10);
  const hargaMax = parseInt(params.harga_max, 10);
  if (hargaMin > 0) { conditions.push(`${priceCol} >= ?`); bindings.push(hargaMin); }
  if (hargaMax > 0) { conditions.push(`${priceCol} <= ?`); bindings.push(hargaMax); }

  // kamar tidur / mandi minimum
  const kt = parseInt(params.kt, 10);
  const km = parseInt(params.km, 10);
  if (kt > 0) { conditions.push('p.jumlah_kamar_tidur >= ?'); bindings.push(kt); }
  if (km > 0) { conditions.push('p.jumlah_kamar_mandi >= ?'); bindings.push(km); }

  // luas tanah / bangunan minimum
  const lt = parseInt(params.lt, 10);
  const lb = parseInt(params.lb, 10);
  if (lt > 0) { conditions.push('p.luas_tanah >= ?');    bindings.push(lt); }
  if (lb > 0) { conditions.push('p.luas_bangunan >= ?'); bindings.push(lb); }

  // keyword bebas
  const textQ = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  if (textQ) {
    conditions.push("(LOWER(p.title) LIKE ? ESCAPE '\\' OR LOWER(p.deskripsi) LIKE ? ESCAPE '\\' OR LOWER(p.kode_listing) LIKE ? ESCAPE '\\')");
    const like = `%${textQ.toLowerCase().replace(/[\\%_]/g, m => '\\' + m)}%`;
    bindings.push(like, like, like);
  }

  const orderBy = ORDER_MAP[params.sort] ?? ORDER_MAP.terbaru;
  const limit   = Math.min(Math.max(1, parseInt(params.limit, 10) || 5), 10);
  const where   = conditions.join(' AND ');

  // Mode landmark: ambil SELURUH kandidat (radius + judul yang menyaring, bukan
  // LIMIT SQL) — filter & urut dilakukan di JS di bawah, sama seperti
  // sitemap.xml.js (D1/SQLite standar tidak punya fungsi trig untuk haversine).
  //
  // ⚠️ Batas ini dulu 60 dan itu MEMOTONG DIAM-DIAM: inventori kost saja 184
  // baris, jadi chatbot hanya pernah menimbang 60 baris sembarang (urutan
  // orderBy) sebelum menyaring jarak — sementara halaman SEO memindai semuanya
  // dan karena itu melaporkan angka yang berbeda untuk pertanyaan yang sama.
  // 600 di atas total listing published (538) sehingga praktis "semua", tapi
  // tetap berpagar supaya tidak ikut membengkak kalau inventori melonjak.
  const fetchLimit = landmark ? 600 : limit;

  const sql = `
    SELECT
      p.id, p.slug, p.title, p.jenis_properti, p.tujuan,
      p.harga, p.harga_sewa_tahun, p.nego,
      p.provinsi, p.kecamatan, p.kabupaten,
      p.latitude, p.longitude,
      p.luas_tanah, p.luas_bangunan,
      p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
      p.legalitas,
      (SELECT url_webp FROM property_images
         WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url
    FROM properties p
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ?
  `;

  try {
    const res = await env.DB.prepare(sql).bind(...bindings, fetchLimit).all();
    const rows = res.results ?? [];
    if (!landmark) return rows;

    // Radius + sebutan di judul, bukan batas kecamatan — diperingkat oleh
    // helper bersama supaya chatbot dan halaman SEO tidak pernah lagi menjawab
    // beda untuk pertanyaan yang sama (override `sort` user: relevansi landmark
    // jadi prioritas begitu landmark disebut).
    return peringkatDekatLandmark(rows, landmark).slice(0, limit);
  } catch (err) {
    console.error('[searchProperties] DB error:', err.message);
    return [];
  }
}
