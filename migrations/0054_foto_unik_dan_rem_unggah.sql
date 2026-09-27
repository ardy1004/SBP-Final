-- Satu objek R2 = satu baris property_images, + rem unggah foto Titip Jual.
--
-- (1) FOTO KEMBAR. Audit 2026-09-27: 3 key R2 dipakai 2–3 baris sekaligus, semua
--     di dalam listing yang sama (1061, 1064, 1048) — foto yang sama dipilih dua
--     kali di form; klien meng-cache key per isi foto sehingga keduanya merujuk
--     SATU objek. Menghapus salah satunya dari admin menghapus objek R2 yang
--     masih dipakai baris lain → foto rusak.
--     Lebih berbahaya lagi: titip-jual-mulai.js menerima photo_keys dari klien
--     hanya dengan cek prefiks + head(). Key listing tayang terbaca di HTML
--     publik, jadi kiriman spam bisa MERUJUK foto listing lain; ketika admin
--     menghapus spam itu, r2Cleanup ikut menghapus foto listing aslinya.
--     UNIQUE(url_webp) menutup keduanya di level DB. Aman: admin upload memakai
--     UUID buatan server, dan tidak ada fitur yang sengaja berbagi foto.
--
--     Yang disisakan MIN(id) = sisipan pertama = urutan terendah di antara
--     kembarannya. urutan & is_cover lalu dinormalisasi ulang (aturan
--     "posisi 1 = foto utama", migrasi 0051) — hanya baris yang berubah.

DELETE FROM property_images
 WHERE id NOT IN (SELECT MIN(id) FROM property_images GROUP BY url_webp);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY urutan ASC, id ASC) - 1 AS rn
    FROM property_images
)
UPDATE property_images
   SET urutan = (SELECT rn FROM ranked WHERE ranked.id = property_images.id)
 WHERE urutan <> (SELECT rn FROM ranked WHERE ranked.id = property_images.id);

UPDATE property_images
   SET is_cover = CASE WHEN urutan = 0 THEN 1 ELSE 0 END
 WHERE is_cover <> CASE WHEN urutan = 0 THEN 1 ELSE 0 END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_images_url_webp ON property_images(url_webp);

-- (2) REM PER-IP untuk /api/titip-jual-tiket-foto. Rem lama (0049) GLOBAL
--     20/menit: satu orang yang mengirim 1 request/3 detik membuat SEMUA
--     penjual lain mendapat tiket null → setiap unggahan foto 403 → tak seorang
--     pun bisa mengirim Titip Jual. ip_hash = SHA-256 IP + garam (bukan IP
--     mentah). `jenis` menampung penghitung lain di tabel yang sama
--     ('tiket' = tiket foto; 'tanpa_captcha' = kiriman Tahap 1 jalur cadangan).
ALTER TABLE titip_jual_tiket_log ADD COLUMN ip_hash TEXT;
ALTER TABLE titip_jual_tiket_log ADD COLUMN jenis TEXT NOT NULL DEFAULT 'tiket';
CREATE INDEX IF NOT EXISTS idx_titip_jual_tiket_log_ip ON titip_jual_tiket_log(ip_hash, created_at);

-- (3) BATAS UNGGAHAN PER TIKET. Satu tiket foto dulu boleh dipakai mengunggah
--     berkas 8 MB tanpa batas selama 1 jam — hosting berkas anonim gratis di
--     bucket privat kita. Tiket kini membawa `sid` acak; tiap unggahan sukses
--     dicatat di sini dan dibatasi per sid (retensi 1 hari lewat purge-trash).
CREATE TABLE IF NOT EXISTS titip_jual_foto_log (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    sid        TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_titip_jual_foto_log_sid ON titip_jual_foto_log(sid);
CREATE INDEX IF NOT EXISTS idx_titip_jual_foto_log_created ON titip_jual_foto_log(created_at);
