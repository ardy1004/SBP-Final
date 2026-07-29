-- Migration 0029: dukung scheduling dari 2 sumber video (Content Library
-- R2 & Konten Agent Cloudinary) di tabel viralframe_scheduled_posts yang sama.
-- video_id sekarang merujuk ke viralframe_videos ATAU viralframe_agent_videos
-- tergantung video_type — slot harian tetap dihitung LINTAS kedua sumber
-- (query pickNextSlot tidak difilter video_type), jadi "5 slot/hari" total.
ALTER TABLE viralframe_scheduled_posts ADD COLUMN video_type TEXT NOT NULL DEFAULT 'library';
CREATE INDEX IF NOT EXISTS idx_vfsp_video_type ON viralframe_scheduled_posts(video_type);
