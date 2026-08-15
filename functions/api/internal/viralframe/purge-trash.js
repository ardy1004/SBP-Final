// POST /api/internal/viralframe/purge-trash — hapus permanen video di Sampah
//   yang sudah lewat 30 hari (Cloudinary + D1). Dipanggil oleh worker cron
//   terpisah (workers/viralframe-purge-cron/), BUKAN oleh browser admin —
//   makanya di luar /api/admin/* (tidak lewat middleware JWT cookie) dan
//   pakai secret header sendiri.
//
// Auth: header X-Purge-Secret harus sama persis dengan env.VIRALFRAME_PURGE_SECRET.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { destroyByCloudName } from '../../../_lib/cloudinary.js';
import { logServerError } from '../../../_lib/logError.js';
import { adaJadwalTertunda } from '../../../_lib/schedulerProviders.js';

// Batas D1 = 100 bound parameter per query, dan DELETE di bawah memakai
// `IN (?, ?, ...)` sebanyak jumlah baris. Nilai 200 yang lama membuat cron GAGAL
// setiap kali sampah menumpuk lebih dari 100 — sampah lalu tidak pernah terhapus
// dan biaya penyimpanan Cloudinary terus berjalan tanpa ketahuan.
// Cron dijalankan berkala, jadi memproses 100 per eksekusi sudah memadai.
const PURGE_LIMIT_PER_RUN = 100;

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.VIRALFRAME_PURGE_SECRET;
  const header = request.headers.get('X-Purge-Secret');
  if (!secret || !header || header !== secret) return jsonError('Forbidden', 403);

  try {
    const res = await env.DB.prepare(
      `SELECT id, cloudinary_public_id, cloudinary_name, resource_type FROM viralframe_agent_videos
       WHERE trashed_at IS NOT NULL AND trashed_at <= datetime('now', '-30 days')
       LIMIT ?`
    ).bind(PURGE_LIMIT_PER_RUN).all();
    const semuaKandidat = res.results ?? [];
    if (semuaKandidat.length === 0) return jsonOk({ purged: 0 });

    // Video yang masih ditunggu tayang Buffer/Zernio dilewati SAAT INI (bukan
    // dianggap gagal) — akan dicoba lagi run berikutnya setelah scheduled_at-nya
    // lewat. Menghapusnya sekarang mematikan link media sebelum sempat tayang
    // (audit 2026-08-15).
    const statusTertunda = await Promise.all(semuaKandidat.map(row => adaJadwalTertunda(env, row.id)));
    const rows = semuaKandidat.filter((_, i) => !statusTertunda[i]);
    const skippedPending = statusTertunda.filter(Boolean).length;
    if (rows.length === 0) return jsonOk({ purged: 0, skipped_pending: skippedPending });

    // HANYA row yang destroy Cloudinary-nya sukses (atau tidak punya file untuk
    // dihapus) yang lanjut dihapus dari D1. Sebelumnya kegagalan Cloudinary
    // ditelan lalu row D1 tetap dihapus tanpa syarat — asset Cloudinary jadi
    // orphan PERMANEN tanpa jejak untuk retry, karena baris D1 (satu-satunya
    // penanda "video ini ada") sudah lenyap (audit 2026-07-28). Row yang gagal
    // dibiarkan di Sampah — cron run berikutnya akan mencobanya lagi.
    const deletable = [];
    await Promise.all(rows.map(async row => {
      if (!row.cloudinary_public_id) { deletable.push(row.id); return; }
      try {
        await destroyByCloudName(env, row.cloudinary_name, row.cloudinary_public_id, row.resource_type);
        deletable.push(row.id);
      } catch (err) {
        console.error('[purge-trash] cloudinary destroy', row.id, err.message);
        await logServerError(env, {
          message: `Gagal destroy Cloudinary asset saat cron purge-trash agent-video #${row.id}: ${err.message}`,
          source: 'server',
          context: { endpoint: 'internal/viralframe/purge-trash', id: row.id, cloudinary_public_id: row.cloudinary_public_id },
        });
      }
    }));

    if (deletable.length > 0) {
      const placeholders = deletable.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM viralframe_agent_videos WHERE id IN (${placeholders})`).bind(...deletable).run();
    }

    const videosResult = await purgeContentLibraryVideos(env);

    return jsonOk({
      purged: deletable.length + videosResult.purged,
      failed: (rows.length - deletable.length) + videosResult.failed,
      skipped_pending: skippedPending,
    });
  } catch (err) {
    console.error('[purge-trash]', err.message);
    return jsonError('Gagal purge sampah', 500);
  }
}

// Sampah Content Library (viralframe_videos, R2 — bukan Cloudinary). Sama pola
// rollback-safe: baris D1 cuma dihapus kalau objek R2-nya sukses dihapus (atau
// memang tidak ada), supaya tidak ada file R2 yatim tanpa jejak untuk retry.
async function purgeContentLibraryVideos(env) {
  const res = await env.DB.prepare(
    `SELECT id, r2_key FROM viralframe_videos
     WHERE trashed_at IS NOT NULL AND trashed_at <= datetime('now', '-30 days')
     LIMIT ?`
  ).bind(PURGE_LIMIT_PER_RUN).all();
  const rows = res.results ?? [];
  if (rows.length === 0) return { purged: 0, failed: 0 };

  const deletable = [];
  await Promise.all(rows.map(async row => {
    if (!row.r2_key) { deletable.push(row.id); return; }
    try {
      await env.MEDIA.delete(row.r2_key);
      deletable.push(row.id);
    } catch (err) {
      console.error('[purge-trash] R2 delete', row.id, err.message);
      await logServerError(env, {
        message: `Gagal hapus R2 object saat cron purge-trash video #${row.id}: ${err.message}`,
        source: 'server',
        context: { endpoint: 'internal/viralframe/purge-trash', id: row.id, r2_key: row.r2_key },
      });
    }
  }));

  if (deletable.length > 0) {
    const placeholders = deletable.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM viralframe_videos WHERE id IN (${placeholders})`).bind(...deletable).run();
  }
  return { purged: deletable.length, failed: rows.length - deletable.length };
}

export async function onRequestOptions() { return handleOptions(); }
