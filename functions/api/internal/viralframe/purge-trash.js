// POST /api/internal/viralframe/purge-trash — hapus permanen video di Sampah
//   yang sudah lewat 30 hari (Cloudinary + D1). Dipanggil oleh worker cron
//   terpisah (workers/viralframe-purge-cron/), BUKAN oleh browser admin —
//   makanya di luar /api/admin/* (tidak lewat middleware JWT cookie) dan
//   pakai secret header sendiri.
//
// Auth: header X-Purge-Secret harus sama persis dengan env.VIRALFRAME_PURGE_SECRET.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { hapusAsetVideo } from '../../../_lib/videoStorage.js';
import { logServerError } from '../../../_lib/logError.js';
import { adaJadwalTertunda } from '../../../_lib/schedulerProviders.js';

// Batas D1 = 100 bound parameter per query, dan DELETE di bawah memakai
// `IN (?, ?, ...)` sebanyak jumlah baris. Nilai 200 yang lama membuat cron GAGAL
// setiap kali sampah menumpuk lebih dari 100 — sampah lalu tidak pernah terhapus
// dan biaya penyimpanan Cloudinary terus berjalan tanpa ketahuan.
// Cron dijalankan berkala, jadi memproses 100 per eksekusi sudah memadai.
const PURGE_LIMIT_PER_RUN = 100;

/**
 * Kebersihan tabel — TIDAK bergantung pada ada/tidaknya sampah video.
 *
 * ⚠️ Dipisahkan jadi fungsi sendiri dan dipanggil SEBELUM jalur purge aset
 * justru karena purge itu punya DUA `return` awal ("tidak ada kandidat" dan
 * "semua kandidat masih menunggu tayang"). Waktu retensi error_logs sempat
 * ditulis inline di bawah keduanya, ia hanya akan berjalan pada malam yang
 * kebetulan ada sampah — pembersih yang diam-diam tidak pernah jalan, kelas
 * kegagalan yang persis sama dengan tabel yang tidak punya pembersih sama
 * sekali. Sekarang ketiga jalur keluar membawa hasilnya.
 *
 * Urutan (bersih-bersih dulu, purge kemudian) aman: kedua DELETE di bawah
 * berpenjaga umur > 30 hari, jadi baris yang baru jadi yatim malam ini memang
 * belum layak dihapus malam ini juga.
 *
 * Keduanya non-fatal: kebersihan tabel tidak boleh menjatuhkan purge aset.
 */
async function bersihkanTabel(env) {
  // Baris jadwal yatim: videonya sudah dihapus purge, tapi barisnya tinggal
  // selamanya. Diukur 2026-08-31: 720 dari 901 baris (80%) sudah yatim, dan
  // tabelnya tumbuh tanpa batas karena tidak ada yang pernah membersihkannya.
  //
  // Aman dihapus: keempat pembaca tabel ini (slotDipakai, slotTerpakaiHariIni,
  // adaJadwalTertunda, platform_gagal) hanya peduli baris TERKINI, dan
  // analytics.js tidak membacanya sama sekali.
  //
  // ⚠️ Dua penjaga yang WAJIB dipertahankan:
  //  · umur > 30 hari — videonya sendiri baru dihapus sesudah 30 hari di
  //    Sampah, jadi ini menyisakan jejak ~60 hari sebelum benar-benar hilang.
  //    Jangan perketat tanpa alasan: sekali terhapus, riwayat posting hilang.
  //  · BUKAN baris yang masih menunggu tayang — kalau sampai terhapus,
  //    adaJadwalTertunda() buta dan video yang sama bisa dikirim dua kali.
  let jadwalYatim = 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM viralframe_scheduled_posts
        WHERE video_type = 'agent'
          AND julianday('now') - julianday(created_at) > 30
          AND NOT (status = 'scheduled' AND scheduled_at > datetime('now'))
          AND NOT EXISTS (SELECT 1 FROM viralframe_agent_videos v WHERE v.id = video_id)`
    ).run();
    jadwalYatim = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] bersihkan jadwal yatim', err.message);
  }

  // Retensi error_logs. Tabelnya TIDAK punya pembersih sama sekali sampai
  // 2026-09-01: endpoint DELETE /api/admin/errors?older_than_days= sudah ada
  // sejak lama tapi nol pemanggil, jadi tabel tumbuh selamanya. Sejak iklan
  // tayang di penempatan Threads, in-app browser Meta menyumbang ~250 baris
  // #418 per hari — kebisingan di luar kendali kita yang tetap dicatat
  // (keputusan user 2026-09-01: sembunyikan, jangan berhenti mencatat).
  //
  // Menumpang cron ini, bukan cron baru: purge-trash sudah dipanggil tiap
  // 03:10 WIB oleh workers/viralframe-purge-cron, jadi nol perubahan di sana.
  //
  // Menghapus menurut UMUR saja, bukan `resolved` — sengaja, menyamai semantik
  // endpoint DELETE manual. Dengan ratusan baris masuk per hari, apa pun yang
  // berumur 30 hari sudah terkubur jauh di luar jangkauan mata.
  let errorLogs = 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM error_logs WHERE created_at < datetime('now', '-30 days')`
    ).run();
    errorLogs = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] retensi error_logs', err.message);
  }

  return { jadwal_yatim_dihapus: jadwalYatim, error_logs_dihapus: errorLogs };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.VIRALFRAME_PURGE_SECRET;
  const header = request.headers.get('X-Purge-Secret');
  if (!secret || !header || header !== secret) return jsonError('Forbidden', 403);

  try {
    // Selalu dijalankan, termasuk pada malam tanpa sampah sama sekali.
    const housekeeping = await bersihkanTabel(env);

    const res = await env.DB.prepare(
      `SELECT id, storage, r2_key, cloudinary_public_id, cloudinary_name, resource_type FROM viralframe_agent_videos
       WHERE trashed_at IS NOT NULL AND trashed_at <= datetime('now', '-30 days')
       LIMIT ?`
    ).bind(PURGE_LIMIT_PER_RUN).all();
    const semuaKandidat = res.results ?? [];
    if (semuaKandidat.length === 0) return jsonOk({ purged: 0, ...housekeeping });

    // Video yang masih ditunggu tayang Buffer/Zernio dilewati SAAT INI (bukan
    // dianggap gagal) — akan dicoba lagi run berikutnya setelah scheduled_at-nya
    // lewat. Menghapusnya sekarang mematikan link media sebelum sempat tayang
    // (audit 2026-08-15).
    const statusTertunda = await Promise.all(semuaKandidat.map(row => adaJadwalTertunda(env, row.id)));
    const rows = semuaKandidat.filter((_, i) => !statusTertunda[i]);
    const skippedPending = statusTertunda.filter(Boolean).length;
    if (rows.length === 0) return jsonOk({ purged: 0, skipped_pending: skippedPending, ...housekeeping });

    // HANYA row yang destroy asetnya sukses (atau tidak punya file untuk dihapus)
    // yang lanjut dihapus dari D1. Sebelumnya kegagalan Cloudinary ditelan lalu
    // row D1 tetap dihapus tanpa syarat — asset jadi orphan PERMANEN tanpa jejak
    // untuk retry, karena baris D1 (satu-satunya penanda "video ini ada") sudah
    // lenyap (audit 2026-07-28). Row yang gagal dibiarkan di Sampah — cron run
    // berikutnya akan mencobanya lagi.
    //
    // ⚠️ hapusAsetVideo() memeriksa `row.storage` LEBIH DULU. Guard lama di sini
    // berbunyi `if (!row.cloudinary_public_id) → tidak ada file, buang baris D1`;
    // baris R2 memang selalu punya kolom itu NULL, jadi tanpa pemeriksaan backend
    // cron ini akan menghapus catatannya dan meninggalkan objek R2 selamanya
    // (migrasi 0043).
    const deletable = [];
    await Promise.all(rows.map(async row => {
      try {
        await hapusAsetVideo(env, row);
        deletable.push(row.id);
      } catch (err) {
        console.error('[purge-trash] destroy aset', row.id, err.message);
        await logServerError(env, {
          message: `Gagal hapus aset ${row.storage === 'r2' ? 'R2' : 'Cloudinary'} saat cron purge-trash agent-video #${row.id}: ${err.message}`,
          source: 'server',
          context: { endpoint: 'internal/viralframe/purge-trash', id: row.id, storage: row.storage, r2_key: row.r2_key, cloudinary_public_id: row.cloudinary_public_id },
        });
      }
    }));

    if (deletable.length > 0) {
      const placeholders = deletable.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM viralframe_agent_videos WHERE id IN (${placeholders})`).bind(...deletable).run();
    }

    return jsonOk({
      purged: deletable.length,
      failed: rows.length - deletable.length,
      skipped_pending: skippedPending,
      ...housekeeping,
    });
  } catch (err) {
    console.error('[purge-trash]', err.message);
    return jsonError('Gagal purge sampah', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
