-- Riwayat caption/hashtag yang pernah digenerate ViralFrame.
-- Dipakai untuk exclusion: saat generate caption baru, pembuka & hashtag yang
-- baru saja dipakai dikirim ke AI sebagai daftar "jangan pakai lagi", supaya
-- konten tidak terasa monoton/generik dan tidak terbaca berulang oleh algoritma
-- media sosial. Pola sama dengan exclusion hook/CTA di ai-generate.js (Tahap 4).
--
-- `opening` = kalimat pertama caption, dinormalisasi (lowercase, tanpa tanda
-- baca ujung) — dibandingkan sebagai teks, bukan hash, supaya bisa dibaca
-- manusia saat debugging.
CREATE TABLE IF NOT EXISTS viralframe_caption_history (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER  REFERENCES properties(id) ON DELETE CASCADE,
  opening     TEXT     NOT NULL,
  hashtags    TEXT     NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Query exclusion selalu "N terbaru lintas katalog" → index pada created_at.
CREATE INDEX IF NOT EXISTS idx_vf_caption_history_created
  ON viralframe_caption_history(created_at DESC);
