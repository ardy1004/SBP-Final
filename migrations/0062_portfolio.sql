-- 0062 — Portofolio "bukti kerja" (2026-11-21).
-- Foto AJB / survey lokasi / serah terima kunci + keterangan, ditampilkan di
-- beranda (strip bergulir) dan /portfolio. Satu baris = satu foto.
--
-- Foto disimpan di R2 MEDIA prefiks `portfolio/` (dua ukuran: foto 1280 px dan
-- thumb 480 px), disajikan publik lewat /api/media. Foto SUDAH disensor & EXIF
-- dibuang di browser sebelum diunggah (canvas → WebP).
--
-- `tampil` hanya boleh 1 bila `aman_dikonfirmasi` = 1 (dijaga server):
-- foto AJB memuat nama, NIK, alamat, nomor sertifikat — admin wajib menyatakan
-- sudah menutup bagian sensitif sebelum foto bisa tampil publik.
-- CREATE IF NOT EXISTS: aman diulang.

CREATE TABLE IF NOT EXISTS portfolio_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kategori          TEXT    NOT NULL CHECK (kategori IN ('ajb', 'survey', 'serah_terima', 'lainnya')),
  foto_key          TEXT    NOT NULL,
  thumb_key         TEXT    NOT NULL,
  keterangan        TEXT    NOT NULL DEFAULT '',
  lokasi            TEXT,
  tanggal           TEXT,
  property_id       INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  tampil            INTEGER NOT NULL DEFAULT 0 CHECK (tampil IN (0, 1)),
  aman_dikonfirmasi INTEGER NOT NULL DEFAULT 0 CHECK (aman_dikonfirmasi IN (0, 1)),
  urutan            INTEGER NOT NULL DEFAULT 0,
  dibuat_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diubah_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_portfolio_tampil_urutan ON portfolio_items (tampil, urutan);
