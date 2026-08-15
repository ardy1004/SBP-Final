/**
 * Saklar fitur publik yang sengaja dimatikan sementara.
 *
 * PETA & LINK MAPS — dimatikan 2026-08-12 atas keputusan pemilik: calon pembeli,
 * kompetitor, dan broker lain memakainya untuk mendatangi lokasi properti langsung
 * dan memotong peran agen.
 *
 * Ini penyembunyian TAMPILAN, bukan penghapusan data. latitude/longitude/gmaps_link
 * tetap utuh di D1, tetap dipakai admin, dan tetap dipakai pencarian "dekat <kampus>"
 * yang menghitung jarak di sisi server (functions/_lib/geoLandmarks.js).
 *
 * Untuk menyalakan kembali: ubah satu-satunya nilai di bawah menjadi `true`.
 */
export const TAMPILKAN_PETA_PUBLIK = false;
