-- 0064 — Jejak penyunting isi pasal per perjanjian (2026-11-21, Tahap C2).
-- Diisi PUT /api/admin/agreements/:id/pasal (editor "Isi Perjanjian").
-- Teks hukum yang bisa disunting wajib bisa ditelusuri siapa & kapan.
-- ALTER TABLE ADD COLUMN tidak idempoten — WAJIB lewat `migrations apply`.

ALTER TABLE agreements ADD COLUMN pasal_diubah_oleh TEXT;
ALTER TABLE agreements ADD COLUMN pasal_diubah_at TEXT;
