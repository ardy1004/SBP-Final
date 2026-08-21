// POST /api/admin/viralframe/agent-videos/bulk — aksi massal untuk banyak video sekaligus
//   Body JSON: { ids: number[], action: 'trash' | 'restore' | 'delete' }
//   trash/restore -> toggle trashed_at (Sampah, reversible)
//   delete        -> hapus permanen (Cloudinary + D1), dipakai dari dalam halaman Sampah
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { hapusAsetVideo } from '../../../../_lib/videoStorage.js';
import { logServerError } from '../../../../_lib/logError.js';
import { adaJadwalTertunda } from '../../../../_lib/schedulerProviders.js';

const VALID_ACTIONS = ['trash', 'restore', 'delete'];
const MAX_IDS = 100;

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!VALID_ACTIONS.includes(action)) return jsonError(`action wajib salah satu: ${VALID_ACTIONS.join(', ')}`, 422);

  const ids = Array.isArray(body.ids) ? body.ids.map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) return jsonError('ids wajib diisi', 422);
  if (ids.length > MAX_IDS) return jsonError(`Maksimal ${MAX_IDS} video per aksi massal`, 422);

  const placeholders = ids.map(() => '?').join(',');

  try {
    if (action === 'trash') {
      await env.DB.prepare(`UPDATE viralframe_agent_videos SET trashed_at = datetime('now') WHERE id IN (${placeholders})`).bind(...ids).run();
      return jsonOk({ affected: ids.length });
    }

    if (action === 'restore') {
      await env.DB.prepare(`UPDATE viralframe_agent_videos SET trashed_at = NULL WHERE id IN (${placeholders})`).bind(...ids).run();
      return jsonOk({ affected: ids.length });
    }

    // delete: HANYA video yang sudah di Sampah (trashed_at IS NOT NULL) — dulu
    // action 'delete' bisa menghapus permanen video AKTIF tanpa lewat Sampah dulu
    // (audit 2026-07-28), melewati safety net "trash dulu baru purge".
    const rows = await env.DB.prepare(
      `SELECT id, storage, r2_key, cloudinary_public_id, cloudinary_name, resource_type FROM viralframe_agent_videos WHERE id IN (${placeholders}) AND trashed_at IS NOT NULL`
    ).bind(...ids).all();
    const semuaTrashed = rows.results ?? [];
    const skippedNotTrashed = ids.length - semuaTrashed.length;

    // Video yang masih ditunggu tayang oleh Buffer/Zernio (scheduled_at di masa
    // depan) dilewati dari penghapusan — kalau dihapus sekarang, link medianya
    // mati sebelum sempat tayang (audit 2026-08-15).
    const statusTertunda = await Promise.all(semuaTrashed.map(row => adaJadwalTertunda(env, row.id)));
    const candidates = semuaTrashed.filter((_, i) => !statusTertunda[i]);
    const skippedPending = semuaTrashed.filter((_, i) => statusTertunda[i]).map(row => row.id);

    // Hapus file tiap row dulu — HANYA row yang destroy-nya sukses (atau tidak
    // punya file untuk dihapus) yang lanjut dihapus dari D1. Sebelumnya kegagalan
    // Cloudinary ditelan lalu row D1 tetap dihapus tanpa syarat = asset orphan
    // permanen tanpa jejak untuk retry (audit 2026-07-28).
    //
    // ⚠️ Pemilihan backend WAJIB lewat hapusAsetVideo(), yang memeriksa
    // `row.storage` LEBIH DULU. Baris R2 selalu punya cloudinary_public_id NULL —
    // guard lama `if (!row.cloudinary_public_id) → anggap tidak ada file` akan
    // membuang baris D1-nya dan meninggalkan objek R2 selamanya (migrasi 0043).
    const deletable = [];
    const failed = [];
    await Promise.all(candidates.map(async row => {
      try {
        await hapusAsetVideo(env, row);
        deletable.push(row.id);
      } catch (err) {
        console.error('[vf agent-videos bulk] destroy aset', row.id, err.message);
        failed.push(row.id);
        await logServerError(env, {
          message: `Gagal hapus aset ${row.storage === 'r2' ? 'R2' : 'Cloudinary'} saat bulk delete agent-video #${row.id}: ${err.message}`,
          source: 'server',
          context: { endpoint: 'agent-videos/bulk', id: row.id, storage: row.storage, r2_key: row.r2_key, cloudinary_public_id: row.cloudinary_public_id },
        });
      }
    }));

    if (deletable.length > 0) {
      const delPlaceholders = deletable.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM viralframe_agent_videos WHERE id IN (${delPlaceholders})`).bind(...deletable).run();
    }
    return jsonOk({ affected: deletable.length, failed, skipped_not_trashed: skippedNotTrashed, skipped_pending: skippedPending });
  } catch (err) {
    console.error('[vf agent-videos bulk]', action, err.message);
    return jsonError('Gagal menjalankan aksi massal', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
