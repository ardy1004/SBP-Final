const JENIS_LABEL = {
  apartment: 'Apartment', rumah: 'Rumah', tanah: 'Tanah', kost: 'Kost',
  hotel: 'Hotel', homestay: 'Homestay', villa: 'Villa', ruko: 'Ruko',
  gudang: 'Gudang', komersial: 'Komersial',
};

const TUJUAN_LABEL = {
  dijual: 'Dijual', disewa: 'Disewakan', dijual_disewa: 'Dijual & Disewakan',
};

function formatHargaShort(harga) {
  const n = Number(harga);
  if (!n || n <= 0) return null;
  if (n >= 1_000_000_000) {
    const val = n / 1_000_000_000;
    const str = Number.isInteger(val) ? String(val) : val.toFixed(1).replace('.', ',');
    return `Rp ${str} Miliar`;
  }
  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    const str = Number.isInteger(val) ? String(val) : val.toFixed(1).replace('.', ',');
    return `Rp ${str} Juta`;
  }
  const val = n / 1_000;
  const str = Number.isInteger(val) ? String(val) : val.toFixed(1).replace('.', ',');
  return `Rp ${str} Ribu`;
}

function trunc(str, max) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

export function generateMetaSeo({ jenis_properti, tujuan, harga, kecamatan, kabupaten, luas_tanah, luas_bangunan, nego }) {
  const jenisLabel = JENIS_LABEL[jenis_properti] || 'Properti';
  const tujuanLabel = TUJUAN_LABEL[tujuan] || '';
  const lokasi = kecamatan || kabupaten || 'Yogyakarta';
  const kab = kabupaten || 'DIY';
  const hargaShort = formatHargaShort(harga);

  // ⚠️ JUDUL WAJIB PUNYA PEMBEDA UNIK.
  // Sampai 2026-08-03 judul hanya disusun dari jenis+tujuan+kecamatan+kabupaten+harga,
  // sehingga dua properti sejenis, sekecamatan, seharga mendapat judul IDENTIK.
  // Terukur di D1 produksi: 214 dari 533 properti (40%) memakai meta_title kembar —
  // sinyal konten tipis/duplikat bagi mesin pencari. Diperparah trunc(...,60) yang
  // justru memotong bagian brand di ujung.
  //
  // Kombinasi diuji langsung ke data nyata (GROUP BY, jumlah properti kembar):
  //   kecamatan (lama) .................. 214
  //   + kelurahan ....................... 148
  //   kelurahan + KT + KM ............... 303  (lebih buruk — banyak yang sekamar sama)
  //   kelurahan + KT + harga ............  46
  //   kelurahan + LT + LB + harga .......   2  ← dipakai 2026-08-03
  //
  // ⚠️ 2026-08-06: kelurahan DIGANTI kecamatan di kepala judul. Struktur pembeda
  // (LT/LB/harga) TIDAK berubah — hanya kata lokasinya. Alasan: kelurahan nyaris
  // tidak pernah diketik orang saat mencari ("rumah dijual sardonoharjo" ≈ 0 volume),
  // sedangkan kecamatan/kabupaten itu yang benar-benar dicari ("rumah dijual ngaglik
  // sleman"). Diuji ulang GROUP BY ke 533 properti nyata sebelum diganti:
  //   kecamatan+kabupaten, TANPA pembeda spek ........ 259 kembar (lebih buruk)
  //   kecamatan+kabupaten, +kelurahan kalau bentrok ... 199 kembar, panjang maks 77 (gagal)
  //   kecamatan (bukan kelurahan) + LT/LB + harga ..... 4 kembar, panjang maks 60 ← dipakai
  const luasBagian = [
    luas_tanah ? `LT${luas_tanah}` : null,
    // `tanah` hampir selalu tanpa bangunan — jangan menulis 'LB0' yang menyesatkan.
    luas_bangunan ? `LB${luas_bangunan}` : null,
  ].filter(Boolean).join(' ');

  // Susun dari yang paling informatif, lalu SUSUTKAN bertahap sampai muat 60 char.
  // Memotong dengan '...' (perilaku lama) selalu membuang bagian EKOR — yaitu harga
  // dan brand — padahal itu yang paling berguna di hasil pencarian. Lebih baik
  // melepas komponen luas secara sadar daripada memotong buta.
  const kepala = `${jenisLabel} ${tujuanLabel} ${lokasi}`.replace(/\s+/g, ' ').trim();
  const ekor = `- ${hargaShort || 'Harga Nego'} | SBP`;
  const kandidat = [
    [kepala, luasBagian, ekor],                                    // lengkap
    [kepala, luas_tanah ? `LT${luas_tanah}` : '', ekor],           // lepas LB
    [kepala, ekor],                                                // lepas luas
  ].map(bagian => bagian.filter(Boolean).join(' '));
  const meta_title = trunc(kandidat.find(t => t.length <= 60) ?? kandidat[kandidat.length - 1], 60);

  const parts = [`Properti ${jenisLabel.toLowerCase()} ${tujuanLabel.toLowerCase()} di ${lokasi}, ${kab}.`];
  if (luas_tanah) parts.push(`Luas tanah ${luas_tanah}m².`);
  if (luas_bangunan) parts.push(`Luas bangunan ${luas_bangunan}m².`);
  if (hargaShort) parts.push(`Harga ${hargaShort}.`);
  if (nego) parts.push('Nego.');
  parts.push('Hubungi Salam Bumi Property untuk info lengkap.');

  const meta_description = trunc(parts.join(' '), 155);

  return { meta_title, meta_description };
}
