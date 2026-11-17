-- Migration 0060: riwayat HARI POSTING per akun — sumber ramp kuota mode Otomatis.
--
-- KENAPA. hariPosting() (functions/_lib/jadwalOtomatis.js) menghitung
-- COUNT(DISTINCT tanggal) dari viralframe_scheduled_posts. Commit b331bb1
-- (2026-08-31) menambah pembersih yang menghapus baris jadwal berumur >30 hari
-- milik video yang sudah dipurge (purge-trash.js) — padahal dua hari sebelumnya
-- sudah diputuskan "jangan dibersihkan, ramp bergantung padanya". Akibatnya
-- riwayat terpotong ±31 hari: `hari` mentok ±31 → kuota tidak pernah naik ke 3,
-- dan satu hari tanpa posting menurunkannya ke 1. Laten selama semua agent
-- memakai mode Manual, tapi angka "hari nyata" di UI sudah salah.
--
-- Tabel kecil ini TIDAK PERNAH dibersihkan: satu baris per akun per tanggal
-- (±365 baris/akun/tahun). Pembersih baris jadwal yatim tetap seperti sekarang.
--
-- Backfill dari baris 'scheduled' yang masih ada. Riwayat sebelum ±akhir
-- Oktober 2026 sudah terhapus pembersih — diterima apa adanya.
CREATE TABLE IF NOT EXISTS viralframe_hari_posting (
  akun_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,  -- YYYY-MM-DD, tanggal WIB dari scheduled_at
  PRIMARY KEY (akun_id, tanggal)
);

INSERT OR IGNORE INTO viralframe_hari_posting (akun_id, tanggal)
SELECT DISTINCT akun_id, substr(scheduled_at, 1, 10)
  FROM viralframe_scheduled_posts
 WHERE status = 'scheduled' AND akun_id IS NOT NULL;
