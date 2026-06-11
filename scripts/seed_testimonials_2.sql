-- Seed 5 testimoni klien high-value Salam Bumi Property (villa, hotel, kost exclusive, gudang)
-- Kolom sama dengan seed sebelumnya: nama_klien, lokasi, rating, isi_testimoni, jenis_transaksi,
--   properti_terkait, tanggal, tampilkan, urutan, created_at.
-- Catatan: properti_terkait bertipe INTEGER (FK id properti) → dibiarkan NULL; deskripsi properti
--   sudah tercermin di isi_testimoni & jenis_transaksi. urutan melanjutkan seed pertama (13–17).

INSERT INTO testimonials
  (nama_klien, lokasi, rating, isi_testimoni, jenis_transaksi, properti_terkait, tanggal, tampilkan, urutan, created_at)
VALUES
  ('Ir. Wijaya Kusuma, M.M.', 'Pakem, Sleman', 5,
   'Saya mengakuisisi villa di Pakem sebagai aset weekend getaway sekaligus investasi sewa harian. View Merapi langsung dari teras dan udara sejuknya luar biasa. Untuk transaksi sebesar ini saya menuntut due diligence ketat, dan tim Salam Bumi Property memfasilitasi pengecekan legalitas sertifikat hingga appraisal independen secara menyeluruh. Profesionalisme mereka membuat saya yakin menandatangani akad.',
   'Pembelian Villa', NULL, '2026-02-12', 1, 13, '2026-02-12 10:15:00'),

  ('Hartono Wijaya', 'Prawirotaman, Yogyakarta', 5,
   'Sebagai investor di sektor hospitality, saya mengakuisisi boutique hotel di kawasan Prawirotaman melalui SBP. Yang saya apresiasi adalah analisa okupansi dan proyeksi ROI yang disajikan berbasis data, bukan asumsi. Proses due diligence properti komersial berjalan rapi termasuk audit laporan finansial dan verifikasi perizinan usaha. Transparansi datanya membuat keputusan investasi jadi terukur.',
   'Pembelian Hotel', NULL, '2026-03-05', 1, 14, '2026-03-05 14:30:00'),

  ('Reza Mahendra', 'Seturan, Sleman', 5,
   'Sebagai profesional muda yang baru masuk dunia investasi properti, saya membeli bangunan kost exclusive di Seturan yang dekat UPN dan Atma Jaya. Tim SBP membantu saya menganalisa yield sewa dan occupancy rate mahasiswa yang historisnya stabil di atas 90%. Mereka juga membimbing perhitungan BEP sampai saya paham betul kapan modal kembali. Sangat edukatif dan profesional.',
   'Investasi Kost', NULL, '2026-04-09', 1, 15, '2026-04-09 11:20:00'),

  ('Dimas Aryasatya', 'Pogung, Sleman', 4,
   'Saya menjual unit kost dekat UGM di Pogung melalui Salam Bumi Property. Tim membantu menyusun strategi harga sewa per kamar yang kompetitif dengan target mahasiswa pascasarjana dan dosen. Hasil akhirnya memuaskan dan harga jual sesuai valuasi, hanya saja proses kelengkapan dokumen sertifikat sempat agak lama karena urusan di BPN. Secara keseluruhan tetap saya rekomendasikan.',
   'Penjualan Kost', NULL, '2026-05-06', 1, 16, '2026-05-06 09:45:00'),

  ('H. Slamet Riyadi', 'Piyungan, Bantul', 5,
   'Perusahaan kami membeli gudang di kawasan industri Piyungan untuk ekspansi lini logistik dan distribusi. Lahannya luas dengan akses jalan yang memadai untuk keluar-masuk truk kontainer. Tim SBP memeriksa legalitas IMB/PBG peruntukan industri secara detail sehingga tidak ada risiko di kemudian hari. Meski nilai transaksinya besar, penanganannya tetap profesional dan komunikatif dari awal hingga balik nama.',
   'Pembelian Gudang', NULL, '2026-05-28', 1, 17, '2026-05-28 15:50:00');
