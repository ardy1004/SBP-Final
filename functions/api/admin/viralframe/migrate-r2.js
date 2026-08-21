// POST /api/admin/viralframe/migrate-r2?tulis=1&batch=5&poster=1
//   Pindahkan video Konten Agent dari Cloudinary ke bucket R2 sbp-video.
//   Sekali pakai — hapus setelah semua baris aktif pindah.
//
// DRY-RUN DEFAULT: tanpa `?tulis=1` endpoint ini TIDAK menulis apa pun, hanya
// melaporkan apa yang akan dikerjakan (pola sama dengan scripts/regen-meta-title.mjs).
//
// Yang SENGAJA tidak dilakukan:
//   • Baris di Sampah tidak disentuh. 106 baris itu sudah tayang dan akan
//     dihapus sendiri oleh cron purge-trash dalam ≤30 hari — memindahkannya
//     berarti membayar bandwidth Cloudinary untuk file yang sebentar lagi mati.
//   • TIDAK ada penghapusan aset Cloudinary. Aset lama dibiarkan hidup sebagai
//     jaring pengaman; `cloudinary_public_id` & `cloudinary_name` tetap tersimpan
//     di barisnya, jadi migrasi ini sepenuhnya bisa dibatalkan.
//   • Baris yang masih ditunggu tayang Buffer/Zernio dilewati — mengubah
//     `cloudinary_url` sebelum post terbit akan mematikan link medianya
//     (Buffer/Zernio hanya dititipi URL, tidak menyimpan salinan).
//
// Idempoten: baris yang sudah `storage='r2'` tidak pernah terpilih lagi, jadi
// aman dipanggil ulang setelah batch yang gagal di tengah.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { adaJadwalTertunda } from '../../../_lib/schedulerProviders.js';
import { kunciVideoBaru, urlPublik, r2Siap } from '../../../_lib/videoStorage.js';

// Batas aman terhadap wall-clock Worker 30 detik. Tiap item = 1 fetch + 1 put
// video (±20 MB) + 1 fetch + 1 put poster, dijalankan paralel antar item.
const BATCH_DEFAULT = 5;
const BATCH_MAX = 10;

// Salinan mini dari toImageThumbnailUrl() di src/app/lib/cloudinaryUrl.ts.
// Sengaja diduplikasi: functions/ DILARANG mengimpor dari src/app/, dan ini
// endpoint sekali pakai yang akan dihapus bersama sisa jalur Cloudinary.
function urlPosterCloudinary(videoUrl) {
  return videoUrl.replace(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i, '.jpg$2');
}

async function salinKeR2(env, sumberUrl, key, contentType) {
  const res = await fetch(sumberUrl);
  if (!res.ok) throw new Error(`Sumber tidak bisa diambil (HTTP ${res.status})`);
  // Streaming: body diteruskan langsung ke R2 tanpa arrayBuffer(). Mem-buffer
  // 20 MB di Worker tidak perlu dan membebani memori tanpa alasan.
  await env.VIDEO.put(key, res.body, { httpMetadata: { contentType } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const tulis = url.searchParams.get('tulis') === '1';
  const ikutPoster = url.searchParams.get('poster') !== '0';
  const batch = Math.min(parseInt(url.searchParams.get('batch') ?? '', 10) || BATCH_DEFAULT, BATCH_MAX);

  if (!r2Siap(env)) {
    return jsonError('Binding R2 "VIDEO" tidak ada di deployment ini — cek Dashboard → Pages → sbp-final → Settings → Functions → R2 bindings', 500);
  }

  try {
    const sisa = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM viralframe_agent_videos WHERE storage = 'cloudinary' AND trashed_at IS NULL`
    ).first();

    const res = await env.DB.prepare(
      `SELECT id, property_id, cloudinary_url, format
       FROM viralframe_agent_videos
       WHERE storage = 'cloudinary' AND trashed_at IS NULL
       ORDER BY id
       LIMIT ?`
    ).bind(batch).all();
    const kandidat = res.results ?? [];

    if (kandidat.length === 0) {
      return jsonOk({ tulis, sisa_sebelum: sisa?.n ?? 0, dipindah: 0, gagal: [], dilewati_tertunda: [], catatan: 'Tidak ada baris aktif yang masih di Cloudinary.' });
    }

    // Video yang masih ditunggu tayang tidak boleh berpindah URL sekarang.
    const tertundaFlags = await Promise.all(kandidat.map(r => adaJadwalTertunda(env, r.id)));
    const dilewatiTertunda = kandidat.filter((_, i) => tertundaFlags[i]).map(r => r.id);
    const siap = kandidat.filter((_, i) => !tertundaFlags[i]);

    if (!tulis) {
      return jsonOk({
        tulis: false,
        sisa_sebelum: sisa?.n ?? 0,
        akan_dipindah: siap.map(r => ({ id: r.id, property_id: r.property_id, dari: r.cloudinary_url })),
        dilewati_tertunda: dilewatiTertunda,
        ikut_poster: ikutPoster,
        catatan: 'DRY-RUN. Tambahkan ?tulis=1 untuk benar-benar memindahkan.',
      });
    }

    const berhasil = [];
    const gagal = [];

    await Promise.all(siap.map(async (row) => {
      try {
        const ext = (row.format && /^[a-z0-9]{2,5}$/i.test(row.format)) ? row.format.toLowerCase() : 'mp4';
        const { key, posterKey } = kunciVideoBaru(row.property_id, ext);

        await salinKeR2(env, row.cloudinary_url, key, `video/${ext === 'mov' ? 'quicktime' : ext}`);

        // Poster: mayoritas video aktif sudah punya turunan .jpg di Cloudinary
        // (160 derived sudah ada), jadi menyalinnya biasanya TIDAK menimbulkan
        // transformasi baru. Untuk yang belum, ini biaya sekali seumur hidup
        // yang menggantikan biaya berulang. Pakai ?poster=0 untuk melewatinya.
        let posterUrlBaru = null;
        if (ikutPoster) {
          try {
            await salinKeR2(env, urlPosterCloudinary(row.cloudinary_url), posterKey, 'image/jpeg');
            posterUrlBaru = urlPublik(env, posterKey);
          } catch (e) {
            // Poster gagal bukan alasan membatalkan pemindahan videonya.
            console.warn('[migrate-r2] poster gagal', row.id, e.message);
          }
        }

        await env.DB.prepare(
          `UPDATE viralframe_agent_videos
           SET storage = 'r2', r2_key = ?, poster_url = ?, cloudinary_url = ?
           WHERE id = ?`
        ).bind(key, posterUrlBaru, urlPublik(env, key), row.id).run();

        berhasil.push({ id: row.id, key, poster: !!posterUrlBaru });
      } catch (err) {
        console.error('[migrate-r2]', row.id, err.message);
        gagal.push({ id: row.id, error: err.message });
      }
    }));

    const sisaSesudah = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM viralframe_agent_videos WHERE storage = 'cloudinary' AND trashed_at IS NULL`
    ).first();

    return jsonOk({
      tulis: true,
      sisa_sebelum: sisa?.n ?? 0,
      sisa_sesudah: sisaSesudah?.n ?? 0,
      dipindah: berhasil.length,
      berhasil,
      gagal,
      dilewati_tertunda: dilewatiTertunda,
    });
  } catch (err) {
    console.error('[migrate-r2]', err.message);
    return jsonError('Gagal menjalankan migrasi', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
