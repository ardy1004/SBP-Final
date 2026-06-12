// Builder URL detail properti — HARUS konsisten dengan route aktual:
//   /{dijual|disewa}/:jenis/:provinsi/:kabupaten/:kecamatan/:slug   (src/app/routes.ts)
// Loader detail (property-detail.tsx) mencari berdasarkan slug saja, tapi prefix path
// WAJIB benar agar route match (bukan 404) + canonical/OG konsisten saat di-share.

function seg(v) {
  return String(v ?? '').toLowerCase().trim().replace(/\s+/g, '-') || 'jogja';
}

/**
 * @param {{ jenis_properti?: string, tujuan?: string, provinsi?: string,
 *           kabupaten?: string, kecamatan?: string, slug: string }} p
 * @param {string} [appUrl] base URL (default https://salambumi.xyz). '' → path relatif.
 */
export function buildPropertyUrl(p, appUrl = 'https://salambumi.xyz') {
  const tujuanPath = p.tujuan === 'disewa' ? 'disewa' : 'dijual';
  const jenisSlug = seg(p.jenis_properti || 'properti');
  const provSlug = seg(p.provinsi);
  const kabSlug = seg(p.kabupaten);
  const kecSlug = seg(p.kecamatan);
  const base = appUrl ? appUrl.replace(/\/$/, '') : '';
  return `${base}/${tujuanPath}/${jenisSlug}/${provSlug}/${kabSlug}/${kecSlug}/${p.slug}`;
}
