import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, ImageOff, Video } from 'lucide-react';

interface PropertyRow {
  id: number;
  kode_listing: string;
  title: string;
  jenis_properti: string;
  tujuan: string;
  status_publish: string;
  kecamatan: string;
  kabupaten: string;
  cover_url: string | null;
}

const JENIS_COLORS: Record<string, string> = {
  rumah: '#1565C0', kost: '#7C3AED', villa: '#10B981',
  tanah: '#F5A623', hotel: '#EF4444', apartment: '#0891B2',
  homestay: '#059669', gudang: '#78716C', komersial: '#DC2626',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: { label: 'Published', cls: 'bg-emerald-100 text-emerald-700' },
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-500' },
  sold:      { label: 'Sold',      cls: 'bg-red-100 text-red-600' },
  archived:  { label: 'Arsip',     cls: 'bg-gray-200 text-gray-500 line-through' },
};

function coverSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith('property-photos/') || url.startsWith('signatures/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function AdminViralFramePage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [displayLimit, setDisplayLimit] = useState(24);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/properties', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProperties(json.data?.properties ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { setDisplayLimit(24); }, [search]);

  const filtered = properties.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.kode_listing ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Video size={20} className="text-[#1565C0]" /> Viral Frame
          </h1>
          <p className="text-[#64748B] text-sm mt-0.5">
            {loading ? 'Memuat…' : `Pilih properti untuk membuat prompt video AI — ${filtered.length} properti`}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari judul atau kode listing…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 rounded-2xl border border-red-100">
          {error} —{' '}
          <button onClick={fetchProperties} className="underline font-medium">Coba lagi</button>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-[#94A3B8] text-sm">
          <div className="w-6 h-6 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin mx-auto mb-2" />
          Memuat data…
        </div>
      )}

      {/* Grid properti */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.slice(0, displayLimit).map(p => {
            const badge = STATUS_BADGE[p.status_publish] ?? { label: p.status_publish, cls: 'bg-gray-100 text-gray-500' };
            const src = coverSrc(p.cover_url);
            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col"
              >
                <div className="relative aspect-video bg-gray-100">
                  {src ? (
                    <img src={src} alt={p.title}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff size={24} className="text-gray-300" />
                    </div>
                  )}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-semibold"
                      style={{ background: JENIS_COLORS[p.jenis_properti] ?? '#64748B', fontSize: '10px' }}>
                      {p.jenis_properti}
                    </span>
                    <span className="text-xs text-[#94A3B8] truncate">{p.kode_listing}</span>
                  </div>
                  <div className="font-medium text-[#0F172A] text-sm leading-snug line-clamp-2">{p.title}</div>
                  <div className="text-xs text-[#64748B] mt-0.5">{p.kecamatan}, {p.kabupaten}</div>
                  <button
                    onClick={() => navigate(`/admin/viralframe/${p.id}`)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                  >
                    🎬 Buat Prompt Video
                  </button>
                  <button
                    onClick={() => navigate(`/admin/viralframe/${p.id}?mode=video-vo`)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#1565C0]/40 text-[#1565C0] text-sm font-medium hover:bg-[#F0F7FF] transition-colors"
                  >
                    🎬 Generate Video VO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12">
          <Filter size={32} className="text-[#E2E8F0] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">Tidak ada properti yang sesuai pencarian</p>
        </div>
      )}

      {!loading && filtered.length > displayLimit && (
        <div className="flex justify-center">
          <button
            onClick={() => setDisplayLimit(prev => prev + 24)}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
          >
            Muat Lebih Banyak ({filtered.length - displayLimit} tersisa)
          </button>
        </div>
      )}
    </div>
  );
}
