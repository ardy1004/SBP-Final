// GET  /api/admin/viralframe/agent-videos?character_id=&property_id=&limit=&offset=
//   List video "Konten Agent" (upload manual, Cloudinary) — join karakter + properti.
// POST /api/admin/viralframe/agent-videos
//   Body JSON (bytes video sudah terupload ke Cloudinary langsung dari browser via
//   /cloudinary-sign, endpoint ini hanya mencatat metadata):
//   { character_id, property_id, caption?, hashtags?, cloudinary_public_id,
//     cloudinary_url, resource_type?, duration_sec?, bytes?, format? }
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const SELECT_COLS = `
  v.id, v.character_id, v.property_id, v.caption, v.hashtags,
  v.cloudinary_public_id, v.cloudinary_url, v.resource_type,
  v.duration_sec, v.bytes, v.format, v.status, v.scheduled_at, v.posted_at,
  v.post_url, v.platform_targets, v.created_at,
  c.nama AS character_nama, c.foto_url AS character_foto_url,
  p.kode_listing, p.title AS property_title
`;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const characterId = parseInt(url.searchParams.get('character_id') ?? '', 10);
  const propertyId = parseInt(url.searchParams.get('property_id') ?? '', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '', 10) || 100, 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '', 10) || 0;

  const conds = [];
  const binds = [];
  if (Number.isInteger(characterId) && characterId > 0) { conds.push('v.character_id = ?'); binds.push(characterId); }
  if (Number.isInteger(propertyId) && propertyId > 0) { conds.push('v.property_id = ?'); binds.push(propertyId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const stmt = env.DB.prepare(
      `SELECT ${SELECT_COLS}
       FROM viralframe_agent_videos v
       JOIN viralframe_characters c ON c.id = v.character_id
       JOIN properties p ON p.id = v.property_id
       ${where}
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset);
    const res = await stmt.all();
    return jsonOk({ items: res.results ?? [] });
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

  const character = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(characterId).first().catch(() => null);
  if (!character) return jsonError('Karakter tidak ditemukan', 404);
  const property = await env.DB.prepare('SELECT id FROM properties WHERE id = ?').bind(propertyId).first().catch(() => null);
  if (!property) return jsonError('Properti tidak ditemukan', 404);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_agent_videos
        (character_id, property_id, caption, hashtags, cloudinary_public_id, cloudinary_url, resource_type, duration_sec, bytes, format)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(characterId, propertyId, caption, hashtags, cloudinaryPublicId, cloudinaryUrl, resourceType, durationSec, bytes, format).run();
    return jsonOk({ id: res.meta?.last_row_id }, 201);
  } catch (err) {
    console.error('[vf agent-videos] insert', err.message);
    return jsonError('Video tersimpan di Cloudinary tapi gagal dicatat DB', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
