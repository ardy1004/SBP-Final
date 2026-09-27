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
import { sqlTanggalWibMinus } from '../../../_lib/waktu.js';
import { collectPropertyR2Keys, deleteR2Keys } from '../../../_lib/r2Cleanup.js';

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

  // Retensi property_view_daily. Tabel metrik yang tumbuh paling cepat: satu
  // baris per properti per hari (~104/hari pada 558 properti), tanpa pembersih
  // sama sekali sampai 2026-09-02 — 8.744 baris menumpuk dalam ~84 hari.
  //
  // 180 hari aman dengan margin 6×: SELURUH pembacanya memakai jendela paling
  // panjang 30 hari (sqlTanggalWibMinus(29) dan `tanggal = SQL_TANGGAL_WIB` di
  // admin/overview.js), dan tidak ada satu pun agregat seumur hidup. Diverifikasi
  // dengan menyapu semua rujukan tabel ini di functions/.
  //
  // ⚠️ Kolomnya `tanggal` (TEKS 'YYYY-MM-DD' waktu WIB), BUKAN `created_at`.
  // Bandingkan lewat sqlTanggalWibMinus() — jangan tulis ekspresi tanggal
  // sendiri: DATE('now','localtime') di D1 menghasilkan UTC, bukan WIB, dan
  // pergeseran 7 jam itu dulu membuat seluruh metrik "hari ini" meleset.
  let viewDaily = 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM property_view_daily WHERE tanggal < ${sqlTanggalWibMinus(180)}`
    ).run();
    viewDaily = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] retensi property_view_daily', err.message);
  }

  // Retensi viralframe_caption_history. Dibaca HANYA sebagai 12 baris terakhir
  // (`ORDER BY created_at DESC LIMIT 12` di viralframe/captions.js) untuk
  // anti-pengulangan caption, jadi 90 hari sudah sangat berlebih.
  let caption = 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM viralframe_caption_history WHERE created_at < datetime('now', '-90 days')`
    ).run();
    caption = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] retensi caption_history', err.message);
  }

  // Foto Titip Jual yatim di R2. Sejak 8 Sep 2026 foto diunggah lebih dulu lewat
  // /api/titip-jual-foto, jadi submit yang gagal SETELAH sebagian foto terunggah
  // meninggalkan objek yang tidak pernah dirujuk `property_images`.
  //
  // ⚠️ AMBANG UMUR 24 JAM WAJIB. Tanpa itu cron ini bisa menghapus foto yang
  // pengunggahnya masih mengisi Step 2 — kegagalan yang jauh lebih buruk daripada
  // sampah yang dibersihkannya. Jangan diperketat "supaya lebih hemat".
  //
  // ⚠️ BERKURSOR (2026-09-27). Dulu `list({limit: 300})` TANPA kursor: setiap
  // malam memeriksa 300 key yang SAMA (urutan leksikografis terendah) dari ~2.600
  // objek, jadi yatim di luar 300 itu tidak pernah terhapus — dan tersaji publik
  // lewat /api/media dengan cache 1 tahun. Kini tiap malam melanjutkan dari
  // kursor terakhir (disimpan di `settings.purge_foto_cursor`) dan kembali ke
  // awal saat daftar habis: seluruh bucket tersapu tiap ~3 malam.
  let fotoYatim = 0;
  let fotoDiperiksa = 0;
  try {
    if (env.MEDIA) {
      const batasMs = Date.now() - 24 * 60 * 60 * 1000;
      const kursorLama = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'purge_foto_cursor'`).first()
        .then(r => r?.value || undefined, () => undefined);
      let daftar;
      try {
        daftar = await env.MEDIA.list({ prefix: 'property-photos/', limit: 1000, cursor: kursorLama });
      } catch {
        // Kursor basi/tidak sah → mulai lagi dari awal, jangan macet selamanya.
        daftar = await env.MEDIA.list({ prefix: 'property-photos/', limit: 1000 });
      }
      const objek = daftar.objects ?? [];
      fotoDiperiksa = objek.length;
      const kandidat = objek.filter(o => o.uploaded && o.uploaded.getTime() < batasMs);

      // ⚠️ D1 hanya menerima 100 bound parameter per query — dipecah 90.
      for (let i = 0; i < kandidat.length; i += 90) {
        const chunk = kandidat.slice(i, i + 90);
        const ph = chunk.map(() => '?').join(',');
        const r = await env.DB.prepare(
          `SELECT url_webp FROM property_images WHERE url_webp IN (${ph})`
        ).bind(...chunk.map(o => o.key)).all();
        const dipakai = new Set((r.results ?? []).map(x => x.url_webp));
        const yatim = chunk.filter(o => !dipakai.has(o.key)).map(o => o.key);
        // Satu panggilan hapus per chunk (R2 menerima array ≤ 1000 key) — hemat
        // subrequest dibanding satu delete per objek.
        if (yatim.length) {
          await env.MEDIA.delete(yatim);
          fotoYatim += yatim.length;
        }
      }

      const kursorBaru = daftar.truncated ? daftar.cursor : null;
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('purge_foto_cursor', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(kursorBaru).run();
    }
  } catch (err) {
    console.error('[purge-trash] foto titip-jual yatim', err.message);
  }

  // Retensi titip_jual_tiket_log (migrasi 0049). Murni penghitung rate-limit
  // untuk /api/titip-jual-tiket-foto — hanya pernah dibaca sebagai COUNT() 60
  // detik terakhir, jadi retensi 1 hari jauh di atas kebutuhan sesungguhnya.
  let tiketLog = 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM titip_jual_tiket_log WHERE created_at < datetime('now', '-1 day')`
    ).run();
    tiketLog = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] retensi titip_jual_tiket_log', err.message);
  }

  // ─── Retensi 24 bulan (Kebijakan Privasi pasal 5) ────────────────────────
  // Janji "data lead disimpan 24 bulan, kemudian dianonimkan atau dihapus" dulu
  // tidak punya mekanisme apa pun. Kriteria SENGAJA sempit — ini menghapus
  // data nyata tiap malam; lebih baik terlalu sedikit daripada salah hapus:
  //  · leads > 24 bulan → dianonimkan (nama/WA/asal/pesan/catatan dikosongkan);
  //    baris & statistiknya (tipe, status, sumber, properti) tetap ada.
  //  · draft Tahap 1 Titip Jual yang TIDAK PERNAH berlanjut > 24 bulan
  //    (submit_id ada, masih draft, tanpa perjanjian apa pun) → dihapus beserta
  //    foto R2 & owner-nya. Owner dihapus DULU (FK ON DELETE SET NULL — lihat
  //    CLAUDE.md), baru properti. Maks 50 per malam.
  // Perjanjian & data kontrak TIDAK disentuh (retensi hukum ≥ 5 tahun).
  let leadsDianonimkan = 0;
  let draftDihapus = 0;
  try {
    const r = await env.DB.prepare(`
      UPDATE leads SET nama = NULL, no_wa = NULL, asal_daerah = NULL, pesan = NULL, notes = NULL,
                       updated_at = CURRENT_TIMESTAMP
       WHERE created_at < datetime('now', '-24 months')
         AND (nama IS NOT NULL OR no_wa IS NOT NULL OR pesan IS NOT NULL OR notes IS NOT NULL)
    `).run();
    leadsDianonimkan = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] anonimkan leads 24 bulan', err.message);
  }
  try {
    const kandidat = await env.DB.prepare(`
      SELECT p.id FROM properties p
       WHERE p.submit_id IS NOT NULL
         AND p.status_publish = 'draft'
         AND p.created_at < datetime('now', '-24 months')
         AND NOT EXISTS (SELECT 1 FROM agreements a WHERE a.property_id = p.id)
       LIMIT 50
    `).all();
    const ids = (kandidat.results ?? []).map(r => r.id);
    if (ids.length) {
      const keys = await collectPropertyR2Keys(env.DB, ids);
      const ph = ids.map(() => '?').join(',');
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM owners WHERE property_id IN (${ph})`).bind(...ids),
        env.DB.prepare(`DELETE FROM properties WHERE id IN (${ph})`).bind(...ids),
      ]);
      // R2 SESUDAH D1: kalau D1 gagal, foto tetap utuh untuk listing yang tetap ada.
      if (env.MEDIA && keys.length) await deleteR2Keys(env.MEDIA, keys);
      draftDihapus = ids.length;
    }
  } catch (err) {
    console.error('[purge-trash] hapus draft Tahap 1 > 24 bulan', err.message);
  }

  // Retensi titip_jual_foto_log (migrasi 0054) — penghitung unggahan per tiket
  // foto; tiketnya berumur 1 jam, jadi 1 hari sudah jauh berlebih.
  let fotoLog = 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM titip_jual_foto_log WHERE created_at < datetime('now', '-1 day')`
    ).run();
    fotoLog = r?.meta?.changes ?? 0;
  } catch (err) {
    console.error('[purge-trash] retensi titip_jual_foto_log', err.message);
  }

  return {
    jadwal_yatim_dihapus: jadwalYatim,
    error_logs_dihapus: errorLogs,
    view_daily_dihapus: viewDaily,
    caption_dihapus: caption,
    foto_yatim_dihapus: fotoYatim,
    foto_diperiksa: fotoDiperiksa,
    tiket_log_dihapus: tiketLog,
    foto_log_dihapus: fotoLog,
    leads_dianonimkan: leadsDianonimkan,
    draft_24_bulan_dihapus: draftDihapus,
  };
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
