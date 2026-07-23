-- Migration 0020: Badge & Logo overlay untuk video ViralFrame
-- Satu baris per jenis (sold/premium/featured/hot/pilihan/logo). Gambar
-- disimpan di Cloudinary (bukan R2) karena harus bisa direferensikan
-- langsung sebagai overlay di transformasi URL video Cloudinary.
-- Badge status (sold/premium/dst) ditempel pojok kiri-atas (default),
-- logo ditempel pojok kanan-bawah menimpa watermark Google Flow/Gemini —
-- posisi & ukuran diatur admin lewat Pengaturan (live preview), disimpan
-- di sini sebagai gravity + offset + lebar relatif.

CREATE TABLE IF NOT EXISTS viralframe_badge_assets (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    type                  TEXT    NOT NULL UNIQUE,  -- sold | premium | featured | hot | pilihan | logo
    cloudinary_public_id  TEXT    NOT NULL,
    cloudinary_url        TEXT    NOT NULL,
    gravity               TEXT    NOT NULL DEFAULT 'north_west',  -- north_west | north_east | south_west | south_east | center
    offset_x              INTEGER NOT NULL DEFAULT 16,
    offset_y              INTEGER NOT NULL DEFAULT 16,
    width_pct             REAL    NOT NULL DEFAULT 0.18,          -- lebar overlay relatif thd lebar video (0-1)
    updated_at            TEXT    DEFAULT (datetime('now'))
);
