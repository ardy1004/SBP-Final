-- 0033 — Index (property_id, created_at DESC) untuk viralframe_generations.
--
-- LATAR BELAKANG: tabel ini hanya punya idx_vf_generations_property (migrasi 0012).
-- Tidak ada indeks yang mencakup pengurutan, padahal SEMUA pembacaan riwayat
-- mengurutkan created_at DESC:
--   * ai-generate.js      : ORDER BY created_at DESC LIMIT 8   (TANPA WHERE → full scan)
--   * suggest-storyboard  : WHERE property_id=? ORDER BY created_at DESC LIMIT 10
--   * generations/index   : ORDER BY created_at DESC, id DESC
--
-- Mulai 2026-08-02 Jalur C (ai-generate) juga MENULIS ke tabel ini setiap generate,
-- jadi barisnya akan tumbuh jauh lebih cepat dari sebelumnya dan full scan per
-- generate akan makin mahal. Indeks ini dibuat sebelum pertumbuhan itu terjadi.
--
-- Indeks komposit (property_id, created_at DESC) melayani query per-properti
-- sekaligus menggantikan idx_vf_generations_property (prefix kiri), tapi indeks
-- lama TIDAK dihapus di sini — menghapus indeks bukan operasi yang perlu
-- diburu-buru dan biayanya hanya ruang.
CREATE INDEX IF NOT EXISTS idx_vf_generations_prop_created
    ON viralframe_generations(property_id, created_at DESC);
