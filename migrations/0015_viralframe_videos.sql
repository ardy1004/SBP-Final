-- Migration 0015: ViralFrame Content Library
-- Menyimpan metadata video hasil generate (SiliconFlow) yang diupload ke R2
-- (prefix 'viralframe-videos/'). Video jadi aset permanen, bukan blob sekali pakai.

CREATE TABLE IF NOT EXISTS viralframe_videos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id  INTEGER NOT NULL,
    r2_key       TEXT    NOT NULL,          -- key R2 (viralframe-videos/uuid.mp4)
    label        TEXT,                      -- deskripsi ringkas (mis. "Scene 1 - Fasad")
    gaya         TEXT,                      -- gaya kamera / arketipe
    rasio        TEXT,                      -- 1280x720 / 720x1280 / dst
    duration_sec INTEGER,
    size_bytes   INTEGER,
    -- Tahap 6 (analitik): diisi kemudian
    post_url     TEXT,
    views        INTEGER,
    likes        INTEGER,
    created_at   TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vf_videos_property ON viralframe_videos(property_id);
