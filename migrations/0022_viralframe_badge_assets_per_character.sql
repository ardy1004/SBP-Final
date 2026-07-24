-- Migration 0022: Badge & Logo jadi per-karakter (agent), bukan global lagi.
-- Tiap karakter ViralFrame bisa punya set badge/logo sendiri, diedit dari
-- halaman Konten Agent (bukan Pengaturan). UNIQUE(type) lama diganti
-- UNIQUE(character_id, type) — SQLite tidak bisa ALTER constraint, jadi
-- tabel di-recreate.

ALTER TABLE viralframe_badge_assets RENAME TO viralframe_badge_assets_old;

CREATE TABLE viralframe_badge_assets (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id          INTEGER NOT NULL REFERENCES viralframe_characters(id) ON DELETE CASCADE,
    type                  TEXT    NOT NULL,  -- sold | premium | featured | hot | pilihan | logo
    cloudinary_public_id  TEXT    NOT NULL,
    cloudinary_url        TEXT    NOT NULL,
    x_pct                 REAL    NOT NULL DEFAULT 0.05,
    y_pct                 REAL    NOT NULL DEFAULT 0.05,
    width_pct             REAL    NOT NULL DEFAULT 0.18,
    updated_at            TEXT    DEFAULT (datetime('now')),
    UNIQUE(character_id, type)
);

-- Duplikasi preset global lama jadi preset awal tiap karakter yang sudah ada,
-- supaya video yang sudah live tidak mendadak kehilangan badge/logo.
INSERT INTO viralframe_badge_assets (character_id, type, cloudinary_public_id, cloudinary_url, x_pct, y_pct, width_pct, updated_at)
SELECT c.id, o.type, o.cloudinary_public_id, o.cloudinary_url, o.x_pct, o.y_pct, o.width_pct, o.updated_at
FROM viralframe_characters c CROSS JOIN viralframe_badge_assets_old o;

DROP TABLE viralframe_badge_assets_old;
