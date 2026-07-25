// GET  /api/admin/properties — semua properti + cover image
// POST /api/admin/properties — buat properti baru (draft)
// Auth: _middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../_shared/response.js';
import { generateMetaSeo } from '../../../_lib/metaSeo.js';
import { parseGmapsCoords } from '../../../_lib/parseGmapsCoords.js';
import { nextKodeSeq, fmtSeq, isUniqueErr } from '../../../_lib/kodeSeq.js';
import { normalisasiHarga } from '../../../_lib/hargaTanah.js';

// Plafon baris untuk daftar admin (belum ada paginasi). 533 properti per Juli 2026.
// Response menyertakan total sebenarnya + flag truncated supaya pemotongan terlihat
// begitu angkanya terlampaui, bukan terpangkas diam-diam.
const MAX_ROWS = 1000;

const VALID_STATUSES = new Set(['draft', 'published', 'sold', 'archived']);
const VALID_JENIS = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];
const VALID_TUJUAN = ['dijual','disewa','dijual_disewa'];

function sanitize(val, max = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, max);
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function today8() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
}


const BADGE_COL_FILTER = {
  pilihan:  'properti_pilihan',
  premium:  'badge_premium',
  featured: 'badge_featured',
  hot:      'badge_hot',
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? '';
  const jenisFilter = (url.searchParams.get('jenis') ?? '').toLowerCase();
  const provinsiFilter = url.searchParams.get('provinsi') ?? '';
  const kabupatenFilter = url.searchParams.get('kabupaten') ?? '';
  const kecamatanFilter = url.searchParams.get('kecamatan') ?? '';
  const kelurahanFilter = url.searchParams.get('kelurahan') ?? '';
  const hargaMin = parseInt(url.searchParams.get('harga_min') ?? '', 10);
  const hargaMax = parseInt(url.searchParams.get('harga_max') ?? '', 10);
  const soldFilter = url.searchParams.get('sold');
  const badgeFilter = (url.searchParams.get('badge') ?? '')
    .split(',').map(b => b.trim()).filter(b => BADGE_COL_FILTER[b]);

  const conditions = [];
  const bindings = [];

  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    conditions.push('p.status_publish = ?');
    bindings.push(statusFilter);
  }

  if (jenisFilter && VALID_JENIS.includes(jenisFilter)) {
    conditions.push('LOWER(p.jenis_properti) = ?');
    bindings.push(jenisFilter);
  }

  if (provinsiFilter) {
    conditions.push('LOWER(p.provinsi) = LOWER(?)');
    bindings.push(provinsiFilter);
  }

  if (kabupatenFilter) {
    conditions.push('LOWER(p.kabupaten) = LOWER(?)');
    bindings.push(kabupatenFilter);
  }

  if (kecamatanFilter) {
    conditions.push('LOWER(p.kecamatan) = LOWER(?)');
    bindings.push(kecamatanFilter);
  }

  if (kelurahanFilter) {
    conditions.push('LOWER(p.kelurahan) = LOWER(?)');
    bindings.push(kelurahanFilter);
  }

  if (Number.isInteger(hargaMin) && hargaMin > 0) { conditions.push('p.harga >= ?'); bindings.push(hargaMin); }
  if (Number.isInteger(hargaMax) && hargaMax > 0) { conditions.push('p.harga <= ?'); bindings.push(hargaMax); }

  if (soldFilter === '1') conditions.push('p.status_sold = 1');
  else if (soldFilter === '0') conditions.push('p.status_sold = 0');

  // Badge filter: OR antar-badge yang dipilih (properti "premium ATAU hot", bukan "premium DAN hot")
  if (badgeFilter.length > 0) {
    conditions.push(`(${badgeFilter.map(b => `p.${BADGE_COL_FILTER[b]} = 1`).join(' OR ')})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      p.id, p.kode_listing, p.title, p.slug,
      p.jenis_properti, p.tujuan,
      p.harga, p.nego, p.nett,
      p.kelurahan, p.kecamatan, p.kabupaten, p.provinsi,
      p.latitude, p.longitude,
      p.status_publish, p.status_sold,
      p.badge_premium, p.badge_featured, p.badge_hot, p.properti_pilihan,
      p.viralframe_dismissed_at,
      p.created_at, p.updated_at, p.published_at,
      (SELECT url_webp FROM property_images
         WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url,
      (SELECT COUNT(*) FROM property_images WHERE property_id = p.id) AS jumlah_foto
    FROM properties p
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ${MAX_ROWS}
  `;

  try {
    // COUNT terpisah: tanpa ini `total` dihitung dari hasil yang SUDAH terpotong,
    // sehingga saat data menembus MAX_ROWS daftarnya terpangkas diam-diam dan
    // admin mengira itulah seluruh isinya.
    const countSql = `SELECT COUNT(*) AS cnt FROM properties p ${where}`;

    const stmtList  = env.DB.prepare(sql);
    const stmtCount = env.DB.prepare(countSql);

    const [result, countRow] = await Promise.all([
      bindings.length > 0 ? stmtList.bind(...bindings).all()    : stmtList.all(),
      bindings.length > 0 ? stmtCount.bind(...bindings).first() : stmtCount.first(),
    ]);

    const rows  = result.results ?? [];
    const total = countRow?.cnt ?? rows.length;

    return jsonOk({
      properties: rows,
      total,                            // jumlah SEBENARNYA yang cocok filter
      ditampilkan: rows.length,
      truncated: total > rows.length,   // frontend menampilkan peringatan bila true
      max_rows: MAX_ROWS,
    });
  } catch (err) {
    console.error('[admin properties list]', err.message);
    return jsonError('Gagal mengambil data properti', 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/properties — buat properti baru (draft)
// ═══════════════════════════════════════════════════════════════════
export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const title        = sanitize(body.title ?? '', 200);
  const jenis        = sanitize(body.jenis_properti ?? '', 30);
  const tujuan       = sanitize(body.tujuan ?? '', 20);
  const harga        = body.harga != null ? parseInt(String(body.harga), 10) : 0;
  const kecamatan    = sanitize(body.kecamatan ?? '', 100);
  const kabupaten    = sanitize(body.kabupaten ?? '', 100);
  const provinsi     = sanitize(body.provinsi ?? 'DI Yogyakarta', 100) || 'DI Yogyakarta';
  const luas_tanah   = parseInt(body.luas_tanah, 10) || null;
  const luas_bangunan = parseInt(body.luas_bangunan, 10) || null;
  const nego         = body.nego ? 1 : 0;
  const gmaps_link   = body.gmaps_link ? sanitize(String(body.gmaps_link), 500) || null : null;

  const errors = {};
  if (!title)                    errors.title          = 'Judul properti wajib diisi';
  if (!VALID_JENIS.includes(jenis))  errors.jenis_properti = 'jenis_properti tidak valid';
  if (!VALID_TUJUAN.includes(tujuan)) errors.tujuan        = 'tujuan harus: dijual, disewa, atau dijual_disewa';
  if (!Number.isInteger(harga) || harga < 0) errors.harga  = 'Harga harus angka non-negatif';

  // Harga total vs per-m² — lihat functions/_lib/hargaTanah.js. Endpoint create
  // sebelumnya sama sekali TIDAK mengisi harga_per_m2 (kolomnya tidak ada di
  // INSERT), sehingga properti baru selalu lahir dengan per-m² kosong sampai
  // ada PATCH pertama. Sekarang keduanya dihitung di satu tempat yang sama
  // dengan endpoint update, jadi keduanya tidak bisa berbeda perilaku.
  const hrg = normalisasiHarga({
    jenis_properti: jenis,
    luas_tanah,
    harga,
    harga_per_m2: body.harga_per_m2,
    harga_mode: body.harga_mode,
  });
  if (!hrg.ok) errors.harga = hrg.error;

  if (Object.keys(errors).length > 0) return jsonError('Validasi gagal', 422, errors);

  const date8  = today8();
  const prefix = `SBP-${date8}-`;

  let seqN, kode_listing, slug;
  try {
    seqN         = await nextKodeSeq(env.DB, 'properties', 'kode_listing', prefix);
    kode_listing = `${prefix}${fmtSeq(seqN)}`;
    const rand   = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const base   = slugify(title);
    slug         = base ? `${base}-${rand}` : `properti-${rand}`;
  } catch (err) {
    console.error('[admin property POST] generate kode:', err.message);
    return jsonError('Gagal generate kode listing', 500);
  }

  let geo_lat = null, geo_lng = null;
  if (gmaps_link) {
    const geo = await parseGmapsCoords(gmaps_link);
    geo_lat = geo.latitude;
    geo_lng = geo.longitude;
  }

  let detailsVal = null;
  if (body.details != null && typeof body.details === 'object') {
    try { detailsVal = JSON.stringify(body.details); } catch { /* ignore */ }
  }

  const meta = !body.meta_title
    // hrg.harga, BUKAN harga mentah: pada mode per-m² nilai mentahnya adalah
    // harga per meter, sehingga meta SEO akan mengiklankan harga yang salah.
    ? generateMetaSeo({ jenis_properti: jenis, tujuan, harga: hrg.harga, kecamatan, kabupaten, luas_tanah, luas_bangunan, nego })
    : { meta_title: sanitize(body.meta_title, 60), meta_description: sanitize(body.meta_description ?? '', 155) };

  try {
    const insertProperty = () => env.DB.prepare(`
      INSERT INTO properties
        (kode_listing, title, slug, jenis_properti, tujuan,
         harga, harga_per_m2, harga_mode, luas_tanah,
         provinsi, kabupaten, kecamatan, kelurahan, alamat,
         gmaps_link, latitude, longitude,
         details, meta_title, meta_description,
         status_publish, created_at, updated_at)
      VALUES (?,?,?,?,?,  ?,?,?,?,  ?,?,?,?,?,  ?,?,?,  ?,?,?,  'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(kode_listing, title, slug, jenis, tujuan,
            hrg.harga, hrg.harga_per_m2, hrg.harga_mode, luas_tanah,
            provinsi, kabupaten, kecamatan, '', '', gmaps_link, geo_lat, geo_lng,
            detailsVal, meta.meta_title, meta.meta_description).run();

    // Retry saat tabrakan UNIQUE kode_listing (request paralel dapat sequence sama)
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await insertProperty();
        break;
      } catch (err) {
        if (!isUniqueErr(err) || attempt >= 3) throw err;
        kode_listing = `${prefix}${fmtSeq(seqN + attempt + 1)}`;
      }
    }

    const newId = result.meta?.last_row_id;
    return jsonCreated({ id: newId, kode_listing, slug });
  } catch (err) {
    console.error('[admin property POST]', err.message);
    return jsonError('Gagal menyimpan properti', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
