// Kontrak paginasi yang dipakai BERSAMA oleh route loader/meta
// (src/app/routes/properties.tsx) dan komponen (src/app/components/PropertiesPage.tsx).
//
// Ditaruh di modul sendiri, bukan di route, karena route sudah mengimpor komponen —
// mengekspor helper dari sana lalu diimpor balik oleh komponen akan membentuk
// impor melingkar. Satu sumber juga memastikan href yang DIRENDER di nav tidak
// pernah berbeda dari URL yang DINYATAKAN kanonik di <head>.

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
