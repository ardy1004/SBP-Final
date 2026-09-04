-- Migration 0047: hasil Stasiun Material ViralFrame pada foto properti.
--
-- Stasiun Material menjalankan SATU lintasan visi per foto dan memanen TIGA hal
-- sekaligus. Dua di antaranya belum punya kolom:
--
--   · label_ruangan  — SUDAH ADA (migrasi 0026). Diisi manual selama ini; kini
--                      bisa diisi otomatis.
--   · vf_skor        — kelayakan foto sebagai bahan VIDEO, 0-100. BEDA dari
--                      `is_cover`: cover dipilih karena menjual di listing,
--                      belum tentu bagus untuk gerak kamera. Sebelum ini backend
--                      memilih foto pakai is_cover + urutan — proksi popularitas,
--                      bukan kualitas sinematik.
--   · vf_catatan     — satu kalimat "apa yang menjual dari foto ini", dipakai
--                      stasiun Konsep & Storyboard sebagai bahan naratif.
--
-- Ketiganya milik FOTO, bukan pesanan: sekali dilabeli, dipakai semua pesanan
-- berikutnya untuk listing itu.

ALTER TABLE property_images ADD COLUMN vf_skor INTEGER;
ALTER TABLE property_images ADD COLUMN vf_catatan TEXT;
-- Kapan lintasan visi terakhir menyentuh foto ini. NULL = belum pernah.
-- Dipakai agar batch pelabelan bisa dilanjutkan dari tempat berhenti tanpa
-- mengulang foto yang sudah selesai — pelabelan 2.483 foto terikat kuota harian
-- provider, jadi ia MEMANG akan berjalan berhari-hari dan wajib bisa dilanjut.
ALTER TABLE property_images ADD COLUMN vf_dinilai_at TEXT;

-- Pencarian "foto mana yang belum dinilai" adalah query terpanas stasiun ini.
CREATE INDEX IF NOT EXISTS idx_pi_vf_belum ON property_images(property_id, vf_dinilai_at);
