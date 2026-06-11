-- [12] ViralFrame — fondasi Fase V1
-- Fitur generate prompt video AI per listing properti.
--
-- viralframe_characters  = library karakter (talent) yang bisa di-assign ke scene.
--                          foto_url menyimpan R2 key (prefix 'viralframe-characters/').
-- viralframe_generations = riwayat generate prompt per properti.
--                          params_json menyimpan seluruh parameter (scene count, durasi,
--                          platform, ai_tool, hook_type, cta_type, foto assignments, character_id).
--                          result_json = hasil validasi JSON dari user (nullable).

CREATE TABLE IF NOT EXISTS viralframe_characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nama        TEXT    NOT NULL,
    foto_url    TEXT    NOT NULL,
    gender      TEXT,
    usia        INTEGER,
    etnik       TEXT,
    style       TEXT,
    ciri_fisik  TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS viralframe_generations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id   INTEGER NOT NULL,
    params_json   TEXT    NOT NULL,
    master_prompt TEXT,
    result_json   TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vf_generations_property
    ON viralframe_generations(property_id);
