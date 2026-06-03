import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { SlidersHorizontal, Grid3X3, List, X, ChevronDown, RotateCcw, MapPin, AlertCircle, RefreshCw } from 'lucide-react';
import {
  getProperties, getLocations, normalizeProperty,
  type NormalizedProperty, type ApiLocation, type PropertiesParams,
  formatRupiah,
} from '../../lib/api';
import { PROPERTY_TYPES } from '../../lib/propertyTypes';
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

export default function PropertiesPage() {
  const [searchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [tujuan, setTujuan] = useState(searchParams.get('tujuan') || 'semua');
  const [selectedJenis, setSelectedJenis] = useState<string[]>(
    searchParams.get('jenis') ? [searchParams.get('jenis')!] : []
  );
  const [hargaRange, setHargaRange] = useState(0);
  const [kabupaten, setKabupaten] = useState(searchParams.get('kabupaten') || '');
  const [kabupatenId, setKabupatenId] = useState<number | null>(null);
  const [kecamatan, setKecamatan] = useState(searchParams.get('kecamatan') || '');
  const [sort, setSort] = useState('terbaru');
  const [page, setPage] = useState(1);

  // ── Location cascade state ────────────────────────────────────────────────
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [locLoading, setLocLoading] = useState(true);

  // ── Properties data state ─────────────────────────────────────────────────
  const [properties, setProperties] = useState<NormalizedProperty[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load kabupaten via cascading API on mount ─────────────────────────────
  useEffect(() => {
    setLocLoading(true);
    // Ambil provinsi (parent_id kosong) → ambil id DIY → ambil kabupaten
    getLocations().then(provRes => {
      if (!provRes.success || !provRes.data?.items.length) {
        setLocLoading(false);
        return;
      }
      const diy = provRes.data.items[0]; // Hanya 1 provinsi di DB: DI Yogyakarta
      getLocations(diy.id).then(kabRes => {
        if (kabRes.success && kabRes.data) {
          const list = kabRes.data.items;
          setKabList(list);
          // Sync kabupatenId dari URL param jika ada
          const urlKab = searchParams.get('kabupaten');
          if (urlKab) {
            const found = list.find(k => k.nama.toLowerCase() === urlKab.toLowerCase());
            if (found) setKabupatenId(found.id);
          }
        }
      }).finally(() => setLocLoading(false));
    }).catch(() => setLocLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      page,
      limit: PER_PAGE,
    };
    if (tujuan !== 'semua') params.tujuan = tujuan;
    if (selectedJenis.length > 0) params.jenis = selectedJenis.join(',');
    if (kabupaten) params.kabupaten = kabupaten;
    if (kecamatan) params.kecamatan = kecamatan;

    const range = HARGA_RANGES[hargaRange];
    if (range.min > 0) params.harga_min = range.min;
    if (range.max > 0) params.harga_max = range.max;

    getProperties(params)
      .then(res => {
        if (res.success && res.data) {
          setProperties(res.data.items.map(normalizeProperty));
          setTotalCount(res.data.pagination.total);
          setTotalPages(res.data.pagination.total_pages);
        } else {
          setError(res.error ?? 'Gagal memuat data properti');
        }
      })
      .catch(() => setError('Koneksi ke server gagal'))
      .finally(() => setLoading(false));
  }, [tujuan, selectedJenis, hargaRange, kabupaten, kecamatan, sort, page]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  // ── Filter handlers ───────────────────────────────────────────────────────
  const toggleJenis = (v: string) => {
    setSelectedJenis(prev => prev.includes(v) ? prev.filter(j => j !== v) : [...prev, v]);
    setPage(1);
  };

  const handleKabChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nama = e.target.value;
    const found = kabList.find(k => k.nama === nama);
    setKabupaten(nama);
    setKabupatenId(found?.id ?? null);
    setKecamatan('');
    setPage(1);
  };

  const resetFilters = () => {
    setTujuan('semua');
    setSelectedJenis([]);
    setHargaRange(0);
    setKabupaten('');
    setKabupatenId(null);
    setKecamatan('');
    setSort('terbaru');
    setPage(1);
  };

  const activeChips = [
    tujuan !== 'semua' ? { label: tujuan === 'dijual' ? 'Dijual' : 'Disewa', clear: () => { setTujuan('semua'); setPage(1); } } : null,
    ...selectedJenis.map(j => ({ label: j, clear: () => toggleJenis(j) })),
    hargaRange > 0 ? { label: HARGA_RANGES[hargaRange].label, clear: () => { setHargaRange(0); setPage(1); } } : null,
    kabupaten ? { label: kabupaten, clear: () => { setKabupaten(''); setKabupatenId(null); setKecamatan(''); setPage(1); } } : null,
    kecamatan ? { label: kecamatan, clear: () => { setKecamatan(''); setPage(1); } } : null,
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
              onClick={() => { setTujuan(v); setPage(1); }}
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
          <select value={hargaRange} onChange={e => { setHargaRange(Number(e.target.value)); setPage(1); }} className={selectClass}>
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
            <select
              value={kabupaten}
              onChange={handleKabChange}
              className={selectClass}
              disabled={locLoading}
            >
              <option value="">{locLoading ? 'Memuat lokasi…' : 'Semua Kab./Kota'}</option>
              {kabList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {kabupaten && kecList.length > 0 && (
            <div className="relative">
              <select
                value={kecamatan}
                onChange={e => { setKecamatan(e.target.value); setPage(1); }}
                className={selectClass}
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
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Cari Properti</h1>
          <p className="text-[#64748B] text-sm mt-1">
            Semua listing properti di DI Yogyakarta — dikurasi &amp; diverifikasi SBP
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

            {/* Topbar */}
            <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:border-[#1565C0] transition-colors"
                >
                  <SlidersHorizontal size={16} /> Filter
                </button>
                <p className="text-sm text-[#64748B]">
                  {loading ? (
                    <Skeleton className="h-4 w-44 inline-block rounded" />
                  ) : (
                    <>Menampilkan <span className="font-bold text-[#0F172A]">{properties.length}</span> dari <span className="font-bold text-[#0F172A]">{totalCount}</span> properti</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={sort}
                    onChange={e => { setSort(e.target.value); setPage(1); }}
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
                </div>
              </div>
            </div>

            {/* Active Filter Chips */}
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

            {/* Konten utama: Loading / Error / Empty / Grid / List */}
            {loading ? (
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
                        src={p.images[0] ?? ''}
                        alt={p.title}
                        className="w-full h-full object-cover"
                        style={{ minHeight: 160 }}
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=400&q=80'; }}
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
            )}

            {/* Pagination — server-side */}
            {!loading && totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8 flex-wrap items-center">
                {page > 1 && (
                  <button
                    onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="px-3 h-9 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-[#1565C0] transition-colors"
                  >
                    ← Prev
                  </button>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${
                      p === page ? 'bg-[#1565C0] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1565C0]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {page < totalPages && (
                  <button
                    onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="px-3 h-9 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:border-[#1565C0] transition-colors"
                  >
                    Next →
                  </button>
                )}
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
