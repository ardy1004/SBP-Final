// PATCH /api/admin/viralframe/agent-videos/reorder — urutan kirim manual (drag & drop)
//   Body JSON: { character_id: number, ordered_ids: number[] }
//   Menomori ulang urutan_kirim (1000, 2000, ...) video AKTIF karakter itu sesuai
//   urutan array yang dikirim. Dipakai scheduler auto-schedule.js sebagai antrean FIFO.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const CHUNK_SIZE = 50;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const characterId = parseInt(body.character_id, 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 422);

  const orderedIds = Array.isArray(body.ordered_ids)
    ? body.ordered_ids.map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0)
    : [];
  if (orderedIds.length === 0 || orderedIds.length !== body.ordered_ids.length) {
    return jsonError('ordered_ids wajib array of integer, tidak kosong', 422);
  }

  try {
    // Set video aktif SEBENARNYA dari DB — jangan percaya urutan yang dikirim
    // client begitu saja. ordered_ids WAJIB permutasi persis (bukan cuma sama
    // panjang) supaya tidak bisa menyelundupkan id video karakter lain (IDOR)
    // dan tidak drift dari tab lain yang trash/restore/upload di karakter yang
    // sama saat drag sedang berlangsung.
    const res = await env.DB.prepare(
      'SELECT id FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL'
    ).bind(characterId).all();
    const activeIds = (res.results ?? []).map(r => r.id);

    const activeSet = new Set(activeIds);
    const orderedSet = new Set(orderedIds);
    const isPermutation = activeIds.length === orderedIds.length
      && activeSet.size === orderedSet.size
      && orderedIds.every(id => activeSet.has(id));
    if (!isPermutation) {
      return jsonError('Daftar video tidak sinkron, muat ulang halaman', 422);
    }

    const stmts = orderedIds.map((id, i) =>
      env.DB.prepare('UPDATE viralframe_agent_videos SET urutan_kirim = ? WHERE id = ? AND character_id = ?')
        .bind((i + 1) * 1000, id, characterId)
    );
    for (const bagian of chunk(stmts, CHUNK_SIZE)) {
      await env.DB.batch(bagian);
    }

    return jsonOk({ updated: orderedIds.length });
  } catch (err) {
    console.error('[vf agent-videos] reorder', err.message);
    return jsonError('Gagal menyimpan urutan kirim', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
