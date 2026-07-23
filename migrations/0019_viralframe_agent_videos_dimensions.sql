-- Migration 0019: tambah width/height video agent (untuk klasifikasi aspek rasio
-- otomatis — Vertikal 9:16 / Horizontal 16:9 / Square 1:1 — diambil dari metadata
-- Cloudinary saat upload, bukan input manual).

ALTER TABLE viralframe_agent_videos ADD COLUMN width INTEGER;
ALTER TABLE viralframe_agent_videos ADD COLUMN height INTEGER;
