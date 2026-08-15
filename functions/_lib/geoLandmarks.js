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

// `kata` = kata kunci yang dicari DI JUDUL listing sebagai sinyal kedua selain
// radius. Alasannya diukur ke D1 produksi 2026-08-12:
//
//   0 dari 184 kost punya latitude/longitude sendiri — SEMUANYA jatuh ke
//   centroid kecamatan. Karena 103 dari 184 kost ada di Kecamatan Depok, setiap
//   landmark yang dekat Depok mengembalikan himpunan yang PERSIS SAMA (~104
//   baris): UGM 104, UNY 104, UAJY 104, RS Sardjito 104 — padahal hanya 5 judul
//   yang benar-benar menyebut UNY dan 2 menyebut UAJY. Sebaliknya UII dapat 0
//   karena Kecamatan Ngemplak (32 kost, klaster Jl. Kaliurang KM 13-14) jatuh
//   tepat di luar cincin 3,5 km — padahal 30 kost menyebut UII di judulnya.
//   Jadi "radius" di sini sebenarnya proksi kecamatan, bukan geografi properti.
//
// ⚠️ HANYA JUDUL, JANGAN DESKRIPSI. Deskripsi berisi daftar kampus borongan —
// satu listing berbunyi "16 km dari UPN dan dikelilingi kampus-kampus ternama
// seperti UII, YKPN, Atma Jaya, Amikom, dan UGM". Mencocokkan deskripsi membuat
// properti Seturan muncul untuk pertanyaan "dekat UII", yaitu berbohong.
//
// ⚠️ SETIAP kata di sini SUDAH DIUKUR ke judul asli, bukan ditebak. Dua kandidat
// GAGAL dan sengaja tidak dipakai: 'veteran' (untuk UPN) hanya menangkap
// "Jl. Veteran" — nama jalan, bukan kampus; 'bandara' (untuk YIA) menangkap
// "Jogja Bay, Bandara, dan Stadion". Kalau menambah kata baru, UKUR DULU.
export const LANDMARKS = [
  { slug: 'ugm',             label: 'UGM',                  lat: -7.7693966, lon: 110.3804236, kata: ['ugm'] },
  { slug: 'uny',             label: 'UNY',                  lat: -7.7730335, lon: 110.3838155, kata: ['uny'] },
  { slug: 'upn',             label: 'UPN Veteran Yogyakarta', lat: -7.7615019, lon: 110.4080844, kata: ['upn'] },
  { slug: 'uii',             label: 'UII',                  lat: -7.6880648, lon: 110.4138300, kata: ['uii'] },
  { slug: 'uajy',            label: 'UAJY',                 lat: -7.7794683, lon: 110.4159125, kata: ['uajy'] },
  { slug: 'sanata-dharma',   label: 'Sanata Dharma',        lat: -7.7747741, lon: 110.3912625, kata: ['sanata', 'sadhar'] },
  { slug: 'amikom',          label: 'Amikom',                lat: -7.7596002, lon: 110.4087223, kata: ['amikom'] },
  // YIA tidak punya kata kunci: 'yia' nol di judul dan 'bandara' salah tangkap.
  { slug: 'yia',             label: 'Bandara YIA',          lat: -7.8998373, lon: 110.0512724, kata: [] },
  { slug: 'malioboro',       label: 'Malioboro',             lat: -7.7932485, lon: 110.3657751, kata: ['malioboro'] },
  { slug: 'rs-sardjito',     label: 'RS Sardjito',          lat: -7.7688515, lon: 110.3725115, kata: ['sardjito'] },
  { slug: 'ambarukmo-plaza', label: 'Ambarukmo Plaza',      lat: -7.7831548, lon: 110.4024354, kata: ['ambarukmo', 'amplaz'] },
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

/** Escape untuk dipakai di dalam RegExp. */
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apakah JUDUL listing menyebut landmark ini?
 *
 * Pakai batas kata (\b), bukan `includes()` mentah: hari ini keduanya memberi
 * hasil identik pada 538 judul produksi (diverifikasi), tapi substring telanjang
 * adalah bom waktu — 'uny' akan tertelan "sunyi", 'uad' oleh "muadzin".
 * Judulnya saja; deskripsi sengaja tidak disentuh (lihat catatan di LANDMARKS).
 */
export function judulMenyebutLandmark(title, landmark) {
  const t = String(title ?? '');
  if (!t || !landmark?.kata?.length) return false;
  return landmark.kata.some(k => new RegExp(`\\b${escRe(k)}\\b`, 'i').test(t));
}

/**
 * Peringkat "dekat landmark" — SATU SUMBER untuk chatbot (searchProperties.js)
 * dan halaman SEO programmatic (routes/properties.tsx). Sebelum 2026-08-12
 * keduanya punya salinan logika haversine sendiri dan sudah menyimpang: halaman
 * SEO memindai seluruh baris, sedangkan chatbot dibatasi 60 kandidat sehingga
 * melihat potongan sembarang dari inventori.
 *
 * Mengembalikan SELURUH daftar terurut (pemanggil yang memotong sesuai limit /
 * paginasi), dengan tiga lapis keyakinan:
 *   1. judul menyebut landmark DAN berada dalam radius  → paling meyakinkan
 *   2. judul menyebut landmark saja                     → jarak TIDAK diklaim
 *   3. dalam radius saja                                → jarak perkiraan
 *
 * Lapis 2 tidak boleh dibuang: di UII lapis itu satu-satunya sumber hasil
 * (radius 0, judul 30).
 */
export function peringkatDekatLandmark(rows, landmark) {
  if (!landmark) return rows;
  return rows
    .map(row => {
      const cocokJudul = judulMenyebutLandmark(row.title, landmark);
      const coord = resolveApproxCoord(row);
      const jarak = coord ? haversineKm(coord.lat, coord.lon, landmark.lat, landmark.lon) : null;
      const dalamRadius = jarak != null && jarak <= LANDMARK_RADIUS_KM;
      if (!cocokJudul && !dalamRadius) return null;
      return {
        ...row,
        // Jarak hanya dilampirkan bila memang dalam radius. Untuk kecocokan
        // judul di luar radius, `null` adalah jawaban jujur — mengarang angka
        // dari centroid kecamatan justru menyesatkan (hanya ada 8 nilai jarak
        // berbeda untuk 184 kost, semuanya jarak kecamatan).
        jarak_km: dalamRadius ? Math.round(jarak * 10) / 10 : null,
        lokasi_approx: dalamRadius ? coord.approx : false,
        cocok_judul: cocokJudul,
        lapis: cocokJudul && dalamRadius ? 1 : cocokJudul ? 2 : 3,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.lapis !== b.lapis) return a.lapis - b.lapis;
      // Di dalam lapis yang sama: yang punya jarak diurutkan terdekat dulu.
      // Array.sort JS stabil → urutan SQL (badge/tanggal) tetap terjaga untuk
      // lapis 2 yang seluruhnya tidak berjarak.
      if (a.jarak_km == null && b.jarak_km == null) return 0;
      if (a.jarak_km == null) return 1;
      if (b.jarak_km == null) return -1;
      return a.jarak_km - b.jarak_km;
    })
    // `lapis` hanya kunci pengurutan, bukan data. Dibuang di sini karena hasil
    // ini dikirim mentah sebagai tool output ke Groq — setiap field yang tidak
    // dipakai model adalah token yang dibayar tanpa guna.
    .map(({ lapis: _lapis, ...sisa }) => sisa);
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
