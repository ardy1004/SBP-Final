-- Migration 0009: Update leads.status_pipeline CHECK constraint
-- Pipeline lama: baru, dihubungi, viewing, nego, closed, lost (6 tahap)
-- Pipeline baru: baru, dihubungi, negosiasi, closing, arsip (5 tahap)
--
-- Mapping nilai lama → baru saat INSERT:
--   viewing → dihubungi  (belum ada nama "viewing" di pipeline baru)
--   nego    → negosiasi
--   closed  → closing
--   lost    → arsip
--
-- Pola: PRAGMA FK off → CREATE leads_new → INSERT+remap → DROP lama → RENAME
-- Kolom lain IDENTIK dengan 0001_initial_schema.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE leads_new (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    property_id         INTEGER  REFERENCES properties(id) ON DELETE SET NULL,
    nama                TEXT     NOT NULL,
    no_wa               TEXT     NOT NULL,
    asal_daerah         TEXT,
    tipe_pengirim       TEXT     CHECK(tipe_pengirim IN ('pembeli','penjual','broker')),
    budget              TEXT,
    rencana_pembayaran  TEXT     CHECK(rencana_pembayaran IN ('hard_cash','soft_cash','kpr')),
    pesan               TEXT,
    source_page         TEXT,
    wa_clicked_at       DATETIME,
    status_pipeline     TEXT     NOT NULL DEFAULT 'baru'
                                 CHECK(status_pipeline IN (
                                     'baru','dihubungi','negosiasi','closing','arsip'
                                 )),
    notes               TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leads_new
SELECT
    id,
    property_id,
    nama,
    no_wa,
    asal_daerah,
    tipe_pengirim,
    budget,
    rencana_pembayaran,
    pesan,
    source_page,
    wa_clicked_at,
    CASE status_pipeline
        WHEN 'viewing' THEN 'dihubungi'
        WHEN 'nego'    THEN 'negosiasi'
        WHEN 'closed'  THEN 'closing'
        WHEN 'lost'    THEN 'arsip'
        ELSE status_pipeline
    END,
    notes,
    created_at,
    updated_at
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

-- Recreate indexes (hilang bersama tabel lama)
CREATE INDEX IF NOT EXISTS idx_leads_status_pipeline ON leads(status_pipeline);
CREATE INDEX IF NOT EXISTS idx_leads_property_id     ON leads(property_id);

PRAGMA foreign_keys = ON;
