-- 0065 — Template isi pasal Perjanjian Jasa Pemasaran berversi (2026-11-21, Tahap C3).
-- Admin → Pengaturan → Template Perjanjian. Menyimpan = baris versi BARU, tidak
-- pernah menimpa — perjanjian yang sudah membekukan salinan (pasal_json) tidak
-- tersentuh. Versi 1 = TEMPLATE_V1 di functions/_lib/teksPerjanjian.js (kode,
-- bukan baris), jadi tabel kosong = masih memakai versi 1; versi baru mulai 2.
-- blok_json: [{ judul, isi, berlaku: { listing: [...], tujuan: [...] } }]
-- CREATE IF NOT EXISTS: aman diulang.

CREATE TABLE IF NOT EXISTS perjanjian_template (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  versi       INTEGER NOT NULL UNIQUE CHECK (versi >= 2),
  blok_json   TEXT    NOT NULL,
  catatan     TEXT,
  dibuat_oleh TEXT,
  dibuat_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
