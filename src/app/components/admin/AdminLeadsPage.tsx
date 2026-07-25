import { bacaJson } from '../../../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  Search, Phone, MessageCircle, Clock, User, Home,
  ChevronDown, GripVertical, StickyNote, ChevronUp, Send, AlertCircle, Loader2,
} from 'lucide-react';

type PipelineStatus = 'baru' | 'dihubungi' | 'negosiasi' | 'closing' | 'arsip';

interface Note { teks: string; admin: string; waktu: string; }

interface Lead {
  id: number;
  nama: string | null;
  no_wa: string | null;
  pesan: string | null;
  asal_daerah: string | null;
  budget: string | null;
  tipe_pengirim: string | null;
  source_page: string | null;
  status_pipeline: PipelineStatus;
  notes: Note[];
  wa_clicked_at: string | null;
  created_at: string;
  properti_title: string | null;
}

const COLUMNS: { id: PipelineStatus; label: string; color: string; bg: string }[] = [
  { id: 'baru',       label: 'Baru',       color: '#1565C0', bg: '#EFF6FF' },
  { id: 'dihubungi',  label: 'Dihubungi',  color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'negosiasi',  label: 'Negosiasi',  color: '#F5A623', bg: '#FFF9E6' },
  { id: 'closing',    label: 'Closing ✓',  color: '#10B981', bg: '#F0FFF4' },
  { id: 'arsip',      label: 'Arsip',       color: '#64748B', bg: '#F1F5F9' },
];

const TIPE_COLORS: Record<string, string> = {
  pembeli: '#1565C0', penjual: '#10B981', broker: '#7C3AED', quick_wa: '#F97316',
};
const TIPE_LABEL: Record<string, string> = {
  pembeli: 'Pembeli', penjual: 'Penjual', broker: 'Broker', quick_wa: 'Klik Cepat WA',
};

function relativeTime(dtStr: string): string {
  const diff = Date.now() - new Date(dtStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'Baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 8)  return `${days} hari lalu`;
  return new Date(dtStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function sourceLabel(src: string | null): string | null {
  if (!src) return null;
  if (src.includes('contact')) return 'kontak';
  if (src.includes('listing') || src.includes('propert')) return 'listing';
  const last = src.replace(/^\/+/, '').split('/').pop();
  return last ?? src;
}

async function patchLead(id: number, body: object): Promise<void> {
  const res = await fetch(`/api/admin/leads/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${id} failed: ${res.status}`);
}

export default function AdminLeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [dragging, setDragging]       = useState<number | null>(null);
  const [dragOver, setDragOver]       = useState<PipelineStatus | null>(null);
  const [expandedCards, setExpanded]  = useState<Set<number>>(new Set());
  const [noteInputs, setNoteInputs]   = useState<Record<number, string>>({});
  const [noteLoading, setNoteLoading] = useState<Set<number>>(new Set());

  const fetchLeads = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/leads?limit=200', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return bacaJson<{ leads: Lead[] }>(r); })
      .then(d => setLeads(d.data?.leads ?? []))
      .catch(e => setError(`Gagal memuat leads: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = leads.filter(l =>
    (l.nama ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.properti_title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.no_wa ?? '').includes(search)
  );

  const byStatus = (s: PipelineStatus) => filtered.filter(l => l.status_pipeline === s);

  // Optimistic status update + API call
  const moveCard = async (id: number, status: PipelineStatus) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status_pipeline: status } : l));
    try { await patchLead(id, { status_pipeline: status }); }
    catch { fetchLeads(); } // revert on failure
  };

  const onDragStart = (id: number) => setDragging(id);
  const onDragEnd   = () => { setDragging(null); setDragOver(null); };
  const onDrop      = (status: PipelineStatus) => {
    if (dragging !== null) moveCard(dragging, status);
    setDragging(null); setDragOver(null);
  };

  const toggleExpand = (id: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const submitNote = async (id: number) => {
    const teks = (noteInputs[id] ?? '').trim();
    if (!teks) return;
    setNoteLoading(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_baru: teks }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // BUG (ketangkap type check 2026-07-26): dulu membaca `data.lead`, padahal
      // PATCH /api/admin/leads/:id membalas jsonOk({ pesan, lead }) sehingga
      // bentuknya {success, data:{pesan, lead}}. `data.lead` selalu undefined,
      // lalu `?? l.notes` menelan kegagalannya tanpa suara — catatan yang baru
      // ditambahkan tidak muncul di daftar sampai halaman dimuat ulang.
      const data = await bacaJson<{ pesan: string; lead: { notes: Note[] } }>(res);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, notes: data.data?.lead?.notes ?? l.notes } : l));
      setNoteInputs(prev => ({ ...prev, [id]: '' }));
    } catch {
      // silent — user can retry
    } finally {
      setNoteLoading(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  if (loading) return (
    <div className="space-y-5">
      <div className="h-8 w-48 bg-gray-200 rounded-xl animate-pulse" />
      <div className="flex gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-64 h-48 bg-gray-100 rounded-2xl animate-pulse flex-shrink-0" />
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#64748B]">
      <AlertCircle size={32} className="text-[#EF4444]" />
      <p className="text-sm">{error}</p>
      <button onClick={fetchLeads} className="text-xs px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
        Coba Lagi
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Manajemen Leads</h1>
          <p className="text-[#64748B] text-sm mt-0.5">{leads.length} total leads</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / properti / WA…"
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white w-52" />
        </div>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(col => {
            const cards = byStatus(col.id);
            return (
              <div key={col.id}
                className={`w-68 rounded-2xl flex flex-col transition-all ${dragOver === col.id ? 'ring-2' : ''}`}
                style={{ width: 272, background: dragOver === col.id ? col.bg : '#F8FAFC' } as React.CSSProperties}
                onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                onDrop={() => onDrop(col.id)}
                onDragLeave={() => setDragOver(null)}>
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-3 rounded-t-2xl" style={{ background: col.bg }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <span className="font-semibold text-sm" style={{ color: col.color }}>{col.label}</span>
                  </div>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: col.color }}>{cards.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 min-h-32">
                  {cards.map(lead => {
                    const expanded = expandedCards.has(lead.id);
                    const src = sourceLabel(lead.source_page);
                    return (
                      <div key={lead.id} draggable onDragStart={() => onDragStart(lead.id)} onDragEnd={onDragEnd}
                        className={`bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing transition-all ${dragging === lead.id ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-1.5">
                          <button
                            onClick={() => navigate(`/admin/leads/${lead.id}`)}
                            className="flex items-center gap-1.5 hover:opacity-70 transition-opacity text-left">
                            <div className="w-6 h-6 rounded-full bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
                              <User size={11} className="text-[#1565C0]" />
                            </div>
                            <span className="font-semibold text-xs text-[#0F172A] leading-tight">{lead.nama ?? '(tamu)'}</span>
                          </button>
                          <GripVertical size={13} className="text-[#CBD5E1] flex-shrink-0" />
                        </div>

                        {/* Properti — judul jadi link jika ada source_page URL */}
                        {lead.properti_title && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <Home size={10} className="text-[#94A3B8] flex-shrink-0" />
                            {lead.source_page?.startsWith('http') ? (
                              <a href={lead.source_page} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-[#1565C0] line-clamp-1 hover:underline">
                                {lead.properti_title}
                              </a>
                            ) : (
                              <span className="text-xs text-[#64748B] line-clamp-1">{lead.properti_title}</span>
                            )}
                          </div>
                        )}

                        {/* Pesan */}
                        {lead.pesan && (
                          <p className="text-xs text-[#94A3B8] italic line-clamp-2 mb-1.5">"{lead.pesan}"</p>
                        )}

                        {/* Meta */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white"
                              style={{ background: TIPE_COLORS[lead.tipe_pengirim ?? ''] ?? '#64748B' }}>
                              {TIPE_LABEL[lead.tipe_pengirim ?? ''] ?? (lead.tipe_pengirim ?? '–')}
                            </span>
                            {src && !lead.source_page?.startsWith('http') && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                                {src}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[#94A3B8]">
                            <Clock size={10} />
                            <span style={{ fontSize: '10px' }}>{relativeTime(lead.created_at)}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 pt-2 border-t border-gray-50">
                          {lead.no_wa ? (
                            <>
                              <a href={`tel:${lead.no_wa}`}
                                className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[#64748B] hover:bg-gray-50 transition-colors">
                                <Phone size={11} />
                                <span style={{ fontSize: '10px' }}>Telepon</span>
                              </a>
                              <a href={`https://wa.me/${lead.no_wa.replace(/\D/g, '')}?text=Halo ${encodeURIComponent(lead.nama ?? 'Tamu')}, saya dari SBP...`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[#10B981] hover:bg-[#F0FFF4] transition-colors">
                                <MessageCircle size={11} />
                                <span style={{ fontSize: '10px' }}>WhatsApp</span>
                              </a>
                            </>
                          ) : (
                            <span className="flex-1 text-[10px] text-[#94A3B8] italic py-1">
                              Belum ada kontak
                            </span>
                          )}
                          <div className="relative group">
                            <button className="p-1 rounded-lg text-[#64748B] hover:bg-gray-50 transition-colors">
                              <ChevronDown size={11} />
                            </button>
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-10 hidden group-hover:block w-36">
                              {COLUMNS.filter(c => c.id !== lead.status_pipeline).map(c => (
                                <button key={c.id} onClick={() => moveCard(lead.id, c.id)}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
                                  style={{ color: c.color }}>→ {c.label}</button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Notes section */}
                        <div className="mt-2 pt-2 border-t border-gray-50">
                          <button onClick={() => toggleExpand(lead.id)}
                            className="flex items-center gap-1 text-[10px] text-[#94A3B8] hover:text-[#64748B] transition-colors w-full">
                            <StickyNote size={10} />
                            <span>{lead.notes.length} catatan</span>
                            {expanded ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
                          </button>

                          {expanded && (
                            <div className="mt-2 space-y-1.5">
                              {lead.notes.map((n, i) => (
                                <div key={i} className="bg-[#FFFBEB] rounded-lg p-2">
                                  <p className="text-xs text-[#0F172A]">{n.teks}</p>
                                  <p className="text-[10px] text-[#94A3B8] mt-0.5">
                                    {n.admin} · {relativeTime(n.waktu)}
                                  </p>
                                </div>
                              ))}
                              <div className="flex gap-1 mt-1.5">
                                <input
                                  value={noteInputs[lead.id] ?? ''}
                                  onChange={e => setNoteInputs(p => ({ ...p, [lead.id]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submitNote(lead.id)}
                                  placeholder="Tambah catatan…"
                                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-[#1565C0]" />
                                <button onClick={() => submitNote(lead.id)}
                                  disabled={noteLoading.has(lead.id)}
                                  className="p-1.5 rounded-lg bg-[#1565C0] text-white hover:bg-[#0D47A1] transition-colors disabled:opacity-50">
                                  {noteLoading.has(lead.id)
                                    ? <Loader2 size={10} className="animate-spin" />
                                    : <Send size={10} />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

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
