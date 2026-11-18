-- Migration 0061: metrik performa konten yang DITARIK OTOMATIS dari Buffer &
-- Zernio (2026-11-18), menggantikan isian manual views/likes yang praktis kosong.
--
-- Dua tabel, keduanya SENGAJA terpisah dari viralframe_scheduled_posts dan
-- viralframe_agent_videos: baris jadwal milik video yang dipurge dihapus
-- pembersih yatim sesudah ±30 hari (purge-trash.js), dan baris videonya ikut
-- hilang di purge. Tanpa salinan di sini, metrik post lama tidak bisa lagi
-- dikaitkan ke properti/agent/DNA kreatifnya — analisis jangka panjang mustahil.
-- Kedua tabel TIDAK dibersihkan purge mana pun.

-- Profil konten per video — disalin SEKALI saat post-nya pertama terdaftar,
-- selagi baris video & order masih ada. DNA kreatif hanya terisi untuk video
-- dari meja kerja ViralFrame (order tertaut via viralframe_orders.video_id);
-- upload manual Konten Agent = NULL.
CREATE TABLE IF NOT EXISTS viralframe_video_profil (
    video_id          INTEGER PRIMARY KEY,
    character_id      INTEGER,   -- pemilik antrean saat diposting
    asal_character_id INTEGER,   -- talent di video bila pernah dipindah (migrasi 0058)
    property_id       INTEGER,
    kode_listing      TEXT,
    jenis_properti    TEXT,
    kecamatan         TEXT,
    harga             INTEGER,
    durasi_detik      REAL,
    poster_url        TEXT,
    order_id          INTEGER,
    variation_key     TEXT,
    -- Creative DNA (stasiunKonsep.js). sudut/hook/naratif = TEKS BEBAS dari AI
    -- (bukan id katalog) — dipetakan ke label katalog saat analisis.
    -- foto_pembuka disimpan sebagai LABEL RUANGAN foto itu, bukan id fotonya:
    -- id foto unik per listing dan tidak bisa dikelompokkan. mood = id enum.
    dna_sudut         TEXT,
    dna_hook          TEXT,
    dna_naratif       TEXT,
    dna_foto_pembuka  TEXT,
    dna_mood          TEXT,
    dibuat_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Satu baris per post yang terbit di satu platform. Kunci = id post di
-- provider (Buffer: node.id, Zernio: latePostId) — sama dengan
-- viralframe_scheduled_posts.remote_post_id.
--
-- Kolom *_d7 = snapshot pada pengamatan PERTAMA sesudah umur ≥ 7 hari, dasar
-- perbandingan antar post (views terus bertambah; membandingkan post umur 2
-- hari dengan umur 20 hari menyesatkan). d7_umur_jam mencatat umur sebenarnya
-- saat snapshot diambil — jujur soal ketidaktepatannya.
CREATE TABLE IF NOT EXISTS viralframe_post_metrik (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    provider            TEXT NOT NULL,
    remote_post_id      TEXT NOT NULL,
    video_id            INTEGER NOT NULL,
    akun_id             INTEGER,
    platform            TEXT NOT NULL,
    terbit_at           TEXT NOT NULL,   -- scheduled_at (ISO +07:00)
    views               INTEGER,
    reach               INTEGER,
    impressions         INTEGER,
    likes               INTEGER,
    comments            INTEGER,
    shares              INTEGER,
    saves               INTEGER,
    avg_tonton_detik    REAL,
    engagement_rate     REAL,
    mentah              TEXT,            -- metrik asli provider (dipotong), untuk field yang belum dipetakan
    views_d7            INTEGER,
    likes_d7            INTEGER,
    comments_d7         INTEGER,
    shares_d7           INTEGER,
    saves_d7            INTEGER,
    avg_tonton_d7       REAL,
    d7_umur_jam         INTEGER,
    diperbarui_provider TEXT,            -- metricsUpdatedAt / lastUpdated dari provider
    ditarik_at          TEXT,
    status_tarik        TEXT,            -- 'ok' | 'sinkron' (provider belum punya angka)
    terdaftar_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, remote_post_id)
);

CREATE INDEX IF NOT EXISTS idx_vpm_akun_platform_terbit ON viralframe_post_metrik(akun_id, platform, terbit_at);
CREATE INDEX IF NOT EXISTS idx_vpm_video ON viralframe_post_metrik(video_id);
