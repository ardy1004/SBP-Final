// GET /api/admin/viralframe/thumbnail?property_id=&character_id=
// Bangun URL composite thumbnail via Cloudinary "fetch" delivery (tanpa upload,
// tanpa API secret — cuma butuh CLOUDINARY_CLOUD_NAME) — bukan AI image-gen,
// karena model image-gen terkenal buruk merender teks (judul/harga) yang legible.
// Background = foto berlabel "Fasad" (Label Foto, Step 0) + overlay foto karakter
// (kalau mode "Gunakan Karakter" dipilih) + teks judul/harga/spek. Harga turun
// (harga < harga_lama) otomatis terdeteksi dari data yang sudah ada, tanpa input manual.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

// Cloudinary text overlay: koma & slash di teks WAJIB di-escape ganda (bukan
// encodeURIComponent biasa) karena keduanya juga pemisah komponen transformasi URL.
function cloudinaryTextEncode(s) {
  return encodeURIComponent(String(s))
    .replace(/%2C/g, '%252C')
    .replace(/\//g, '%252F');
}

function formatRupiahSingkat(n) {
  if (!n) return '';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}Jt`;
  return String(n);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const propertyId = parseInt(url.searchParams.get('property_id') ?? '', 10);
  const characterId = parseInt(url.searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 400);

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return jsonError('Cloudinary belum dikonfigurasi', 500);

  try {
    const property = await env.DB.prepare(
      `SELECT title, harga, harga_lama, jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan
       FROM properties WHERE id = ?`
    ).bind(propertyId).first();
    if (!property) return jsonError('Properti tidak ditemukan', 404);

    const fasad = await env.DB.prepare(
      `SELECT url_webp FROM property_images WHERE property_id = ? AND label_ruangan = 'Fasad' ORDER BY urutan ASC LIMIT 1`
    ).bind(propertyId).first();
    if (!fasad) return jsonError('Belum ada foto berlabel "Fasad" — label dulu di Step 0 (Label Foto)', 422);

    let karakter = null;
    if (Number.isInteger(characterId) && characterId > 0) {
      karakter = await env.DB.prepare(
        `SELECT foto_url, nama FROM viralframe_characters WHERE id = ?`
      ).bind(characterId).first();
    }

    const origin = url.origin;
    const fasadUrl = `${origin}/api/media?key=${encodeURIComponent(fasad.url_webp)}`;

    const hargaTurun = !!(property.harga_lama && property.harga > 0 && property.harga_lama > property.harga);
    const hargaText = hargaTurun
      ? `TURUN HARGA! Rp${formatRupiahSingkat(property.harga_lama)} -> Rp${formatRupiahSingkat(property.harga)}`
      : `Rp${formatRupiahSingkat(property.harga)}`;
    const specText = [
      property.luas_tanah ? `LT ${property.luas_tanah}m2` : null,
      property.luas_bangunan ? `LB ${property.luas_bangunan}m2` : null,
      property.jumlah_kamar_tidur ? `KT ${property.jumlah_kamar_tidur}` : null,
      property.jumlah_kamar_mandi ? `KM ${property.jumlah_kamar_mandi}` : null,
    ].filter(Boolean).join(' | ');

    // Rasio 4:5 (1080x1350) — aman dipakai IG feed/thumbnail Reels & FB.
    const layers = [
      'w_1080,h_1350,c_fill,g_auto,q_auto,f_auto',
      'l_gradient_fade,y_-300,o_60/fl_layer_apply',
    ];

    if (karakter?.foto_url) {
      const charUrl = `${origin}/api/media?key=${encodeURIComponent(karakter.foto_url)}`;
      layers.push(`l_fetch:${encodeURIComponent(charUrl)},w_380,c_fill,g_face,r_max,e_improve/fl_layer_apply,g_south_west,x_30,y_30`);
    }

    layers.push(`l_text:Arial_64_bold:${cloudinaryTextEncode(String(property.title).slice(0, 60))},co_white,w_950,c_fit/fl_layer_apply,g_south,y_260`);
    layers.push(`l_text:Arial_52_bold:${cloudinaryTextEncode(hargaText)},co_rgb:FFD700,w_950,c_fit/fl_layer_apply,g_south,y_180`);
    if (specText) {
      layers.push(`l_text:Arial_36:${cloudinaryTextEncode(specText)},co_white,w_950,c_fit/fl_layer_apply,g_south,y_120`);
    }

    const thumbnailUrl = `https://res.cloudinary.com/${cloudName}/image/fetch/${layers.join('/')}/${encodeURIComponent(fasadUrl)}`;

    return jsonOk({
      thumbnail_url: thumbnailUrl,
      harga_turun: hargaTurun,
      harga_text: hargaText,
      spec_text: specText,
      has_character: !!karakter?.foto_url,
    });
  } catch (err) {
    console.error('[viralframe thumbnail]', err.message);
    return jsonError('Gagal membangun thumbnail', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
