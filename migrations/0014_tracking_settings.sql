-- Migration 0014: Tracking & Analytics foundation
-- Tabel pixel_configs (multi-pixel Meta) + settings key-value (GA4, GTM, Search Console)

CREATE TABLE IF NOT EXISTS pixel_configs (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    label               TEXT     NOT NULL,
    pixel_id            TEXT     NOT NULL,
    is_active           INTEGER  NOT NULL DEFAULT 1,
    events_enabled      TEXT     NOT NULL DEFAULT '["PageView","ViewContent","Search","Contact","Lead"]',
    capi_access_token   TEXT,
    created_at          TEXT     NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('ga4_measurement_id',          NULL),
    ('gtm_container_id',            NULL),
    ('search_console_verification', NULL);
