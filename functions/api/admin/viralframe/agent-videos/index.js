// GET  /api/admin/viralframe/agent-videos?character_id=&property_id=&limit=&offset=
//   List video "Konten Agent" (upload manual, Cloudinary) — join karakter + properti.
// POST /api/admin/viralframe/agent-videos
//   Body JSON (bytes video sudah terupload ke Cloudinary langsung dari browser via
//   /cloudinary-sign, endpoint ini hanya mencatat metadata):
//   { character_id, property_id, caption?, hashtags?, cloudinary_public_id,
//     cloudinary_url, resource_type?, duration_sec?, bytes?, format? }
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { destroyCloudinaryAsset } from '../../../../_lib/cloudinary.js';

const SELECT_COLS = `
  v.id, v.character_id, v.property_id, v.caption, v.hashtags,
  v.cloudinary_public_id, v.cloudinary_url, v.resource_type,
  v.duration_sec, v.bytes, v.format, v.width, v.height,
  v.status, v.scheduled_at, v.posted_at,
  v.post_url, v.platform_targets, v.trashed_at, v.created_at,
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
  const missing = rows.filter(r => r.width == null || r.height == null).slice(0, BACKFILL_MAX_PER_REQUEST);
  if (missing.length === 0) return;

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return; // belum dikonfigurasi, lewati diam-diam

  const auth = 'Basic ' + btoa(`${apiKey}:${apiSecret}`);

  await Promise.all(missing.map(async (row) => {
    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/resources/${row.resource_type || 'video'}/upload/${row.cloudinary_public_id}`,
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

  const cloudinaryPublicId = typeof body.cloudinary_public_id === 'string' ? body.cloudinary_public_id.slice(0, 300) : '';
  const cloudinaryUrl = typeof body.cloudinary_url === 'string' ? body.cloudinary_url.slice(0, 1000) : '';
  if (!cloudinaryPublicId || !cloudinaryUrl) return jsonError('cloudinary_public_id dan cloudinary_url wajib', 422);

  const caption = typeof body.caption === 'string' ? body.caption.slice(0, 1000) || null : null;
  const hashtags = typeof body.hashtags === 'string' ? body.hashtags.slice(0, 500) || null : null;
  const resourceType = typeof body.resource_type === 'string' ? body.resource_type.slice(0, 20) : 'video';
  const durationSec = body.duration_sec != null ? Number(body.duration_sec) || null : null;
  const bytes = body.bytes != null ? (parseInt(body.bytes, 10) || null) : null;
  const format = typeof body.format === 'string' ? body.format.slice(0, 20) : null;
  const width = body.width != null ? (parseInt(body.width, 10) || null) : null;
  const height = body.height != null ? (parseInt(body.height, 10) || null) : null;

  const character = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(characterId).first().catch(() => null);
  if (!character) return jsonError('Karakter tidak ditemukan', 404);
  const property = await env.DB.prepare('SELECT id FROM properties WHERE id = ?').bind(propertyId).first().catch(() => null);
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_agent_videos
        (character_id, property_id, caption, hashtags, cloudinary_public_id, cloudinary_url, resource_type, duration_sec, bytes, format, width, height)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(characterId, propertyId, caption, hashtags, cloudinaryPublicId, cloudinaryUrl, resourceType, durationSec, bytes, format, width, height).run();
    return jsonOk({ id: res.meta?.last_row_id }, 201);
  } catch (err) {
    console.error('[vf agent-videos] insert', err.message);
    // Bersihkan aset yatim di Cloudinary (best-effort) supaya storage tidak terisi
    // file tanpa catatan DB
    try { await destroyCloudinaryAsset(env, cloudinaryPublicId, resourceType); }
    catch (e) { console.error('[vf agent-videos] cleanup orphan', e.message); }
    return jsonError('Gagal mencatat video ke DB — upload dibatalkan, silakan coba lagi', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
