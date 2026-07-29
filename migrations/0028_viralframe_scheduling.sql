-- Migration 0028: Auto-scheduling ViralFrame ke sosmed (Buffer + Zernio)
--
-- Sampah untuk Content Library video, sama pola dengan viralframe_agent_videos
-- (migrasi 0023) — video yang berhasil dijadwalkan otomatis pindah sampah,
-- dihapus permanen 30 hari kemudian via functions/api/internal/viralframe/purge-trash.js.
ALTER TABLE viralframe_videos ADD COLUMN trashed_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_vfv_trashed_at ON viralframe_videos(trashed_at);

-- Riwayat & status scheduling per platform. Satu video -> sampai 5 baris
-- (satu per platform), supaya kegagalan sebagian platform tetap tercatat &
-- bisa di-retry manual tanpa kehilangan jejak platform yang sudah sukses.
CREATE TABLE IF NOT EXISTS viralframe_scheduled_posts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id       INTEGER NOT NULL REFERENCES viralframe_videos(id),
    provider       TEXT NOT NULL,   -- 'buffer' | 'zernio'
    platform       TEXT NOT NULL,   -- 'youtube' | 'tiktok' | 'threads' | 'facebook' | 'instagram'
    slot_index     INTEGER NOT NULL,
    scheduled_at   TEXT NOT NULL,
    status         TEXT NOT NULL,   -- 'scheduled' | 'failed'
    remote_post_id TEXT,
    error_message  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vfsp_video_id ON viralframe_scheduled_posts(video_id);
CREATE INDEX IF NOT EXISTS idx_vfsp_scheduled_at ON viralframe_scheduled_posts(scheduled_at);

-- Settings baru (tabel settings sudah ada sejak migrasi 0014, key-value TEXT).
-- Preset default = rumus primetime hasil riset (WIB): FB/IG/Threads condong pagi-siang,
-- TikTok/YouTube Shorts condong siang-malam. Bisa diedit lewat Admin > Pengaturan.
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('buffer_api_key', NULL),
    ('zernio_api_key', NULL),
    ('buffer_channel_id_youtube', NULL),
    ('buffer_channel_id_tiktok', NULL),
    ('buffer_channel_id_threads', NULL),
    ('zernio_account_id_facebook', NULL),
    ('zernio_account_id_instagram', NULL),
    ('viralframe_schedule_preset', '[{"slot":1,"fb_ig_threads":"09:00","tiktok":"12:30","youtube":"12:30"},{"slot":2,"fb_ig_threads":"11:00","tiktok":"18:00","youtube":"17:30"},{"slot":3,"fb_ig_threads":"13:00","tiktok":"19:30","youtube":"19:00"},{"slot":4,"fb_ig_threads":"19:00","tiktok":"20:30","youtube":"20:00"},{"slot":5,"fb_ig_threads":"20:00","tiktok":"21:00","youtube":"13:30"}]');
