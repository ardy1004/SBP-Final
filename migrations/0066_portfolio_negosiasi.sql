-- 0066 — Kategori portofolio "negosiasi" (2026-11-21).
-- CHECK (kategori IN (...)) dari 0062 tidak bisa diubah di SQLite tanpa
-- membangun ulang tabel. Aman di sini karena:
--   · portfolio_items TIDAK dirujuk tabel/view/trigger mana pun (diperiksa ke
--     sqlite_master produksi) — DROP tidak memicu cascade ke mana-mana;
--   · urutannya CREATE baru → salin SEMUA kolom (id dipertahankan) → DROP lama →
--     RENAME baru. Data tidak pernah hanya berada di satu tempat yang dihapus.
-- Berbeda dari insiden 0022 (RENAME lama dulu, lalu tabel induk ber-cascade).
-- Jalankan HANYA lewat `wrangler d1 migrations apply`, setelah `d1 export`.

PRAGMA defer_foreign_keys = true;

CREATE TABLE portfolio_items_0066 (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kategori          TEXT    NOT NULL CHECK (kategori IN ('ajb', 'survey', 'negosiasi', 'serah_terima', 'lainnya')),
  foto_key          TEXT    NOT NULL,
  thumb_key         TEXT    NOT NULL,
  keterangan        TEXT    NOT NULL DEFAULT '',
  lokasi            TEXT,
  tanggal           TEXT,
  property_id       INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  tampil            INTEGER NOT NULL DEFAULT 0 CHECK (tampil IN (0, 1)),
  aman_dikonfirmasi INTEGER NOT NULL DEFAULT 0 CHECK (aman_dikonfirmasi IN (0, 1)),
  urutan            INTEGER NOT NULL DEFAULT 0,
  dibuat_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diubah_at         TEXT
);

INSERT INTO portfolio_items_0066
  (id, kategori, foto_key, thumb_key, keterangan, lokasi, tanggal, property_id, tampil, aman_dikonfirmasi, urutan, dibuat_at, diubah_at)
SELECT id, kategori, foto_key, thumb_key, keterangan, lokasi, tanggal, property_id, tampil, aman_dikonfirmasi, urutan, dibuat_at, diubah_at
  FROM portfolio_items;

DROP TABLE portfolio_items;
ALTER TABLE portfolio_items_0066 RENAME TO portfolio_items;
CREATE INDEX IF NOT EXISTS idx_portfolio_tampil_urutan ON portfolio_items (tampil, urutan);
