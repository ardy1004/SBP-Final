-- =============================================================================
-- SBP — Migration 0004: Tabel rate limit untuk login admin
-- Menyimpan percobaan login gagal per email (sliding window 15 menit, max 5x)
-- =============================================================================

CREATE TABLE IF NOT EXISTS login_rate_limits (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    identifier   TEXT     NOT NULL,   -- email address yang mencoba login
    ip_address   TEXT,                -- IP pencoba (opsional, untuk audit)
    attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk query cepat: "berapa percobaan dari email X dalam 15 menit terakhir?"
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_time
    ON login_rate_limits(identifier, attempted_at);
