-- =============================================================================
-- SBP — Migration 0049: Rem anti-flood untuk /api/titip-jual-tiket-foto
--
-- Endpoint itu menerbitkan tiket JWT (scope titipjual-foto) tanpa syarat input
-- apa pun — beda dari pendahulunya (titip-jual-prospek.js) yang minimal
-- mewajibkan nama+WA berformat valid sebelum menerbitkan tiket sejenis. Tabel
-- ini murni penghitung "berapa tiket diterbitkan semenit terakhir" (pola sama
-- dengan login_rate_limits) — tidak dibaca fitur lain, hanya dihitung COUNT()
-- dan dibersihkan retensi 1 hari lewat purge-trash (lihat bersihkanTabel()).
-- =============================================================================

CREATE TABLE IF NOT EXISTS titip_jual_tiket_log (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_titip_jual_tiket_log_created ON titip_jual_tiket_log(created_at);
