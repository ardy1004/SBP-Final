-- Migration 0008: Tambah 'ruko' ke CHECK jenis_properti + selaraskan label
-- Dari 9 nilai menjadi 10: tambah 'ruko' sebagai tipe properti tersendiri
-- SQLite tidak support ALTER TABLE CHECK — perlu recreate table (pola sama 0006)
-- Kolom lain TIDAK diubah — HANYA CHECK jenis_properti yang diperluas

PRAGMA foreign_keys = OFF;

CREATE TABLE properties_new (
    id                      INTEGER  PRIMARY KEY AUTOINCREMENT,
    kode_listing            TEXT     NOT NULL UNIQUE,
    title                   TEXT     NOT NULL,
    slug                    TEXT     NOT NULL UNIQUE,
    jenis_properti          TEXT     NOT NULL
                                     CHECK(jenis_properti IN (
                                         'rumah','tanah','kost','hotel',
                                         'homestay','villa','apartment','ruko','gudang','komersial'
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
                                     CHECK(status_publish IN ('draft','published','sold','archived')),
    meta_title              TEXT,
    meta_description        TEXT,
    details                 TEXT,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at            DATETIME
);

INSERT INTO properties_new SELECT * FROM properties;

DROP TABLE properties;
ALTER TABLE properties_new RENAME TO properties;

PRAGMA foreign_keys = ON;
