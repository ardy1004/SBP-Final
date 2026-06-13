// Ekstrak lat/lng dari URL Google Maps (berbagai format + short links)
// Returns { latitude, longitude, source } — latitude/longitude null jika gagal

const SHORT_DOMAINS = ['maps.app.goo.gl', 'goo.gl'];

function extractCoords(url) {
  // @lat,lng — paling umum di URL panjang Google Maps
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]), source: 'at_pattern' };

  // !3dLAT!4dLNG — format embed/share
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]), source: 'embed_pattern' };

  // ?q=lat,lng atau &q=lat,lng — [+-]? non-capturing sebelum lng untuk handle tanda plus
  m = url.match(/[?&]q=(-?\d+\.\d+),\s*[+-]?(\d+\.\d+)/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]), source: 'q_param' };

  // /lat,lng di path (fallback generik) — handle tanda + eksplisit di depan koordinat
  m = url.match(/\/([+-]?\d{1,3}\.\d{4,}),\s*[+-]?(\d{1,3}\.\d{4,})/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]), source: 'generic_path' };

  return null;
}

function isIndonesia(lat, lng) {
  return lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141;
}

export async function parseGmapsCoords(url) {
  if (!url || typeof url !== 'string') return { latitude: null, longitude: null, source: 'unparseable' };
  try {
    const trimmed = url.trim();

    const direct = extractCoords(trimmed);
    if (direct) {
      if (!isIndonesia(direct.latitude, direct.longitude)) return { latitude: null, longitude: null, source: 'out_of_range' };
      return direct;
    }

    let parsed;
    try { parsed = new URL(trimmed); } catch { return { latitude: null, longitude: null, source: 'unparseable' }; }

    const isShort = SHORT_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    if (!isShort) return { latitude: null, longitude: null, source: 'unparseable' };

    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    try {
      const resp = await fetch(trimmed, { redirect: 'follow', signal: ac.signal });
      clearTimeout(tid);
      const fromResolved = extractCoords(resp.url);
      if (fromResolved) {
        if (!isIndonesia(fromResolved.latitude, fromResolved.longitude)) return { latitude: null, longitude: null, source: 'out_of_range' };
        return fromResolved;
      }
      return { latitude: null, longitude: null, source: 'unresolved_shortlink' };
    } catch {
      clearTimeout(tid);
      return { latitude: null, longitude: null, source: 'error' };
    }
  } catch {
    return { latitude: null, longitude: null, source: 'error' };
  }
}
