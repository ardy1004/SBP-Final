import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Phone, MessageCircle, Clock, Home, ExternalLink,
  Send, Loader2, AlertCircle, StickyNote,
} from 'lucide-react';

type PipelineStatus = 'baru' | 'dihubungi' | 'negosiasi' | 'closing' | 'arsip';

interface Note { teks: string; admin: string; waktu: string; }

interface Properti {
  id: number;
  title: string;
  slug: string;
  jenis_properti: string;
  tujuan: 'dijual' | 'disewa' | 'dijual_disewa';
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
}

interface LeadDetail {
  id: number;
  nama: string | null;
  no_wa: string | null;
  asal_daerah: string | null;
  tipe_pengirim: string | null;
  budget: string | null;
  rencana_pembayaran: string | null;
  pesan: string | null;
  source_page: string | null;
  wa_clicked_at: string | null;
  status_pipeline: PipelineStatus;
  notes: Note[];
  created_at: string;
  updated_at: string;
  properti: Properti | null;
}

const COLUMNS: { id: PipelineStatus; label: string; color: string; bg: string }[] = [
  { id: 'baru',       label: 'Baru',       color: '#1565C0', bg: '#EFF6FF' },
  { id: 'dihubungi',  label: 'Dihubungi',  color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'negosiasi',  label: 'Negosiasi',  color: '#F5A623', bg: '#FFF9E6' },
  { id: 'closing',    label: 'Closing ✓',  color: '#10B981', bg: '#F0FFF4' },
  { id: 'arsip',      label: 'Arsip',       color: '#64748B', bg: '#F1F5F9' },
];

const CONFIRM_STATUSES = new Set<PipelineStatus>(['closing', 'arsip']);

const TIPE_LABEL: Record<string, string> = {
  pembeli: 'Pembeli', penjual: 'Penjual', broker: 'Broker', quick_wa: 'Klik Cepat WA',
};

function normalizeWA(raw: string | null): string {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('62')) return d;
  if (d.startsWith('0'))  return '62' + d.slice(1);
  if (d.startsWith('8'))  return '62' + d;
  return d;
}

function statusConfig(status: PipelineStatus) {
  return COLUMNS.find(c => c.id === status) ?? COLUMNS[0];
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function propertyUrl(p: Properti): string {
  const jenis = p.jenis_properti.toLowerCase();
  const prov  = p.provinsi.toLowerCase().replace(/\s+/g, '-');
  const kab   = p.kabupaten.toLowerCase().replace(/\s+/g, '-');
  const kec   = (p.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const base  = p.tujuan === 'disewa' ? '/disewa' : '/dijual';
  return `${base}/${jenis}/${prov}/${kab}/${kec}/${p.slug}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide sm:w-32 flex-shrink-0 mb-0.5 sm:mb-0">
        {label}
      </dt>
      <dd className="text-sm text-[#0F172A] font-medium">{value ?? '—'}</dd>
    </div>
  );
}

export default function AdminLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData]       = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [statusSaving, setStatusSaving] = useState(false);

  const [noteText, setNoteText]       = useState('');
  const [noteSaving, setNoteSaving]   = useState(false);
  const [noteError, setNoteError]     = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/admin/leads/${id}`, { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Gagal memuat data');
    setData(json.data.lead);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadDetail()
      .catch(err => setError(err.message ?? 'Gagal memuat data'))
      .finally(() => setLoading(false));
  }, [loadDetail]);

  const handleStatusChange = async (status: PipelineStatus) => {
    if (!data || status === data.status_pipeline) return;
    if (CONFIRM_STATUSES.has(status)) {
      const label = statusConfig(status).label;
      if (!window.confirm(`Ubah status lead ini menjadi "${label}"?`)) return;
    }
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_pipeline: status }),
      });
      const json = await res.json();
      if (json.success) setData(json.data.lead);
    } finally {
      setStatusSaving(false);
    }
  };

  const handleAddNote = async () => {
    const teks = noteText.trim();
    if (!teks) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_baru: teks }),
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data.lead);
        setNoteText('');
      } else {
        setNoteError(json.error ?? 'Gagal menyimpan catatan');
      }
    } catch {
      setNoteError('Gagal menghubungi server');
    } finally {
      setNoteSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-7 h-7 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <AlertCircle size={28} className="text-[#EF4444] mb-3" />
        <p className="text-[#64748B] text-sm">{error ?? 'Lead tidak ditemukan'}</p>
        <button onClick={() => navigate('/admin/leads')}
          className="mt-4 text-sm text-[#1565C0] hover:underline">
          ← Kembali ke daftar
        </button>
      </div>
    );
  }

  const sc = statusConfig(data.status_pipeline);
  const waNumber = normalizeWA(data.no_wa);
  const notesSorted = [...data.notes].sort((a, b) => (a.waktu < b.waktu ? 1 : -1));

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/admin/leads')}
          className="p-2 rounded-xl text-[#64748B] hover:bg-white hover:text-[#0F172A] transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-lg font-bold text-[#0F172A]">{data.nama ?? '(tamu)'}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
          </div>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Masuk: {formatDateTime(data.created_at)} · Update: {formatDateTime(data.updated_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ─── Kolom kiri — Info Lead ────────────────────────────── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ background: sc.color }}>
              {(data.nama ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#0F172A] truncate">{data.nama ?? '(tamu)'}</p>
              {data.tipe_pengirim && (
                <p className="text-xs text-[#64748B]">{TIPE_LABEL[data.tipe_pengirim] ?? data.tipe_pengirim}</p>
              )}
            </div>
          </div>

          <dl className="space-y-2.5">
            <InfoRow label="No WA" value={data.no_wa
              ? <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="text-[#10B981] hover:underline">{data.no_wa}</a>
              : <span className="text-[#94A3B8] italic text-xs">Tidak ada</span>} />
            <InfoRow label="Asal Daerah" value={data.asal_daerah} />
            <InfoRow label="Budget" value={data.budget} />
            <InfoRow label="Rencana Bayar" value={data.rencana_pembayaran} />
            <InfoRow label="Source" value={data.source_page} />
          </dl>

          {data.pesan && (
            <div>
              <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">Pesan</p>
              <div className="bg-[#F8FAFC] border border-gray-100 rounded-xl p-3 text-sm text-[#374151]">
                {data.pesan}
              </div>
            </div>
          )}

          {data.properti && (
            <div>
              <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">Properti Terkait</p>
              <a href={propertyUrl(data.properti)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#F8FAFC] border border-gray-100 rounded-xl p-3 hover:bg-[#EFF6FF] transition-colors">
                <Home size={15} className="text-[#1565C0] flex-shrink-0" />
                <span className="text-sm text-[#1565C0] font-medium truncate">{data.properti.title}</span>
                <ExternalLink size={12} className="text-[#94A3B8] flex-shrink-0 ml-auto" />
              </a>
            </div>
          )}

          {data.no_wa && (
            <a href={`https://wa.me/${waNumber}?text=Halo ${encodeURIComponent(data.nama ?? 'Tamu')}, saya dari SBP...`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#25D366] hover:bg-[#1ebe57] transition-colors">
              <MessageCircle size={16} />
              Hubungi via WA
            </a>
          )}
        </div>

        {/* ─── Kolom kanan — Pipeline & Catatan ──────────────────── */}
        <div className="space-y-5">

          {/* Pipeline */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-display font-semibold text-[#0F172A] text-sm mb-3">Status Pipeline</h2>
            <select
              value={data.status_pipeline}
              disabled={statusSaving}
              onChange={e => handleStatusChange(e.target.value as PipelineStatus)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white disabled:opacity-60">
              {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {statusSaving && (
              <p className="text-xs text-[#94A3B8] mt-2 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Menyimpan...
              </p>
            )}
          </div>

          {/* Catatan */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <StickyNote size={15} className="text-[#F5A623]" />
              <h2 className="font-display font-semibold text-[#0F172A] text-sm">Catatan ({notesSorted.length})</h2>
            </div>

            <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
              {notesSorted.length === 0 && (
                <p className="text-xs text-[#94A3B8] italic">Belum ada catatan.</p>
              )}
              {notesSorted.map((n, i) => (
                <div key={i} className="bg-[#FFFBEB] rounded-xl p-3">
                  <p className="text-sm text-[#0F172A]">{n.teks}</p>
                  <p className="text-[11px] text-[#94A3B8] mt-1 flex items-center gap-1">
                    <Clock size={10} /> {n.admin} · {formatDateTime(n.waktu)}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                placeholder="Tambah catatan baru…"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] focus:ring-1 focus:ring-[#1565C0]/20 transition-colors resize-none"
              />
              {noteError && (
                <p className="text-xs text-[#EF4444] flex items-center gap-1">
                  <AlertCircle size={12} /> {noteError}
                </p>
              )}
              <button onClick={handleAddNote} disabled={noteSaving || !noteText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] disabled:opacity-60 transition-colors">
                {noteSaving
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Send size={13} />}
                Simpan Catatan
              </button>
            </div>
          </div>

          {data.no_wa && (
            <a href={`tel:${data.no_wa}`}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#64748B] bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
              <Phone size={14} /> Telepon {data.no_wa}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
