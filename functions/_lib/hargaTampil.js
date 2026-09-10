// Harga mana yang ditampilkan untuk sebuah properti — SATU SUMBER KEBENARAN.
// Diimpor backend secara natif DAN frontend lewat Vite (pola yang sama dengan
// hargaTanah.js, inAppBrowser.js, metaEvents.js).
//
// MASALAH YANG DIPERBAIKI (2026-09-10)
// Kolom `harga` di D1 adalah harga JUAL. Untuk properti bertujuan `disewa` ia
// sengaja diisi 0 — lihat komentar di functions/api/titip-jual.js:233 — dan
// harga sebenarnya ada di `harga_sewa_tahun`.
//
// Server sudah menangani ini dengan benar (meta SEO memilih kolom sesuai tujuan),
// tapi SELURUH permukaan yang dilihat manusia tidak: PropertyCard, empat titik di
// PropertyDetailPage, dan llms.txt semuanya membaca `harga` mentah. Akibatnya
// listing sewa tampil **Rp 0** sementara meta_title-nya berbunyi "Rp 75 Juta".
//
// Lebih halus lagi: `normalizeProperty()` SUDAH menyiapkan datanya sebagai
// `harga_sewa` — tapi nol komponen pernah membacanya. Field itu ditulis, dikirim,
// lalu dibuang diam-diam; TypeScript tidak bisa menangkap yang seperti itu.
//
// ⚠️ Menerima DUA nama field, dan itu wajib: data mentah D1 memakai
// `harga_sewa_tahun`, sedangkan objek hasil `normalizeProperty()` yang dipegang
// komponen memakai `harga_sewa`. Menganggap salah satunya saja akan membuat
// separuh pemanggil diam-diam kembali menampilkan nol.

/** Angka > 0, atau null. `harga` 0 pada listing sewa BUKAN harga — itu penanda "tidak berlaku". */
function angkaPositif(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {{tujuan?: string, harga?: number|null, harga_sewa_tahun?: number|null, harga_sewa?: number|null}} p
 * @returns {{utama: number|null, satuan: string, jual: number|null, sewa: number|null}}
 *   `utama`  angka headline (null = belum ada harga → pemanggil menampilkan "Hubungi kami")
 *   `satuan` '/tahun' untuk sewa, '' untuk jual
 *   `jual`/`sewa` angka mentah tiap sisi; `dijual_disewa` memakai keduanya
 */
export function hargaTampil(p) {
  const tujuan = p?.tujuan ?? 'dijual';
  const jual = angkaPositif(p?.harga);
  const sewa = angkaPositif(p?.harga_sewa_tahun ?? p?.harga_sewa);

  if (tujuan === 'disewa') {
    return { utama: sewa, satuan: '/tahun', jual: null, sewa };
  }
  if (tujuan === 'dijual_disewa') {
    // Headline-nya harga jual, tapi `sewa` ikut dikembalikan supaya pemanggil
    // bisa menampilkannya sebagai baris kedua. Sampai 2026-09-10 harga sewa
    // properti `dijual_disewa` TIDAK PERNAH tampil di mana pun — rusak senyap:
    // pengunjung tidak melihat angka salah, mereka cuma tidak pernah tahu.
    return { utama: jual, satuan: '', jual, sewa };
  }
  return { utama: jual, satuan: '', jual, sewa: null };
}
