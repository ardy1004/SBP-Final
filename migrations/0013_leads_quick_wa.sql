-- Migration 0013: Support quick_wa lead type dari sticky WA bar
--
-- Perubahan:
--   1. tipe_pengirim CHECK: tambah 'quick_wa' (jalur sticky bar, tanpa form lengkap)
--   2. nama: hapus NOT NULL — quick_wa tidak punya nama pengunjung
--   3. no_wa: hapus NOT NULL — quick_wa tidak punya nomor WA pengunjung
--
-- Kolom lain IDENTIK dengan 0009_update_leads_pipeline.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE leads_new (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    property_id         INTEGER  REFERENCES properties(id) ON DELETE SET NULL,
    nama                TEXT,
    no_wa               TEXT,
    asal_daerah         TEXT,
    tipe_pengirim       TEXT     CHECK(tipe_pengirim IN ('pembeli','penjual','broker','quick_wa')),
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

INSERT INTO leads_new SELECT * FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

CREATE INDEX IF NOT EXISTS idx_leads_status_pipeline ON leads(status_pipeline);
CREATE INDEX IF NOT EXISTS idx_leads_property_id     ON leads(property_id);

PRAGMA foreign_keys = ON;
