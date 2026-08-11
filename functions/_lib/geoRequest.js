// Geo dari request.cf Cloudflare — gratis, otomatis ada di tiap request Worker,
// tidak butuh API pihak ketiga. Dipakai untuk mencatat dari kota mana audiens
// mengklik (kartu properti, tombol WA) — lihat property_click_geo (migrasi 0036).
export function extractGeo(request) {
  const cf = request.cf || {};
  return {
    city: cf.city || null,
    region: cf.region || null,
    country: cf.country || null,
  };
}
