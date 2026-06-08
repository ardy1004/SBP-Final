INSERT INTO blog_posts
  (judul, slug, cover, excerpt, konten, kategori, tags, author_id,
   reading_time_menit, status, published_at, meta_title, meta_description,
   created_at, updated_at)
VALUES
  ('5 Tips Memilih Rumah Pertama untuk Keluarga Muda',
   'tips-memilih-rumah-pertama-a1b2',
   'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80',
   'Panduan praktis memilih rumah pertama: lokasi, legalitas, dan strategi KPR yang aman untuk keluarga muda.',
   '<p>Membeli rumah pertama adalah salah satu keputusan finansial terbesar dalam hidup. Berikut panduan singkat dari tim Salam Bumi Property.</p><h2>1. Tentukan Lokasi yang Tepat</h2><p>Pertimbangkan akses ke tempat kerja, sekolah, dan fasilitas umum. Lokasi menentukan kenyamanan sekaligus potensi kenaikan nilai aset.</p><h2>2. Periksa Legalitas</h2><p>Pastikan sertifikat SHM dan IMB/PBG lengkap sebelum transaksi.</p><h2>3. Hitung Kemampuan KPR</h2><p>Idealnya cicilan tidak melebihi 30% penghasilan bulanan.</p><ul><li>Siapkan dana darurat</li><li>Bandingkan suku bunga bank</li><li>Perhatikan biaya tambahan (BPHTB, notaris)</li></ul><p>Hubungi admin SBP untuk konsultasi gratis.</p>',
   'Panduan',
   '["Rumah","Tips","KPR"]',
   (SELECT id FROM admins ORDER BY id LIMIT 1),
   3, 'published', CURRENT_TIMESTAMP, NULL, NULL,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('Strategi Investasi Properti Kost di Jogja',
   'strategi-investasi-kost-jogja-c3d4',
   'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&q=80',
   'Mengapa kost di sekitar kampus Yogyakarta menjadi primadona investasi dengan yield yang menarik.',
   '<p>Yogyakarta sebagai kota pelajar memiliki permintaan hunian sewa yang stabil sepanjang tahun.</p><h2>Potensi Yield</h2><p>Kost di dekat kampus besar (UGM, UNY, UII) dapat menghasilkan yield 8-12% per tahun, jauh di atas deposito.</p><h2>Yang Perlu Diperhatikan</h2><ul><li>Jarak ke kampus dan akses transportasi</li><li>Tingkat hunian (occupancy rate)</li><li>Biaya operasional dan perawatan</li></ul><p>Dengan pengelolaan yang baik, kost adalah aset produktif jangka panjang.</p>',
   'Investasi',
   '["Investasi","Kost","Jogja"]',
   (SELECT id FROM admins ORDER BY id LIMIT 1),
   4, 'published', CURRENT_TIMESTAMP, NULL, NULL,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
