// Kontrak paginasi yang dipakai BERSAMA oleh route loader/meta
// (src/app/routes/properties.tsx) dan komponen (src/app/components/PropertiesPage.tsx).
//
// Ditaruh di modul sendiri, bukan di route, karena route sudah mengimpor komponen —
// mengekspor helper dari sana lalu diimpor balik oleh komponen akan membentuk
// impor melingkar. Satu sumber juga memastikan href yang DIRENDER di nav tidak
// pernah berbeda dari URL yang DINYATAKAN kanonik di <head>.

import { PROPERTY_TYPE_VALUES } from './propertyTypes';

/**
 * Jumlah listing per halaman — SAMA untuk loader SSR (LIMIT/OFFSET) dan fetch
 * klien (`limit` awal & kelipatan "Muat Lebih Banyak"). Nav paginasi yang disusun
 * di klien (basePathFilter) menghitung jumlah halaman dari angka ini; kalau
 * berbeda dari server, tautan "halaman N" menunjuk irisan yang lain.
 */
export const UKURAN_HALAMAN = 20;

/**
 * Path dasar (tanpa `page`) untuk daftar yang disaring filter KLIEN saat ini.
 *
 * Dipakai nav paginasi setelah pengunjung mengubah filter tanpa memuat ulang
 * halaman: nav dari loader masih menggambarkan URL awal, jadi tautannya harus
 * disusun ulang dari filter yang sedang aktif. Urutan kunci = SUPPORTED_PARAMS
 * loader; `jenis` diurutkan menurut PROPERTY_TYPES supaya satu kombinasi = satu
 * URL (klik Tanah→Kost dan Kost→Tanah menghasilkan tautan yang sama).
 *
 * `provinsi` SENGAJA tidak ikut: fetch klien tidak pernah memfilter provinsi,
 * jadi tautan harus menggambarkan daftar yang sedang dilihat pengunjung.
 */
export function basePathFilter(f: { tujuan: string; jenis: string[]; kabupaten: string; kecamatan: string }): string {
  const qs = new URLSearchParams();
  if (f.tujuan && f.tujuan !== 'semua') qs.set('tujuan', f.tujuan);
  const jenis = PROPERTY_TYPE_VALUES.filter(v => f.jenis.includes(v));
  if (jenis.length) qs.set('jenis', jenis.join(','));
  if (f.kabupaten) qs.set('kabupaten', f.kabupaten);
  if (f.kecamatan) qs.set('kecamatan', f.kecamatan);
  const s = qs.toString();
  return s ? `/properties?${s}` : '/properties';
}

export interface PaginationInfo {
  /** Halaman aktif, mulai dari 1. */
  page: number;
  totalPages: number;
  /** Path + query yang relevan, TANPA `page`. Href tiap halaman disusun darinya. */
  basePath: string;
}

/**
 * Href halaman ke-n.
 *
 * Halaman 1 SENGAJA tidak diberi `?page=1`: kalau diberi, ia jadi URL kedua dengan
 * isi identik dengan URL dasar — persis duplikat yang sedang kita hindari.
 */
export function urlHalaman(basePath: string, n: number): string {
  if (n <= 1) return basePath;
  return `${basePath}${basePath.includes('?') ? '&' : '?'}page=${n}`;
}

/**
 * Deret nomor halaman untuk nav: selalu memuat halaman pertama, terakhir, dan
 * tetangga halaman aktif; sisanya diringkas jadi elipsis.
 *
 * `null` = pemisah elipsis. Dibatasi supaya kategori dengan 27 halaman tidak
 * merender 27 tautan sekaligus — tapi halaman pertama & terakhir selalu ada agar
 * crawler bisa mencapai ujung daftar dari mana pun ia masuk.
 */
export function deretHalaman(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const sekitar = new Set<number>([1, totalPages, page]);
  for (const d of [-2, -1, 1, 2]) {
    const n = page + d;
    if (n >= 1 && n <= totalPages) sekitar.add(n);
  }
  const urut = [...sekitar].sort((a, b) => a - b);

  const hasil: (number | null)[] = [];
  let sebelumnya = 0;
  for (const n of urut) {
    if (sebelumnya && n - sebelumnya > 1) hasil.push(null);
    hasil.push(n);
    sebelumnya = n;
  }
  return hasil;
}
