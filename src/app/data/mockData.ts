export interface Property {
  id: number;
  kode: string;
  slug: string;
  title: string;
  jenis: string;
  jenisRaw?: string;
  jenisEmoji: string;
  tujuan: 'dijual' | 'disewa' | 'dijual_disewa';
  harga: number;
  harga_lama?: number;
  harga_sewa?: number;
  nego: boolean;
  nett?: boolean;
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  kelurahan: string;
  alamat?: string;
  luas_tanah?: number;
  luas_bangunan?: number;
  lebar_depan?: number;
  lantai?: number;
  kamar_tidur?: number;
  kamar_mandi?: number;
  legalitas: string;
  status_legalitas?: string;
  furnished?: string;
  deskripsi: string;
  images: string[];
  badge_premium?: boolean;
  badge_featured?: boolean;
  badge_hot?: boolean;
  status_sold?: boolean;
  properti_pilihan?: boolean;
  verified?: boolean;
  views_count: number;
  income_per_bulan?: number;
  pengeluaran_per_bulan?: number;
  latitude?: number;
  longitude?: number;
  status_publish: 'published' | 'draft' | 'sold' | 'archived';
  published_at: string;
  updated_at: string;
  video_youtube?: string;
}

export const PROPERTIES: Property[] = [
  {
    id: 1,
    kode: 'SBP-20240115-0001',
    slug: 'rumah-minimalis-dekat-ugm-depok-sleman-jogja',
    title: 'Rumah Minimalis 2 Lantai Dekat UGM Sleman Jogja',
    jenis: 'Rumah',
    jenisEmoji: '🏠',
    tujuan: 'dijual',
    harga: 850000000,
    harga_lama: 950000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Sleman',
    kecamatan: 'Depok',
    kelurahan: 'Caturtunggal',
    luas_tanah: 150,
    luas_bangunan: 180,
    lebar_depan: 8,
    lantai: 2,
    kamar_tidur: 3,
    kamar_mandi: 2,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'semi',
    deskripsi: 'Rumah minimalis modern 2 lantai dengan desain estetis di kawasan strategis Depok, Sleman. Hanya 1.5 km dari Universitas Gadjah Mada (UGM). Kondisi semi furnished, siap huni. Lokasi sangat strategis dekat kampus, pusat perbelanjaan, dan akses tol.',
    images: [
      'https://images.unsplash.com/photo-1675657144518-025804f1812c?w=800&q=80',
      'https://images.unsplash.com/photo-1621501744628-6b0413614492?w=800&q=80',
      'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=800&q=80',
    ],
    badge_hot: true,
    badge_featured: true,
    properti_pilihan: true,
    verified: true,
    views_count: 1247,
    latitude: -7.7704,
    longitude: 110.3756,
    status_publish: 'published',
    published_at: '2024-01-15',
    updated_at: '2024-05-20',
  },
  {
    id: 2,
    kode: 'SBP-20240220-0002',
    slug: 'kost-eksklusif-putri-mlati-sleman-jogja',
    title: 'Kost Eksklusif Putri 20 Kamar Dekat UNY Mlati Sleman',
    jenis: 'Kost',
    jenisEmoji: '🏗️',
    tujuan: 'dijual',
    harga: 1200000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Sleman',
    kecamatan: 'Mlati',
    kelurahan: 'Sinduadi',
    luas_tanah: 280,
    luas_bangunan: 350,
    lebar_depan: 12,
    lantai: 3,
    kamar_tidur: 20,
    kamar_mandi: 20,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'fully',
    deskripsi: 'Kost eksklusif putri 3 lantai dengan 20 kamar fully furnished AC. Setiap kamar dilengkapi kamar mandi dalam, WiFi, air panas. Dekat UNY dan kampus lain. Investasi properti terbaik dengan income stabil.',
    images: [
      'https://images.unsplash.com/photo-1735461932749-e602a9f6fc82?w=800&q=80',
      'https://images.unsplash.com/photo-1709166797199-4cb8aa74ad7c?w=800&q=80',
    ],
    badge_premium: true,
    properti_pilihan: true,
    verified: true,
    views_count: 2108,
    income_per_bulan: 30000000,
    pengeluaran_per_bulan: 8000000,
    latitude: -7.7498,
    longitude: 110.3663,
    status_publish: 'published',
    published_at: '2024-02-20',
    updated_at: '2024-05-18',
  },
  {
    id: 3,
    kode: 'SBP-20240310-0003',
    slug: 'villa-view-merapi-kaliurang-sleman-jogja',
    title: 'Villa Mewah View Merapi Kaliurang Sleman Jogja',
    jenis: 'Villa',
    jenisEmoji: '🌴',
    tujuan: 'dijual_disewa',
    harga: 3500000000,
    harga_sewa: 50000000,
    nego: false,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Sleman',
    kecamatan: 'Pakem',
    kelurahan: 'Hargobinangun',
    luas_tanah: 600,
    luas_bangunan: 400,
    lebar_depan: 20,
    lantai: 2,
    kamar_tidur: 5,
    kamar_mandi: 6,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'fully',
    deskripsi: 'Villa premium dengan pemandangan Gunung Merapi yang spektakuler. Kolam renang private, taman tropis, ruang keluarga mewah. Cocok untuk tempat tinggal mewah atau bisnis villa sewa. ROI tinggi dari penyewaan villa jangka pendek.',
    images: [
      'https://images.unsplash.com/photo-1692736933760-8a8a9b8c1b6f?w=800&q=80',
      'https://images.unsplash.com/photo-1668957065532-5770d193d501?w=800&q=80',
      'https://images.unsplash.com/photo-1720161263981-84281892ee4b?w=800&q=80',
    ],
    badge_premium: true,
    properti_pilihan: true,
    verified: true,
    views_count: 3421,
    income_per_bulan: 45000000,
    pengeluaran_per_bulan: 10000000,
    latitude: -7.6174,
    longitude: 110.4245,
    status_publish: 'published',
    published_at: '2024-03-10',
    updated_at: '2024-05-22',
    video_youtube: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    id: 4,
    kode: 'SBP-20240401-0004',
    slug: 'tanah-strategis-ringroad-banguntapan-bantul',
    title: 'Tanah Kavling Strategis Ringroad Selatan Bantul Jogja',
    jenis: 'Tanah',
    jenisEmoji: '🌿',
    tujuan: 'dijual',
    harga: 2000000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Bantul',
    kecamatan: 'Banguntapan',
    kelurahan: 'Tamanan',
    luas_tanah: 500,
    lebar_depan: 25,
    legalitas: 'SHM & IMB/PBG Lengkap',
    deskripsi: 'Tanah kavling premium di tepi Ringroad Selatan, lokasi sangat strategis untuk pengembangan properti komersial atau hunian. Akses mudah ke berbagai fasilitas Jogja. Cocok untuk investasi jangka panjang.',
    images: [
      'https://images.unsplash.com/photo-1613553507747-5f8d62ad5904?w=800&q=80',
    ],
    badge_featured: true,
    verified: true,
    views_count: 892,
    latitude: -7.8285,
    longitude: 110.4052,
    status_publish: 'published',
    published_at: '2024-04-01',
    updated_at: '2024-05-10',
  },
  {
    id: 5,
    kode: 'SBP-20240415-0005',
    slug: 'hotel-melati-gondomanan-kota-yogyakarta',
    title: 'Hotel Melati Strategis Gondomanan Kota Yogyakarta',
    jenis: 'Hotel',
    jenisEmoji: '🏨',
    tujuan: 'dijual',
    harga: 8000000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Kota Yogyakarta',
    kecamatan: 'Gondomanan',
    kelurahan: 'Prawirodirjan',
    luas_tanah: 800,
    luas_bangunan: 1200,
    lebar_depan: 20,
    lantai: 4,
    kamar_tidur: 40,
    kamar_mandi: 40,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'fully',
    deskripsi: 'Hotel melati 4 lantai di pusat kota Yogyakarta, dekat Malioboro. 40 kamar fully furnished, restoran, lobby modern. Investasi terbaik di pusat pariwisata Jogja. Income stabil dari wisatawan sepanjang tahun.',
    images: [
      'https://images.unsplash.com/photo-1692736933732-ad902fc34626?w=800&q=80',
      'https://images.unsplash.com/photo-1651108066220-f61c22fc281f?w=800&q=80',
    ],
    badge_premium: true,
    properti_pilihan: true,
    verified: true,
    views_count: 4102,
    income_per_bulan: 120000000,
    pengeluaran_per_bulan: 40000000,
    latitude: -7.8006,
    longitude: 110.3687,
    status_publish: 'published',
    published_at: '2024-04-15',
    updated_at: '2024-05-25',
  },
  {
    id: 6,
    kode: 'SBP-20240501-0006',
    slug: 'rumah-2-lantai-dekat-malioboro-wirobrajan-yogyakarta',
    title: 'Rumah 2 Lantai Dekat Malioboro Wirobrajan Yogyakarta',
    jenis: 'Rumah',
    jenisEmoji: '🏠',
    tujuan: 'dijual',
    harga: 1800000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Kota Yogyakarta',
    kecamatan: 'Wirobrajan',
    kelurahan: 'Patangpuluhan',
    luas_tanah: 200,
    luas_bangunan: 250,
    lantai: 2,
    kamar_tidur: 4,
    kamar_mandi: 3,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'semi',
    deskripsi: 'Rumah 2 lantai di lokasi premium, hanya 500 meter dari Malioboro. Cocok untuk hunian keluarga atau guest house. Nilai properti terus meningkat karena lokasi wisata strategis.',
    images: [
      'https://images.unsplash.com/photo-1735461932749-e602a9f6fc82?w=800&q=80',
      'https://images.unsplash.com/photo-1621501744628-6b0413614492?w=800&q=80',
    ],
    badge_featured: true,
    verified: true,
    views_count: 1563,
    latitude: -7.7997,
    longitude: 110.3589,
    status_publish: 'published',
    published_at: '2024-05-01',
    updated_at: '2024-05-28',
  },
  {
    id: 7,
    kode: 'SBP-20240510-0007',
    slug: 'apartemen-studio-condongcatur-depok-sleman',
    title: 'Apartemen Studio Modern Condongcatur Depok Sleman',
    jenis: 'Apartemen',
    jenisEmoji: '🏢',
    tujuan: 'dijual',
    harga: 450000000,
    nego: false,
    nett: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Sleman',
    kecamatan: 'Depok',
    kelurahan: 'Condongcatur',
    luas_bangunan: 36,
    lantai: 8,
    kamar_tidur: 1,
    kamar_mandi: 1,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'fully',
    deskripsi: 'Apartemen studio modern fully furnished lantai 8 dengan view kota Yogyakarta. Fasilitas lengkap: kolam renang, gym, security 24 jam. Dekat kampus UGM, UNY, dan pusat perbelanjaan.',
    images: [
      'https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80',
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80',
    ],
    badge_featured: true,
    verified: true,
    views_count: 743,
    latitude: -7.7608,
    longitude: 110.3887,
    status_publish: 'published',
    published_at: '2024-05-10',
    updated_at: '2024-05-27',
  },
  {
    id: 8,
    kode: 'SBP-20240520-0008',
    slug: 'homestay-umbulharjo-kota-yogyakarta',
    title: 'Homestay Productif 15 Kamar Umbulharjo Kota Yogyakarta',
    jenis: 'Homestay',
    jenisEmoji: '🏡',
    tujuan: 'dijual',
    harga: 2500000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Kota Yogyakarta',
    kecamatan: 'Umbulharjo',
    kelurahan: 'Giwangan',
    luas_tanah: 350,
    luas_bangunan: 450,
    lantai: 3,
    kamar_tidur: 15,
    kamar_mandi: 15,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'fully',
    deskripsi: 'Homestay produktif 3 lantai dengan 15 kamar. Lokasi strategis di Umbulharjo, mudah akses ke seluruh penjuru Jogja. Sudah berjalan 3 tahun dengan tingkat hunian 80%. Income stabil untuk investor.',
    images: [
      'https://images.unsplash.com/photo-1675657144361-98ae33e6b6f9?w=800&q=80',
      'https://images.unsplash.com/photo-1692736933760-8a8a9b8c1b6f?w=800&q=80',
    ],
    badge_premium: true,
    properti_pilihan: true,
    verified: true,
    views_count: 2876,
    income_per_bulan: 35000000,
    pengeluaran_per_bulan: 10000000,
    latitude: -7.8271,
    longitude: 110.3891,
    status_publish: 'published',
    published_at: '2024-05-20',
    updated_at: '2024-05-29',
  },
  {
    id: 9,
    kode: 'SBP-20240525-0009',
    slug: 'tanah-parangtritis-sanden-bantul-jogja',
    title: 'Tanah Luas Jalan Parangtritis Sanden Bantul Jogja',
    jenis: 'Tanah',
    jenisEmoji: '🌿',
    tujuan: 'dijual',
    harga: 1500000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Bantul',
    kecamatan: 'Sanden',
    kelurahan: 'Murtigading',
    luas_tanah: 1000,
    lebar_depan: 20,
    legalitas: 'SHM Pekarangan Saja Tanpa IMB/PBG',
    deskripsi: 'Tanah luas 1000 m² di Jalan Parangtritis, lokasi bisnis yang sangat strategis. Cocok untuk pengembangan guest house, villa, atau usaha komersial. Dekat Pantai Parangtritis.',
    images: [
      'https://images.unsplash.com/photo-1619994121345-b61cd610c5a6?w=800&q=80',
    ],
    badge_featured: true,
    views_count: 654,
    latitude: -7.9836,
    longitude: 110.3285,
    status_publish: 'published',
    published_at: '2024-05-25',
    updated_at: '2024-05-29',
  },
  {
    id: 10,
    kode: 'SBP-20240528-0010',
    slug: 'ruko-strategis-mlati-sleman-jogja',
    title: 'Ruko 3 Lantai Strategis Mlati Sleman Jogja',
    jenis: 'Komersial',
    jenisEmoji: '🏬',
    tujuan: 'dijual_disewa',
    harga: 1900000000,
    harga_sewa: 40000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Sleman',
    kecamatan: 'Mlati',
    kelurahan: 'Tlogoadi',
    luas_tanah: 120,
    luas_bangunan: 300,
    lantai: 3,
    legalitas: 'SHM & IMB/PBG Lengkap',
    deskripsi: 'Ruko 3 lantai di lokasi ramai Mlati Sleman. Ground floor untuk usaha, lantai 2-3 untuk hunian atau kantor. Pinggir jalan utama dengan lalu lintas tinggi. Cocok untuk berbagai jenis usaha.',
    images: [
      'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=800&q=80',
    ],
    badge_hot: true,
    verified: true,
    views_count: 1102,
    status_publish: 'published',
    published_at: '2024-05-28',
    updated_at: '2024-05-30',
  },
  {
    id: 11,
    kode: 'SBP-20240529-0011',
    slug: 'rumah-dijual-bantul-tamanan-jogja',
    title: 'Rumah Asri Dekat Ringroad Bantul Tamanan Yogyakarta',
    jenis: 'Rumah',
    jenisEmoji: '🏠',
    tujuan: 'dijual',
    harga: 650000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Bantul',
    kecamatan: 'Banguntapan',
    kelurahan: 'Tamanan',
    luas_tanah: 120,
    luas_bangunan: 100,
    lantai: 1,
    kamar_tidur: 3,
    kamar_mandi: 2,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'semi',
    deskripsi: 'Rumah asri 1 lantai dengan taman depan belakang. Suasana nyaman dan tenang, namun dekat Ringroad dan akses transportasi. Cocok untuk keluarga muda.',
    images: [
      'https://images.unsplash.com/photo-1714621488914-a245a8089213?w=800&q=80',
    ],
    views_count: 387,
    status_publish: 'published',
    published_at: '2024-05-29',
    updated_at: '2024-05-30',
  },
  {
    id: 12,
    kode: 'SBP-20240530-0012',
    slug: 'kost-putra-condongcatur-depok-sleman-jogja',
    title: 'Kost Putra 10 Kamar AC Condongcatur Depok Sleman',
    jenis: 'Kost',
    jenisEmoji: '🏗️',
    tujuan: 'dijual',
    harga: 900000000,
    nego: true,
    provinsi: 'DI Yogyakarta',
    kabupaten: 'Sleman',
    kecamatan: 'Depok',
    kelurahan: 'Condongcatur',
    luas_tanah: 180,
    luas_bangunan: 200,
    lantai: 2,
    kamar_tidur: 10,
    kamar_mandi: 10,
    legalitas: 'SHM & IMB/PBG Lengkap',
    furnished: 'semi',
    deskripsi: 'Kost putra 2 lantai, 10 kamar ber-AC, kamar mandi dalam, WiFi. Dekat kampus UGM & UPN. Income stabil 8-10 juta/bulan. Investasi properti menguntungkan di kawasan kampus Jogja.',
    images: [
      'https://images.unsplash.com/photo-1675657144518-025804f1812c?w=800&q=80',
    ],
    badge_featured: true,
    verified: true,
    views_count: 821,
    income_per_bulan: 12000000,
    pengeluaran_per_bulan: 3000000,
    status_publish: 'published',
    published_at: '2024-05-30',
    updated_at: '2024-05-31',
  },
];

export const FEATURED_PROPERTIES = PROPERTIES.filter(p => p.properti_pilihan);

export const TESTIMONIALS = [
  {
    id: 1,
    nama: 'Budi Santoso',
    foto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
    lokasi: 'Jakarta',
    rating: 5,
    isi: 'Proses pembelian rumah sangat mudah dan transparan. Tim SBP sangat profesional, membantu dari awal hingga proses AJB selesai. Sangat rekomendasikan!',
    jenis_transaksi: 'Pembeli Rumah',
    tanggal: '2024-04-15',
  },
  {
    id: 2,
    nama: 'Siti Rahayu',
    foto: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
    lokasi: 'Sleman',
    rating: 5,
    isi: 'Kost saya berhasil terjual dalam waktu 2 minggu saja! Sistem verifikasi SBP membuat calon pembeli lebih percaya. Fee yang transparan dan tidak ada biaya tersembunyi.',
    jenis_transaksi: 'Owner Kost',
    tanggal: '2024-03-20',
  },
  {
    id: 3,
    nama: 'Andi Wijaya',
    foto: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80',
    lokasi: 'Bantul',
    rating: 5,
    isi: 'Investasi terbaik yang pernah saya lakukan! Berkat analisis investasi dari SBP, saya bisa memilih properti dengan yield terbaik. Tim sangat membantu.',
    jenis_transaksi: 'Investor Properti',
    tanggal: '2024-02-28',
  },
  {
    id: 4,
    nama: 'Dewi Kusuma',
    foto: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
    lokasi: 'Yogyakarta',
    rating: 5,
    isi: 'Proses perjanjian digital sangat mudah dan aman. Saya bisa tanda tangan dari rumah tanpa harus datang ke kantor. Inovatif sekali!',
    jenis_transaksi: 'Penjual Rumah',
    tanggal: '2024-01-10',
  },
  {
    id: 5,
    nama: 'Hendra Pratama',
    foto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
    lokasi: 'Sleman',
    rating: 5,
    isi: 'Monica dan tim SBP sangat responsif 24/7. Pertanyaan saya selalu dijawab dengan cepat dan detail. Akhirnya dapat villa impian dengan harga terbaik!',
    jenis_transaksi: 'Pembeli Villa',
    tanggal: '2024-05-05',
  },
];

export const BLOG_POSTS = [
  {
    id: 1,
    judul: 'Panduan Lengkap KPR untuk Pembeli Rumah Pertama di Jogja',
    slug: 'panduan-kpr-pembeli-rumah-pertama-jogja',
    cover: 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=800&q=80',
    excerpt: 'Memiliki rumah pertama adalah impian banyak orang. KPR bisa menjadi jalan, namun perlu persiapan matang. Simak panduan lengkap dari SBP.',
    kategori: 'KPR',
    author: 'Monica Vera S',
    tanggal: '2024-05-20',
    reading_time: 7,
  },
  {
    id: 2,
    judul: 'Investasi Kost Dekat Kampus Jogja: Potensi Yield 8-12% Per Tahun',
    slug: 'investasi-kost-dekat-kampus-jogja-yield-tinggi',
    cover: 'https://images.unsplash.com/photo-1692736933732-ad902fc34626?w=800&q=80',
    excerpt: 'Kost dekat kampus di Yogyakarta adalah salah satu investasi properti paling menjanjikan. Yield 8-12% per tahun bisa Anda raih dengan strategi tepat.',
    kategori: 'Investasi',
    author: 'Ardy Salam',
    tanggal: '2024-05-10',
    reading_time: 5,
  },
  {
    id: 3,
    judul: 'Cara Cek Keaslian Sertifikat SHM Sebelum Beli Properti',
    slug: 'cara-cek-keaslian-sertifikat-shm-properti',
    cover: 'https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80',
    excerpt: 'Keamanan transaksi properti dimulai dari keaslian sertifikat. Pelajari cara memverifikasi SHM sebelum menandatangani perjanjian jual beli.',
    kategori: 'Panduan',
    author: 'Monica Vera S',
    tanggal: '2024-04-28',
    reading_time: 6,
  },
  {
    id: 4,
    judul: 'Kawasan Sleman: Mengapa Menjadi Primadona Investasi Properti Jogja?',
    slug: 'kawasan-sleman-primadona-investasi-properti-jogja',
    cover: 'https://images.unsplash.com/photo-1709166797199-4cb8aa74ad7c?w=800&q=80',
    excerpt: 'Sleman terus berkembang pesat sebagai kawasan residensial dan komersial. Temukan mengapa investor properti memilih Sleman sebagai lokasi investasi utama.',
    kategori: 'Investasi',
    author: 'Ardy Salam',
    tanggal: '2024-04-15',
    reading_time: 8,
  },
  {
    id: 5,
    judul: 'Mengenal Jenis-jenis Legalitas Properti dan Risikonya',
    slug: 'jenis-legalitas-properti-dan-risikonya',
    cover: 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=800&q=80',
    excerpt: 'SHM, SHGB, Girik - apa bedanya? Ketahui risiko setiap jenis legalitas properti sebelum Anda memutuskan untuk membeli.',
    kategori: 'Panduan',
    author: 'Monica Vera S',
    tanggal: '2024-03-30',
    reading_time: 9,
  },
];

export const FAQ_DATA = [
  {
    kategori: 'Umum',
    pertanyaan: [
      {
        q: 'Apa itu Salam Bumi Property (SBP)?',
        a: 'Salam Bumi Property (SBP) adalah portal properti berbasis kepercayaan dan kecerdasan investasi untuk wilayah DI Yogyakarta. Kami mengkurasi dan memverifikasi setiap listing secara langsung — tanpa sistem agen atau member. Setiap properti yang tayang di SBP telah dicek legalitas dan kondisinya oleh tim kami.',
      },
      {
        q: 'Apakah SBP menggunakan sistem agen atau broker?',
        a: 'Tidak. SBP beroperasi tanpa sistem agen pihak ketiga. Seluruh listing dikurasi dan diverifikasi langsung oleh tim SBP (CV Salam Bumi Property). Ini menjamin akurasi informasi dan transparansi transaksi.',
      },
      {
        q: 'Apakah ada biaya untuk mencari properti di SBP?',
        a: 'Sama sekali tidak ada biaya untuk calon pembeli. Anda bisa mencari, melihat detail, dan menghubungi kami sepenuhnya gratis. Fee hanya berlaku untuk pemilik properti yang menggunakan jasa pemasaran SBP.',
      },
    ],
  },
  {
    kategori: 'Membeli',
    pertanyaan: [
      {
        q: 'Bagaimana cara menghubungi pemilik properti?',
        a: 'Anda cukup mengisi form "Kirim Pesan ke Admin" di halaman detail properti, lalu klik tombol WhatsApp. Data Anda akan tersimpan dan tim SBP akan segera menghubungi Anda melalui WhatsApp untuk proses selanjutnya.',
      },
      {
        q: 'Apakah informasi properti di SBP akurat dan terpercaya?',
        a: 'Ya. Setiap properti dengan badge "Terverifikasi SBP" telah melalui proses pengecekan langsung: legalitas sertifikat dilihat, lokasi dikonfirmasi, foto asli (bukan foto stok), dan harga wajar. Kami berkomitmen pada transparansi penuh.',
      },
      {
        q: 'Bisakah saya mengajukan KPR melalui SBP?',
        a: 'SBP menyediakan Kalkulator KPR di setiap halaman detail properti untuk simulasi. Untuk pengajuan KPR aktual, tim kami dapat membantu menghubungkan Anda dengan bank rekanan. Konsultasikan via WhatsApp.',
      },
    ],
  },
  {
    kategori: 'Titip Jual',
    pertanyaan: [
      {
        q: 'Bagaimana cara memasarkan properti saya melalui SBP?',
        a: 'Kunjungi halaman "Titip Jual", isi data diri (Step 1) dan informasi properti (Step 2), lalu kirim. Tim SBP akan menghubungi Anda dalam 1×24 jam untuk proses selanjutnya termasuk penandatanganan perjanjian digital.',
      },
      {
        q: 'Berapa biaya (fee) jasa pemasaran SBP?',
        a: 'Besaran fee jasa pemasaran disepakati bersama dan dicantumkan dalam perjanjian. Hubungi tim SBP untuk informasi lengkap.',
      },
      {
        q: 'Kapan properti saya mulai tayang di website?',
        a: 'Properti akan tayang setelah Anda menandatangani perjanjian pemasaran secara digital melalui link khusus yang dikirim tim SBP via WhatsApp. Proses ini biasanya selesai dalam 1-3 hari kerja.',
      },
    ],
  },
  {
    kategori: 'Legalitas',
    pertanyaan: [
      {
        q: 'Apa itu SHM dan mengapa penting?',
        a: 'SHM (Sertifikat Hak Milik) adalah sertifikat dengan hak kepemilikan penuh atas tanah. Ini adalah legalitas terkuat untuk properti. Properti dengan SHM memiliki nilai jual lebih tinggi dan proses KPR lebih mudah.',
      },
      {
        q: 'Apakah SBP membantu proses balik nama sertifikat?',
        a: 'SBP bekerja sama dengan notaris dan PPAT terpercaya di Yogyakarta untuk membantu proses AJB (Akta Jual Beli) dan balik nama sertifikat. Tim kami akan memandu Anda dari awal hingga akhir.',
      },
    ],
  },
];

export const LOCATION_HIERARCHY = {
  'DI Yogyakarta': {
    'Kota Yogyakarta': {
      'Danurejan': ['Bausasran', 'Danurejan', 'Tegalpanggung'],
      'Gedongtengen': ['Pringgokusuman', 'Sosromenduran'],
      'Gondomanan': ['Ngupasan', 'Prawirodirjan'],
      'Jetis': ['Bumijo', 'Cokrodiningratan', 'Gowongan'],
      'Kraton': ['Kadipaten', 'Panembahan', 'Patehan'],
      'Mantrijeron': ['Gedongkiwo', 'Mantrijeron', 'Suryodiningratan'],
      'Mergangsan': ['Brontokusuman', 'Keparakan', 'Wirogunan'],
      'Ngampilan': ['Notoprajan', 'Ngampilan'],
      'Pakualaman': ['Gunungketur', 'Purwokinanti'],
      'Umbulharjo': ['Giwangan', 'Muja-muju', 'Pandeyan', 'Semaki', 'Sorosutan', 'Tahunan', 'Warungboto'],
      'Wirobrajan': ['Kricak', 'Patangpuluhan', 'Tegalrejo'],
    },
    'Sleman': {
      'Depok': ['Caturtunggal', 'Condongcatur', 'Maguwoharjo'],
      'Mlati': ['Sinduadi', 'Sumberadi', 'Tlogoadi', 'Triharjo'],
      'Ngaglik': ['Donoharjo', 'Minomartani', 'Sariharjo', 'Sardonoharjo', 'Sinduharjo', 'Sukoharjo'],
      'Pakem': ['Harjobinangun', 'Hargobinangun', 'Pakembinangun', 'Purwobinangun'],
      'Gamping': ['Ambarketawang', 'Balecatur', 'Banyuraden', 'Nogotirto', 'Trihanggo'],
      'Godean': ['Sidoarum', 'Sidoluhur', 'Sidoagung', 'Sidomulyo', 'Sidomoyo', 'Sidokarto', 'Sidareja', 'Sidorejo'],
    },
    'Bantul': {
      'Banguntapan': ['Baturetno', 'Jambidan', 'Jagalan', 'Potorono', 'Tamanan', 'Tegaltirto', 'Wirokerten'],
      'Sewon': ['Bangunharjo', 'Panggungharjo', 'Pendowoharjo', 'Timbulharjo'],
      'Kasihan': ['Bangunjiwo', 'Ngestiharjo', 'Pendowoharjo', 'Tirtonirmolo'],
      'Sanden': ['Gadingharjo', 'Gadingsari', 'Murtigading', 'Srigading'],
      'Kretek': ['Donotirto', 'Parangtritis', 'Tirtohargo', 'Tirtomulyo', 'Tirtosari'],
    },
    'Gunung Kidul': {
      'Wonosari': ['Argosari', 'Baleharjo', 'Desa Wonosari', 'Karangtengah', 'Kepek', 'Mulo', 'Piyaman', 'Selang', 'Siraman', 'Wareng'],
      'Playen': ['Bleberan', 'Bunder', 'Gading', 'Ngleri', 'Playen', 'Plembutan', 'Riharjo', 'Sawahan', 'Nglipar', 'Ngunut'],
    },
    'Kulon Progo': {
      'Wates': ['Bendungan', 'Giripeni', 'Kulwaru', 'Ngestiharjo', 'Sogan', 'Triharjo', 'Wates'],
      'Sentolo': ['Demangrejo', 'Kaliagung', 'Salamrejo', 'Sentolo', 'Sukoreno'],
    },
  },
};

// Locale-independent thousands separator (titik = id-ID style).
// Sengaja tidak pakai toLocaleString('id-ID') — CF Workers ICU tidak dijamin
// sama dengan browser client → mismatch React hydration error #418.
const _ribuan = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const formatRupiah = (amount: number): string => {
  if (amount >= 1_000_000_000) {
    const s = (amount / 1_000_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `Rp ${s}M`;
  }
  if (amount >= 1_000_000) {
    const s = (amount / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `Rp ${s}Jt`;
  }
  return `Rp ${_ribuan(amount)}`;
};

export const formatRupiahFull = (amount: number): string => {
  return `Rp ${_ribuan(amount)}`;
};

export const PORTFOLIO_ITEMS = [
  { id: 1, judul: 'Rumah 3KT di Condongcatur', lokasi: 'Depok, Sleman', foto: 'https://images.unsplash.com/photo-1675657144518-025804f1812c?w=600&q=80', harga: 780000000, jenis: 'Rumah' },
  { id: 2, judul: 'Kost 15 Kamar Mlati', lokasi: 'Mlati, Sleman', foto: 'https://images.unsplash.com/photo-1735461932749-e602a9f6fc82?w=600&q=80', harga: 1100000000, jenis: 'Kost' },
  { id: 3, judul: 'Villa Kaliurang Premium', lokasi: 'Pakem, Sleman', foto: 'https://images.unsplash.com/photo-1692736933760-8a8a9b8c1b6f?w=600&q=80', harga: 4200000000, jenis: 'Villa' },
  { id: 4, judul: 'Tanah 300m² Banguntapan', lokasi: 'Banguntapan, Bantul', foto: 'https://images.unsplash.com/photo-1613553507747-5f8d62ad5904?w=600&q=80', harga: 900000000, jenis: 'Tanah' },
  { id: 5, judul: 'Apartemen Studio UGM Area', lokasi: 'Depok, Sleman', foto: 'https://images.unsplash.com/photo-1515263487990-61b07816b324?w=600&q=80', harga: 420000000, jenis: 'Apartemen' },
  { id: 6, judul: 'Hotel Melati Malioboro', lokasi: 'Gondomanan, Kota Yogyakarta', foto: 'https://images.unsplash.com/photo-1692736933732-ad902fc34626?w=600&q=80', harga: 7500000000, jenis: 'Hotel' },
];
