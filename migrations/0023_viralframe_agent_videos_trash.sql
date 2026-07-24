-- Migration 0023: Sampah/Arsip untuk Konten Agent — video yang sudah selesai
-- dijadwalkan manual (Metricool/Meta Business Suite) dipindah ke sampah dulu
-- (reversible), baru dihapus permanen otomatis 30 hari kemudian via cron
-- worker terpisah (lihat workers/viralframe-purge-cron/), supaya kuota
-- storage Cloudinary tidak cepat penuh tanpa risiko hapus permanen dadakan.

ALTER TABLE viralframe_agent_videos ADD COLUMN trashed_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_vfav_trashed_at ON viralframe_agent_videos(trashed_at);
