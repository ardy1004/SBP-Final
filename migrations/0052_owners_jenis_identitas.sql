-- Jenis identitas pemilik: 'ktp' (NIK, tepat 16 digit) atau 'sim' (No. SIM, 12-16 digit).
-- Aturannya satu sumber: functions/_lib/identitas.js.
--
-- Nomornya SENGAJA tetap di nik_encrypted (enkripsi yang sama) — kolom itu juga
-- penanda "Tahap 2 selesai" bagi idempotensi titip-jual-lengkapi.js. Nama kolom
-- jadi misnomer, sama seperti cloudinary_url.
--
-- Semua baris lama = 'ktp', dan memang benar: sebelum migrasi ini hanya NIK yang
-- bisa diisi (divalidasi 16 digit di form, server, dan admin).
ALTER TABLE owners ADD COLUMN jenis_identitas TEXT NOT NULL DEFAULT 'ktp';
