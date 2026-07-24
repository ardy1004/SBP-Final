// GET  /api/admin/viralframe/badges?character_id= — list badge/logo milik 1 karakter (max 6 baris: sold/premium/featured/hot/pilihan/logo)
// POST /api/admin/viralframe/badges — upsert 1 jenis untuk 1 karakter (upload baru menggantikan yang lama di jenis+karakter yang sama)
//   Body JSON: { character_id, type, cloudinary_public_id, cloudinary_url, x_pct?, y_pct?, width_pct? }
//   Posisi bebas (persentase 0-1 dari pojok kiri-atas video), bukan preset gravity.
//   Badge & logo bersifat per-karakter — tiap agent punya preset sendiri.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const VALID_TYPES = ['sold', 'premium', 'featured', 'hot', 'pilihan', 'logo'];

function clamp01(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : fallback;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const characterId = parseInt(url.searchParams.get('character_id') ?? '', 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 400);

  try {
    const res = await env.DB.prepare(
      `SELECT id, character_id, type, cloudinary_public_id, cloudinary_url, x_pct, y_pct, width_pct, updated_at
       FROM viralframe_badge_assets WHERE character_id = ? ORDER BY type`
    ).bind(characterId).all();
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

  const characterId = parseInt(body.character_id, 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 422);

  const type = typeof body.type === 'string' ? body.type : '';
  if (!VALID_TYPES.includes(type)) return jsonError(`type wajib salah satu: ${VALID_TYPES.join(', ')}`, 422);

  const cloudinaryPublicId = typeof body.cloudinary_public_id === 'string' ? body.cloudinary_public_id.slice(0, 300) : '';
  const cloudinaryUrl = typeof body.cloudinary_url === 'string' ? body.cloudinary_url.slice(0, 1000) : '';
  if (!cloudinaryPublicId || !cloudinaryUrl) return jsonError('cloudinary_public_id dan cloudinary_url wajib', 422);

  const xPct = clamp01(body.x_pct, type === 'logo' ? 0.78 : 0.05);
  const yPct = clamp01(body.y_pct, type === 'logo' ? 0.82 : 0.05);
  const widthPct = Number.isFinite(Number(body.width_pct)) ? Math.min(Math.max(Number(body.width_pct), 0.02), 1) : 0.18;

  try {
    const existing = await env.DB.prepare('SELECT id FROM viralframe_badge_assets WHERE character_id = ? AND type = ?')
      .bind(characterId, type).first();
    if (existing) {
      await env.DB.prepare(
        `UPDATE viralframe_badge_assets
         SET cloudinary_public_id = ?, cloudinary_url = ?, x_pct = ?, y_pct = ?, width_pct = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(cloudinaryPublicId, cloudinaryUrl, xPct, yPct, widthPct, existing.id).run();
      return jsonOk({ id: existing.id });
    }
    const res = await env.DB.prepare(
      `INSERT INTO viralframe_badge_assets (character_id, type, cloudinary_public_id, cloudinary_url, x_pct, y_pct, width_pct)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(characterId, type, cloudinaryPublicId, cloudinaryUrl, xPct, yPct, widthPct).run();
    return jsonOk({ id: res.meta?.last_row_id }, 201);
  } catch (err) {
    console.error('[vf badges] upsert', err.message);
    return jsonError('Gagal menyimpan badge', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
