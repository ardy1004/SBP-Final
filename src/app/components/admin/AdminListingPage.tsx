import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, ChevronDown, Edit, Plus, FileUp, Trash2, ImageOff, MapPin } from 'lucide-react';
import { getLocations, type ApiLocation } from '../../../lib/api';
import { PROPERTY_TYPES } from '../../../lib/propertyTypes';
import CsvImportModal from './CsvImportModal';

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
  latitude: number | null;
  longitude: number | null;
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

// Opsi bulk "Tandai Sebagai" (badge + SOLD) — semua hanya UPDATE DB
const BULK_MARKS: { action: string; label: string; cls: string }[] = [
  { action: 'premium',  label: '⭐ Premium',  cls: 'text-indigo-600' },
  { action: 'featured', label: '🔥 Featured', cls: 'text-orange-600' },
  { action: 'hot',      label: '🏷️ Hot',      cls: 'text-red-500' },
  { action: 'pilihan',  label: '⭐ Pilihan',  cls: 'text-yellow-600' },
  { action: 'verified', label: '✓ Verified',  cls: 'text-teal-600' },
  { action: 'sold',     label: 'SOLD',         cls: 'text-amber-700' },
];

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
  const [filterJenis, setFilterJenis] = useState<string>(''); // '' = semua jenis
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [displayLimit, setDisplayLimit] = useState(20);
  const [markOpen, setMarkOpen] = useState(false);

  // ── Bulk "Set Lokasi" — cascade Provinsi → Kab./Kota → Kecamatan ──────────
  const [locOpen, setLocOpen] = useState(false);
  const [provList, setProvList] = useState<ApiLocation[]>([]);
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [provId, setProvId] = useState<number | null>(null);
  const [kabId, setKabId] = useState<number | null>(null);
  const [kecName, setKecName] = useState('');

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'Semua') qs.set('status', statusFilter);
      if (filterJenis) qs.set('jenis', filterJenis);
      const params = qs.toString() ? `?${qs.toString()}` : '';
      const res = await fetch(`/api/admin/properties${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProperties(json.data?.properties ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, filterJenis]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { setSelectedIds(new Set()); setDisplayLimit(20); }, [statusFilter, filterJenis, search]);

  // Cascade lokasi: muat provinsi saat panel Set Lokasi pertama dibuka.
  useEffect(() => {
    if (locOpen && provList.length === 0) {
      getLocations().then(res => { if (res.success && res.data) setProvList(res.data.items); }).catch(() => {});
    }
  }, [locOpen, provList.length]);

  // Muat kabupaten saat provinsi dipilih; reset kab/kec.
  useEffect(() => {
    setKabList([]); setKabId(null); setKecList([]); setKecName('');
    if (!provId) return;
    getLocations(provId).then(res => { if (res.success && res.data) setKabList(res.data.items); }).catch(() => {});
  }, [provId]);

  // Muat kecamatan saat kabupaten dipilih; reset kec.
  useEffect(() => {
    setKecList([]); setKecName('');
    if (!kabId) return;
    getLocations(kabId).then(res => { if (res.success && res.data) setKecList(res.data.items); }).catch(() => {});
  }, [kabId]);

  const handleDelete = useCallback(async (p: PropertyRow) => {
    if (!window.confirm(`Hapus properti "${p.title}" permanen? Foto juga akan dihapus. Tidak bisa dibatalkan.`)) return;
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/admin/properties/${p.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchProperties();
    } catch (err) {
      alert(`Gagal menghapus: ${err instanceof Error ? err.message : 'Error tidak diketahui'}`);
    } finally {
      setDeletingId(null);
    }
  }, [fetchProperties]);

  const filtered = properties.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.kode_listing ?? '').toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const someSelected = !allSelected && filtered.some(p => selectedIds.has(p.id));

  const handleToggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const handleToggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkPublish = async () => {
    const ids = [...selectedIds];
    if (!window.confirm(`Publish ${ids.length} properti sekarang?`)) return;
    setBulkLoading(true);
    try {
      const CHUNK = 50;
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      let published = 0;
      for (let i = 0; i < chunks.length; i++) {
        setBulkProgress(`Publish batch ${i + 1} dari ${chunks.length}…`);
        const res = await fetch('/api/admin/properties/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'publish', ids: chunks[i] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        published += json.data?.affected ?? chunks[i].length;
      }
      await fetchProperties();
      setSelectedIds(new Set());
      alert(`Berhasil publish ${published} properti.`);
    } catch (err) {
      alert(`Gagal publish massal: ${err instanceof Error ? err.message : 'Error tidak diketahui'}`);
    } finally {
      setBulkLoading(false);
      setBulkProgress('');
    }
  };

  // Generic bulk "tandai sebagai" — dipakai untuk badge + SOLD (chunk 50, hanya UPDATE)
  const handleBulkMark = async (action: string, label: string) => {
    const ids = [...selectedIds];
    setMarkOpen(false);
    if (!window.confirm(`Tandai ${ids.length} properti sebagai ${label}?`)) return;
    setBulkLoading(true);
    try {
      const CHUNK = 50;
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      let affected = 0;
      for (let i = 0; i < chunks.length; i++) {
        setBulkProgress(`Tandai ${label} batch ${i + 1} dari ${chunks.length}…`);
        const res = await fetch('/api/admin/properties/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids: chunks[i] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        affected += json.data?.affected ?? chunks[i].length;
      }
      await fetchProperties();
      setSelectedIds(new Set());
      alert(`Berhasil menandai ${affected} properti sebagai ${label}.`);
    } catch (err) {
      alert(`Gagal tandai ${label}: ${err instanceof Error ? err.message : 'Error tidak diketahui'}`);
    } finally {
      setBulkLoading(false);
      setBulkProgress('');
    }
  };

  // Reset pilihan cascade lokasi + tutup panel.
  const resetLocPanel = () => {
    setLocOpen(false); setProvId(null); setKabId(null); setKecName('');
    setKabList([]); setKecList([]);
  };

  const handleBulkSetLocation = async () => {
    const provinsi  = provList.find(p => p.id === provId)?.nama ?? '';
    const kabupaten = kabList.find(k => k.id === kabId)?.nama ?? '';
    const kecamatan = kecName;
    if (!provinsi || !kabupaten || !kecamatan) return;

    const ids = [...selectedIds];
    if (!window.confirm(`Set lokasi "${kecamatan}, ${kabupaten}, ${provinsi}" untuk ${ids.length} properti? Kolom lokasi lama akan ditimpa.`)) return;
    setBulkLoading(true);
    try {
      const CHUNK = 50;
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      let affected = 0;
      for (let i = 0; i < chunks.length; i++) {
        setBulkProgress(`Set lokasi batch ${i + 1} dari ${chunks.length}…`);
        const res = await fetch('/api/admin/properties/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_location', ids: chunks[i], provinsi, kabupaten, kecamatan }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        affected += json.data?.affected ?? chunks[i].length;
      }
      await fetchProperties();
      setSelectedIds(new Set());
      resetLocPanel();
      alert(`Lokasi berhasil diupdate untuk ${affected} properti.`);
    } catch (err) {
      alert(`Gagal set lokasi: ${err instanceof Error ? err.message : 'Error tidak diketahui'}`);
    } finally {
      setBulkLoading(false);
      setBulkProgress('');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!window.confirm(`Hapus ${ids.length} properti permanen? Semua foto juga dihapus. Tidak bisa dibatalkan.`)) return;
    setBulkLoading(true);
    try {
      const CHUNK = 20;
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      let deleted = 0;
      for (let i = 0; i < chunks.length; i++) {
        setBulkProgress(`Menghapus batch ${i + 1} dari ${chunks.length}…`);
        const res = await fetch('/api/admin/properties/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', ids: chunks[i] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        deleted += json.data?.affected ?? chunks[i].length;
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      }
      await fetchProperties();
      setSelectedIds(new Set());
      alert(`Berhasil menghapus ${deleted} properti.`);
    } catch (err) {
      alert(`Gagal hapus massal: ${err instanceof Error ? err.message : 'Error tidak diketahui'}`);
    } finally {
      setBulkLoading(false);
      setBulkProgress('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 bg-[#F0F4F8] pb-2 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Manajemen Properti</h1>
          <p className="text-[#64748B] text-sm mt-0.5">
            {loading ? 'Memuat…' : `${filtered.length} properti ditampilkan`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCsvModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors"
          >
            <FileUp size={15} /> Import CSV
          </button>
          <button
            onClick={() => navigate('/admin/listing/new')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
          >
            <Plus size={15} /> Tambah Properti
          </button>
        </div>
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
              value={filterJenis}
              onChange={e => setFilterJenis(e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white cursor-pointer"
            >
              <option value="">Semua Jenis</option>
              {PROPERTY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
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
      </div>

      {/* Bulk action bar — slide down when something is selected */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: selectedIds.size > 0 ? (locOpen ? '400px' : markOpen ? '220px' : '80px') : '0px', opacity: selectedIds.size > 0 ? 1 : 0 }}
      >
        <div className="bg-[#EFF6FF] border border-[#1565C0]/20 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-[#1565C0]">
              {bulkProgress || `${selectedIds.size} properti dipilih`}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleBulkPublish}
                disabled={bulkLoading}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Publish Semua
              </button>
              <button
                onClick={() => { setMarkOpen(o => !o); setLocOpen(false); }}
                disabled={bulkLoading}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Tandai Sebagai {markOpen ? '▲' : '▼'}
              </button>
              <button
                onClick={() => { setLocOpen(o => !o); setMarkOpen(false); }}
                disabled={bulkLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MapPin size={13} /> Set Lokasi {locOpen ? '▲' : '▼'}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkLoading}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Hapus Semua
              </button>
              <button
                onClick={() => { setMarkOpen(false); setSelectedIds(new Set()); }}
                disabled={bulkLoading}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-40"
              >
                Batal
              </button>
            </div>
          </div>
          {markOpen && (
            <div className="flex items-center gap-2 flex-wrap mt-2.5 pt-2.5 border-t border-[#1565C0]/10">
              <span className="text-xs text-[#64748B]">Tandai sebagai:</span>
              {BULK_MARKS.map(m => (
                <button
                  key={m.action}
                  onClick={() => handleBulkMark(m.action, m.label)}
                  disabled={bulkLoading}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${m.cls}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Panel cascade Set Lokasi */}
          {locOpen && (
            <div className="mt-2.5 pt-2.5 border-t border-[#1565C0]/10">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 mb-2">
                <MapPin size={13} /> Set lokasi untuk {selectedIds.size} properti terpilih (menimpa lokasi lama)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={provId ?? ''}
                  onChange={e => setProvId(parseInt(e.target.value, 10) || null)}
                  disabled={bulkLoading}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white"
                >
                  <option value="">{provList.length ? 'Pilih Provinsi' : 'Memuat…'}</option>
                  {provList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                </select>
                <select
                  value={kabId ?? ''}
                  onChange={e => setKabId(parseInt(e.target.value, 10) || null)}
                  disabled={bulkLoading || !provId}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white disabled:bg-gray-50"
                >
                  <option value="">Pilih Kab./Kota</option>
                  {kabList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
                <select
                  value={kecName}
                  onChange={e => setKecName(e.target.value)}
                  disabled={bulkLoading || !kabId}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white disabled:bg-gray-50"
                >
                  <option value="">Pilih Kecamatan</option>
                  {kecList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={handleBulkSetLocation}
                  disabled={bulkLoading || !provId || !kabId || !kecName}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Terapkan ke {selectedIds.size} properti terpilih
                </button>
                <button
                  onClick={resetLocPanel}
                  disabled={bulkLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-40"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
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
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={handleToggleAll}
                    className="w-4 h-4 accent-[#1565C0] cursor-pointer"
                    title="Pilih Semua"
                  />
                </th>
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
                  <td colSpan={6} className="py-12 text-center text-[#94A3B8] text-sm">
                    <div className="w-6 h-6 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin mx-auto mb-2" />
                    Memuat data…
                  </td>
                </tr>
              )}
              {!loading && filtered.slice(0, displayLimit).map(p => {
                const badge = STATUS_BADGE[p.status_publish] ?? { label: p.status_publish, cls: 'bg-gray-100 text-gray-500' };
                const src = coverSrc(p.cover_url);
                const isSelected = selectedIds.has(p.id);
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? 'bg-[#EFF6FF]' : ''}`}
                    onClick={() => navigate(`/admin/listing/${p.id}`)}
                  >
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleOne(p.id)}
                        className="w-4 h-4 accent-[#1565C0] cursor-pointer"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {src ? (
                          <img src={src} alt={p.title}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <ImageOff size={16} className="text-gray-400" />
                          </div>
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
                      {p.latitude != null
                        ? <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 mt-0.5">
                            <MapPin size={10} /> GPS ✓
                          </span>
                        : <span className="text-[10px] text-gray-400 mt-0.5">— no GPS</span>}
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
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="p-1.5 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Hapus permanen"
                        >
                          <Trash2 size={14} />
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

        {!loading && filtered.length > displayLimit && (
          <div className="flex justify-center p-4 border-t border-gray-100">
            <button
              onClick={() => setDisplayLimit(prev => prev + 20)}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
            >
              Muat Lebih Banyak ({filtered.length - displayLimit} tersisa)
            </button>
          </div>
        )}

        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-[#94A3B8]">
            Menampilkan {Math.min(displayLimit, filtered.length)} dari {filtered.length} properti
          </span>
        </div>
      </div>

      <CsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onSuccess={() => { setShowCsvModal(false); fetchProperties(); }}
      />
    </div>
  );
}
