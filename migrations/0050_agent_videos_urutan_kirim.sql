-- =============================================================================
-- SBP — Migration 0050: Urutan kirim manual (drag & drop) untuk Konten Agent
--
-- `urutan_kirim` menggantikan created_at sebagai dasar urutan FIFO scheduler
-- (auto-schedule.js) dan urutan tampil grid Konten Agent. Nilainya berjarak
-- (gap 1000) per character_id, hanya relevan untuk video trashed_at IS NULL.
-- Backfill di bawah MEMPERTAHANKAN urutan lama persis (created_at ASC) supaya
-- migrasi ini nol dampak terhadap antrean yang sudah berjalan — video yang
-- "akan dikirim duluan" sebelum migrasi tetap "akan dikirim duluan" sesudahnya,
-- sampai admin benar-benar menggeser sesuatu.
-- =============================================================================

ALTER TABLE viralframe_agent_videos ADD COLUMN urutan_kirim INTEGER;

CREATE INDEX IF NOT EXISTS idx_agent_videos_urutan
  ON viralframe_agent_videos(character_id, urutan_kirim);

-- Backfill: video aktif diberi urutan_kirim sesuai created_at ASC (perilaku
-- lama), per character_id, kelipatan 1000. Video di Sampah dibiarkan NULL
-- (tidak relevan — dikecualikan semua query aktif oleh trashed_at IS NULL, dan
-- akan diisi ulang otomatis saat dipulihkan lewat kode aplikasi, bukan di sini).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY character_id ORDER BY created_at ASC, id ASC) AS rn
  FROM viralframe_agent_videos
  WHERE trashed_at IS NULL
)
UPDATE viralframe_agent_videos
SET urutan_kirim = (SELECT rn * 1000 FROM ranked WHERE ranked.id = viralframe_agent_videos.id)
WHERE id IN (SELECT id FROM ranked);
