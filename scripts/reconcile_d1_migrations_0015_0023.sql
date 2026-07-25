-- Rekonsiliasi ledger migrasi D1 produksi — SEKALI JALAN, sudah dieksekusi 2026-07-25.
--
-- JANGAN taruh file ini di migrations/ — foldernya dibaca Wrangler sebagai migrasi.
-- Jalankan manual:
--   npx wrangler d1 execute sbp-db --remote --file=scripts/reconcile_d1_migrations_0015_0023.sql
--
-- ── Masalah ──────────────────────────────────────────────────────────────────
-- Tabel & kolom untuk 0015–0023 dibuat langsung lewat `wrangler d1 execute --remote`
-- (lihat CLAUDE.md), jadi objeknya SUDAH ADA di produksi tapi tidak pernah tercatat
-- di tabel d1_migrations. Akibatnya `wrangler d1 migrations list --remote` melaporkan
-- 9 migrasi ini sebagai "belum diterapkan".
--
-- ── Kenapa berbahaya ─────────────────────────────────────────────────────────
-- Siapa pun yang menjalankan `wrangler d1 migrations apply --remote` untuk migrasi
-- BARU akan ikut menyeret kesembilan migrasi lama ini:
--   * 0017/0019/0021/0023 = `ALTER TABLE ... ADD COLUMN` telanjang (tanpa IF NOT
--     EXISTS, yang memang tidak didukung SQLite) → gagal "duplicate column name"
--     dan menghentikan seluruh run di tengah jalan.
--   * 0022 = RENAME TO ..._old → CREATE TABLE → DROP TABLE ..._old. Kalau sampai
--     tereksekusi ulang pada tabel yang SUDAH bermigrasi, viralframe_badge_assets
--     bisa kehilangan data.
--
-- ── Perbaikan ────────────────────────────────────────────────────────────────
-- Tandai kesembilannya sebagai sudah diterapkan, TANPA menjalankan isinya.
-- Kolom d1_migrations.name UNIQUE → INSERT OR IGNORE aman diulang.
--
-- Prasyarat yang sudah diverifikasi sebelum eksekusi (semua bernilai ada):
--   error_logs (tabel), properties.viralframe_dismissed_at, viralframe_videos.post_url,
--   viralframe_agent_videos.width / .trashed_at, viralframe_badge_assets.character_id
-- Backup penuh `wrangler d1 export` diambil lebih dulu.

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0015_viralframe_videos.sql'),
  ('0016_error_logs.sql'),
  ('0017_viralframe_dismissed.sql'),
  ('0018_viralframe_agent_videos.sql'),
  ('0019_viralframe_agent_videos_dimensions.sql'),
  ('0020_viralframe_badge_assets.sql'),
  ('0021_viralframe_badge_assets_freeform.sql'),
  ('0022_viralframe_badge_assets_per_character.sql'),
  ('0023_viralframe_agent_videos_trash.sql');
