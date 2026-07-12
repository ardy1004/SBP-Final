// Parser slug programmatic SEO — route /:slug (mis. /rumah-dijual-jogja).
// Grammar: {jenis}-{dijual|disewa}[-{lokasi...}]
//   jenis  : salah satu PROPERTY_TYPE_VALUES (rumah, kost, tanah, villa, …)
//   lokasi : opsional; alias DIY (jogja/yogyakarta/diy) = tanpa filter lokasi,
//            selain itu dicocokkan ke kabupaten/kecamatan di DB oleh loader.
// Slug yang tidak cocok grammar → loader melempar 404 (hindari duplicate content).

import { PROPERTY_TYPE_VALUES, getPropertyTypeLabel } from './propertyTypes';

/** Token lokasi yang berarti "seluruh DIY" — tidak perlu filter lokasi. */
const DIY_ALIASES = new Set(['jogja', 'yogyakarta', 'diy', 'di-yogyakarta', 'daerah-istimewa-yogyakarta']);

export interface ProgrammaticParse {
  jenis: string;            // value valid, mis. 'rumah'
  jenisLabel: string;       // label tampilan, mis. 'Rumah'
  tujuan: 'dijual' | 'disewa';
  tujuanLabel: string;      // 'Dijual' | 'Disewa'
  /** Token lokasi mentah setelah tujuan ('sleman', 'kulon-progo'), null = seluruh DIY */
  lokasiToken: string | null;
}

export function parseProgrammaticSlug(slug: string): ProgrammaticParse | null {
  const parts = slug.toLowerCase().split('-').filter(Boolean);
  if (parts.length < 2) return null;

  const jenis = parts[0];
  if (!(PROPERTY_TYPE_VALUES as readonly string[]).includes(jenis)) return null;

  const tujuan = parts[1];
  if (tujuan !== 'dijual' && tujuan !== 'disewa') return null;

  const lokasiRaw = parts.slice(2).join('-');
  const lokasiToken = lokasiRaw && !DIY_ALIASES.has(lokasiRaw) ? lokasiRaw : null;

  return {
    jenis,
    jenisLabel: getPropertyTypeLabel(jenis),
    tujuan,
    tujuanLabel: tujuan === 'dijual' ? 'Dijual' : 'Disewa',
    lokasiToken,
  };
}
