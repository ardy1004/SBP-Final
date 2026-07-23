// GET  /api/admin/viralframe/badges — list semua badge/logo (max 6 baris: sold/premium/featured/hot/pilihan/logo)
// POST /api/admin/viralframe/badges — upsert 1 jenis (upload baru menggantikan yang lama di jenis yang sama)
//   Body JSON: { type, cloudinary_public_id, cloudinary_url, gravity?, offset_x?, offset_y?, width_pct? }
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const VALID_TYPES = ['sold', 'premium', 'featured', 'hot', 'pilihan', 'logo'];
const VALID_GRAVITY = ['north_west', 'north_east', 'south_west', 'south_east', 'center'];

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const res = await env.DB.prepare(
      `SELECT id, type, cloudinary_public_id, cloudinary_url, gravity, offset_x, offset_y, width_pct, updated_at
       FROM viralframe_badge_assets ORDER BY type`
    ).all();
    return jsonOk({ items: res.results ?? [] });
  } catch (err) {
    console.error('[vf badges] GET', err.message);
    return jsonError('Gagal mengambil daftar badge', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const type = typeof body.type === 'string' ? body.type : '';
  if (!VALID_TYPES.includes(type)) return jsonError(`type wajib salah satu: ${VALID_TYPES.join(', ')}`, 422);

  const cloudinaryPublicId = typeof body.cloudinary_public_id === 'string' ? body.cloudinary_public_id.slice(0, 300) : '';
  const cloudinaryUrl = typeof body.cloudinary_url === 'string' ? body.cloudinary_url.slice(0, 1000) : '';
  if (!cloudinaryPublicId || !cloudinaryUrl) return jsonError('cloudinary_public_id dan cloudinary_url wajib', 422);

  const gravity = VALID_GRAVITY.includes(body.gravity) ? body.gravity : (type === 'logo' ? 'south_east' : 'north_west');
  const offsetX = Number.isFinite(Number(body.offset_x)) ? Math.round(Number(body.offset_x)) : 16;
  const offsetY = Number.isFinite(Number(body.offset_y)) ? Math.round(Number(body.offset_y)) : 16;
  const widthPct = Number.isFinite(Number(body.width_pct)) ? Math.min(Math.max(Number(body.width_pct), 0.02), 1) : 0.18;

  try {
    const existing = await env.DB.prepare('SELECT id FROM viralframe_badge_assets WHERE type = ?').bind(type).first();
    if (existing) {
      await env.DB.prepare(
        `UPDATE viralframe_badge_assets
         SET cloudinary_public_id = ?, cloudinary_url = ?, gravity = ?, offset_x = ?, offset_y = ?, width_pct = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(cloudinaryPublicId, cloudinaryUrl, gravity, offsetX, offsetY, widthPct, existing.id).run();
      return jsonOk({ id: existing.id });
    }
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_badge_assets (type, cloudinary_public_id, cloudinary_url, gravity, offset_x, offset_y, width_pct)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(type, cloudinaryPublicId, cloudinaryUrl, gravity, offsetX, offsetY, widthPct).run();
    return jsonOk({ id: res.meta?.last_row_id }, 201);
  } catch (err) {
    console.error('[vf badges] upsert', err.message);
    return jsonError('Gagal menyimpan badge', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
