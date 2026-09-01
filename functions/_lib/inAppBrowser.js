// Penanda in-app browser Meta — SUMBER TUNGGAL untuk backend DAN frontend.
//
// Dipakai oleh:
//   · src/app/entry.client.tsx        -> menandai laporan hidrasi (context.in_app)
//   · functions/api/admin/errors/*.js -> filter "Sembunyikan in-app browser"
//
// KENAPA HARUS SATU TEMPAT
// Daftar ini dulu ditulis DUA KALI dengan dua sintaks berbeda: regex JS di klien
// dan rangkaian `LIKE` di SQL. Keduanya menyimpang tanpa satu pun error — dan
// itulah yang terjadi pada 2026-09-01: 44 baris dari Threads lolos filter
// meski tombol "Sembunyikan in-app browser" sudah menyala, karena tidak ada
// yang tahu daftar ini perlu ditambah di DUA tempat sekaligus.
//
// ⚠️ DAFTAR INI ADALAH ALLOWLIST YANG BASI DIAM-DIAM. Setiap aplikasi Meta baru
// — dan setiap penempatan iklan baru yang mengarahkan ke aplikasi itu — membawa
// token user-agent baru yang tidak dikenali. Gejalanya BUKAN error, melainkan
// error #418 yang tiba-tiba "lolos filter". Kalau suatu saat Admin → Errors
// kembali penuh #418 padahal filter menyala: periksa `user_agent` baris-baris
// itu, cari token aplikasinya, tambahkan SATU baris di sini.
export const PENANDA_IN_APP = [
  'FBAN',       // Facebook App Name   — in-app browser Facebook (iOS)
  'FBAV',       // Facebook App Version — in-app browser Facebook (Android/iOS)
  'FB_IAB',     // Facebook In-App Browser (Android)
  'Instagram',  // in-app browser Instagram
  'Barcelona',  // THREADS. "Barcelona" adalah nama kode internal aplikasi
                // Threads — token ini yang MUNCUL di UA, kata "Threads" TIDAK
                // pernah muncul. Terlihat seperti sampah kalau tidak tahu;
                // JANGAN dihapus. 46 baris pada 2026-09-01.
  'IABMV',      // In-App Browser Meta Version — penanda generik yang dibawa
                // varian iOS aplikasi Meta. Sebagian besar tumpang tindih
                // dengan penanda di atas; gunanya menangkap aplikasi Meta
                // BERIKUTNYA sebelum ada yang sempat menambahkannya manual.
];

/** Cocokkan user-agent dengan daftar di atas. Case-insensitive, sama seperti
 *  `LIKE` di SQLite, supaya klien dan SQL tidak pernah berbeda pendapat. */
export function cocokInApp(ua) {
  if (!ua) return false;
  const s = String(ua).toLowerCase();
  return PENANDA_IN_APP.some(p => s.includes(p.toLowerCase()));
}

/**
 * Predikat SQL yang setara dengan cocokInApp(), plus flag `context.in_app`
 * yang ditulis klien.
 *
 * ⚠️ COALESCE WAJIB, jangan "dirapikan". Tanpa itu baris ber-`user_agent` NULL
 * (SEMUA error server, termasuk `[scheduler]`) membuat ekspresinya bernilai
 * NULL — dan `NOT NULL` juga NULL, sehingga barisnya terbuang dari KEDUA sisi
 * filter sekaligus. Diukur saat ditemukan: 20 baris belum-ditinjau berubah jadi
 * 0 + 2, dan justru baris [scheduler] yang mau ditonjolkan malah lenyap.
 * Jebakan tiga-nilai yang sama dengan aturan TRIM(COALESCE(x,''))='' di CLAUDE.md.
 *
 * ⚠️ Dicocokkan ke DUA jalan, dan itu disengaja:
 *   · `context.in_app` — ditandai klien (cocokInApp di entry.client.tsx)
 *   · `user_agent`     — dibaca server, jadi berlaku juga untuk baris LAMA
 * Flag saja tidak cukup: baris yang masuk sebelum penandaan dipasang tidak akan
 * pernah punya flag. UA juga jadi jaring kalau penandaan klien gagal — dan
 * itulah yang membuat penambahan penanda baru berlaku surut tanpa migrasi.
 */
export function sqlInApp(kolomUa = 'user_agent', kolomContext = 'context') {
  const ua = PENANDA_IN_APP.map(p => `COALESCE(${kolomUa},'') LIKE '%${p}%'`);
  return `(COALESCE(${kolomContext},'') LIKE '%"in_app":true%' OR ${ua.join(' OR ')})`;
}
