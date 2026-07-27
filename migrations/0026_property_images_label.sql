-- Migration 0026: label ruangan per foto properti
--
-- KENAPA ADA
-- ViralFrame membutuhkan label ruangan ("Dapur", "Fasad", dst) untuk meng-ground
-- prompt video ke foto yang benar. Sebelum ini label TIDAK PERNAH tersimpan: ia
-- hanya dipilih ulang setiap sesi di Step 2 (Jalur A) dan di YouTube Long.
-- Akibatnya mode "Storyboard massal" mengirim label palsu (Foto 1..Foto 12)
-- karena tidak ada sumber label mana pun — AI lalu mengarang isi ruangan.
-- Lihat AUDIT_VIRALFRAME_2026-07-26.md temuan Y3.
--
-- Kolom NULLABLE tanpa default: 533 listing yang sudah ada tetap valid, dan
-- "belum berlabel" bisa dibedakan dari "berlabel kosong".
--
-- Nilai yang sah = PHOTO_LABELS di src/app/components/admin/viralframe/options.ts
-- (24 entri, Title Case). Sengaja TIDAK dipaksakan lewat CHECK constraint agar
-- daftar label bisa berkembang tanpa migrasi baru; validasi ada di endpoint PATCH.

ALTER TABLE property_images ADD COLUMN label_ruangan TEXT;
