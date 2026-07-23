-- Migration 0021: posisi badge/logo jadi bebas (persentase x/y), bukan cuma 5
-- titik jangkar preset (gravity+offset). Kolom lama (gravity/offset_x/offset_y)
-- dibiarkan ada (tidak dipakai lagi oleh kode baru) supaya migrasi tetap aman.

ALTER TABLE viralframe_badge_assets ADD COLUMN x_pct REAL NOT NULL DEFAULT 0.05;
ALTER TABLE viralframe_badge_assets ADD COLUMN y_pct REAL NOT NULL DEFAULT 0.05;
