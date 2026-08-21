-- 0043 — Video Konten Agent pindah dari Cloudinary ke R2.
--
-- Latar: akun Cloudinary agent utama tembus 114% kuota free (28,69/25 credits).
-- Transformasi 51% + bandwidth 33% dari biaya itu HILANG TOTAL di R2 (egress $0,
-- poster dibuat di browser). Storage tinggal ~$0,08/bulan di laju sekarang.
--
-- Kolom sengaja DITAMBAH, bukan diganti — baris lama tetap 'cloudinary' dan tetap
-- bisa dihapus lewat jalur Cloudinary sampai purge menghabiskannya sendiri.
--
-- CATATAN NAMA: `cloudinary_url` sekarang berisi URL publik untuk KEDUA backend
-- (Cloudinary lama atau R2 baru). Namanya dipertahankan supaya commit-agent.js,
-- jadwalOtomatis.js, analytics.js dan tipe frontend tidak perlu disentuh sama
-- sekali. Baca sebagai "URL publik video", bukan "URL Cloudinary".

-- 'cloudinary' | 'r2'. Kolom INI yang menentukan cara menghapus asetnya —
-- pemeriksaannya WAJIB dilakukan sebelum cek cloudinary_public_id, karena baris
-- R2 memang punya cloudinary_public_id NULL dan jalur hapus lama menerjemahkan
-- NULL sebagai "tidak ada file untuk dihapus".
ALTER TABLE viralframe_agent_videos ADD COLUMN storage TEXT NOT NULL DEFAULT 'cloudinary';

-- Key objek di bucket sbp-video. NULL untuk baris Cloudinary.
ALTER TABLE viralframe_agent_videos ADD COLUMN r2_key TEXT;

-- URL publik poster .jpg. Menggantikan transformasi video->jpg Cloudinary yang
-- ditagih PER DETIK durasi sumber (terukur: 13.848 dari 14.732 unit transformasi).
ALTER TABLE viralframe_agent_videos ADD COLUMN poster_url TEXT;

-- Dipakai endpoint migrasi & purge untuk memilih baris per backend.
CREATE INDEX IF NOT EXISTS idx_vf_agent_videos_storage ON viralframe_agent_videos(storage, trashed_at);
