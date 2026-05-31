import { useState } from 'react';
import { Search, Phone, MessageCircle, Clock, User, Home, ChevronDown, GripVertical } from 'lucide-react';

type LeadStatus = 'Baru' | 'Dihubungi' | 'Viewing' | 'Nego' | 'Closed' | 'Lost';

interface Lead {
  id: string;
  nama: string;
  wa: string;
  properti: string;
  jenis: string;
  waktu: string;
  pesan: string;
  status: LeadStatus;
}

const MOCK_LEADS: Lead[] = [
  { id: 'L001', nama: 'Budi Santoso', wa: '08123456789', properti: 'Rumah 2 Lantai Condongcatur', jenis: 'Pembeli', waktu: '09:14', pesan: 'Saya tertarik, bisa survei hari Sabtu?', status: 'Baru' },
  { id: 'L002', nama: 'Dewi Kartika', wa: '08234567890', properti: 'Kost Eksklusif Mlati', jenis: 'Investor', waktu: '08:51', pesan: 'Yield berapa persen per tahun?', status: 'Baru' },
  { id: 'L003', nama: 'Ahmad Fauzi', wa: '08345678901', properti: 'Villa 3 KT Ngemplak', jenis: 'Pembeli', waktu: 'Kemarin', pesan: 'Apakah bisa KPR?', status: 'Dihubungi' },
  { id: 'L004', nama: 'Siti Rahayu', wa: '08456789012', properti: 'Tanah Kavling Kalasan', jenis: 'Pembeli', waktu: 'Kemarin', pesan: 'SHM kan? Mau cek sertifikat dulu', status: 'Dihubungi' },
  { id: 'L005', nama: 'Rizki Pratama', wa: '08567890123', properti: 'Rumah Asri Godean', jenis: 'Pembeli', waktu: '2 hari lalu', pesan: 'Sudah survei, suka. Mau nego harga', status: 'Viewing' },
  { id: 'L006', nama: 'Fitri Handayani', wa: '08678901234', properti: 'Kost Mewah Sinduharjo', jenis: 'Investor', waktu: '3 hari lalu', pesan: 'Tertarik, bisa diskon?', status: 'Nego' },
  { id: 'L007', nama: 'Hendra Wijaya', wa: '08789012345', properti: 'Rumah 2 Lantai Condongcatur', jenis: 'Pembeli', waktu: '1 minggu lalu', pesan: 'Deal! Proses AJB kapan bisa?', status: 'Closed' },
  { id: 'L008', nama: 'Maya Lestari', wa: '08890123456', properti: 'Villa Ngemplak', jenis: 'Pembeli', waktu: '1 minggu lalu', pesan: 'Maaf, batal. Budget tidak cukup', status: 'Lost' },
];

const COLUMNS: { id: LeadStatus; label: string; color: string; bg: string }[] = [
  { id: 'Baru', label: 'Baru', color: '#1565C0', bg: '#EFF6FF' },
  { id: 'Dihubungi', label: 'Dihubungi', color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'Viewing', label: 'Viewing', color: '#F5A623', bg: '#FFF9E6' },
  { id: 'Nego', label: 'Nego', color: '#0891B2', bg: '#ECFEFF' },
  { id: 'Closed', label: 'Closed ✓', color: '#10B981', bg: '#F0FFF4' },
  { id: 'Lost', label: 'Lost ✗', color: '#EF4444', bg: '#FEF2F2' },
];

const JENIS_COLORS: Record<string, string> = {
  Pembeli: '#1565C0', Penjual: '#10B981', Investor: '#F5A623', Broker: '#7C3AED',
};

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  const filtered = leads.filter(l =>
    l.nama.toLowerCase().includes(search.toLowerCase()) ||
    l.properti.toLowerCase().includes(search.toLowerCase())
  );

  const byStatus = (status: LeadStatus) => filtered.filter(l => l.status === status);

  const onDragStart = (id: string) => setDragging(id);
  const onDragEnd = () => { setDragging(null); setDragOver(null); };
  const onDrop = (status: LeadStatus) => {
    if (dragging) {
      setLeads(prev => prev.map(l => l.id === dragging ? { ...l, status } : l));
    }
    setDragging(null);
    setDragOver(null);
  };

  const moveCard = (id: string, status: LeadStatus) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Manajemen Leads</h1>
          <p className="text-[#64748B] text-sm mt-0.5">{leads.length} total leads</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari lead…"
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white w-48"
          />
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(col => {
            const cards = byStatus(col.id);
            return (
              <div
                key={col.id}
                className={`w-64 rounded-2xl flex flex-col transition-colors ${dragOver === col.id ? 'ring-2' : ''}`}
                style={{ background: dragOver === col.id ? col.bg : '#F8FAFC', ringColor: col.color } as React.CSSProperties}
                onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                onDrop={() => onDrop(col.id)}
                onDragLeave={() => setDragOver(null)}>
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-3 rounded-t-2xl" style={{ background: col.bg }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <span className="font-semibold text-sm" style={{ color: col.color }}>{col.label}</span>
                  </div>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: col.color }}>
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 min-h-32">
                  {cards.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => onDragStart(lead.id)}
                      onDragEnd={onDragEnd}
                      className={`bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing transition-all ${dragging === lead.id ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-[#E3F2FD] flex items-center justify-center">
                            <User size={11} className="text-[#1565C0]" />
                          </div>
                          <span className="font-semibold text-xs text-[#0F172A]">{lead.nama}</span>
                        </div>
                        <GripVertical size={13} className="text-[#CBD5E1]" />
                      </div>

                      <div className="flex items-center gap-1 mb-2">
                        <Home size={10} className="text-[#94A3B8]" />
                        <span className="text-xs text-[#64748B] line-clamp-1">{lead.properti}</span>
                      </div>

                      <p className="text-xs text-[#94A3B8] italic line-clamp-2 mb-2">"{lead.pesan}"</p>

                      <div className="flex items-center justify-between">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: JENIS_COLORS[lead.jenis] || '#64748B', fontSize: '10px' }}>
                          {lead.jenis}
                        </span>
                        <div className="flex items-center gap-1 text-[#94A3B8]">
                          <Clock size={10} />
                          <span style={{ fontSize: '10px' }}>{lead.waktu}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50">
                        <a href={`tel:${lead.wa}`} className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[#64748B] hover:bg-gray-50 transition-colors">
                          <Phone size={11} />
                          <span style={{ fontSize: '10px' }}>Telepon</span>
                        </a>
                        <a href={`https://wa.me/62${lead.wa.slice(1)}?text=Halo ${lead.nama}, saya dari SBP...`} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[#10B981] hover:bg-[#F0FFF4] transition-colors">
                          <MessageCircle size={11} />
                          <span style={{ fontSize: '10px' }}>WhatsApp</span>
                        </a>
                        <div className="relative group">
                          <button className="p-1 rounded-lg text-[#64748B] hover:bg-gray-50 transition-colors">
                            <ChevronDown size={11} />
                          </button>
                          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-10 hidden group-hover:block w-32">
                            {COLUMNS.filter(c => c.id !== lead.status).map(c => (
                              <button key={c.id} onClick={() => moveCard(lead.id, c.id)}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors" style={{ color: c.color }}>
                                → {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {cards.length === 0 && (
                    <div className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-gray-200">
                      <p className="text-xs text-[#CBD5E1]">Drop di sini</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-[#94A3B8] text-center">Drag & drop kartu untuk mengubah status lead</p>
    </div>
  );
}
