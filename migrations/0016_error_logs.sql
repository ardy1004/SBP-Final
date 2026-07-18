-- Migration 0016: Error tracking — satu tabel untuk error client (React crash,
-- window.onerror, unhandledrejection) dan server (catch block Functions).
-- Ganti console.error yang menguap begitu terminal wrangler tail ditutup.

CREATE TABLE IF NOT EXISTS error_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT    NOT NULL,           -- 'client' | 'server'
    message     TEXT    NOT NULL,
    stack       TEXT,
    url         TEXT,                       -- halaman/endpoint saat error terjadi
    user_agent  TEXT,
    context     TEXT,                       -- JSON bebas (mis. { admin_id, property_id })
    resolved    INTEGER NOT NULL DEFAULT 0, -- ditandai admin setelah ditinjau
    created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved, created_at DESC);
