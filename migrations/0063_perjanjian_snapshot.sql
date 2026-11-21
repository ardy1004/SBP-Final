-- 0063 — Salinan beku isi pasal per perjanjian + versi formula hash (2026-11-21).
-- Fondasi editor isi perjanjian (Tahap C1). Lihat functions/_lib/teksPerjanjian.js.
--
-- pasal_json           : salinan blok pasal untuk varian perjanjian ini, dibekukan
--                        saat link TTD dibuat (configure.js). NULL = perjanjian
--                        lama → teks lama (susunPasalLama), tidak berubah.
-- pasal_template_versi : versi template sumber salinan.
-- pasal_kustom         : 1 = isi pasal disunting admin khusus perjanjian ini (C2).
-- audit_hash_versi     : formula audit_hash_dokumen. NULL/1 = kepala saja
--                        (perilaku lama), 2 = kepala + seluruh pasal.
--
-- ALTER TABLE ADD COLUMN tidak idempoten — WAJIB lewat `migrations apply`
-- (tercatat di d1_migrations), jangan `d1 execute` manual.

ALTER TABLE agreements ADD COLUMN pasal_json TEXT;
ALTER TABLE agreements ADD COLUMN pasal_template_versi INTEGER;
ALTER TABLE agreements ADD COLUMN pasal_kustom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agreements ADD COLUMN audit_hash_versi INTEGER;
