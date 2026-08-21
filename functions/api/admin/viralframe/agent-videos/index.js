// GET  /api/admin/viralframe/agent-videos?character_id=&property_id=&limit=&offset=
//   List video "Konten Agent" (upload manual) — join karakter + properti.
// POST /api/admin/viralframe/agent-videos
//   Body JSON (bytes video sudah terupload langsung dari browser, endpoint ini
//   hanya mencatat metadata). Dua bentuk yang diterima:
//   • R2 (baru, via /r2-sign):
//     { character_id, property_id, storage: 'r2', r2_key, cloudinary_url (URL publik R2),
//       poster_url?, duration_sec?, bytes?, format?, width?, height?, caption?, hashtags? }
//   • Cloudinary (lama, via /cloudinary-sign): sama tapi dengan
//     { cloudinary_public_id, cloudinary_name } dan tanpa storage/r2_key.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { resolveCloudinaryByCloudName, cloudNameDariUrl, cekSpesialis } from '../../../../_lib/agentAccounts.js';
import { hapusAsetVideo } from '../../../../_lib/videoStorage.js';
import { logServerError } from '../../../../_lib/logError.js';

const SELECT_COLS = `
  v.id, v.character_id, v.property_id, v.caption, v.hashtags,
  v.cloudinary_public_id, v.cloudinary_url, v.cloudinary_name, v.resource_type,
  v.storage, v.r2_key, v.poster_url,
  v.duration_sec, v.bytes, v.format, v.width, v.height,
  v.status, v.scheduled_at, v.posted_at,
  v.post_url, v.platform_targets, v.trashed_at, v.created_at,
  v.views, v.likes, v.gaya, v.metrics_updated_at,
  c.nama AS character_nama, c.foto_url AS character_foto_url,
  p.kode_listing, p.title AS property_title,
  p.status_sold, p.badge_premium, p.badge_featured, p.badge_hot, p.properti_pilihan
`;

// Video lama (sebelum kolom width/height ada) tidak punya dimensi tersimpan.
// Backfill otomatis best-effort dari Cloudinary Admin API saat pertama kali
// terlihat lagi di GET, supaya langsung ikut terklasifikasi tanpa upload ulang.
// Maks backfill per request — Workers dibatasi ±50 subrequest; sisanya kebagian
// di request berikutnya (data lama makin lengkap tiap kali list dibuka).
const BACKFILL_MAX_PER_REQUEST = 10;

async function backfillDimensions(env, rows) {
  // HANYA untuk baris Cloudinary — baris R2 tidak punya akun Cloudinary untuk
  // ditanyai, dan dimensinya memang sudah dibaca di browser saat upload
  // (src/app/lib/posterVideo.ts). Tanpa filter ini setiap list akan menembak
  // Admin API untuk baris yang mustahil ditemukan di sana.
  const missing = rows
    .filter(r => r.storage !== 'r2' && (r.width == null || r.height == null))
    .slice(0, BACKFILL_MAX_PER_REQUEST);
  if (missing.length === 0) return;

  // Tiap agent bisa punya cloud sendiri (migrasi 0037), jadi kredensialnya
  // di-resolve PER CLOUD, bukan sekali dari env. Cache per request supaya 10
  // baris di cloud yang sama tidak jadi 10 query D1.
  const credsCache = new Map();
  const ambilCreds = async (cloudName) => {
    const kunci = cloudName ?? '';
    if (!credsCache.has(kunci)) credsCache.set(kunci, await resolveCloudinaryByCloudName(env, cloudName));
    return credsCache.get(kunci);
  };

  await Promise.all(missing.map(async (row) => {
    try {
      const creds = await ambilCreds(row.cloudinary_name);
      if (!creds) return; // cloud tidak dikenali / belum dikonfigurasi, lewati diam-diam
      const auth = 'Basic ' + btoa(`${creds.apiKey}:${creds.apiSecret}`);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${creds.cloudName}/resources/${row.resource_type || 'video'}/upload/${row.cloudinary_public_id}`,
        { headers: { Authorization: auth } }
      );
      if (!res.ok) return;
      const info = await res.json();
      if (!info.width || !info.height) return;
      await env.DB.prepare('UPDATE viralframe_agent_videos SET width = ?, height = ? WHERE id = ?')
        .bind(info.width, info.height, row.id).run();
      row.width = info.width;
      row.height = info.height;
    } catch (err) {
      console.error('[vf agent-videos] backfill dimensions', row.id, err.message);
    }
  }));
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const characterId = parseInt(url.searchParams.get('character_id') ?? '', 10);
  const propertyId = parseInt(url.searchParams.get('property_id') ?? '', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '', 10) || 100, 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '', 10) || 0;
  const view = url.searchParams.get('view') === 'trash' ? 'trash' : 'active';

  // ?counts_by=character_id — agregat GROUP BY di database, dipakai badge angka
  // sidebar (AdminViralFrameAgentVideosPage.tsx). Sebelumnya sidebar mengambil
  // SAMPAI 200 ROW MENTAH lalu menghitung sendiri di client — kalau video aktif
  // di seluruh karakter lebih dari 200, karakter yang datanya kepotong dapat
  // angka salah/kurang tanpa indikasi apa pun (audit 2026-07-28). Query agregat
  // tidak kena batas LIMIT sama sekali karena tidak mengambil baris individual.
  if (url.searchParams.get('counts_by') === 'character_id') {
    try {
      const res = await env.DB.prepare(
        `SELECT character_id, COUNT(*) AS count FROM viralframe_agent_videos
         WHERE ${view === 'trash' ? 'trashed_at IS NOT NULL' : 'trashed_at IS NULL'}
         GROUP BY character_id`
      ).all();
      return jsonOk({ counts: res.results ?? [] });
    } catch (err) {
      console.error('[vf agent-videos] GET counts_by', err.message);
      return jsonError('Gagal mengambil hitungan video per karakter', 500);
    }
  }

  const conds = [view === 'trash' ? 'v.trashed_at IS NOT NULL' : 'v.trashed_at IS NULL'];
  const binds = [];
  if (Number.isInteger(characterId) && characterId > 0) { conds.push('v.character_id = ?'); binds.push(characterId); }
  if (Number.isInteger(propertyId) && propertyId > 0) { conds.push('v.property_id = ?'); binds.push(propertyId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  const orderBy = view === 'trash' ? 'v.trashed_at DESC, v.id DESC' : 'v.created_at DESC, v.id DESC';

  try {
    const stmt = env.DB.prepare(
      `SELECT ${SELECT_COLS}
       FROM viralframe_agent_videos v
       JOIN viralframe_characters c ON c.id = v.character_id
       JOIN properties p ON p.id = v.property_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset);
    const res = await stmt.all();
    const items = res.results ?? [];
    await backfillDimensions(env, items);
    return jsonOk({ items });
  } catch (err) {
    console.error('[vf agent-videos] GET', err.message);
    return jsonError('Gagal mengambil daftar video agent', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const characterId = parseInt(body.character_id, 10);
  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 422);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);

  // `cloudinary_url` = URL PUBLIK video untuk kedua backend (lihat migrasi 0043).
  // Namanya dipertahankan supaya commit-agent.js, jadwalOtomatis.js & analytics.js
  // tidak perlu disentuh; baca sebagai "URL publik", bukan "URL Cloudinary".
  const cloudinaryUrl = typeof body.cloudinary_url === 'string' ? body.cloudinary_url.slice(0, 1000) : '';
  if (!cloudinaryUrl) return jsonError('cloudinary_url (URL publik video) wajib', 422);

  const storage = body.storage === 'r2' ? 'r2' : 'cloudinary';

  let cloudinaryPublicId = null;
  let cloudinaryName = null;
  let r2Key = null;

  if (storage === 'r2') {
    r2Key = typeof body.r2_key === 'string' ? body.r2_key.slice(0, 300) : '';
    if (!r2Key) return jsonError('r2_key wajib untuk storage r2', 422);
    // `cloudinary_public_id` NOT NULL sejak migrasi 0018 — jauh sebelum R2 ada.
    // Melonggarkannya butuh MEMBANGUN ULANG tabel (SQLite tidak punya ALTER
    // COLUMN), dan pola RENAME→CREATE→DROP itu persis yang nyaris menghapus data
    // di migrasi 0022. Jadi kolomnya diisi key R2-nya: maknanya tetap konsisten,
    // "identitas objek di storage-nya" — sejalan dengan `cloudinary_url` yang
    // juga sudah berarti "URL publik apa pun backend-nya" (migrasi 0043).
    // `r2_key` tetap kolom resmi yang dibaca hapusAsetVideo().
    cloudinaryPublicId = r2Key;
  } else {
    cloudinaryPublicId = typeof body.cloudinary_public_id === 'string' ? body.cloudinary_public_id.slice(0, 300) : '';
    if (!cloudinaryPublicId) return jsonError('cloudinary_public_id wajib', 422);
    // Cloud tempat file benar-benar mendarat. Diambil dari URL Cloudinary itu
    // sendiri (sumber paling tepercaya — client tidak bisa salah lapor), dengan
    // nilai kiriman client sebagai cadangan kalau bentuk URL-nya tak terduga.
    cloudinaryName = cloudNameDariUrl(cloudinaryUrl)
      ?? (typeof body.cloudinary_name === 'string' ? body.cloudinary_name.slice(0, 100) || null : null);
  }

  const posterUrl = typeof body.poster_url === 'string' ? body.poster_url.slice(0, 1000) || null : null;

  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 1000) || null : null;
  const hashtags = typeof body.hashtags === 'string' ? body.hashtags.slice(0, 500) || null : null;
  const resourceType = typeof body.resource_type === 'string' ? body.resource_type.slice(0, 20) : 'video';
  const durationSec = body.duration_sec != null ? Number(body.duration_sec) || null : null;
  const bytes = body.bytes != null ? (parseInt(body.bytes, 10) || null) : null;
  const format = typeof body.format === 'string' ? body.format.slice(0, 20) : null;
  const width = body.width != null ? (parseInt(body.width, 10) || null) : null;
  const height = body.height != null ? (parseInt(body.height, 10) || null) : null;
  // Arketipe/gaya video yang dipakai saat prompt-nya digenerate — dikirim otomatis
  // oleh workspace, bukan diketik admin. Ini sumbu yang dibandingkan di Analitik;
  // kalau kosong, video tetap tercatat tapi masuk kelompok '(tanpa gaya)'.
  const gaya = typeof body.gaya === 'string' ? body.gaya.slice(0, 100) || null : null;

  const character = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(characterId).first().catch(() => null);
  if (!character) return jsonError('Karakter tidak ditemukan', 404);
  const property = await env.DB.prepare('SELECT id, jenis_properti FROM properties WHERE id = ?').bind(propertyId).first().catch(() => null);
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  // Gerbang spesialis yang sebenarnya (cloudinary-sign cuma menolak lebih awal
  // demi UX — endpoint ini bisa dipanggil langsung tanpa lewat sana).
  const cek = await cekSpesialis(env, characterId, property.jenis_properti);
  if (!cek.boleh) return jsonError(cek.pesan, 422);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_agent_videos
        (character_id, property_id, caption, hashtags, cloudinary_public_id, cloudinary_url, cloudinary_name, storage, r2_key, poster_url, resource_type, duration_sec, bytes, format, width, height, gaya)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(characterId, propertyId, caption, hashtags, cloudinaryPublicId, cloudinaryUrl, cloudinaryName, storage, r2Key, posterUrl, resourceType, durationSec, bytes, format, width, height, gaya).run();
    return jsonOk({ id: res.meta?.last_row_id }, 201);
  } catch (err) {
    console.error('[vf agent-videos] insert', err.message);
    // Dicatat ke error_logs, bukan cuma console.error — kegagalan INSERT di sini
    // TIDAK terlihat di mana pun sebelumnya, sehingga pelanggaran constraint
    // (mis. cloudinary_public_id NOT NULL untuk baris R2, 2026-08-22) hanya bisa
    // didiagnosa dengan menebak-nebak skema. Sekarang muncul di Admin → Error Logs.
    await logServerError(env, {
      message: `INSERT viralframe_agent_videos gagal (storage=${storage}): ${err.message}`,
      source: 'server',
      context: { endpoint: 'admin/viralframe/agent-videos', storage, r2_key: r2Key, character_id: characterId, property_id: propertyId },
    });

    // Bersihkan aset yatim (best-effort) supaya storage tidak terisi file tanpa
    // catatan DB. hapusAsetVideo() memilih backend dari `storage`.
    try { await hapusAsetVideo(env, { storage, r2_key: r2Key, cloudinary_public_id: cloudinaryPublicId, cloudinary_name: cloudinaryName, resource_type: resourceType }); }
    catch (e) { console.error('[vf agent-videos] cleanup orphan', e.message); }

    // Sebabnya ikut dikirim: endpoint ini admin-only, dan tanpa itu pesan
    // "silakan coba lagi" mengajak mengulang kegagalan yang pasti terulang.
    return jsonError(`Gagal mencatat video ke DB: ${String(err.message).slice(0, 200)}`, 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
