-- Migration 0059: status 'unconfirmed' ("Belum pasti") untuk hasil penjadwalan
-- yang AMBIGU, dan keluarkan video yang sudah terkirim dari antrean.
--
-- Data saja — kolom status TEXT tanpa CHECK (migrasi 0030), tidak ada perubahan
-- skema. WAJIB `wrangler d1 export` sebelum diterapkan ke produksi.
--
-- KENAPA. Dilaporkan user 2026-11-17: video bertanda "gagal" di Konten Agent
-- ternyata sudah tayang. Penyebabnya: kita memutus panggilan ke Buffer/Zernio
-- setelah 10 detik (TIMEOUT_POST_MS), tapi provider tetap memproses request-nya.
-- Sejak kode 2026-11-17 hasil seperti itu ditulis 'unconfirmed'; migrasi ini
-- menyusulkan baris lama yang sama ambigunya.
--
-- 1. Baris 'failed' yang pesannya AMBIGU → 'unconfirmed'. Polanya sama dengan
--    klasifikasi baru di schedulerProviders.js: timeout/jaringan, HTTP 5xx,
--    Zernio 409 "already scheduled" (post-nya justru ADA), Buffer tanpa post id.
--    Hanya pasangan (video, platform) yang BELUM punya baris 'scheduled' (yang
--    sudah pulih tidak relevan) dan videonya masih ada (sisanya dibersihkan
--    purge-trash). Diukur sebelum diterapkan: 27 baris / 21 video.
UPDATE viralframe_scheduled_posts
   SET status = 'unconfirmed'
 WHERE status = 'failed'
   AND video_type = 'agent'
   AND (error_message LIKE 'Gagal menghubungi%'
        OR error_message LIKE '%already scheduled%'
        OR error_message LIKE 'Buffer HTTP 5%'
        OR error_message LIKE 'Zernio HTTP 5%'
        OR error_message LIKE 'Buffer tidak mengembalikan post id%')
   AND NOT EXISTS (SELECT 1 FROM viralframe_scheduled_posts s2
                    WHERE s2.video_id = viralframe_scheduled_posts.video_id
                      AND s2.platform = viralframe_scheduled_posts.platform
                      AND s2.status = 'scheduled')
   AND EXISTS (SELECT 1 FROM viralframe_agent_videos v
                WHERE v.id = viralframe_scheduled_posts.video_id);

-- 2. Video yang masih Aktif padahal sudah (mungkin) terkirim → Sampah. Sama
--    dengan yang dilakukan persistScheduleResult sekarang. Tanpa ini video
--    seperti itu diam di tab Aktif tanpa pernah dikirim cron lagi (antrean kini
--    hanya video yang belum pernah dikirim), sehingga terlihat seperti stok.
--    Diukur sebelum diterapkan: 0 video dengan baris 'scheduled'; yang mungkin
--    tertangkap hanya video gagal-total yang barisnya baru menjadi
--    'unconfirmed' di langkah 1.
UPDATE viralframe_agent_videos
   SET trashed_at = datetime('now')
 WHERE trashed_at IS NULL
   AND EXISTS (SELECT 1 FROM viralframe_scheduled_posts sp
                WHERE sp.video_id = viralframe_agent_videos.id
                  AND sp.video_type = 'agent'
                  AND sp.status IN ('scheduled','unconfirmed'));
