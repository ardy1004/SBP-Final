// GET /api/admin/viralframe/performa?hari=30&platform=&character_id=
// Analisis performa konten dari metrik yang DITARIK OTOMATIS (tarik-metrik.js,
// migrasi 0061). Semua aturan statistik ada di analisisPerforma()
// (functions/_lib/metrikKonten.js) — endpoint ini cuma membaca & meneruskan.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { analisisPerforma } from '../../../_lib/metrikKonten.js';

const HARI_SAH = [14, 30, 60, 90];
const PLATFORM_SAH = ['youtube', 'tiktok', 'threads', 'facebook', 'instagram'];

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const hariMinta = parseInt(url.searchParams.get('hari') ?? '30', 10);
  const hari = HARI_SAH.includes(hariMinta) ? hariMinta : 30;
  const platform = PLATFORM_SAH.includes(url.searchParams.get('platform')) ? url.searchParams.get('platform') : null;
  const akun = parseInt(url.searchParams.get('character_id') ?? '', 10);
  const akunId = Number.isInteger(akun) && akun > 0 ? akun : null;

  try {
    const [res, agen, terakhir] = await Promise.all([
      env.DB.prepare(
        `SELECT pm.akun_id, pm.platform, pm.provider, pm.video_id, pm.terbit_at, pm.ditarik_at,
                pm.views, pm.likes, pm.comments, pm.shares, pm.saves, pm.avg_tonton_detik,
                pm.views_d7, pm.likes_d7, pm.comments_d7, pm.shares_d7, pm.saves_d7, pm.avg_tonton_d7,
                vp.character_id, vp.asal_character_id, vp.property_id, vp.kode_listing, vp.jenis_properti,
                vp.kecamatan, vp.harga, vp.durasi_detik, vp.poster_url, vp.order_id,
                vp.dna_sudut, vp.dna_hook, vp.dna_naratif, vp.dna_foto_pembuka, vp.dna_mood
           FROM viralframe_post_metrik pm
           LEFT JOIN viralframe_video_profil vp ON vp.video_id = pm.video_id
          WHERE julianday(pm.terbit_at) >= julianday('now', ?)
            AND (? IS NULL OR pm.platform = ?)
            AND (? IS NULL OR pm.akun_id = ?)`
      ).bind(`-${hari} days`, platform, platform, akunId, akunId).all(),
      env.DB.prepare('SELECT id, nama FROM viralframe_characters').all(),
      env.DB.prepare('SELECT MAX(ditarik_at) AS t FROM viralframe_post_metrik').first(),
    ]);
    const namaAgent = new Map((agen.results ?? []).map(a => [a.id, a.nama]));
    // Satu platform terpilih = tiap video paling banyak 1 platform; syarat
    // "≥ 2 platform" akan mengosongkan daftar teratas.
    const analisis = analisisPerforma(res.results ?? [], namaAgent, { minPlatformTop: platform ? 1 : 2 });
    return jsonOk({
      filter: { hari, platform, character_id: akunId },
      ditarik_terakhir: terakhir?.t ?? null,
      agent: (agen.results ?? []).map(a => ({ id: a.id, nama: a.nama })),
      ...analisis,
    });
  } catch (err) {
    // Tabel belum ada = migrasi 0061 belum diterapkan di DB ini.
    if (/no such table/i.test(err.message ?? '')) return jsonError('Data performa belum tersedia: migrasi database 0061 belum diterapkan.', 503);
    console.error('[vf performa]', err.message);
    return jsonError('Gagal memuat analisis performa', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
