import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Whitelist ORDER BY — tidak boleh dari input user langsung (SQL injection guard)
const ORDER_MAP = {
  terbaru:  'p.properti_pilihan DESC, p.badge_premium DESC, p.badge_featured DESC, p.badge_hot DESC, p.published_at DESC',
  termurah: 'p.harga ASC, p.published_at DESC',
  termahal: 'p.harga DESC, p.published_at DESC',
  luas:     'p.luas_tanah DESC, p.published_at DESC',
  yield:    'p.income_per_bulan DESC, p.published_at DESC',
};

const VALID_JENIS = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
const VALID_TUJUAN = ['dijual','disewa','dijual_disewa'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;

  // --- Pagination ---
  let page  = Math.max(1, parseInt(q.get('page')  ?? '1',  10) || 1);
  let limit = parseInt(q.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) limit = DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  // --- Sort (whitelist) ---
  const orderBy = ORDER_MAP[q.get('sort')] ?? ORDER_MAP.terbaru;

  // --- Build dynamic WHERE ---
  const conditions = ["p.status_publish = 'published'"];
  const bindings   = [];

  // tujuan: "dijual" → mencakup dijual + dijual_disewa
  const tujuan = q.get('tujuan');
  if (tujuan && VALID_TUJUAN.includes(tujuan)) {
    if (tujuan === 'dijual') {
      conditions.push("(p.tujuan = 'dijual' OR p.tujuan = 'dijual_disewa')");
    } else if (tujuan === 'disewa') {
      conditions.push("(p.tujuan = 'disewa' OR p.tujuan = 'dijual_disewa')");
    } else {
      conditions.push("p.tujuan = ?");
      bindings.push(tujuan);
    }
  }

  // jenis: comma-separated multi-select (mis. "rumah,kost,villa")
  const jenis = q.get('jenis');
  if (jenis) {
    const list = jenis.split(',').map(j => j.trim()).filter(j => VALID_JENIS.includes(j));
    if (list.length > 0) {
      conditions.push(`p.jenis_properti IN (${list.map(() => '?').join(',')})`);
      bindings.push(...list);
    }
  }

  // lokasi 4 level (case-insensitive — data seed huruf kapital, query bisa lowercase)
  const lokasi = { provinsi: q.get('provinsi'), kabupaten: q.get('kabupaten'), kecamatan: q.get('kecamatan'), kelurahan: q.get('kelurahan') };
  for (const [col, val] of Object.entries(lokasi)) {
    if (val) { conditions.push(`LOWER(p.${col}) = LOWER(?)`); bindings.push(val); }
  }

  // harga range — gunakan harga_sewa_tahun bila filter tujuan=disewa
  const priceCol = (tujuan === 'disewa') ? 'p.harga_sewa_tahun' : 'p.harga';
  const hargaMin = parseInt(q.get('harga_min') ?? '', 10);
  const hargaMax = parseInt(q.get('harga_max') ?? '', 10);
  if (hargaMin > 0) { conditions.push(`${priceCol} >= ?`); bindings.push(hargaMin); }
  if (hargaMax > 0) { conditions.push(`${priceCol} <= ?`); bindings.push(hargaMax); }

  // KT / KM minimum
  const kt = parseInt(q.get('kt') ?? '', 10);
  const km = parseInt(q.get('km') ?? '', 10);
  if (kt > 0) { conditions.push('p.jumlah_kamar_tidur >= ?'); bindings.push(kt); }
  if (km > 0) { conditions.push('p.jumlah_kamar_mandi >= ?'); bindings.push(km); }

  const where = conditions.join(' AND ');

  // --- Queries ---
  // Field alamat TIDAK disertakan (privat — hanya kecamatan+kabupaten yang tampil publik)
  // Field latitude/longitude TIDAK disertakan (terlalu presisi untuk listing publik)
  const sqlData = `
    SELECT
      p.id, p.kode_listing, p.title, p.slug,
      p.jenis_properti, p.tujuan,
      p.harga, p.harga_lama, p.harga_sewa_tahun,
      p.nego, p.nett, p.harga_per_m2,
      p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
      p.luas_tanah, p.luas_bangunan, p.lebar_depan, p.lantai,
      p.legalitas, p.status_legalitas, p.furnished,
      p.kecamatan, p.kabupaten, p.provinsi,
      p.badge_premium, p.badge_featured, p.badge_hot,
      p.status_sold, p.properti_pilihan, p.verified,
      p.income_per_bulan, p.pengeluaran_per_bulan,
      p.views_count, p.published_at, p.updated_at,
      (SELECT url_webp FROM property_images
         WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url,
      (SELECT alt_text  FROM property_images
         WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_alt
    FROM properties p
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const sqlCount = `SELECT COUNT(*) AS total FROM properties p WHERE ${where}`;

  try {
    const [dataRes, countRes] = await Promise.all([
      env.DB.prepare(sqlData).bind(...bindings, limit, offset).all(),
      env.DB.prepare(sqlCount).bind(...bindings).first(),
    ]);

    const total      = countRes?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    return jsonOk({
      items: dataRes.results,
      pagination: {
        total,
        page,
        limit,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev:  page > 1,
      },
    });
  } catch (err) {
    console.error('[properties/list] DB error:', err.message);
    return jsonError('Gagal mengambil data properti', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
