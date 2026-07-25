-- Mode input & tampilan harga, khusus dibutuhkan untuk tanah.
--
-- LATAR: agen properti mengiklankan tanah dalam rupiah per m², bukan total —
-- terlihat dari judul listing yang ditulis sendiri, mis. "Turun Harga Jadi
-- 4,9 Juta/m²!". Karena form admin hanya menyediakan satu kolom "Harga
-- Penawaran", 39 listing tanah terisi harga PER-M² di kolom total. Akibatnya
-- lahan 2,7 hektar tampil seharga Rp 4,9 juta.
--
-- KONTRAK KOLOM (jangan diubah tanpa membaca functions/_lib/hargaTanah.js):
--   harga        = SELALU total rupiah. Sumber kebenaran tunggal untuk filter,
--                  pengurutan, dan seluruh query — jangan pernah diisi per-m².
--   harga_per_m2 = SELALU turunan: ROUND(harga / luas_tanah). Dihitung ulang
--                  setiap kali disimpan.
--   harga_mode   = hanya menentukan CARA MENGETIK di admin dan CARA MENAMPILKAN
--                  di situs. Tidak pernah mengubah arti kolom harga.
--
-- Default 'total' menjaga perilaku seluruh 533 listing yang sudah ada tetap sama.

ALTER TABLE properties ADD COLUMN harga_mode TEXT NOT NULL DEFAULT 'total';
