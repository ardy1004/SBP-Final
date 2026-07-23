-- Migration 0018: ViralFrame Agent Videos (Cloudinary)
-- Video hasil generate eksternal (Veo/Kling/dll dari Master Prompt Step 4) yang
-- di-upload manual oleh admin setelah selesai di-download ke PC. Disimpan di
-- Cloudinary (bukan R2 — R2 khusus data listing properti), ditautkan ke
-- karakter (berfungsi sebagai "agent") + properti + caption/hashtag, sebagai
-- fondasi fitur scheduling ke medsos di roadmap berikutnya.

CREATE TABLE IF NOT EXISTS viralframe_agent_videos (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id          INTEGER NOT NULL,
    property_id           INTEGER NOT NULL,
    caption               TEXT,
    hashtags              TEXT,
    cloudinary_public_id  TEXT    NOT NULL,
    cloudinary_url        TEXT    NOT NULL,
    resource_type         TEXT    NOT NULL DEFAULT 'video',
    duration_sec          REAL,
    bytes                 INTEGER,
    format                TEXT,
    -- Disiapkan untuk fitur scheduling medsos (belum diimplementasikan)
    status                TEXT    NOT NULL DEFAULT 'ready',
    scheduled_at          TEXT,
    posted_at             TEXT,
    post_url              TEXT,
    platform_targets      TEXT,
    created_at            TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (character_id) REFERENCES viralframe_characters(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vfav_character ON viralframe_agent_videos(character_id);
CREATE INDEX IF NOT EXISTS idx_vfav_property ON viralframe_agent_videos(property_id);
