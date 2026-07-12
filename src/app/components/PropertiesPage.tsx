import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { SlidersHorizontal, Grid3X3, List, Map, X, ChevronDown, RotateCcw, MapPin, AlertCircle, RefreshCw, Search, Building2 } from 'lucide-react';

const LazyPropertyMap = lazy(() => import('./PropertyMap'));
import {
  getProperties, getLocations, getAllLocations, normalizeProperty,
  type NormalizedProperty, type ApiLocation, type PropertiesParams,
  formatRupiah,
} from '../../lib/api';
import { PROPERTY_TYPES, getPropertyTypeLabel } from '../../lib/propertyTypes';
import { cfImg } from '../../lib/img';
import { parseSmartQuery, type LocationIndex, type FlatLoc, type SmartFilters } from './smartSearchParser';
import { trackEvent } from '../../lib/tracking';
import PropertyCard from './PropertyCard';
import { Skeleton } from './ui/skeleton';

const JENIS_OPTIONS = PROPERTY_TYPES.map(t => ({ value: t.value, label: `${t.emoji} ${t.label}` }));

const HARGA_RANGES = [
  { label: 'Semua Harga',  min: 0,              max: 0 },
  { label: '< 500 Jt',     min: 0,              max: 500_000_000 },
  { label: '500 Jt – 1 M', min: 500_000_000,    max: 1_000_000_000 },
  { label: '1 M – 2 M',    min: 1_000_000_000,  max: 2_000_000_000 },
  { label: '2 M – 3 M',    min: 2_000_000_000,  max: 3_000_000_000 },
  { label: '3 M – 5 M',    min: 3_000_000_000,  max: 5_000_000_000 },
  { label: '5 M – 10 M',   min: 5_000_000_000,  max: 10_000_000_000 },
  { label: '> 10 M',        min: 10_000_000_000, max: 0 },
];

const SORT_OPTIONS = [
  { value: 'terbaru',  label: 'Terbaru (Unggulan)' },
  { value: 'termurah', label: 'Termurah' },
  { value: 'termahal', label: 'Termahal' },
  { value: 'luas',     label: 'Terluas' },
  { value: 'yield',    label: 'Yield Tertinggi' },
];

const PER_PAGE = 9;

function SkeletonCards({ count = PER_PAGE }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <Skeleton className="w-full" style={{ paddingTop: '66.67%', display: 'block' }} />
          <div className="p-4 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonListItems({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 flex overflow-hidden">
          <Skeleton className="w-48 sm:w-64 flex-shrink-0" style={{ minHeight: 160 }} />
          <div className="p-4 flex-1 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Data SSR dari route module (routes/properties.tsx) — konten listing sudah
 *  dirender server-side untuk SEO/GEO. filters harus identik dengan yang akan
 *  dipakai fetch client agar hasil konsisten. */
export interface SsrListingData {
  properties: NormalizedProperty[];
  total: number;
  filters: { tujuan: string; jenis: string; provinsi: string; kabupaten: string; kecamatan: string };
}

interface PropertiesPageProps {
  ssrData?: SsrListingData;
  /** H1 kustom untuk halaman programmatic SEO (mis. "Rumah Dijual di Sleman") */
  heading?: string | null;
}

export default function PropertiesPage({ ssrData, heading }: PropertiesPageProps = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // ── Filter state ──────────────────────────────────────────────────────────
  // Untuk halaman programmatic SEO (/rumah-dijual-jogja), filter awal datang dari
  // ssrData.filters (hasil parse slug oleh loader) — bukan dari query params.
  const [tujuan, setTujuan] = useState(ssrData?.filters.tujuan || searchParams.get('tujuan') || 'semua');
  const [selectedJenis, setSelectedJenis] = useState<string[]>(() => {
    if (ssrData?.filters.jenis) return ssrData.filters.jenis.split(',');
    return searchParams.get('jenis') ? [searchParams.get('jenis')!] : [];
  });
  // Harga sebagai SATU sumber kebenaran (min/max). Dropdown range menulis ke sini juga.
  const [hargaMin, setHargaMin] = useState(0);
  const [hargaMax, setHargaMax] = useState(0);
  const [kabupaten, setKabupaten] = useState(ssrData?.filters.kabupaten || searchParams.get('kabupaten') || '');
  const [kabupatenId, setKabupatenId] = useState<number | null>(null);
  const [kecamatan, setKecamatan] = useState(ssrData?.filters.kecamatan || searchParams.get('kecamatan') || '');
  // Spek (dari smart search; minimum). 0 = tidak aktif.
  const [kt, setKt] = useState(0);
  const [km, setKm] = useState(0);
  const [lantai, setLantai] = useState(0);
  const [ltMin, setLtMin] = useState(0);
  const [lbMin, setLbMin] = useState(0);
  // Keyword teks bebas (remainder) → param q.
  const [qKeyword, setQKeyword] = useState('');
  const [sort, setSort] = useState('terbaru');
  const [limit, setLimit] = useState(20);

  // ── Smart search bar state ──────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [allLocs, setAllLocs] = useState<LocationIndex | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [propSuggest, setPropSuggest] = useState<NormalizedProperty[]>([]);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const propSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard untuk Search tracking: simpan key filter terakhir yang sudah di-fire
  const lastSearchKeyRef = useRef<string | null>(null);

  // ── Location cascade state ────────────────────────────────────────────────
  const [provList, setProvList] = useState<ApiLocation[]>([]);
  const [provId, setProvId] = useState<number | null>(null);
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [locLoading, setLocLoading] = useState(true);

  // ── Properties data state ─────────────────────────────────────────────────
  // Dengan ssrData: state awal terisi dari server → konten ada di HTML awal
  // (SEO/GEO) dan fetch pertama di-skip (data sudah identik, hindari flash skeleton).
  const [properties, setProperties] = useState<NormalizedProperty[]>(ssrData?.properties ?? []);
  const [totalCount, setTotalCount] = useState(ssrData?.total ?? 0);
  const [loading, setLoading] = useState(!ssrData);
  const [error, setError] = useState<string | null>(null);
  const skipFirstFetchRef = useRef(Boolean(ssrData));

  // ── Load provinces on mount ───────────────────────────────────────────────
  useEffect(() => {
    setLocLoading(true);
    getLocations().then(res => {
      if (res.success && res.data) setProvList(res.data.items);
    }).catch(() => {}).finally(() => setLocLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load SEMUA lokasi (flat) untuk index smart-search parser + typeahead ──
  useEffect(() => {
    getAllLocations().then(res => {
      if (!res.success || !res.data) return;
      const items = res.data.items as FlatLoc[];
      const byId: Record<number, FlatLoc> = {};
      items.forEach(l => { byId[l.id] = l; });
      const provinces = items.filter(l => l.parent_id == null);
      const kabupatens = items.filter(l => l.parent_id != null && byId[l.parent_id]?.parent_id == null);
      const kecamatans = items.filter(l => {
        const p = l.parent_id != null ? byId[l.parent_id] : null;
        return !!p && p.parent_id != null && byId[p.parent_id]?.parent_id == null;
      });
      setAllLocs({ provinces, kabupatens, kecamatans, byId });
    }).catch(() => {});
  }, []);

  // ── Hidrasi provId dari URL ?provinsi= (mis. dari hero filter homepage) ─────
  // Tanpa ini, provId tetap null saat datang dari URL → cascade di bawah me-reset
  // kabupaten/kecamatan yang sudah diisi dari URL → filter lokasi hilang.
  useEffect(() => {
    if (provId || provList.length === 0) return;
    const urlProv = searchParams.get('provinsi');
    if (!urlProv) return;
    const found = provList.find(p => p.nama.toLowerCase() === urlProv.toLowerCase());
    if (found) setProvId(found.id);
  }, [provList]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load kabupaten saat provinsi dipilih ──────────────────────────────────
  // Catatan: effect ini HANYA mengisi/mengosongkan daftar dropdown (kabList/kecList),
  // TIDAK me-reset nilai filter kabupaten/kecamatan. Reset nilai sudah ditangani oleh
  // handler aksi user (handleProvChange, resetFilters, clear-chip). Mereset di sini akan
  // menghapus filter lokasi yang datang dari URL (hero filter homepage).
  useEffect(() => {
    if (!provId) { setKabList([]); setKecList([]); return; }
    getLocations(provId).then(res => {
      if (res.success && res.data) {
        const list = res.data.items;
        setKabList(list);
        const urlKab = searchParams.get('kabupaten');
        if (urlKab) {
          const found = list.find(k => k.nama.toLowerCase() === urlKab.toLowerCase());
          if (found) setKabupatenId(found.id);
        }
      }
    });
  }, [provId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch kecamatan saat kabupaten berubah ────────────────────────────────
  useEffect(() => {
    if (!kabupatenId) { setKecList([]); return; }
    getLocations(kabupatenId).then(res => {
      if (res.success && res.data) setKecList(res.data.items);
    });
  }, [kabupatenId]);

  // ── Fetch properties saat filter/page/sort berubah ───────────────────────
  const fetchProperties = useCallback(() => {
    setLoading(true);
    setError(null);

    const params: PropertiesParams = {
      sort: sort as PropertiesParams['sort'],
      limit,
    };
    if (tujuan !== 'semua') params.tujuan = tujuan;
    if (selectedJenis.length > 0) params.jenis = selectedJenis.join(',');
    if (kabupaten) params.kabupaten = kabupaten;
    if (kecamatan) params.kecamatan = kecamatan;
    if (hargaMin > 0) params.harga_min = hargaMin;
    if (hargaMax > 0) params.harga_max = hargaMax;
    if (kt > 0) params.kt = kt;
    if (km > 0) params.km = km;
    if (lantai > 0) params.lantai = lantai;
    if (ltMin > 0) params.lt = ltMin;
    if (lbMin > 0) params.lb = lbMin;
    if (qKeyword.trim()) params.q = qKeyword.trim();

    getProperties(params)
      .then(res => {
        if (res.success && res.data) {
          setProperties(res.data.items.map(normalizeProperty));
          setTotalCount(res.data.pagination.total);
        } else {
          setError(res.error ?? 'Gagal memuat data properti');
        }
      })
      .catch(() => setError('Koneksi ke server gagal'))
      .finally(() => setLoading(false));
  }, [tujuan, selectedJenis, hargaMin, hargaMax, kabupaten, kecamatan, kt, km, lantai, ltMin, lbMin, qKeyword, sort, limit]);

  useEffect(() => {
    // Fetch pertama di-skip bila data SSR tersedia (hasil query loader identik
    // dengan fetch ini). Perubahan filter berikutnya tetap memicu fetch normal.
    if (skipFirstFetchRef.current) { skipFirstFetchRef.current = false; return; }
    fetchProperties();
  }, [fetchProperties]);

  // Search tracking — fire saat filter/query berubah dan ada setidaknya 1 filter aktif
  useEffect(() => {
    // Bangun key unik dari semua filter yang relevan (bukan sort/limit)
    const keyParts: string[] = [];
    if (qKeyword.trim()) keyParts.push(`q:${qKeyword.trim()}`);
    if (tujuan !== 'semua') keyParts.push(`t:${tujuan}`);
    if (selectedJenis.length) keyParts.push(`j:${selectedJenis.join(',')}`);
    if (kabupaten) keyParts.push(`kab:${kabupaten}`);
    if (kecamatan) keyParts.push(`kec:${kecamatan}`);
    if (hargaMin > 0) keyParts.push(`mn:${hargaMin}`);
    if (hargaMax > 0) keyParts.push(`mx:${hargaMax}`);
    if (kt > 0) keyParts.push(`kt:${kt}`);
    if (km > 0) keyParts.push(`km:${km}`);
    if (lantai > 0) keyParts.push(`lt:${lantai}`);
    if (ltMin > 0) keyParts.push(`ltm:${ltMin}`);
    if (lbMin > 0) keyParts.push(`lbm:${lbMin}`);

    if (keyParts.length === 0) return; // state default — bukan search nyata
    const key = keyParts.join('|');
    if (key === lastSearchKeyRef.current) return; // identik — skip
    lastSearchKeyRef.current = key;

    // Bangun search_string yang mudah dibaca manusia
    const humanParts: string[] = [];
    if (qKeyword.trim()) humanParts.push(qKeyword.trim());
    if (selectedJenis.length) humanParts.push(selectedJenis.join('/'));
    if (kecamatan) humanParts.push(kecamatan);
    else if (kabupaten) humanParts.push(kabupaten);
    if (hargaMin > 0 && hargaMax > 0)
      humanParts.push(`${formatRupiah(hargaMin)}-${formatRupiah(hargaMax)}`);
    else if (hargaMax > 0) humanParts.push(`<${formatRupiah(hargaMax)}`);
    else if (hargaMin > 0) humanParts.push(`>${formatRupiah(hargaMin)}`);
    if (tujuan !== 'semua') humanParts.push(tujuan);

    trackEvent('Search', {
      search_string: humanParts.join(' ') || key,
      content_category: 'real_estate',
    });
  }, [tujuan, selectedJenis, hargaMin, hargaMax, kabupaten, kecamatan, kt, km, lantai, ltMin, lbMin, qKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter handlers ───────────────────────────────────────────────────────
  const toggleJenis = (v: string) => {
    setSelectedJenis(prev => prev.includes(v) ? prev.filter(j => j !== v) : [...prev, v]);
    setLimit(20);
  };

  const handleProvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    setProvId(id); setKabupaten(''); setKabupatenId(null); setKecamatan(''); setLimit(20);
  };

  const handleKabChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nama = e.target.value;
    const found = kabList.find(k => k.nama === nama);
    setKabupaten(nama);
    setKabupatenId(found?.id ?? null);
    setKecamatan('');
    setLimit(20);
  };

  const resetFilters = () => {
    setTujuan('semua');
    setSelectedJenis([]);
    setHargaMin(0); setHargaMax(0);
    setProvId(null);
    setKabupaten('');
    setKabupatenId(null);
    setKecamatan('');
    setKt(0); setKm(0); setLantai(0); setLtMin(0); setLbMin(0);
    setQKeyword(''); setQuery('');
    setSort('terbaru');
    setLimit(20);
  };

  // ── Smart search: apply hasil parser ke STATE FILTER EXISTING (reuse) ──────
  const applySmartFilters = (f: SmartFilters) => {
    if (f.tujuan) setTujuan(f.tujuan);
    if (f.jenis) setSelectedJenis([f.jenis]);
    if (f.hargaMin != null) setHargaMin(f.hargaMin);
    if (f.hargaMax != null) setHargaMax(f.hargaMax);
    if (f.kt != null) setKt(f.kt);
    if (f.km != null) setKm(f.km);
    if (f.lantai != null) setLantai(f.lantai);
    if (f.luasTanah != null) setLtMin(f.luasTanah);
    if (f.luasBangunan != null) setLbMin(f.luasBangunan);
    if (f.provId !== undefined) setProvId(f.provId ?? null);
    if (f.kabupaten != null) setKabupaten(f.kabupaten);
    if (f.kabupatenId !== undefined) setKabupatenId(f.kabupatenId ?? null);
    if (f.kecamatan != null) setKecamatan(f.kecamatan);
    setLimit(20);
  };

  const runSmartSearch = (raw: string) => {
    const text = raw.trim();
    setShowSuggest(false);
    if (!text || !allLocs) {
      setQKeyword(text);
      return;
    }
    const { filters, remainder } = parseSmartQuery(text, allLocs);
    applySmartFilters(filters);
    setQKeyword(remainder);
    setQuery(remainder); // sisa kata tak terdeteksi tetap jadi keyword di input
  };

  // Typeahead suggestions (lokasi + jenis) dari data yang sudah di-load.
  const suggest = useMemo(() => {
    const ql = query.trim().toLowerCase();
    if (ql.length < 2) return { locs: [] as FlatLoc[], jenis: [] as { value: string; label: string }[] };
    const locs = allLocs
      ? [...allLocs.kecamatans, ...allLocs.kabupatens]
          .filter(l => l.nama.toLowerCase().includes(ql))
          .slice(0, 3)
      : [];
    const jenis = JENIS_OPTIONS
      .filter(j => j.label.toLowerCase().includes(ql) || j.value.toLowerCase().includes(ql))
      .slice(0, 3);
    return { locs, jenis };
  }, [query, allLocs]);

  // Debounced fetch saran "Properti" (judul/kode) saat mengetik (min 2 char).
  useEffect(() => {
    if (propSuggestTimer.current) clearTimeout(propSuggestTimer.current);
    const ql = query.trim();
    if (ql.length < 2) { setPropSuggest([]); return; }
    propSuggestTimer.current = setTimeout(() => {
      getProperties({ q: ql, limit: 3 }).then(res => {
        if (res.success && res.data) setPropSuggest(res.data.items.map(normalizeProperty));
      }).catch(() => {});
    }, 300);
    return () => { if (propSuggestTimer.current) clearTimeout(propSuggestTimer.current); };
  }, [query]);

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const detailPathOf = (p: NormalizedProperty) => {
    const seg = (v: string) => (v || '').toLowerCase().replace(/\s+/g, '-');
    const dir = p.tujuan === 'disewa' ? 'disewa' : 'dijual';
    return `/${dir}/${seg(p.jenisRaw ?? p.jenis)}/${seg(p.provinsi)}/${seg(p.kabupaten)}/${seg(p.kecamatan)}/${p.slug}`;
  };

  // Apply 1 saran lokasi (typeahead) → set cascade kabupaten/kecamatan.
  const applyLocationSuggestion = (loc: FlatLoc) => {
    if (!allLocs) return;
    const parent = loc.parent_id != null ? allLocs.byId[loc.parent_id] : null;
    const isKecamatan = !!parent && parent.parent_id != null; // parent = kabupaten
    if (isKecamatan && parent) {
      const prov = parent.parent_id != null ? allLocs.byId[parent.parent_id] : null;
      setProvId(prov?.id ?? null);
      setKabupaten(parent.nama); setKabupatenId(parent.id);
      setKecamatan(loc.nama);
    } else {
      // loc = kabupaten
      const prov = loc.parent_id != null ? allLocs.byId[loc.parent_id] : null;
      setProvId(prov?.id ?? null);
      setKabupaten(loc.nama); setKabupatenId(loc.id);
      setKecamatan('');
    }
    setLimit(20); setShowSuggest(false); setQuery('');
  };

  // ── Chips aktif (derive dari state — SATU sumber, removable individual) ────
  const hargaChipLabel = () => {
    if (hargaMin > 0 && hargaMax > 0) return `Harga: ${formatRupiah(hargaMin)} – ${formatRupiah(hargaMax)}`;
    if (hargaMax > 0) return `Harga: ≤ ${formatRupiah(hargaMax)}`;
    if (hargaMin > 0) return `Harga: ≥ ${formatRupiah(hargaMin)}`;
    return '';
  };

  const activeChips = [
    tujuan !== 'semua' ? { label: tujuan === 'dijual' ? 'Dijual' : 'Disewa', clear: () => { setTujuan('semua'); setLimit(20); } } : null,
    ...selectedJenis.map(j => ({ label: `Jenis: ${getPropertyTypeLabel(j)}`, clear: () => toggleJenis(j) })),
    (hargaMin > 0 || hargaMax > 0) ? { label: hargaChipLabel(), clear: () => { setHargaMin(0); setHargaMax(0); setLimit(20); } } : null,
    kabupaten ? { label: `Lokasi: ${kabupaten}`, clear: () => { setKabupaten(''); setKabupatenId(null); setKecamatan(''); setLimit(20); } } : null,
    kecamatan ? { label: `Kec: ${kecamatan}`, clear: () => { setKecamatan(''); setLimit(20); } } : null,
    kt > 0 ? { label: `Kamar Tidur: ${kt}+`, clear: () => { setKt(0); setLimit(20); } } : null,
    km > 0 ? { label: `Kamar Mandi: ${km}+`, clear: () => { setKm(0); setLimit(20); } } : null,
    lantai > 0 ? { label: `Lantai: ${lantai}+`, clear: () => { setLantai(0); setLimit(20); } } : null,
    ltMin > 0 ? { label: `LT: ${ltMin}m²+`, clear: () => { setLtMin(0); setLimit(20); } } : null,
    lbMin > 0 ? { label: `LB: ${lbMin}m²+`, clear: () => { setLbMin(0); setLimit(20); } } : null,
    qKeyword.trim() ? { label: `Kata kunci: "${qKeyword.trim()}"`, clear: () => { setQKeyword(''); setQuery(''); setLimit(20); } } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const selectClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] appearance-none bg-white";

  const SidebarContent = () => (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display font-bold text-[#0F172A]">Filter</h3>
        <button onClick={resetFilters} className="text-xs text-[#EF4444] hover:underline flex items-center gap-1">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      {/* Tujuan */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">Tujuan</label>
        <div className="flex gap-2">
          {[['semua', 'Semua'], ['dijual', 'Dijual'], ['disewa', 'Disewa']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => { setTujuan(v); setLimit(20); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                tujuan === v ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Jenis Properti */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">Jenis Properti</label>
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {JENIS_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedJenis.includes(value)}
                onChange={() => toggleJenis(value)}
                className="w-4 h-4 rounded accent-[#1565C0] cursor-pointer"
              />
              <span className={`text-sm transition-colors ${selectedJenis.includes(value) ? 'text-[#1565C0] font-semibold' : 'text-gray-700 group-hover:text-[#1565C0]'}`}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Rentang Harga */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">Rentang Harga</label>
        <div className="relative">
          <select
            value={(() => { const i = HARGA_RANGES.findIndex(r => r.min === hargaMin && r.max === hargaMax); return i >= 0 ? i : 0; })()}
            onChange={e => { const r = HARGA_RANGES[Number(e.target.value)]; setHargaMin(r.min); setHargaMax(r.max); setLimit(20); }}
            className={selectClass} aria-label="Rentang harga">
            {HARGA_RANGES.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Lokasi — cascade via GET /api/locations */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">Lokasi</label>
        <div className="space-y-2">
          <div className="relative">
            <select value={provId ?? ''} onChange={handleProvChange} className={selectClass} disabled={locLoading} aria-label="Provinsi">
              <option value="">{locLoading ? 'Memuat…' : 'Semua Provinsi'}</option>
              {provList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={kabupaten}
              onChange={handleKabChange}
              className={selectClass}
              disabled={!provId}
              aria-label="Kabupaten atau kota"
            >
              <option value="">Semua Kab./Kota</option>
              {kabList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {kabupaten && kecList.length > 0 && (
            <div className="relative">
              <select
                value={kecamatan}
                onChange={e => { setKecamatan(e.target.value); setLimit(20); }}
                className={selectClass}
                aria-label="Kecamatan"
              >
                <option value="">Semua Kecamatan</option>
                {kecList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Advanced Filter (UI saja — belum disambungkan ke API) */}
      <button
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-1 text-xs text-[#1565C0] font-semibold hover:underline mb-3"
      >
        Filter Lanjutan {advancedOpen ? '▲' : '▼'}
      </button>
      {advancedOpen && (
        <div className="space-y-3 mb-4 pt-3 border-t border-gray-100">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Legalitas</label>
            {['SHM & IMB/PBG Lengkap', 'SHGB', 'SHM Pekarangan'].map(l => (
              <label key={l} className="flex items-center gap-2 mb-1 cursor-pointer">
                <input type="checkbox" className="w-3 h-3 accent-[#1565C0]" />
                <span className="text-xs text-gray-600">{l}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Furnished</label>
            {['Fully Furnished', 'Semi Furnished', 'Unfurnished'].map(f => (
              <label key={f} className="flex items-center gap-2 mb-1 cursor-pointer">
                <input type="checkbox" className="w-3 h-3 accent-[#1565C0]" />
                <span className="text-xs text-gray-600">{f}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="pt-16 min-h-screen" style={{ background: '#F0F4F8' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">{heading || 'Cari Properti'}</h1>
          <p className="text-[#64748B] text-sm mt-1">
            {heading
              ? `${heading} — dikurasi & diverifikasi langsung oleh tim SBP`
              : 'Semua listing properti di DI Yogyakarta — dikurasi & diverifikasi SBP'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">

          {/* Sidebar Desktop */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm sticky top-20">
              <SidebarContent />
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">

            {/* ─── Smart Search Bar ─── */}
            <div ref={searchBoxRef} className="relative sticky top-16 z-20 bg-[#F0F4F8] pt-2 mb-4">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); runSmartSearch(query); }
                    else if (e.key === 'Escape') setShowSuggest(false);
                  }}
                  placeholder="Coba: rumah sleman 3 kamar 1-2M..."
                  className="w-full pl-11 pr-28 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] focus:border-transparent"
                />
                <button
                  onClick={() => runSmartSearch(query)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                >
                  Cari
                </button>
              </div>

              {/* Typeahead dropdown */}
              {showSuggest && query.trim().length >= 2 && (suggest.locs.length > 0 || suggest.jenis.length > 0 || propSuggest.length > 0) && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden">
                  {suggest.locs.length > 0 && (
                    <div className="py-1.5">
                      <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Lokasi</div>
                      {suggest.locs.map(loc => (
                        <button key={`loc-${loc.id}`} onMouseDown={e => { e.preventDefault(); applyLocationSuggestion(loc); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-[#F0F7FF]">
                          <MapPin size={14} className="text-[#1565C0]" /> {loc.nama}
                          <span className="text-xs text-gray-400 ml-auto">{loc.tipe}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {suggest.jenis.length > 0 && (
                    <div className="py-1.5 border-t border-gray-50">
                      <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Jenis Properti</div>
                      {suggest.jenis.map(j => (
                        <button key={`jen-${j.value}`} onMouseDown={e => { e.preventDefault(); setSelectedJenis([j.value]); setLimit(20); setShowSuggest(false); setQuery(''); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-[#F0F7FF]">
                          <Building2 size={14} className="text-[#1565C0]" /> {j.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {propSuggest.length > 0 && (
                    <div className="py-1.5 border-t border-gray-50">
                      <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Properti</div>
                      {propSuggest.map(p => (
                        <button key={`prop-${p.id}`} onMouseDown={e => { e.preventDefault(); setShowSuggest(false); navigate(detailPathOf(p)); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-[#F0F7FF]">
                          <span className="text-[10px] font-mono text-gray-400">{p.kode}</span>
                          <span className="truncate">{p.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chips hasil deteksi smart search + filter aktif (removable) */}
            {activeChips.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4">
                {activeChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={chip.clear}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E3F2FD] text-[#1565C0] rounded-full text-xs font-medium hover:bg-[#1565C0] hover:text-white transition-colors"
                  >
                    {chip.label} <X size={12} />
                  </button>
                ))}
              </div>
            )}

            {/* Topbar */}
            <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:border-[#1565C0] transition-colors"
                >
                  <SlidersHorizontal size={16} /> Filter
                </button>
                <div className="text-sm text-[#64748B]">
                  {loading ? (
                    <Skeleton className="h-4 w-44 inline-block rounded" />
                  ) : (
                    <>Menampilkan <span className="font-bold text-[#0F172A]">{properties.length}</span> dari <span className="font-bold text-[#0F172A]">{totalCount}</span> properti</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={sort}
                    onChange={e => { setSort(e.target.value); setLimit(20); }}
                    aria-label="Urutkan properti"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-[#1565C0]"
                  >
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-[#1565C0] text-white' : 'text-gray-400'}`}>
                    <Grid3X3 size={16} />
                  </button>
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg ${viewMode === 'list' ? 'bg-[#1565C0] text-white' : 'text-gray-400'}`}>
                    <List size={16} />
                  </button>
                  <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-lg ${viewMode === 'map' ? 'bg-[#1565C0] text-white' : 'text-gray-400'}`} title="Tampilan Peta">
                    <Map size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* ─── Tampilan Peta ─── */}
            {viewMode === 'map' && isMounted && (
              <Suspense fallback={<div className="h-[560px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">Memuat peta…</p></div>}>
                <LazyPropertyMap filters={{ tujuan, jenis: selectedJenis, kabupaten }} />
              </Suspense>
            )}

            {/* Konten utama: Loading / Error / Empty / Grid / List */}
            {viewMode !== 'map' && (loading && properties.length === 0 ? (
              viewMode === 'grid' ? <SkeletonCards /> : <SkeletonListItems />
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle size={40} className="text-[#EF4444] mb-3" />
                <p className="text-[#64748B] mb-4">{error}</p>
                <button
                  onClick={fetchProperties}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                >
                  <RefreshCw size={14} /> Coba Lagi
                </button>
              </div>
            ) : properties.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="font-display font-bold text-xl text-[#0F172A] mb-2">Tidak ada properti ditemukan</h3>
                <p className="text-[#64748B] mb-6">Coba ubah filter pencarian Anda</p>
                <button
                  onClick={resetFilters}
                  className="px-6 py-2.5 rounded-xl text-white font-semibold"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                >
                  Reset Filter
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {properties.map(p => <PropertyCard key={p.id} property={p as any} />)}
              </div>
            ) : (
              <div className="space-y-4">
                {properties.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex">
                    <div className="relative w-48 sm:w-64 flex-shrink-0">
                      <img
                        src={cfImg(p.images[0] ?? '', 400)}
                        alt={p.title}
                        className="w-full h-full object-cover"
                        style={{ minHeight: 160 }}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=400&q=80'; }}
                        suppressHydrationWarning
                      />
                    </div>
                    <div className="p-4 flex-1">
                      <p className="text-[10px] text-gray-400 font-mono mb-1">{p.kode}</p>
                      <h3 className="font-display font-bold text-[#0F172A] mb-1 line-clamp-2">{p.title}</h3>
                      <div className="flex items-center gap-1 text-[#64748B] text-xs mb-2">
                        <MapPin size={10} />{p.kecamatan}, {p.kabupaten}
                      </div>
                      <div className="text-xl font-bold text-[#1565C0] font-display mb-2">{formatRupiah(p.harga)}</div>
                      <div className="flex gap-3 text-xs text-gray-600">
                        {p.luas_tanah    && <span>LT: {p.luas_tanah}m²</span>}
                        {p.luas_bangunan && <span>LB: {p.luas_bangunan}m²</span>}
                        {p.kamar_tidur   ? <span>KT: {p.kamar_tidur}</span>  : null}
                        {p.kamar_mandi   ? <span>KM: {p.kamar_mandi}</span>  : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Muat Lebih Banyak — server-side load more (akumulatif) */}
            {viewMode !== 'map' && !error && properties.length > 0 && properties.length < totalCount && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setLimit(prev => prev + 20)}
                  disabled={loading}
                  className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                >
                  {loading ? 'Memuat…' : `Muat Lebih Banyak (${totalCount - properties.length} tersisa)`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-80 bg-white overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-bold">Filter Properti</span>
              <button onClick={() => setSidebarOpen(false)}><X size={20} /></button>
            </div>
            <SidebarContent />
            <div className="p-4">
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-full py-3 rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
              >
                Terapkan Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
