import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, ChevronDown, Edit, Plus } from 'lucide-react';

interface PropertyRow {
  id: number;
  kode_listing: string;
  title: string;
  slug: string;
  jenis_properti: string;
  tujuan: string;
  harga: number;
  status_publish: string;
  kecamatan: string;
  kabupaten: string;
  cover_url: string | null;
  jumlah_foto: number;
  created_at: string;
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

const STATUS_FILTERS = ['Semua', 'published', 'draft', 'sold', 'archived'] as const;
const STATUS_LABELS: Record<string, string> = {
  Semua: 'Semua', published: 'Published', draft: 'Draft', sold: 'Sold', archived: 'Arsip',
};

function formatRupiah(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace('.0', '')} M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function coverSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith('property-photos/') || url.startsWith('signatures/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function AdminListingPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = statusFilter !== 'Semua' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/properties${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProperties(json.data?.properties ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

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
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Manajemen Properti</h1>
          <p className="text-[#64748B] text-sm mt-0.5">
            {loading ? 'Memuat…' : `${filtered.length} properti ditampilkan`}
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/listing/new')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
        >
          <Plus size={15} /> Tambah Properti
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari judul atau kode listing…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white cursor-pointer"
            >
              {STATUS_FILTERS.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
          </div>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-[#1565C0] text-white'
                  : 'bg-gray-100 text-[#64748B] hover:bg-gray-200'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-red-100">
            {error} —{' '}
            <button onClick={fetchProperties} className="underline font-medium">Coba lagi</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">Properti</th>
                <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden md:table-cell">Lokasi</th>
                <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden lg:table-cell">Harga</th>
                <th className="p-3 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">Status</th>
                <th className="p-3 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#94A3B8] text-sm">
                    <div className="w-6 h-6 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin mx-auto mb-2" />
                    Memuat data…
                  </td>
                </tr>
              )}
              {!loading && filtered.map(p => {
                const badge = STATUS_BADGE[p.status_publish] ?? { label: p.status_publish, cls: 'bg-gray-100 text-gray-500' };
                const src = coverSrc(p.cover_url);
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/admin/listing/${p.id}`)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {src ? (
                          <img src={src} alt={p.title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-[#0F172A] text-xs leading-snug line-clamp-2">{p.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-semibold"
                              style={{ background: JENIS_COLORS[p.jenis_properti] ?? '#64748B', fontSize: '10px' }}>
                              {p.jenis_properti}
                            </span>
                            <span className="text-xs text-[#94A3B8]">{p.kode_listing}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div className="text-xs text-[#64748B]">{p.kecamatan}, {p.kabupaten}</div>
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      <div className="font-semibold text-[#0F172A] text-xs">{formatRupiah(p.harga)}</div>
                      <div className="text-xs text-[#94A3B8]">{p.tujuan}</div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/admin/listing/${p.id}`)}
                          className="p-1.5 text-[#64748B] hover:text-[#F5A623] hover:bg-[#FFF9E6] rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && !error && (
          <div className="text-center py-12">
            <Filter size={32} className="text-[#E2E8F0] mx-auto mb-3" />
            <p className="text-[#64748B] text-sm">Tidak ada properti yang sesuai filter</p>
          </div>
        )}

        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-[#94A3B8]">
            Menampilkan {filtered.length} dari {properties.length} properti
          </span>
        </div>
      </div>
    </div>
  );
}
