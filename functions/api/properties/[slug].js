import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';
import { SQL_TANGGAL_WIB } from '../../_lib/waktu.js';

// Skor investasi 1–5 bintang berdasarkan yield (spec 8.4)
function hitungSkorInvestasi(yieldPersen) {
  if (yieldPersen >= 8) return 5;
  if (yieldPersen >= 6) return 4;
  if (yieldPersen >= 4) return 3;
  if (yieldPersen >= 2) return 2;
  return 1;
}

function hitungInvestmentIntelligence(property) {
  const { income_per_bulan, pengeluaran_per_bulan, harga } = property;
  if (!income_per_bulan || !harga) return null;

  const pengeluaran      = pengeluaran_per_bulan ?? 0;
  const bersihPerBulan   = income_per_bulan - pengeluaran;
  const bersihPerTahun   = bersihPerBulan * 12;
  const grossPerTahun    = income_per_bulan * 12;

  if (bersihPerTahun <= 0 || harga <= 0) return null;

  const yieldPersen    = (bersihPerTahun / harga) * 100;
  const capRatePersen  = (grossPerTahun  / harga) * 100;
  const paybackTahun   = harga / bersihPerTahun;

  return {
    yield_persen:            Math.round(yieldPersen    * 100) / 100,
    payback_tahun:           Math.round(paybackTahun   * 100) / 100,
    cap_rate_persen:         Math.round(capRatePersen  * 100) / 100,
    income_bersih_per_bulan: bersihPerBulan,
    income_bersih_per_tahun: bersihPerTahun,
    skor_investasi:          hitungSkorInvestasi(yieldPersen),
  };
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') {
    return jsonError('Slug tidak valid', 400);
  }

  try {
    // Ambil properti — sertakan koordinat (dibutuhkan peta + proximity engine)
    // Tetap TIDAK sertakan kolom `alamat` (privat, hanya kec+kab yang publik)
    const property = await env.DB.prepare(`
      SELECT
        id, kode_listing, title, slug,
        jenis_properti, tujuan,
        harga, harga_lama, harga_sewa_tahun, nego, nett, harga_per_m2,
        jumlah_kamar_tidur, jumlah_kamar_mandi,
        luas_tanah, luas_bangunan, lebar_depan, lantai,
        legalitas, status_legalitas, bank_agunan, outstanding_bank,
        jarak_sungai_m, jarak_makam_m, jarak_sutet_m, lebar_jalan_m,
        furnished,
        kecamatan, kabupaten, provinsi, kelurahan,
        latitude, longitude, gmaps_link,
        deskripsi, info_tambahan, alasan_dijual, video_youtube,
        income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
        badge_premium, badge_featured, badge_hot,
        status_sold, properti_pilihan, verified,
        views_count, status_publish,
        meta_title, meta_description,
        details,
        created_at, updated_at, published_at
      FROM properties
      WHERE slug = ? AND status_publish = 'published'
      LIMIT 1
    `).bind(slug).first();

    if (!property) {
      return jsonError(`Properti dengan slug "${slug}" tidak ditemukan`, 404);
    }

    // Ambil foto terurut (untuk galeri + lightbox)
    const imagesRes = await env.DB.prepare(`
      SELECT id, url_webp, alt_text, urutan, is_cover
      FROM property_images
      WHERE property_id = ?
      ORDER BY urutan ASC, id ASC
    `).bind(property.id).all();

    // Parse details JSON (stored as TEXT)
    let detailsParsed = null;
    if (property.details) {
      try { detailsParsed = JSON.parse(property.details); }
      catch { detailsParsed = null; }
    }

    // Hitung Investment Intelligence (hanya bila ada data income)
    const investmentIntelligence = hitungInvestmentIntelligence(property);

    // Increment views_count + upsert daily tracker — non-blocking
    context.waitUntil(
      Promise.all([
        env.DB.prepare('UPDATE properties SET views_count = views_count + 1 WHERE id = ?')
          .bind(property.id)
          .run()
          .catch(err => console.error('[views] increment failed:', err.message)),
        env.DB.prepare(`
          INSERT INTO property_view_daily (property_id, tanggal, views)
          VALUES (?, ${SQL_TANGGAL_WIB}, 1)
          ON CONFLICT(property_id, tanggal) DO UPDATE SET views = views + 1
        `)
          .bind(property.id)
          .run()
          .catch(err => console.error('[views_daily] upsert failed:', err.message)),
      ])
    );

    // Rakit response — hapus field internal, tambah computed fields
    const { details: _details, ...propertyClean } = property;

    return jsonOk({
      ...propertyClean,
      details: detailsParsed,
      images: imagesRes.results,
      investment_intelligence: investmentIntelligence,
    });

  } catch (err) {
    console.error('[properties/detail] DB error:', err.message);
    return jsonError('Gagal mengambil detail properti', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
