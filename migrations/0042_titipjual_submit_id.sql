-- Migration 0042: idempotensi submit Titip Jual.
--
-- MASALAH YANG DITUTUP (audit 12 Agu 2026)
-- functions/api/titip-jual.js menulis property + owner + agreement DULU, baru
-- mengunggah foto ke R2. Payload submit berisi seluruh foto sebagai base64
-- (20 foto ≈ 8–11 MB) dan di uplink seluler bisa memakan 60–90 detik. Kalau
-- koneksi putus SETELAH request sampai server tapi SEBELUM response diterima,
-- klien menampilkan "Koneksi ke server gagal" padahal datanya sudah tersimpan.
-- User menekan Kirim lagi → lahir listing kedua, owner kedua, agreement kedua.
-- Tidak ada apa pun yang mencegahnya sebelum ini.
--
-- Klien mengirim `submit_id` (crypto.randomUUID) yang tetap sama selama satu
-- sesi form, termasuk saat mencoba ulang. Indeks UNIQUE di bawah membuat
-- percobaan kedua bisa dikenali dan dijawab dengan hasil yang lama.
--
-- Nullable + UNIQUE aman di SQLite: NULL tidak dianggap duplikat satu sama lain,
-- jadi 533 baris lama (dan seluruh properti yang dibuat manual lewat admin,
-- yang memang tidak punya submit_id) tetap valid.

ALTER TABLE properties ADD COLUMN submit_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_submit_id
    ON properties(submit_id);
