// POST /api/admin/viralframe/agent-videos/bulk — aksi massal untuk banyak video sekaligus
//   Body JSON: { ids: number[], action: 'trash' | 'restore' | 'delete' | 'transfer', character_id? }
//   trash/restore -> toggle trashed_at (Sampah, reversible)
//   delete        -> hapus permanen (Cloudinary + D1), dipakai dari dalam halaman Sampah
//   transfer      -> pindahkan ke antrean agent lain (`character_id` = tujuan), lihat transfer()
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { hapusAsetVideo } from '../../../../_lib/videoStorage.js';
import { logServerError } from '../../../../_lib/logError.js';
import { adaJadwalTertunda } from '../../../../_lib/schedulerProviders.js';

const VALID_ACTIONS = ['trash', 'restore', 'delete', 'transfer'];
const MAX_IDS = 100;

// "Belum pernah masuk scheduler" = tidak punya SATU PUN baris di
// viralframe_scheduled_posts, status apa pun — termasuk yang semua platformnya
// gagal. Dipakai dua kali (klasifikasi & WHERE UPDATE) supaya pemeriksaan dan
// penulisan memakai definisi yang sama persis. Sengaja tanpa alias tabel: frasa
// ini disisipkan ke SELECT maupun UPDATE yang sama-sama menyebut nama tabel penuh.
//
// Kenapa seketat itu — dua jebakan nyata di jadwalOtomatis.js kalau video
// berriwayat ikut pindah:
//   1. jadwalkanVideo() tidak memeriksa riwayat, jadi video yang SUDAH tayang di
//      akun asal akan diposting ulang di akun tujuan tanpa peringatan apa pun.
//   2. ulangiPlatformGagal() mencari baris gagal menurut `sp.akun_id` agent ASAL,
//      tanpa melihat pemilik video sekarang — retry malam agent asal akan terus
//      menembakkan video yang sudah dipindah ke akun asal.
const BELUM_PERNAH_DIJADWALKAN = `NOT EXISTS (SELECT 1 FROM viralframe_scheduled_posts sp
  WHERE sp.video_id = viralframe_agent_videos.id AND sp.video_type = 'agent')`;

// Pindahkan video ke antrean agent lain. Yang berpindah hanya baris D1 — file
// ada di bucket R2 bersama tanpa identitas agent (migrasi 0043), jadi tidak ada
// yang perlu disalin. Ini PINDAH, bukan SALIN: video tidak akan tayang di akun
// asal sama sekali.
async function transfer(env, ids, tujuanMentah) {
  const tujuan = parseInt(tujuanMentah, 10);
  if (!Number.isInteger(tujuan) || tujuan <= 0) return jsonError('character_id tujuan wajib diisi', 422);
  const agent = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(tujuan).first();
  if (!agent) return jsonError('Agent tujuan tidak ditemukan', 422);

  const unik = [...new Set(ids)];
  const placeholders = unik.map(() => '?').join(',');
  const rows = (await env.DB.prepare(
    `SELECT id, character_id, trashed_at, urutan_kirim,
            CASE WHEN ${BELUM_PERNAH_DIJADWALKAN} THEN 0 ELSE 1 END AS pernah
       FROM viralframe_agent_videos WHERE id IN (${placeholders})`
  ).bind(...unik).all()).results ?? [];

  const dilewati = { pernah_dijadwalkan: [], di_sampah: [], sudah_di_tujuan: [], tidak_ada: [], berubah_bersamaan: [] };
  const ketemu = new Set(rows.map(r => r.id));
  for (const id of unik) if (!ketemu.has(id)) dilewati.tidak_ada.push(id);
  const lolos = [];
  for (const r of rows) {
    if (r.trashed_at) dilewati.di_sampah.push(r.id);
    else if (r.character_id === tujuan) dilewati.sudah_di_tujuan.push(r.id);
    else if (r.pernah) dilewati.pernah_dijadwalkan.push(r.id);
    else lolos.push(r);
  }

  // Urutan relatif di antrean asal dipertahankan, lalu ditempel di UJUNG antrean
  // tujuan — pola yang sama dengan 'restore' di bawah: nilai NULL/basi di
  // ORDER BY ASC muncul PALING DEPAN, jadi tanpa ini video pindahan diam-diam
  // menyerobot jadi prioritas #1 scheduler agent tujuan.
  const MAKS = Number.MAX_SAFE_INTEGER;
  lolos.sort((a, b) => ((a.urutan_kirim ?? MAKS) - (b.urutan_kirim ?? MAKS)) || (a.id - b.id));
  const { maxUrutan } = await env.DB.prepare(
    'SELECT COALESCE(MAX(urutan_kirim), 0) AS maxUrutan FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL'
  ).bind(tujuan).first();

  // Syarat lolos DIULANG di WHERE: cron auto-schedule bisa saja menjadwalkan
  // atau men-Sampah-kan video di antara SELECT di atas dan UPDATE ini. Dengan
  // syarat di WHERE, pemeriksaan + penulisan atomik per baris; yang kalah
  // balapan cukup tidak berubah (changes = 0) dan dilaporkan.
  //
  // asal_character_id (migrasi 0058) mencatat produsen PERTAMA: pemindahan
  // berantai A→B→C tetap A, dan kembali ke A mengosongkannya. SQLite membaca
  // nilai LAMA di seluruh ekspresi SET, jadi urutan kolom di sini tidak penting.
  let base = maxUrutan ?? 0;
  const stmts = lolos.map(r => {
    base += 1000;
    return env.DB.prepare(
      `UPDATE viralframe_agent_videos
          SET asal_character_id = CASE WHEN COALESCE(asal_character_id, character_id) = ? THEN NULL
                                       ELSE COALESCE(asal_character_id, character_id) END,
              character_id = ?,
              urutan_kirim = ?
        WHERE id = ? AND trashed_at IS NULL AND character_id <> ? AND ${BELUM_PERNAH_DIJADWALKAN}`
    ).bind(tujuan, tujuan, base, r.id, tujuan);
  });

  let affected = 0;
  if (stmts.length > 0) {
    const hasil = await env.DB.batch(stmts);
    hasil.forEach((h, i) => {
      if ((h.meta?.changes ?? 0) > 0) affected++;
      else dilewati.berubah_bersamaan.push(lolos[i].id);
    });
  }
  return jsonOk({ affected, dilewati });
}

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
    if (action === 'transfer') return await transfer(env, ids, body.character_id);

    if (action === 'trash') {
      await env.DB.prepare(`UPDATE viralframe_agent_videos SET trashed_at = datetime('now') WHERE id IN (${placeholders})`).bind(...ids).run();
      return jsonOk({ affected: ids.length });
    }

    if (action === 'restore') {
      // ids di sini bisa lintas karakter. Video pulih WAJIB dapat urutan_kirim
      // baru di akhir antrean karakternya masing-masing — NULL/nilai basi di
      // SQLite ORDER BY ASC muncul PALING DEPAN, jadi tanpa ini video pulih bisa
      // diam-diam menyerobot jadi prioritas #1 scheduler. Antrean akhir dihitung
      // PER GRUP character_id, bukan sekali untuk seluruh batch.
      const rows = await env.DB.prepare(
        `SELECT id, character_id FROM viralframe_agent_videos WHERE id IN (${placeholders})`
      ).bind(...ids).all();
      const found = rows.results ?? [];

      const grupPerKarakter = new Map();
      for (const row of found) {
        if (!grupPerKarakter.has(row.character_id)) grupPerKarakter.set(row.character_id, []);
        grupPerKarakter.get(row.character_id).push(row.id);
      }

      const statements = [];
      for (const [characterId, videoIds] of grupPerKarakter) {
        const { maxUrutan } = await env.DB.prepare(
          'SELECT COALESCE(MAX(urutan_kirim), 0) AS maxUrutan FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL'
        ).bind(characterId).first();
        let base = maxUrutan ?? 0;
        for (const videoId of videoIds.sort((a, b) => a - b)) {
          base += 1000;
          statements.push(
            env.DB.prepare('UPDATE viralframe_agent_videos SET trashed_at = NULL, urutan_kirim = ? WHERE id = ?').bind(base, videoId)
          );
        }
      }

      if (statements.length > 0) await env.DB.batch(statements);
      return jsonOk({ affected: statements.length });
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
