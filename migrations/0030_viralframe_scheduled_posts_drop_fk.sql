-- Migration 0030: hapus FOREIGN KEY video_id -> viralframe_videos(id) di
-- viralframe_scheduled_posts.
--
-- Bug ditemukan saat percobaan nyata scheduling Konten Agent: tabel ini
-- (migrasi 0028) dibuat dengan video_id REFERENCES viralframe_videos(id),
-- padahal migrasi 0029 menambah video_type supaya tabel yang sama juga
-- menyimpan baris untuk viralframe_agent_videos (ID space berbeda). D1
-- mengaktifkan foreign_keys=ON secara default, jadi SETIAP insert untuk
-- video_type='agent' gagal dengan "FOREIGN KEY constraint failed" --
-- endpoint commit-agent.js selalu balas 500 "Gagal mencatat hasil scheduling".
--
-- Tabel dipastikan kosong (0 baris) sebelum migrasi ini dijalankan, jadi
-- rebuild langsung tanpa migrasi data.
DROP TABLE IF EXISTS viralframe_scheduled_posts;

CREATE TABLE viralframe_scheduled_posts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id       INTEGER NOT NULL, -- merujuk viralframe_videos ATAU viralframe_agent_videos tergantung video_type
    video_type     TEXT NOT NULL DEFAULT 'library',
    provider       TEXT NOT NULL,
    platform       TEXT NOT NULL,
    slot_index     INTEGER NOT NULL,
    scheduled_at   TEXT NOT NULL,
    status         TEXT NOT NULL,
    remote_post_id TEXT,
    error_message  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vfsp_video_id ON viralframe_scheduled_posts(video_id);
CREATE INDEX IF NOT EXISTS idx_vfsp_scheduled_at ON viralframe_scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_vfsp_video_type ON viralframe_scheduled_posts(video_type);
