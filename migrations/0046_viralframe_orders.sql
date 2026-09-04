-- Migration 0046: PESANAN PRODUKSI ViralFrame (M1).
--
-- ─── Kenapa tabel ini ada ────────────────────────────────────────────────────
-- Sampai sekarang ViralFrame berbentuk WIZARD: state satu video hidup di React
-- + localStorage (`vf_draft_<id>`), dan yang tersimpan ke D1 hanya ARTEFAK
-- akhirnya (`viralframe_generations`). Akibatnya empat hal yang tampak seperti
-- bug terpisah sebenarnya satu penyebab — tidak ada objek "pekerjaan" yang bisa
-- dipegang sistem:
--   · rotasi tidak pernah jalan  → keputusan tak pernah disimpan sebagai vektor
--   · produksi manual satu-satu  → tidak ada antrean yang bisa dijalankan cron
--   · kegagalan tidak terlihat   → tidak ada yang bisa berstatus 'gagal'
--   · 87% katalog tak tersentuh  → pelabelan jadi syarat masuk, bukan stasiun
--
-- Satu baris di sini = satu video yang sedang dibuat, dari dipesan sampai tayang.
--
-- ⚠️ SENGAJA TIDAK menumpang `viralframe_generations`. Tabel itu menyimpan
-- `params_json` yang bentuknya SUDAH pernah berubah (pembacanya harus toleran
-- `p?.s1 ?? p`). Menaruh status + vektor rotasi di dalam blob JSON yang tidak
-- stabil bentuknya adalah persis cara dua mekanisme anti-pengulangan sebelumnya
-- mati diam-diam. Status dan variation_key WAJIB kolom ber-index.

CREATE TABLE IF NOT EXISTS viralframe_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id   INTEGER NOT NULL REFERENCES properties(id)             ON DELETE CASCADE,
    character_id  INTEGER NOT NULL REFERENCES viralframe_characters(id)  ON DELETE CASCADE,

    -- Stasiun tempat pesanan ini berada. Urutannya:
    --   baru → material → variasi → konsep → storyboard → menunggu_render → selesai
    -- Keluar jalur: 'gagal' (bisa diulang) · 'batal' (dihentikan user).
    -- ⚠️ 'menunggu_render' BUKAN kegagalan — di situlah gerbang manusia berada
    -- (menempel prompt ke Google Flow lalu mengunggah hasilnya), dan pesanan
    -- memang wajar diam berjam-jam bahkan berhari-hari di status ini.
    status        TEXT    NOT NULL DEFAULT 'baru',

    -- Sidik jari kombinasi SUMBU DOMINAN yang dipakai video ini (mekanisme
    -- naratif, struktur hook, foto pembuka, ritme cut, mood). Diisi stasiun
    -- Variasi (M4); NULL sampai saat itu.
    variation_key TEXT,

    -- Lima parameter yang boleh diubah manusia (total part, durasi per part,
    -- durasi VO per part, CTA, platform). NULL = pakai default lapis konstanta.
    params_json   TEXT,
    -- Keluaran stasiun (storyboard, prompt, dsb). Diisi bertahap.
    hasil_json    TEXT,
    -- Pesan kegagalan terakhir, apa adanya — supaya 'gagal' bisa ditindaklanjuti
    -- tanpa harus membuka log.
    catatan       TEXT,

    -- Video yang dihasilkan, begitu diunggah lewat stasiun Aset. Menyambungkan
    -- pesanan ke seluruh mesin distribusi yang SUDAH berjalan (scheduler, metrik).
    -- ON DELETE SET NULL, bukan CASCADE: menghapus video dari Sampah tidak boleh
    -- ikut menghapus jejak pesanannya — pelajaran dari `owners` (migrasi 0045).
    video_id      INTEGER REFERENCES viralframe_agent_videos(id) ON DELETE SET NULL,

    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

-- Antrean per stasiun (dipakai layar Antrean & cron produksi).
CREATE INDEX IF NOT EXISTS idx_vfo_status  ON viralframe_orders(status, created_at);
-- Antrean per agent + hitung pesanan terbuka untuk penjaga kuota Flow.
CREATE INDEX IF NOT EXISTS idx_vfo_agent   ON viralframe_orders(character_id, status);
-- Riwayat pesanan sebuah listing (dipakai selector rotasi di M4).
CREATE INDEX IF NOT EXISTS idx_vfo_listing ON viralframe_orders(property_id, created_at);

-- ⚠️ ATURAN ROTASI DITEGAKKAN DI SINI, BUKAN DI PROMPT.
-- Dua percobaan anti-pengulangan sebelumnya gagal justru karena mengandalkan
-- kepatuhan model / query yang tidak difilter. Ini membuat variasi kembar
-- MUSTAHIL disimpan, bukan sekadar tidak dianjurkan.
--
-- Dibuat SEKARANG meski `variation_key` baru diisi di M4: SQLite tidak bisa
-- menambah constraint lewat ALTER, dan pola RENAME→CREATE→DROP untuk
-- menambahkannya belakangan persis yang nyaris menghapus data di migrasi 0022.
--
-- Aman untuk baris M1: di SQLite NULL tidak pernah sama dengan NULL, jadi
-- banyak baris ber-variation_key NULL tetap boleh berdampingan.
--
-- Kuncinya (property_id, variation_key) TANPA character_id — aturannya
-- "tiap LISTING wajib rotasi", jadi agent berbeda pun tidak boleh memakai
-- kombinasi sumbu dominan yang sama untuk listing yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vfo_variasi
    ON viralframe_orders(property_id, variation_key);
