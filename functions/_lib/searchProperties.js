// Reusable property search untuk dipakai chat endpoint + future use.
// Logic filter diadaptasi dari functions/api/properties/index.js.

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

  // lokasi
  if (params.kabupaten) { conditions.push('LOWER(p.kabupaten) = LOWER(?)'); bindings.push(String(params.kabupaten)); }
  if (params.kecamatan) { conditions.push('LOWER(p.kecamatan) = LOWER(?)'); bindings.push(String(params.kecamatan)); }

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
    conditions.push('(LOWER(p.title) LIKE ? OR LOWER(p.deskripsi) LIKE ? OR LOWER(p.kode_listing) LIKE ?)');
    const like = `%${textQ.toLowerCase()}%`;
    bindings.push(like, like, like);
  }

  const orderBy = ORDER_MAP[params.sort] ?? ORDER_MAP.terbaru;
  const limit   = Math.min(Math.max(1, parseInt(params.limit, 10) || 5), 10);
  const where   = conditions.join(' AND ');

  const sql = `
    SELECT
      p.id, p.slug, p.title, p.jenis_properti, p.tujuan,
      p.harga, p.harga_sewa_tahun, p.nego,
      p.kecamatan, p.kabupaten,
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
    const res = await env.DB.prepare(sql).bind(...bindings, limit).all();
    return res.results ?? [];
  } catch (err) {
    console.error('[searchProperties] DB error:', err.message);
    return [];
  }
}
