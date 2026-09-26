-- Aturan tunggal foto utama: foto dengan urutan terendah = SATU-SATUNYA is_cover=1.
-- Lihat functions/_lib/fotoUtama.js untuk alasan & penjaganya di setiap penulis.
--
-- Sebelum migrasi ini (diukur 2026-09-26, 2.624 foto di 574 properti):
--   - 20 properti punya cover yang BUKAN foto urutan pertama, sehingga kartu
--     listing (is_cover DESC, urutan ASC) dan galeri detail + og:image share WA
--     (urutan ASC) menampilkan foto utama yang BERBEDA.
--   - 507 properti tanpa cover sama sekali (upload admin tak pernah memberinya).
--
-- Langkah 1 — nomori ulang 0..n-1 dengan urutan yang PERSIS ditampilkan kartu
-- listing hari ini, sehingga cover pilihan admin menang (keputusan user). Efek
-- terukur: foto pertama berubah di tepat 20 properti itu, sisanya tetap.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY is_cover DESC, urutan ASC, id ASC) - 1 AS rn
    FROM property_images
)
UPDATE property_images
   SET urutan = (SELECT rn FROM ranked WHERE ranked.id = property_images.id);

-- Langkah 2 — foto urutan 0 jadi satu-satunya cover. Efek terukur: 507 baris
-- mendapat is_cover=1 pada foto yang SUDAH tampil pertama (nol perubahan visual).
UPDATE property_images
   SET is_cover = CASE WHEN urutan = 0 THEN 1 ELSE 0 END;
