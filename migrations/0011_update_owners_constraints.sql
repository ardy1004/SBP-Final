PRAGMA foreign_keys=OFF;

CREATE TABLE owners_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_pemilik      TEXT,
  no_wa_1           TEXT NOT NULL,
  no_wa_2           TEXT,
  gmaps             TEXT,
  nik_encrypted     TEXT,
  nama_ktp          TEXT,
  alamat_ktp        TEXT,
  rt_rw             TEXT,
  kelurahan         TEXT,
  kecamatan         TEXT,
  bertindak_sebagai TEXT CHECK(bertindak_sebagai IN ('pemilik_sertifikat','suami_istri','ahli_waris','lainnya')),
  data_ahli_waris   TEXT,
  property_id       INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO owners_new
  SELECT
    id, nama_pemilik, no_wa_1, no_wa_2, gmaps,
    nik_encrypted, nama_ktp, alamat_ktp, rt_rw, kelurahan, kecamatan,
    CASE bertindak_sebagai
      WHEN 'owner_sah'  THEN 'pemilik_sertifikat'
      WHEN 'pasangan'   THEN 'suami_istri'
      WHEN 'ahli_waris' THEN 'ahli_waris'
      WHEN 'lainnya'    THEN 'lainnya'
      WHEN 'pemilik_sertifikat' THEN 'pemilik_sertifikat'
      WHEN 'suami_istri'        THEN 'suami_istri'
      ELSE NULL
    END,
    data_ahli_waris, property_id, created_at, updated_at
  FROM owners;

DROP TABLE owners;
ALTER TABLE owners_new RENAME TO owners;

PRAGMA foreign_keys=ON;
