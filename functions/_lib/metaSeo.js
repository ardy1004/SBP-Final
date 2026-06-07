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

  const rawTitle = `${jenisLabel} ${tujuanLabel} di ${lokasi}, ${kab} - ${hargaShort || 'Harga Nego'} | Salam Bumi Property`;
  const meta_title = trunc(rawTitle, 60);

  const parts = [`Properti ${jenisLabel.toLowerCase()} ${tujuanLabel.toLowerCase()} di ${lokasi}, ${kab}.`];
  if (luas_tanah) parts.push(`Luas tanah ${luas_tanah}m².`);
  if (luas_bangunan) parts.push(`Luas bangunan ${luas_bangunan}m².`);
  if (hargaShort) parts.push(`Harga ${hargaShort}.`);
  if (nego) parts.push('Nego.');
  parts.push('Hubungi Salam Bumi Property untuk info lengkap.');

  const meta_description = trunc(parts.join(' '), 155);

  return { meta_title, meta_description };
}
