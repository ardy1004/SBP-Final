-- =============================================================================
-- SBP (Salam Bumi Property) — Migrasi Schema Awal
-- Referensi: SBP_MASTER_SPEC.md section 4 (Data Model)
-- D1/SQLite — JANGAN pakai tipe PostgreSQL (SERIAL, JSONB, dll.)
-- Catatan teknis 4.11:
--   • harga_per_m2 = kolom INTEGER biasa, dihitung di application layer
--   • details     = kolom TEXT berisi JSON (bukan tabel terpisah)
--   • Semua BOOLEAN = INTEGER 0/1 (SQLite tidak punya tipe BOOLEAN)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- [1/9] TABLE: locations (4.9)
-- Hierarki 4 level: provinsi → kabupaten → kecamatan → kelurahan
-- parent_id = NULL untuk provinsi; cascade ke bawah via parent_id
-- Dibuat PERTAMA karena tabel lain tidak bergantung padanya
-- =============================================================================
CREATE TABLE IF NOT EXISTS locations (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    nama        TEXT     NOT NULL,
    tipe        TEXT     NOT NULL CHECK(tipe IN ('provinsi','kabupaten','kecamatan','kelurahan')),
    parent_id   INTEGER  REFERENCES locations(id) ON DELETE SET NULL,
    slug        TEXT     NOT NULL,
    latitude    REAL,
    longitude   REAL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [2/9] TABLE: admins (4.10)
-- password_hash = bcrypt (NEVER plaintext)
-- twofa_secret = TOTP secret (nullable, opsional)
-- Nama kolom twofa_secret (bukan 2fa_secret) karena identifier tidak boleh awali angka
-- =============================================================================
CREATE TABLE IF NOT EXISTS admins (
    id              INTEGER  PRIMARY KEY AUTOINCREMENT,
    email           TEXT     NOT NULL UNIQUE,
    password_hash   TEXT     NOT NULL,
    nama            TEXT     NOT NULL,
    role            TEXT     NOT NULL DEFAULT 'admin'
                             CHECK(role IN ('superadmin','admin')),
    last_login      DATETIME,
    twofa_secret    TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [3/9] TABLE: properties (4.1 + 4.3/4.11)
-- ⚠ harga_per_m2 BUKAN generated column — dihitung di app layer (harga ÷ luas_tanah)
-- ⚠ details (TEXT/JSON) menyimpan field spesifik per jenis (lihat 4.3):
--     Kost  : {"jenis_kost":"putri","ruang_penjaga":true,"token_listrik_per_kamar":false}
--     Hotel : {"jenis_hotel":"bintang_3"}
--     Apt   : {"no_unit":"A-12"}
-- Field yang sering di-filter (KT, KM, LT, LB, harga) tetap kolom asli
-- alamat = privat; publik hanya tampilkan kecamatan + kabupaten
-- =============================================================================
CREATE TABLE IF NOT EXISTS properties (
    id                      INTEGER  PRIMARY KEY AUTOINCREMENT,
    kode_listing            TEXT     NOT NULL UNIQUE,
    title                   TEXT     NOT NULL,
    slug                    TEXT     NOT NULL UNIQUE,
    jenis_properti          TEXT     NOT NULL
                                     CHECK(jenis_properti IN (
                                         'rumah','tanah','kost','hotel',
                                         'homestay','villa','apartment','gudang','komersial'
                                     )),
    tujuan                  TEXT     NOT NULL
                                     CHECK(tujuan IN ('dijual','disewa','dijual_disewa')),
    harga                   INTEGER  NOT NULL DEFAULT 0,
    harga_lama              INTEGER,
    harga_sewa_tahun        INTEGER,
    nego                    INTEGER  NOT NULL DEFAULT 0,
    nett                    INTEGER  NOT NULL DEFAULT 0,
    jumlah_kamar_tidur      INTEGER,
    jumlah_kamar_mandi      INTEGER,
    luas_tanah              INTEGER,
    luas_bangunan           INTEGER,
    lebar_depan             REAL,
    lantai                  INTEGER,
    harga_per_m2            INTEGER,
    furnished               TEXT     CHECK(furnished IN ('fully','semi','unfurnished')),
    legalitas               TEXT,
    status_legalitas        TEXT     CHECK(status_legalitas IN ('on_hand','on_bank')),
    bank_agunan             TEXT,
    outstanding_bank        INTEGER,
    jarak_sungai_m          INTEGER,
    jarak_makam_m           INTEGER,
    jarak_sutet_m           INTEGER,
    lebar_jalan_m           REAL,
    provinsi                TEXT     NOT NULL DEFAULT '',
    kabupaten               TEXT     NOT NULL DEFAULT '',
    kecamatan               TEXT     NOT NULL DEFAULT '',
    kelurahan               TEXT     NOT NULL DEFAULT '',
    alamat                  TEXT,
    latitude                REAL,
    longitude               REAL,
    gmaps_link              TEXT,
    deskripsi               TEXT,
    info_tambahan           TEXT,
    alasan_dijual           TEXT,
    video_youtube           TEXT,
    income_per_bulan        INTEGER,
    pengeluaran_per_bulan   INTEGER,
    harga_sewa_kamar_bulan  INTEGER,
    badge_premium           INTEGER  NOT NULL DEFAULT 0,
    badge_featured          INTEGER  NOT NULL DEFAULT 0,
    badge_hot               INTEGER  NOT NULL DEFAULT 0,
    status_sold             INTEGER  NOT NULL DEFAULT 0,
    properti_pilihan        INTEGER  NOT NULL DEFAULT 0,
    verified                INTEGER  NOT NULL DEFAULT 0,
    views_count             INTEGER  NOT NULL DEFAULT 0,
    status_publish          TEXT     NOT NULL DEFAULT 'draft'
                                     CHECK(status_publish IN ('draft','published')),
    meta_title              TEXT,
    meta_description        TEXT,
    details                 TEXT,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at            DATETIME
);

-- =============================================================================
-- [4/9] TABLE: property_images (4.2)
-- ON DELETE CASCADE: hapus properti → semua fotonya ikut terhapus
-- =============================================================================
CREATE TABLE IF NOT EXISTS property_images (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER  NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    url_webp    TEXT     NOT NULL,
    alt_text    TEXT,
    urutan      INTEGER  NOT NULL DEFAULT 0,
    is_cover    INTEGER  NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [5/9] TABLE: owners (4.4) — DATA PRIVAT
-- nik WAJIB dienkripsi AES di application layer sebelum INSERT
-- data_ahli_waris = JSON: {jumlah_ahli_waris, semua_sepakat, kuasa_notaris, turun_waris}
-- =============================================================================
CREATE TABLE IF NOT EXISTS owners (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    nama_pemilik        TEXT     NOT NULL,
    no_wa_1             TEXT     NOT NULL,
    no_wa_2             TEXT,
    gmaps               TEXT,
    nik                 TEXT,
    nama_ktp            TEXT,
    alamat_ktp          TEXT,
    rt_rw               TEXT,
    kelurahan           TEXT,
    kecamatan           TEXT,
    bertindak_sebagai   TEXT     CHECK(bertindak_sebagai IN (
                                     'owner_sah','pasangan','ahli_waris','lainnya'
                                 )),
    data_ahli_waris     TEXT,
    property_id         INTEGER  REFERENCES properties(id) ON DELETE SET NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [6/9] TABLE: agreements (4.5) — KONTRAK PERJANJIAN
-- sign_token: UUID v4 / random 32-char, UNIK, single-use
-- token_expires_at: default +72 jam dari generate (ditentukan di app layer)
-- token_used: 1 = sudah ditandatangani, link tidak bisa dipakai ulang
-- audit_*: jejak untuk kepatuhan UU ITE
-- =============================================================================
CREATE TABLE IF NOT EXISTS agreements (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    kode_perjanjian     TEXT     NOT NULL UNIQUE,
    property_id         INTEGER  NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    owner_id            INTEGER  NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    jenis_transaksi     TEXT     NOT NULL CHECK(jenis_transaksi IN ('jual','sewa')),
    jenis_listing       TEXT     NOT NULL CHECK(jenis_listing IN ('open','exclusive')),
    durasi_kontrak      INTEGER,
    fee_persen          REAL     NOT NULL DEFAULT 3.0,
    status              TEXT     NOT NULL DEFAULT 'draft'
                                 CHECK(status IN (
                                     'draft','opsi_dikonfigurasi',
                                     'menunggu_ttd','signed','expired'
                                 )),
    sign_token          TEXT     UNIQUE,
    token_expires_at    DATETIME,
    token_used          INTEGER  NOT NULL DEFAULT 0,
    signature_image_url TEXT,
    signed_at           DATETIME,
    audit_ip            TEXT,
    audit_user_agent    TEXT,
    audit_hash_dokumen  TEXT,
    link_opened_count   INTEGER  NOT NULL DEFAULT 0,
    pdf_url             TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [7/9] TABLE: leads (4.6) — CRM PEMBELI
-- Spec K6: lead WAJIB tersimpan ke DB sebelum membuka WhatsApp
-- notes = JSON array: [{teks: "...", admin: "Monica", waktu: "2024-..."}]
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads (
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
                                     'baru','dihubungi','viewing','nego','closed','lost'
                                 )),
    notes               TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [8/9] TABLE: testimonials (4.7)
-- tampilkan: 1 = tampil di slider homepage
-- urutan: drag-reorder di admin (angka lebih kecil = tampil lebih dulu)
-- =============================================================================
CREATE TABLE IF NOT EXISTS testimonials (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    nama_klien          TEXT     NOT NULL,
    foto_url            TEXT,
    lokasi              TEXT,
    rating              INTEGER  NOT NULL DEFAULT 5 CHECK(rating BETWEEN 1 AND 5),
    isi_testimoni       TEXT     NOT NULL,
    jenis_transaksi     TEXT,
    properti_terkait    INTEGER  REFERENCES properties(id) ON DELETE SET NULL,
    tanggal             DATE,
    tampilkan           INTEGER  NOT NULL DEFAULT 1,
    urutan              INTEGER  NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- [9/9] TABLE: blog_posts (4.8)
-- tags = JSON array: ["KPR","Investasi","Panduan"]
-- author_id → admins.id (ON DELETE SET NULL: post tetap ada meski admin dihapus)
-- reading_time_menit = dihitung di app layer (panjang konten ÷ 200 kata/menit)
-- =============================================================================
CREATE TABLE IF NOT EXISTS blog_posts (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    judul               TEXT     NOT NULL,
    slug                TEXT     NOT NULL UNIQUE,
    cover               TEXT,
    excerpt             TEXT,
    konten              TEXT,
    kategori            TEXT,
    tags                TEXT,
    author_id           INTEGER  REFERENCES admins(id) ON DELETE SET NULL,
    reading_time_menit  INTEGER,
    status              TEXT     NOT NULL DEFAULT 'draft'
                                 CHECK(status IN ('draft','published','scheduled')),
    published_at        DATETIME,
    meta_title          TEXT,
    meta_description    TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES WAJIB (4.11)
-- =============================================================================

-- Filter listing utama: jenis properti + status publish
CREATE INDEX IF NOT EXISTS idx_properties_jenis_status
    ON properties(jenis_properti, status_publish);

-- Query lokasi: cascading filter + programmatic SEO
CREATE INDEX IF NOT EXISTS idx_properties_lokasi
    ON properties(provinsi, kabupaten, kecamatan);

-- Lookup by slug: halaman detail, validasi unik saat save
CREATE INDEX IF NOT EXISTS idx_properties_slug
    ON properties(slug);

-- Sort & filter harga
CREATE INDEX IF NOT EXISTS idx_properties_harga
    ON properties(harga);

-- CRM kanban: query lead per status pipeline
CREATE INDEX IF NOT EXISTS idx_leads_status_pipeline
    ON leads(status_pipeline);

-- Validasi token TTD (halaman /sign/:token)
CREATE INDEX IF NOT EXISTS idx_agreements_sign_token
    ON agreements(sign_token);

-- Cascading dropdown lokasi: WHERE parent_id = ?
CREATE INDEX IF NOT EXISTS idx_locations_parent_id
    ON locations(parent_id);

-- =============================================================================
-- INDEXES TAMBAHAN (untuk performa query umum)
-- =============================================================================

-- Banner carousel: ambil properti pilihan yang published
CREATE INDEX IF NOT EXISTS idx_properties_pilihan
    ON properties(properti_pilihan, status_publish);

-- Homepage & listing: sort terbaru
CREATE INDEX IF NOT EXISTS idx_properties_published_at
    ON properties(published_at);

-- Blog: query artikel published + sort terbaru
CREATE INDEX IF NOT EXISTS idx_blog_posts_status
    ON blog_posts(status, published_at);

-- Lead per properti: hitung leads per listing di admin overview
CREATE INDEX IF NOT EXISTS idx_leads_property_id
    ON leads(property_id);

-- Images per properti: ambil semua foto urut dari satu properti
CREATE INDEX IF NOT EXISTS idx_property_images_property_id
    ON property_images(property_id, urutan);
