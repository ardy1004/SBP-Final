-- Seed 10 testimoni klien Salam Bumi Property (pasar properti Yogyakarta)
-- Kolom mengikuti schema asli tabel testimonials:
--   nama_klien, lokasi, rating, isi_testimoni, jenis_transaksi, tanggal, tampilkan, urutan, created_at
-- id dibiarkan auto-increment. tanggal & created_at bervariasi (Jan–Jun 2026) agar ORDER BY DESC masuk akal.

INSERT INTO testimonials
  (nama_klien, lokasi, rating, isi_testimoni, jenis_transaksi, tanggal, tampilkan, urutan, created_at)
VALUES
  ('Bapak Suryanto Wibowo', 'Maguwoharjo, Sleman', 5,
   'Proses beli rumah di Maguwoharjo lancar banget. Dari survei sampai akad cuma butuh tiga minggu, dan tim SBP yang nemenin saya ngurus BPHTB sama notaris. Sebagai pembeli pertama saya banyak nggak ngerti, tapi semuanya dijelasin sabar. Sangat puas.',
   'Pembelian Rumah', '2026-01-14', 1, 10, '2026-01-14 09:20:00'),

  ('Ibu Retno Palupi', 'Kasihan, Bantul', 5,
   'Saya titip jual rumah warisan yang sudah lama kosong. Awalnya pesimis karena lokasinya masuk gang, tapi admin SBP rajin update progress tiap minggu lewat WhatsApp. Tidak sampai dua bulan sudah ada pembeli serius dan harganya sesuai harapan. Terima kasih sudah amanah.',
   'Titip Jual', '2026-02-03', 1, 20, '2026-02-03 13:45:00'),

  ('Andika Pratama', 'Condongcatur, Depok, Sleman', 4,
   'Cari kontrakan dekat kampus UPN buat anak kuliah. Pilihannya lumayan banyak dan adminnya fast respon. Cuma agak nunggu pas mau lihat unit karena ramai peminat, jadi kasih 4 bintang. Overall puas, harga transparan tanpa biaya siluman.',
   'Sewa', '2026-02-22', 1, 30, '2026-02-22 16:10:00'),

  ('Hendra Gunawan', 'Banguntapan, Bantul', 5,
   'Sebagai investor kost saya butuh data yield yang jelas, bukan janji manis. Tim SBP kasih hitungan okupansi dan estimasi balik modal yang realistis. Dua unit kost dekat kampus sudah saya akuisisi lewat mereka. Analisanya tajam dan jujur soal risiko.',
   'Investasi', '2026-03-08', 1, 40, '2026-03-08 10:30:00'),

  ('Siti Nurhaliza', 'Kotagede, Yogyakarta', 5,
   'Alhamdulillah rumah saya akhirnya laku setelah hampir setahun pasang sendiri nggak laku-laku. Begitu dipegang SBP, fotonya dibikin profesional dan dipromosikan dengan baik. Dibantu sampai tuntas urusan AJB di notaris. Pelayanannya bikin tenang.',
   'Penjualan Rumah', '2026-03-19', 1, 50, '2026-03-19 11:05:00'),

  ('Yoga Adi Saputra', 'Sewon, Bantul', 5,
   'Mantap sih ini. Nego harga tanah dibantu sampai dapat angka yang masuk akal buat kedua pihak. Adminnya komunikatif, ditanya jam berapapun dibalas. Legalitas sertifikat dicek dulu sebelum DP jadi saya nggak khawatir. Recommended buat yang masih awam.',
   'Pembelian Tanah', '2026-04-02', 1, 60, '2026-04-02 14:50:00'),

  ('Dr. Bambang Sutejo', 'Jalan Kaliurang KM 9, Sleman', 5,
   'Saya relokasi dari luar kota dan butuh hunian cepat dekat tempat praktik. Tim Salam Bumi Property sangat profesional, jadwal survei fleksibel mengikuti waktu saya yang padat. Dokumen KPR diuruskan sampai approve. Pelayanan kelas atas, sangat saya apresiasi.',
   'Pembelian Rumah', '2026-04-21', 1, 70, '2026-04-21 08:40:00'),

  ('Mbak Wulan Sari', 'Godean, Sleman', 4,
   'Nyari ruko buat usaha laundry dan dibantuin cariin lokasi yang ramai. Sempat ada miss soal jadwal lihat unit pertama, tapi langsung diperbaiki dan dikasih opsi pengganti yang malah lebih cocok. Adminnya ramah dan nggak maksa. Puas, cuma sedikit catatan di awal.',
   'Sewa', '2026-05-09', 1, 80, '2026-05-09 15:25:00'),

  ('Agus Setiawan', 'Berbah, Sleman', 5,
   'Transaksi tanah kavling 200 meter berjalan transparan dari awal sampai balik nama. Semua biaya dirinci di depan, nggak ada kejutan. Yang bikin salut, tim SBP ngingetin soal pajak dan proses di BPN tanpa saya minta. Benar-benar dibimbing sampai sertifikat jadi.',
   'Pembelian Tanah', '2026-05-23', 1, 90, '2026-05-23 12:15:00'),

  ('Ibu Lestari Handayani', 'Umbulharjo, Yogyakarta', 5,
   'Pengalaman jual rumah pertama kali dan jujur deg-degan takut ketipu. Ternyata SBP sangat amanah, setiap calon pembeli diverifikasi dulu jadi nggak buang waktu. Akad berjalan lancar di hadapan notaris, dana langsung cair. Sukses terus untuk timnya, sangat membantu.',
   'Penjualan Rumah', '2026-06-04', 1, 100, '2026-06-04 10:00:00');
