// GET /api/admin/viralframe/bahan?property_id=&character_id=
//
// STASIUN 0 — BAHAN. Apa yang akan dipakai membuat video, DITAMPILKAN SEBELUM
// dibuat, dan bisa dikoreksi manusia.
//
// ─── Kenapa ini endpoint tersendiri, bukan bagian dari pesanan ───────────────
// Panel Bahan muncul saat listing baru dipilih — sebelum user menekan apa pun
// dan sebelum satu baris pesanan pun ditulis. Menjadikannya bagian dari alur
// pesanan berarti membuat baris di database hanya untuk MELIHAT, dan baris itu
// akan menumpuk setiap kali user berpindah-pindah listing.
//
// Nol panggilan AI: seluruh isinya sudah ada di D1 (kolom `properties` diisi
// manusia, `property_images.vf_*` diisi stasiun Material). Lihat komentar di
// functions/_lib/dnaProduk.js untuk alasan lengkapnya.
//
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { rakitDnaProduk, rakitDnaAgent } from '../../../_lib/dnaProduk.js';
import { FLOW, maksVariasi } from '../../../_lib/viralframe.js';
import { ambilFotoListing, hitungMaterial } from '../../../_lib/fotoListing.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const propertyId = parseInt(url.searchParams.get('property_id') ?? '', 10);
  const characterId = parseInt(url.searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 422);

  try {
    const [prop, agent, foto, material, riwayat] = await Promise.all([
      env.DB.prepare(
        `SELECT id, kode_listing, title, jenis_properti, tujuan, harga,
                kelurahan, kecamatan, kabupaten,
                luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
                lantai, lebar_depan, lebar_jalan_m, furnished, legalitas,
                income_per_bulan, harga_sewa_kamar_bulan, deskripsi
           FROM properties WHERE id = ?`
      ).bind(propertyId).first(),
      env.DB.prepare(
        'SELECT id, nama, gender, usia, etnik, style, ciri_fisik, foto_url FROM viralframe_characters WHERE id = ?'
      ).bind(characterId).first(),
      // ⚠️ Foto dan hitungan material diambil lewat `fotoListing.js` yang SAMA
      // dengan stasiun Storyboard. Sebelumnya panel ini menulis query sendiri
      // tanpa filter label tapi dengan `LIMIT 14` yang sama, sehingga untuk
      // listing berfoto >14 (terukur: 14 listing, terbanyak 20) ia menampilkan
      // himpunan BERBEDA dari yang benar-benar dipakai membuat video.
      ambilFotoListing(env, propertyId),
      hitungMaterial(env, propertyId),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM viralframe_orders
          WHERE property_id = ? AND variation_key IS NOT NULL`
      ).bind(propertyId).first(),
    ]);

    if (!prop) return jsonError('Properti tidak ditemukan', 404);
    if (!agent) return jsonError('Agent tidak ditemukan', 404);

    return jsonOk({
      dna: rakitDnaProduk({ prop, foto }),
      dna_agent: rakitDnaAgent(agent),
      foto: foto.map((f, i) => ({
        id: f.id,
        url: f.url_webp,
        label: f.label_ruangan ?? null,
        skor: f.vf_skor ?? null,
        catatan: f.vf_catatan ?? null,
        dinilai: f.vf_dinilai_at != null,
        // Peringkat inilah wujud keputusan "adaptif" soal batas ingredient Flow:
        // ≤refImageUtama teratas wajib dilampirkan, sisanya cadangan.
        utama: i < FLOW.refImageUtama,
      })),
      material: {
        total_foto: material.totalFoto,
        berlabel: material.berlabel,
        belum_dinilai: material.belumDinilai,
        label_unik: material.labelUnik,
        // Gerbang IDENTIK dengan stasiun Material di `jalankan.js` — keduanya
        // memakai hitungan yang sama dari modul yang sama, jadi panel tidak bisa
        // lagi bilang "sudah dinilai" untuk listing yang justru akan dinilai.
        perlu_dinilai: material.belumDinilai > 0,
      },
      rotasi: {
        sudah: riwayat?.n ?? 0,
        maks: maksVariasi(material.labelUnik),
      },
      flow: { utama: FLOW.refImageUtama, maks: FLOW.refImagePerPart },
    });
  } catch (err) {
    console.error('[vf bahan]', err.message);
    return jsonError('Gagal menyiapkan bahan', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
