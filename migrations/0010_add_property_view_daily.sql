-- [10] TABLE: property_view_daily
-- Tracking views dan WA clicks per properti per hari.
-- views    = jumlah buka halaman detail properti hari itu
-- wa_clicks = jumlah klik tombol "Hubungi via WA" hari itu (sticky bar mobile)
-- UNIQUE(property_id, tanggal) → aman untuk upsert ON CONFLICT DO UPDATE

CREATE TABLE IF NOT EXISTS property_view_daily (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER  NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    tanggal     DATE     NOT NULL DEFAULT (DATE('now','localtime')),
    views       INTEGER  NOT NULL DEFAULT 0,
    wa_clicks   INTEGER  NOT NULL DEFAULT 0,
    UNIQUE(property_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_pvd_property_tanggal
    ON property_view_daily(property_id, tanggal);

CREATE INDEX IF NOT EXISTS idx_pvd_tanggal
    ON property_view_daily(tanggal);
