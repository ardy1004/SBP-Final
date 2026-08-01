-- Migration 0034: metrik performa untuk Konten Agent.
--
-- LATAR: fitur "Analitik — gaya pemenang" membaca `viralframe_videos`, tapi tabel
-- itu 0 baris. Alur nyata yang dipakai admin adalah upload manual ke Cloudinary →
-- `viralframe_agent_videos` (85 baris per 2026-08-02). Jadi loop A/B tidak pernah
-- bisa jalan: tabel yang diisi bukan tabel yang dibaca, dan tabel yang diisi
-- tidak punya kolom metrik sama sekali.
--
-- `gaya` diisi otomatis saat upload dari workspace (arketipe video yang dipakai
-- saat prompt-nya digenerate) — bukan input manual, supaya tidak pernah lupa/salah.
-- Video lama akan NULL dan tampil sebagai '(tanpa gaya)' di analitik; itu jujur,
-- jangan ditebak-tebak mundur.
--
-- `views`/`likes` diisi manual oleh admin dari dashboard sosmed. NULL = belum
-- diisi, dan analitik memang HANYA menghitung baris yang sudah diisi — nol
-- diperlakukan berbeda dari kosong.

ALTER TABLE viralframe_agent_videos ADD COLUMN views INTEGER;
ALTER TABLE viralframe_agent_videos ADD COLUMN likes INTEGER;
ALTER TABLE viralframe_agent_videos ADD COLUMN gaya TEXT;
ALTER TABLE viralframe_agent_videos ADD COLUMN metrics_updated_at TEXT;

-- Analitik memfilter `views > 0` lalu GROUP BY gaya; indeks ini membuatnya tidak
-- full-scan seiring tabel tumbuh.
CREATE INDEX IF NOT EXISTS idx_vfav_gaya_views ON viralframe_agent_videos(gaya, views);
