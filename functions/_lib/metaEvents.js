// Kosakata event Meta Pixel/CAPI — SUMBER TUNGGAL untuk backend DAN frontend.
//
// Dipakai oleh:
//   · functions/api/admin/pixel-configs/index.js -> events_enabled bawaan pixel baru
//   · src/app/components/admin/AdminSettingsPage.tsx -> daftar centang di UI
//
// KENAPA HARUS SATU TEMPAT
// Daftar ini dulu ditulis dua kali (`DEFAULT_EVENTS` + `ALL_EVENTS`). Kelas
// kegagalan yang sama persis dengan penanda in-app di inAppBrowser.js: menambah
// nama di satu sisi saja tidak menghasilkan error apa pun, hanya event yang
// diam-diam tidak pernah bisa dinyalakan dari UI.
//
// 🔥 MENAMBAH NAMA DI SINI TIDAK CUKUP — WAJIB DISERTAI MIGRASI D1.
// Baris `pixel_configs` yang SUDAH ADA menyimpan salinan daftarnya sendiri di
// kolom `events_enabled`, dan DUA tempat memeriksanya sebelum mengirim apa pun:
//   · trackEvent()  -> px.events_enabled.includes(eventName)   (browser)
//   · filter CAPI   -> JSON.parse(events_enabled).includes(…)  (server)
// Jadi nama baru tanpa migrasi = fitur yang lulus semua gate tapi mengirim NOL
// event, tanpa satu pun error. Lihat migrations/0044_pixel_complete_registration.sql
// sebagai contoh (json_insert ke '$[#]', dijaga NOT LIKE supaya idempoten).
export const META_EVENTS = [
  'PageView',             // saklar induk — tanpa ini fbq tak pernah di-init
  'ViewContent',          // detail properti
  'Search',               // filter/pencarian di /properties
  'Contact',              // klik WA (anonim, tanpa PII)
  'Lead',                 // lead PEMBELI — form detail properti, kontak, chat
  'CompleteRegistration', // lead PENJUAL — Titip Jual. Sengaja event TERPISAH
                          // dari `Lead` supaya kampanye cari-penjual dan
                          // cari-pembeli bisa dioptimalkan sendiri-sendiri;
                          // kalau digabung, algoritma Meta belajar dari audiens
                          // campuran dan kedua sisi jadi lebih buruk.
                          // Dikirim TANPA `value`: lead penjual tidak membawa
                          // pendapatan, dan mengisi value dengan harga aset
                          // membuat ROAS di Ads Manager menyesatkan.
];
