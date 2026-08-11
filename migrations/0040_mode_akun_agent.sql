-- Migration 0040: mode akun ViralFrame (terpusat / per agent).
--
-- Latar: kredensial per agent sudah terpasang (0037/0038), tapi antrean video
-- lama masih akan dihabiskan lewat SATU kanal dulu sebelum tiap agent jalan
-- sendiri (keputusan user 2026-08-11). Tanpa saklar ini, video milik agent A
-- otomatis terbit ke akun sosmed agent A — padahal untuk sementara semuanya
-- harus lewat agent utama.
--
-- 'terpusat'  : SEMUA agent memakai akun agent utama, storage DAN scheduler.
-- 'per_agent' : tiap agent memakai akunnya sendiri (aturan spesialis berlaku).
--
-- Nilai awal sengaja 'terpusat' — itu perilaku yang diminta sekarang, dan sama
-- dengan kondisi sebelum 0037 dari sudut pandang pengguna.
--
-- Agent utama dicari lewat NAMA, bukan id yang dihardcode, supaya migrasi ini
-- tidak salah sasaran kalau dijalankan di database yang urutan barisnya beda.

INSERT OR REPLACE INTO settings (key, value) VALUES ('viralframe_akun_mode', 'terpusat');

INSERT OR REPLACE INTO settings (key, value)
SELECT 'viralframe_akun_utama', CAST(id AS TEXT)
FROM viralframe_characters
WHERE nama = 'Monica Vera'
LIMIT 1;
