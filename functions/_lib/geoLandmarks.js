// Data landmark (kampus/RS/mall) + centroid kecamatan DIY untuk halaman
// programmatic SEO "{jenis}-dekat-{landmark}" (mis. /kost-dekat-ugm).
//
// Sumber koordinat: geocoding satu-kali via Nominatim/OpenStreetMap (bukan
// tebakan) — lihat riwayat percakapan. Properti mayoritas TIDAK punya
// latitude/longitude sendiri (isian gmaps_link manual, jarang diisi admin),
// jadi sebagai fallback "kasar" dipakai titik pusat kecamatan (approx=true).
// Ini konsisten dgn keputusan produk: presisi rendah lebih baik daripada
// halaman kosong (anti thin-content, spec 3.8), dgn syarat selalu diberi
// label "≈ perkiraan" di UI — JANGAN pernah ditampilkan sebagai jarak pasti.
//
// functions/_lib import bersama backend↔frontend (lihat CLAUDE.md) — dipakai
// oleh sitemap.xml.js DAN src/app/routes/properties.tsx (loader SSR).

export const LANDMARK_RADIUS_KM = 3.5;

export const LANDMARKS = [
  { slug: 'ugm',             label: 'UGM',                  lat: -7.7693966, lon: 110.3804236 },
  { slug: 'uny',             label: 'UNY',                  lat: -7.7730335, lon: 110.3838155 },
  { slug: 'upn',             label: 'UPN Veteran Yogyakarta', lat: -7.7615019, lon: 110.4080844 },
  { slug: 'uii',             label: 'UII',                  lat: -7.6880648, lon: 110.4138300 },
  { slug: 'uajy',            label: 'UAJY',                 lat: -7.7794683, lon: 110.4159125 },
  { slug: 'sanata-dharma',   label: 'Sanata Dharma',        lat: -7.7747741, lon: 110.3912625 },
  { slug: 'amikom',          label: 'Amikom',                lat: -7.7596002, lon: 110.4087223 },
  { slug: 'yia',             label: 'Bandara YIA',          lat: -7.8998373, lon: 110.0512724 },
  { slug: 'malioboro',       label: 'Malioboro',             lat: -7.7932485, lon: 110.3657751 },
  { slug: 'rs-sardjito',     label: 'RS Sardjito',          lat: -7.7688515, lon: 110.3725115 },
  { slug: 'ambarukmo-plaza', label: 'Ambarukmo Plaza',      lat: -7.7831548, lon: 110.4024354 },
];

// Key = nama kecamatan lowercase (cocok dgn kolom properties.kecamatan setelah
// di-lowercase). Hanya kecamatan yang benar-benar punya listing saat ini —
// tambahkan entri baru di sini bila inventori merambah kecamatan lain.
export const KECAMATAN_CENTROIDS = {
  'depok':        { lat: -7.7587420, lon: 110.3931320 },
  'mlati':        { lat: -7.7339251, lon: 110.3290320 },
  'ngaglik':      { lat: -7.7220206, lon: 110.4025788 },
  'ngemplak':     { lat: -7.6980701, lon: 110.4451494 },
  'gamping':      { lat: -7.7953921, lon: 110.3216174 },
  'banguntapan':  { lat: -7.8285428, lon: 110.4108390 },
  'gondokusuman': { lat: -7.7870130, lon: 110.3873290 },
  'ngampilan':    { lat: -7.8062206, lon: 110.3559245 },
  'umbulharjo':   { lat: -7.8097264, lon: 110.3877003 },
};

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve koordinat properti: pakai latitude/longitude asli bila ada
 * (approx=false, presisi), fallback ke centroid kecamatan (approx=true,
 * kasar). Return null bila tak ada info lokasi sama sekali.
 */
export function resolveApproxCoord(property) {
  const lat = property.latitude != null ? Number(property.latitude) : null;
  const lon = property.longitude != null ? Number(property.longitude) : null;
  if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    return { lat, lon, approx: false };
  }
  const kecKey = String(property.kecamatan ?? '').trim().toLowerCase();
  const centroid = KECAMATAN_CENTROIDS[kecKey];
  if (!centroid) return null;
  return { lat: centroid.lat, lon: centroid.lon, approx: true };
}

export function findLandmark(slug) {
  return LANDMARKS.find(l => l.slug === slug) ?? null;
}

/**
 * Parser grammar programmatic landmark: {jenis}-dekat-{landmarkSlug}
 * (mis. "kost-dekat-ugm"). Terpisah dari parseProgrammaticSlug (grammar
 * {jenis}-{dijual|disewa}[-{lokasi}]) karena token kedua berbeda ('dekat'
 * vs 'dijual'/'disewa') — dua grammar independen, dicoba berurutan oleh loader.
 */
export function parseLandmarkSlug(slug, jenisValues, getJenisLabel) {
  const parts = String(slug).toLowerCase().split('-').filter(Boolean);
  if (parts.length < 3 || parts[1] !== 'dekat') return null;

  const jenis = parts[0];
  if (!jenisValues.includes(jenis)) return null;

  const landmarkSlug = parts.slice(2).join('-');
  const landmark = findLandmark(landmarkSlug);
  if (!landmark) return null;

  return {
    jenis,
    jenisLabel: getJenisLabel(jenis),
    landmark,
  };
}
