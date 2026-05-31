import { useState } from 'react';
import { Search, Plus, Eye, Edit, Trash2, ToggleLeft, ToggleRight, Filter, ChevronDown } from 'lucide-react';
import { PROPERTIES, formatRupiah } from '../../data/mockData';

const JENIS_COLORS: Record<string, string> = {
  Rumah: '#1565C0', Kost: '#7C3AED', Villa: '#10B981',
  Tanah: '#F5A623', Hotel: '#EF4444', Apartemen: '#0891B2',
};

export default function AdminListingPage() {
  const [search, setSearch] = useState('');
  const [filterJenis, setFilterJenis] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(PROPERTIES.map(p => [p.id, p.status_publish !== 'draft']))
  );
  const [selected, setSelected] = useState<string[]>([]);

  const jenisList = ['Semua', 'Rumah', 'Kost', 'Villa', 'Tanah', 'Hotel', 'Apartemen'];
  const statusList = ['Semua', 'Aktif', 'Draft', 'Terjual'];

  const filtered = PROPERTIES.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) || p.kode.toLowerCase().includes(search.toLowerCase());
    const matchJenis = filterJenis === 'Semua' || p.jenis === filterJenis;
    const matchStatus = filterStatus === 'Semua'
      || (filterStatus === 'Aktif' && toggles[p.id] && p.status_publish !== 'sold')
      || (filterStatus === 'Draft' && !toggles[p.id])
      || (filterStatus === 'Terjual' && p.status_publish === 'sold');
    return matchSearch && matchJenis && matchStatus;
  });

  const togglePublish = (id: string) => setToggles(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSelect = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(p => p.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Manajemen Listing</h1>
          <p className="text-[#64748B] text-sm mt-0.5">{PROPERTIES.length} properti terdaftar</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
          <Plus size={15} /> Tambah Listing
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
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
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <select value={filterJenis} onChange={e => setFilterJenis(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white cursor-pointer">
                {jenisList.map(j => <option key={j}>{j}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white cursor-pointer">
                {statusList.map(s => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
            </div>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="mt-3 flex items-center gap-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-[#64748B]">{selected.length} dipilih</span>
            <button className="text-sm text-[#1565C0] font-medium hover:underline">Publish semua</button>
            <button className="text-sm text-[#EF4444] font-medium hover:underline">Hapus semua</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="p-3 text-left w-8">
                  <input type="checkbox" onChange={selectAll} checked={selected.length === filtered.length && filtered.length > 0} className="accent-[#1565C0]" />
                </th>
                <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">Properti</th>
                <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden md:table-cell">Lokasi</th>
                <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden lg:table-cell">Harga</th>
                <th className="p-3 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">Publish</th>
                <th className="p-3 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${selected.includes(p.id) ? 'bg-[#EFF6FF]' : ''}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="accent-[#1565C0]" />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img src={p.images[0]} alt={p.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=80&q=60'; }} />
                      <div className="min-w-0">
                        <div className="font-medium text-[#0F172A] text-xs leading-snug line-clamp-2">{p.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-semibold" style={{ background: JENIS_COLORS[p.jenis] || '#64748B', fontSize: '10px' }}>{p.jenis}</span>
                          <span className="text-xs text-[#94A3B8]">{p.kode}</span>
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
                    <button onClick={() => togglePublish(p.id)} className="transition-colors">
                      {toggles[p.id]
                        ? <ToggleRight size={26} className="text-[#10B981]" />
                        : <ToggleLeft size={26} className="text-[#94A3B8]" />
                      }
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 text-[#64748B] hover:text-[#1565C0] hover:bg-[#E3F2FD] rounded-lg transition-colors">
                        <Eye size={14} />
                      </button>
                      <button className="p-1.5 text-[#64748B] hover:text-[#F5A623] hover:bg-[#FFF9E6] rounded-lg transition-colors">
                        <Edit size={14} />
                      </button>
                      <button className="p-1.5 text-[#64748B] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Filter size={32} className="text-[#E2E8F0] mx-auto mb-3" />
            <p className="text-[#64748B] text-sm">Tidak ada listing yang sesuai filter</p>
          </div>
        )}

        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-[#94A3B8]">Menampilkan {filtered.length} dari {PROPERTIES.length} listing</span>
          <div className="flex items-center gap-1">
            {[1].map(n => (
              <button key={n} className="w-7 h-7 rounded-lg text-xs font-semibold bg-[#1565C0] text-white">{n}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
