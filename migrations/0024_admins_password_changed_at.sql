-- Migration 0024: invalidasi sesi lama saat password diganti.
--
-- Masalah: ganti password hanya menimpa password_hash. JWT yang sudah beredar
-- tetap sah sampai exp-nya (8 jam), jadi sesi yang sudah bocor TIDAK terputus
-- oleh penggantian password — padahal itu justru alasan orang menggantinya.
--
-- Solusi: catat kapan password terakhir diubah. functions/api/admin/_middleware.js
-- menolak token yang iat-nya lebih awal dari nilai ini. Admin yang sedang aktif
-- tidak ikut terlempar karena password.js langsung mengirim cookie baru.
--
-- Kolom sengaja NULL-able tanpa default: baris lama bernilai NULL = tidak ada
-- pembatasan (semua token yang masih hidup tetap sah), sehingga migrasi ini tidak
-- memutus sesi siapa pun saat diterapkan.

ALTER TABLE admins ADD COLUMN password_changed_at DATETIME;
