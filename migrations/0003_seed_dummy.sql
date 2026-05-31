-- =============================================================================
-- SBP — Seed Data Dummy untuk Testing Query
-- TUJUAN: memastikan relasi antar tabel berfungsi & API dapat dikembangkan
-- BUKAN data produksi — foto masih Unsplash, konten ringkas
--
-- IDEMPOTENCY: INSERT OR IGNORE — aman dijalankan ulang
-- URUTAN INSERT (wajib): admins → properties → property_images
--                        → testimonials → blog_posts
--
-- ADMIN PASSWORD: bcrypt cost-12 dari 'SbpAdmin2024!'
-- Hash: $2b$12$OpVaxY214sQ998szncQ/7ukhk7Y5yOGUWbos2c6cgpCvjHNYfN8ky
-- ⚠ Ganti password via Admin Dashboard sebelum production
-- =============================================================================

-- =============================================================================
-- [1/5] ADMINS — 1 superadmin
-- =============================================================================
INSERT OR IGNORE INTO admins (
    id, email, password_hash, nama, role
) VALUES (
    1,
    'admin@salambumi.id',
    '$2b$12$OpVaxY214sQ998szncQ/7ukhk7Y5yOGUWbos2c6cgpCvjHNYfN8ky',
    'Monica Vera S',
    'superadmin'
);

-- =============================================================================
-- [2/5] PROPERTIES — 3 properti variasi jenis
--
-- harga_per_m2 dihitung di sini: harga ÷ luas_tanah (spec 4.11)
--   Properti 1 (Rumah) : 850.000.000 ÷ 150  = 5.666.667
--   Properti 2 (Kost)  : 1.200.000.000 ÷ 280 = 4.285.714
--   Properti 3 (Tanah) : 2.000.000.000 ÷ 500 = 4.000.000
--
-- Slug mengikuti spec 3.2: lowercase, tanpa stopword, jogja dipertahankan
-- =============================================================================

-- Properti 1: Rumah (dijual, Depok-Sleman)
INSERT OR IGNORE INTO properties (
    id, kode_listing, title, slug,
    jenis_properti, tujuan,
    harga, harga_per_m2, nego, nett,
    jumlah_kamar_tidur, jumlah_kamar_mandi,
    luas_tanah, luas_bangunan, lebar_depan, lantai,
    legalitas, status_legalitas, furnished,
    provinsi, kabupaten, kecamatan, kelurahan,
    deskripsi,
    badge_featured, badge_hot, verified, properti_pilihan,
    views_count, status_publish, published_at,
    latitude, longitude,
    details
) VALUES (
    1,
    'SBP-20240115-0001',
    'Rumah Minimalis 2 Lantai Dekat UGM Depok Sleman',
    'rumah-minimalis-dekat-ugm-depok-sleman-jogja',
    'rumah', 'dijual',
    850000000, 5666667, 1, 0,
    3, 2,
    150, 180, 8.0, 2,
    'SHM & IMB/PBG Lengkap', 'on_hand', 'semi',
    'DI Yogyakarta', 'Sleman', 'Depok', 'Caturtunggal',
    'Rumah minimalis modern 2 lantai di kawasan strategis Depok, Sleman. Hanya 1.5 km dari Universitas Gadjah Mada. Kondisi semi furnished, siap huni. Dekat kampus, pusat perbelanjaan, dan akses tol.',
    1, 1, 1, 1,
    1247, 'published', '2024-01-15 08:00:00',
    -7.7704, 110.3756,
    NULL
);

-- Properti 2: Kost (dijual, Mlati-Sleman) — ada income → Investment Intelligence
INSERT OR IGNORE INTO properties (
    id, kode_listing, title, slug,
    jenis_properti, tujuan,
    harga, harga_per_m2, nego, nett,
    jumlah_kamar_tidur, jumlah_kamar_mandi,
    luas_tanah, luas_bangunan, lebar_depan, lantai,
    legalitas, status_legalitas, furnished,
    income_per_bulan, pengeluaran_per_bulan, harga_sewa_kamar_bulan,
    provinsi, kabupaten, kecamatan, kelurahan,
    deskripsi,
    badge_premium, verified, properti_pilihan,
    views_count, status_publish, published_at,
    latitude, longitude,
    details
) VALUES (
    2,
    'SBP-20240220-0002',
    'Kost Eksklusif Putri 20 Kamar Dekat UNY Mlati Sleman',
    'kost-eksklusif-putri-dekat-uny-mlati-sleman-jogja',
    'kost', 'dijual',
    1200000000, 4285714, 1, 0,
    20, 20,
    280, 350, 12.0, 3,
    'SHM & IMB/PBG Lengkap', 'on_hand', 'fully',
    30000000, 8000000, 1800000,
    'DI Yogyakarta', 'Sleman', 'Mlati', 'Sinduadi',
    'Kost eksklusif putri 3 lantai dengan 20 kamar fully furnished AC. Setiap kamar dilengkapi kamar mandi dalam, WiFi, air panas. Dekat UNY dan kampus lain. Investasi properti terbaik dengan income stabil.',
    1, 1, 1,
    2108, 'published', '2024-02-20 08:00:00',
    -7.7498, 110.3663,
    '{"jenis_kost":"putri","ruang_penjaga":true,"token_listrik_per_kamar":false}'
);

-- Properti 3: Tanah (dijual, Banguntapan-Bantul)
INSERT OR IGNORE INTO properties (
    id, kode_listing, title, slug,
    jenis_properti, tujuan,
    harga, harga_per_m2, nego, nett,
    luas_tanah, lebar_depan,
    legalitas, status_legalitas,
    provinsi, kabupaten, kecamatan, kelurahan,
    deskripsi,
    badge_featured, verified,
    views_count, status_publish, published_at,
    latitude, longitude,
    details
) VALUES (
    3,
    'SBP-20240401-0003',
    'Tanah Kavling Strategis Ringroad Selatan Bantul',
    'tanah-kavling-ringroad-selatan-banguntapan-bantul-jogja',
    'tanah', 'dijual',
    2000000000, 4000000, 1, 0,
    500, 25.0,
    'SHM & IMB/PBG Lengkap', 'on_hand',
    'DI Yogyakarta', 'Bantul', 'Banguntapan', 'Tamanan',
    'Tanah kavling premium di tepi Ringroad Selatan. Lokasi sangat strategis untuk pengembangan properti komersial atau hunian. Akses mudah ke berbagai fasilitas Jogja.',
    1, 1,
    892, 'published', '2024-04-01 08:00:00',
    -7.8285, 110.4052,
    NULL
);

-- =============================================================================
-- [3/5] PROPERTY_IMAGES — 1 cover per properti
-- =============================================================================
INSERT OR IGNORE INTO property_images (
    id, property_id, url_webp, alt_text, urutan, is_cover
) VALUES
(1, 1,
 'https://images.unsplash.com/photo-1675657144518-025804f1812c?w=800&q=80',
 'Rumah minimalis 2 lantai Depok Sleman Jogja', 0, 1),
(2, 2,
 'https://images.unsplash.com/photo-1735461932749-e602a9f6fc82?w=800&q=80',
 'Kost eksklusif putri Mlati Sleman Jogja', 0, 1),
(3, 3,
 'https://images.unsplash.com/photo-1613553507747-5f8d62ad5904?w=800&q=80',
 'Tanah kavling Banguntapan Bantul Jogja', 0, 1);

-- =============================================================================
-- [4/5] TESTIMONIALS — 2 testimoni (verifikasi slider homepage)
-- =============================================================================
INSERT OR IGNORE INTO testimonials (
    id, nama_klien, foto_url, lokasi, rating,
    isi_testimoni, jenis_transaksi, properti_terkait,
    tanggal, tampilkan, urutan
) VALUES
(1,
 'Budi Santoso',
 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
 'Jakarta', 5,
 'Proses pembelian rumah sangat mudah dan transparan. Tim SBP sangat profesional, membantu dari awal hingga proses AJB selesai. Sangat direkomendasikan!',
 'Pembeli Rumah', 1,
 '2024-04-15', 1, 1),
(2,
 'Siti Rahayu',
 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
 'Sleman', 5,
 'Kost saya berhasil terjual dalam waktu 2 minggu! Sistem verifikasi SBP membuat calon pembeli lebih percaya. Fee transparan, tanpa biaya tersembunyi.',
 'Owner Kost', 2,
 '2024-03-20', 1, 2);

-- =============================================================================
-- [5/5] BLOG_POSTS — 3 artikel (verifikasi section "Artikel Terbaru" homepage)
-- author_id = 1 → Monica Vera S
-- tags = JSON array (spec 4.8)
-- =============================================================================
INSERT OR IGNORE INTO blog_posts (
    id, judul, slug, excerpt, kategori, tags,
    author_id, reading_time_menit,
    status, published_at
) VALUES
(1,
 'Panduan Lengkap KPR untuk Pembeli Rumah Pertama di Jogja',
 'panduan-kpr-pembeli-rumah-pertama-jogja',
 'Memiliki rumah pertama adalah impian banyak orang. KPR bisa menjadi jalan, namun perlu persiapan matang. Simak panduan lengkap dari SBP.',
 'KPR',
 '["KPR","Panduan","Rumah Pertama"]',
 1, 7, 'published', '2024-05-20 08:00:00'),
(2,
 'Investasi Kost Dekat Kampus Jogja: Yield 8-12% Per Tahun',
 'investasi-kost-dekat-kampus-jogja-yield-tinggi',
 'Kost dekat kampus di Yogyakarta adalah salah satu investasi properti paling menjanjikan. Yield 8-12% per tahun bisa Anda raih dengan strategi tepat.',
 'Investasi',
 '["Investasi","Kost","Kampus","Yield"]',
 1, 5, 'published', '2024-05-10 08:00:00'),
(3,
 'Cara Cek Keaslian Sertifikat SHM Sebelum Beli Properti',
 'cara-cek-keaslian-sertifikat-shm-properti',
 'Keamanan transaksi properti dimulai dari keaslian sertifikat. Pelajari cara memverifikasi SHM sebelum menandatangani perjanjian jual beli.',
 'Panduan',
 '["Legalitas","SHM","Panduan","Keamanan"]',
 1, 6, 'published', '2024-04-28 08:00:00');
