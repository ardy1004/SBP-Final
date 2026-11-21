// Konten statis halaman FAQ & Portfolio.
//
// 2026-09-27: data tiruan lama (PROPERTIES, FEATURED_PROPERTIES, TESTIMONIALS,
// BLOG_POSTS, LOCATION_HIERARCHY — nol pemakai) dihapus, dan formatRupiah /
// formatRupiahFull pindah ke src/lib/format.ts. Sebelumnya src/lib/api.ts
// meng-ekspor ulang formatter dari sini, dan `FEATURED_PROPERTIES =
// PROPERTIES.filter(...)` (panggilan di tingkat modul) menahan 13,8 KB data
// tiruan: ikut chunk SSR, dijalankan tiap Worker start, dan dimuat di SETIAP
// halaman browser. JANGAN menambah pemanggilan fungsi di tingkat modul di sini.

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

