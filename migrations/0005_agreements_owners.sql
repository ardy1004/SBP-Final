-- =============================================================================
-- Migrasi 0005 — Gap-fix tabel owners + index tambahan
-- Referensi: SBP_MASTER_SPEC.md section 4.4 (owners) dan 4.5 (agreements)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- [1/4] Rename kolom nik → nik_encrypted
-- Kolom NIK WAJIB terenkripsi at-rest (AES-GCM via Web Crypto).
-- Nama kolom diubah untuk memperjelas bahwa isinya ciphertext, bukan plaintext.
ALTER TABLE owners RENAME COLUMN nik TO nik_encrypted;

-- [2/4] Tambah updated_at yang hilang di tabel owners
ALTER TABLE owners ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- [3/4] Index: agreements(status) — query admin dashboard filter per status
CREATE INDEX IF NOT EXISTS idx_agreements_status
    ON agreements(status);

-- [4/4] Index: owners(property_id) — lookup owner dari property_id
CREATE INDEX IF NOT EXISTS idx_owners_property_id
    ON owners(property_id);
