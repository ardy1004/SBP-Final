// Smart Search Parser — rule-based (regex + dictionary), TANPA AI.
// Mengubah free-text query → filter terstruktur + chips + remainder (keyword teks bebas).
// Pure function, tidak menyentuh state/React. Aman terhadap input aneh (emoji/simbol).

import { PROPERTY_TYPES } from '../../lib/propertyTypes';

export interface FlatLoc {
  id: number;
  nama: string;
  tipe: string;
  parent_id: number | null;
}
export interface LocationIndex {
  provinces: FlatLoc[];
  kabupatens: FlatLoc[];
  kecamatans: FlatLoc[];
  byId: Record<number, FlatLoc>;
}

export interface SmartFilters {
  tujuan?: 'dijual' | 'disewa';
  jenis?: string;
  hargaMin?: number;
  hargaMax?: number;
  kt?: number;
  km?: number;
  lantai?: number;
  luasTanah?: number;
  luasBangunan?: number;
  provId?: number | null;
  kabupaten?: string;
  kabupatenId?: number | null;
  kecamatan?: string;
}
export interface SmartChip { key: string; label: string }
export interface SmartParseResult {
  filters: SmartFilters;
  chips: SmartChip[];
  remainder: string;
}

// Sinonim jenis properti → value resmi PROPERTY_TYPES.
const JENIS_SYNONYMS: Record<string, string> = {
  apartemen: 'apartment', apartment: 'apartment', apart: 'apartment',
  rumah: 'rumah', kontrakan: 'rumah', hunian: 'rumah',
  tanah: 'tanah', kavling: 'tanah', kaveling: 'tanah', kapling: 'tanah',
  kost: 'kost', kos: 'kost', 'kos-kosan': 'kost', kosan: 'kost', indekos: 'kost',
  hotel: 'hotel',
  homestay: 'homestay', guesthouse: 'homestay', 'guest house': 'homestay', penginapan: 'homestay',
  villa: 'villa', vila: 'villa',
  ruko: 'ruko', rukan: 'ruko',
  gudang: 'gudang', warehouse: 'gudang',
  komersial: 'komersial', gedung: 'komersial', kantor: 'komersial', office: 'komersial',
};

function rupiahLabel(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')} M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(0)} Jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function unitToMultiplier(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('m') || u.includes('miliar') || u.includes('milyar')) return 1_000_000_000;
  if (u.startsWith('j')) return 1_000_000;     // jt / juta
  if (u.startsWith('r')) return 1_000;         // rb / ribu
  return 1;
}

function toNumber(raw: string): number {
  // "1.5" / "1,5" → 1.5
  return parseFloat(raw.replace(',', '.')) || 0;
}

const UNIT = '(m|miliar|milyar|jt|juta|rb|ribu)';
const NUM = '(\\d+(?:[.,]\\d+)?)';

export function parseSmartQuery(query: string, locations: LocationIndex): SmartParseResult {
  const filters: SmartFilters = {};
  const chips: SmartChip[] = [];
  // Normalisasi: lowercase + rapikan spasi. Pakai working string `s` yang dipangkas tiap match.
  let s = ` ${(query || '').toLowerCase().replace(/\s+/g, ' ').trim()} `;

  const strip = (re: RegExp) => { s = s.replace(re, ' ').replace(/\s+/g, ' '); };

  // ── (a) HARGA — dicek DULU (butuh suffix unit, jadi "3 kamar" tak tertangkap) ──
  // range: X - Y <unit>
  let m = s.match(new RegExp(`${NUM}\\s*(?:-|–|s(?:ampai|\\/d)|hingga|ke)\\s*${NUM}\\s*${UNIT}`, 'i'));
  if (m) {
    const mult = unitToMultiplier(m[3]);
    const min = Math.round(toNumber(m[1]) * mult);
    const max = Math.round(toNumber(m[2]) * mult);
    filters.hargaMin = Math.min(min, max);
    filters.hargaMax = Math.max(min, max);
    chips.push({ key: 'harga', label: `Harga: ${rupiahLabel(filters.hargaMin)} – ${rupiahLabel(filters.hargaMax)}` });
    strip(new RegExp(`${NUM}\\s*(?:-|–|s(?:ampai|\\/d)|hingga|ke)\\s*${NUM}\\s*${UNIT}`, 'i'));
  } else {
    // di bawah / max
    m = s.match(new RegExp(`(?:di ?bawah|dibawah|maks?(?:imal)?|max|kurang dari|<)\\s*${NUM}\\s*${UNIT}`, 'i'));
    if (m) {
      filters.hargaMax = Math.round(toNumber(m[1]) * unitToMultiplier(m[2]));
      chips.push({ key: 'harga', label: `Harga: ≤ ${rupiahLabel(filters.hargaMax)}` });
      strip(new RegExp(`(?:di ?bawah|dibawah|maks?(?:imal)?|max|kurang dari|<)\\s*${NUM}\\s*${UNIT}`, 'i'));
    } else {
      // di atas / min
      m = s.match(new RegExp(`(?:di ?atas|diatas|min(?:imal)?|lebih dari|>)\\s*${NUM}\\s*${UNIT}`, 'i'));
      if (m) {
        filters.hargaMin = Math.round(toNumber(m[1]) * unitToMultiplier(m[2]));
        chips.push({ key: 'harga', label: `Harga: ≥ ${rupiahLabel(filters.hargaMin)}` });
        strip(new RegExp(`(?:di ?atas|diatas|min(?:imal)?|lebih dari|>)\\s*${NUM}\\s*${UNIT}`, 'i'));
      } else {
        // angka tunggal + unit → diperlakukan sebagai budget maksimal
        m = s.match(new RegExp(`${NUM}\\s*${UNIT}\\b`, 'i'));
        if (m) {
          filters.hargaMax = Math.round(toNumber(m[1]) * unitToMultiplier(m[2]));
          chips.push({ key: 'harga', label: `Harga: ≤ ${rupiahLabel(filters.hargaMax)}` });
          strip(new RegExp(`${NUM}\\s*${UNIT}\\b`, 'i'));
        }
      }
    }
  }

  // ── (b) SPESIFIKASI — kamar mandi DULU agar "kamar mandi" tak tertangkap "kamar" (=KT) ──
  // Kamar mandi: "N kamar mandi" / "kamar mandi N" / "N km"
  m = s.match(/(\d+)\s*kamar mandi|kamar mandi\s*(\d+)|(\d+)\s*km\b/);
  if (m) {
    filters.km = parseInt(m[1] || m[2] || m[3], 10);
    chips.push({ key: 'km', label: `Kamar Mandi: ${filters.km}+` });
    strip(/(\d+)\s*kamar mandi|kamar mandi\s*(\d+)|(\d+)\s*km\b/);
  }
  // Kamar tidur: "N kamar" / "N kt" / "kt N" / "N kamar tidur"
  m = s.match(/(\d+)\s*kamar(?: tidur)?|(\d+)\s*kt\b|kt\s*(\d+)/);
  if (m) {
    filters.kt = parseInt(m[1] || m[2] || m[3], 10);
    chips.push({ key: 'kt', label: `Kamar Tidur: ${filters.kt}+` });
    strip(/(\d+)\s*kamar(?: tidur)?|(\d+)\s*kt\b|kt\s*(\d+)/);
  }
  // Lantai: "N lantai"
  m = s.match(/(\d+)\s*lantai/);
  if (m) {
    filters.lantai = parseInt(m[1], 10);
    chips.push({ key: 'lantai', label: `Lantai: ${filters.lantai}+` });
    strip(/(\d+)\s*lantai/);
  }
  // Luas tanah: "lt N" / "tanah N (m)"
  m = s.match(/\blt\s*(\d+)|tanah\s*(\d+)\s*m?\b/);
  if (m) {
    filters.luasTanah = parseInt(m[1] || m[2], 10);
    chips.push({ key: 'lt', label: `LT: ${filters.luasTanah}m²+` });
    strip(/\blt\s*(\d+)|tanah\s*(\d+)\s*m?\b/);
  }
  // Luas bangunan: "lb N" / "bangunan N (m)"
  m = s.match(/\blb\s*(\d+)|bangunan\s*(\d+)\s*m?\b/);
  if (m) {
    filters.luasBangunan = parseInt(m[1] || m[2], 10);
    chips.push({ key: 'lb', label: `LB: ${filters.luasBangunan}m²+` });
    strip(/\blb\s*(\d+)|bangunan\s*(\d+)\s*m?\b/);
  }

  // ── (c) JENIS PROPERTI ──
  for (const [syn, value] of Object.entries(JENIS_SYNONYMS)) {
    const re = new RegExp(`(^|\\s)${syn.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
    if (re.test(s)) {
      filters.jenis = value;
      const label = PROPERTY_TYPES.find(t => t.value === value)?.label ?? value;
      chips.push({ key: 'jenis', label: `Jenis: ${label}` });
      s = s.replace(re, ' ').replace(/\s+/g, ' ');
      break;
    }
  }

  // ── (e) TUJUAN ──
  if (/\b(dijual|jual)\b/.test(s)) {
    filters.tujuan = 'dijual';
    chips.push({ key: 'tujuan', label: 'Dijual' });
    strip(/\b(dijual|jual)\b/g);
  } else if (/\b(disewa|sewa|rental|kontrak)\b/.test(s)) {
    filters.tujuan = 'disewa';
    chips.push({ key: 'tujuan', label: 'Disewa' });
    strip(/\b(disewa|sewa|rental|kontrak)\b/g);
  }

  // ── (d) LOKASI — kecamatan (paling spesifik) → kabupaten → provinsi ──
  const matchLoc = (list: FlatLoc[]): FlatLoc | null => {
    // cocokkan nama lokasi sebagai whole-word substring di sisa query. Pilih nama terpanjang.
    let best: FlatLoc | null = null;
    for (const loc of list) {
      const nm = loc.nama.toLowerCase();
      if (!nm) continue;
      const re = new RegExp(`(^|\\s)${nm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
      if (re.test(s) && (!best || nm.length > best.nama.length)) best = loc;
    }
    return best;
  };

  let locHit = matchLoc(locations.kecamatans);
  let locLevel: 'kecamatan' | 'kabupaten' | 'provinsi' | null = locHit ? 'kecamatan' : null;
  if (!locHit) { locHit = matchLoc(locations.kabupatens); if (locHit) locLevel = 'kabupaten'; }
  if (!locHit) { locHit = matchLoc(locations.provinces);  if (locHit) locLevel = 'provinsi'; }

  if (locHit && locLevel) {
    if (locLevel === 'kecamatan') {
      const kab = locHit.parent_id != null ? locations.byId[locHit.parent_id] : null;
      const prov = kab?.parent_id != null ? locations.byId[kab.parent_id] : null;
      filters.kecamatan = locHit.nama;
      if (kab) { filters.kabupaten = kab.nama; filters.kabupatenId = kab.id; }
      if (prov) filters.provId = prov.id;
    } else if (locLevel === 'kabupaten') {
      const prov = locHit.parent_id != null ? locations.byId[locHit.parent_id] : null;
      filters.kabupaten = locHit.nama;
      filters.kabupatenId = locHit.id;
      if (prov) filters.provId = prov.id;
    } else {
      filters.provId = locHit.id;
    }
    chips.push({ key: 'lokasi', label: `Lokasi: ${locHit.nama}` });
    const reLoc = new RegExp(`(^|\\s)${locHit.nama.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
    s = s.replace(reLoc, ' ').replace(/\s+/g, ' ');
  }

  // ── (f) REMAINDER — sisa kata, buang konektor sepele ──
  const STOP = new Set(['di', 'yg', 'yang', 'area', 'daerah', 'kawasan']);
  const remainder = s
    .split(' ')
    .map(w => w.trim())
    .filter(w => w.length > 0 && !STOP.has(w))
    .join(' ')
    .trim();

  return { filters, chips, remainder };
}
