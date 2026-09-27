import { bacaJson } from '../../../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { FileText, ChevronRight, AlertCircle, MessageCircle, Link2, Copy, Check } from 'lucide-react';

interface Agreement {
  id: number;
  kode_perjanjian: string;
  status: string;
  jenis_listing: string | null;
  jenis_transaksi: string;
  fee_persen: number | null;
  created_at: string;
  signed_at: string | null;
  nama_pemilik: string;
  jenis_properti: string;
  kecamatan: string;
  kabupaten: string;
  harga: number;
  /** Diisi bila perjanjian signed ini sudah punya versi perbaikan (migrasi 0053). */
  digantikan_oleh: number | null;
  /** Signed sebelum perbaikan isi kontrak 27 Sep 2026 dan isinya memang keliru. */
  perlu_versi_perbaikan: boolean;
  /** menunggu_ttd tapi link tanda tangannya sudah lewat masa berlaku. */
  link_kedaluwarsa: boolean;
}

/** Pemilik yang berhenti setelah Tahap 1 (GET /api/admin/titip-jual/tertunda). */
interface Tertunda {
  property_id: number;
  kode_listing: string;
  title: string | null;
  jenis_properti: string;
  tujuan: string;
  kecamatan: string | null;
  kabupaten: string | null;
  created_at: string;
  no_wa_1: string | null;
  no_wa_2: string | null;
  jumlah_foto: number;
  /** 1 = masuk lewat jalur cadangan tanpa Turnstile (migrasi 0055) — tinjau lebih teliti. */
  tanpa_captcha: number;
}

interface Ringkasan {
  tahap1_tertunda: number;
  perlu_konfigurasi: number;
  link_kedaluwarsa: number;
  perlu_versi_perbaikan: number;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft:              { label: 'Draft',          bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' },
  opsi_dikonfigurasi: { label: 'Dikonfigurasi',  bg: '#EDE9FE', text: '#5B21B6', dot: '#7C3AED' },
  menunggu_ttd:       { label: 'Menunggu TTD',   bg: '#FEF9C3', text: '#854D0E', dot: '#F5A623' },
  signed:             { label: 'Signed',         bg: '#DCFCE7', text: '#166534', dot: '#16A34A' },
  expired:            { label: 'Expired',        bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
};

// `kedaluwarsa` & `perbaikan` adalah saringan TURUNAN (bukan kolom status):
// servernya diminta satu status, lalu disaring di klien dengan flag dari API.
const FILTER_OPTIONS = [
  { value: '',             label: 'Semua' },
  { value: 'draft',        label: 'Draft' },
  { value: 'menunggu_ttd', label: 'Menunggu TTD' },
  { value: 'kedaluwarsa',  label: 'Link kedaluwarsa' },
  { value: 'signed',       label: 'Signed' },
  { value: 'perbaikan',    label: 'Perlu versi perbaikan' },
];
const STATUS_SERVER: Record<string, string> = { kedaluwarsa: 'menunggu_ttd', perbaikan: 'signed' };

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminAgreementsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'perjanjian' | 'tertunda'>('perjanjian');
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);

  useEffect(() => {
    fetch('/api/admin/titip-jual/ringkasan', { credentials: 'include' })
      .then(r => bacaJson<Ringkasan>(r))
      .then(d => { if (d.success && d.data) setRingkasan(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'perjanjian') return;
    setLoading(true);
    setError(null);
    const statusServer = STATUS_SERVER[statusFilter] ?? statusFilter;
    const qs = statusServer ? `?status=${encodeURIComponent(statusServer)}` : '';
    fetch(`/api/admin/agreements${qs}`, { credentials: 'include' })
      .then(r => bacaJson<{ agreements: Agreement[] }>(r))
      .then(d => {
        if (!d.success) { setError(d.error ?? 'Gagal memuat data'); return; }
        let list = d.data?.agreements ?? [];
        if (statusFilter === 'kedaluwarsa') list = list.filter(a => a.link_kedaluwarsa);
        if (statusFilter === 'perbaikan') list = list.filter(a => a.perlu_versi_perbaikan);
        setAgreements(list);
      })
      .catch(() => setError('Gagal memuat data'))
      .finally(() => setLoading(false));
  }, [statusFilter, tab]);

  const chip = (label: string, n: number | undefined, onClick: () => void) => (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl text-left border transition-colors ${n ? 'bg-amber-50 border-amber-200 hover:border-amber-400' : 'bg-white border-gray-100'}`}>
      <div className={`text-lg font-bold ${n ? 'text-amber-800' : 'text-[#94A3B8]'}`}>{n ?? '–'}</div>
      <div className="text-[11px] text-[#64748B] leading-tight">{label}</div>
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-[#0F172A]">Titip Jual / Perjanjian</h1>
        <p className="text-[#64748B] text-sm mt-0.5">Pengajuan pemilik properti dan perjanjian pemasarannya</p>
      </div>

      {/* Yang menunggu tindakan admin */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {chip('Belum lengkapi data diri', ringkasan?.tahap1_tertunda, () => setTab('tertunda'))}
        {chip('Draft perlu dikonfigurasi', ringkasan?.perlu_konfigurasi, () => { setTab('perjanjian'); setStatusFilter('draft'); })}
        {chip('Link TTD kedaluwarsa', ringkasan?.link_kedaluwarsa, () => { setTab('perjanjian'); setStatusFilter('kedaluwarsa'); })}
        {chip('Perlu versi perbaikan', ringkasan?.perlu_versi_perbaikan, () => { setTab('perjanjian'); setStatusFilter('perbaikan'); })}
      </div>

      {/* Tab */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['perjanjian', 'Perjanjian'], ['tertunda', 'Belum lengkapi data diri']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${tab === v ? 'border-[#1565C0] text-[#1565C0]' : 'border-transparent text-[#64748B] hover:text-[#0F172A]'}`}>
            {l}{v === 'tertunda' && ringkasan?.tahap1_tertunda ? ` (${ringkasan.tahap1_tertunda})` : ''}
          </button>
        ))}
      </div>

      {tab === 'tertunda' ? <TabTertunda /> : (
        <>
          {/* Filter Pills */}
          <div className="flex gap-2 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  statusFilter === opt.value
                    ? 'bg-[#1565C0] text-white border-[#1565C0]'
                    : 'bg-white text-[#64748B] border-gray-200 hover:border-[#1565C0] hover:text-[#1565C0]'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-7 h-7 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center py-14 text-center px-6">
                <AlertCircle size={28} className="text-[#EF4444] mb-3" />
                <p className="text-[#64748B] text-sm">{error}</p>
              </div>
            ) : agreements.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
                  <FileText size={24} className="text-[#94A3B8]" />
                </div>
                <p className="font-medium text-[#0F172A] mb-1">
                  {statusFilter ? 'Tidak ada pengajuan dengan filter ini' : 'Belum ada pengajuan titip jual'}
                </p>
                <p className="text-[#64748B] text-sm">
                  Pengajuan dari pemilik properti akan muncul di sini
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">
                        Nama Owner
                      </th>
                      <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden sm:table-cell">
                        Properti
                      </th>
                      <th className="p-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden md:table-cell">
                        Tanggal Masuk
                      </th>
                      <th className="p-3 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">
                        Status
                      </th>
                      <th className="p-3 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {agreements.map(agr => {
                      const sc = STATUS_CONFIG[agr.status] ?? STATUS_CONFIG.draft;
                      return (
                        <tr key={agr.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="p-3">
                            <div className="font-medium text-[#0F172A] text-sm leading-snug">
                              {agr.nama_pemilik}
                            </div>
                            <div className="text-xs text-[#94A3B8] mt-0.5">{agr.kode_perjanjian}</div>
                          </td>
                          <td className="p-3 hidden sm:table-cell">
                            <div className="text-sm text-[#374151] capitalize">{agr.jenis_properti}</div>
                            <div className="text-xs text-[#94A3B8]">
                              {agr.kecamatan}{agr.kabupaten ? `, ${agr.kabupaten}` : ''}
                            </div>
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <div className="text-sm text-[#374151]">{formatDate(agr.created_at)}</div>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                              style={{ background: sc.bg, color: sc.text }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc.dot }} />
                              {sc.label}
                            </span>
                            {agr.link_kedaluwarsa && (
                              <div className="mt-1 text-[11px] font-semibold text-red-700 whitespace-nowrap">Link kedaluwarsa</div>
                            )}
                            {agr.perlu_versi_perbaikan && (
                              <div className="mt-1 text-[11px] font-semibold text-amber-700 whitespace-nowrap">Perlu versi perbaikan</div>
                            )}
                            {agr.digantikan_oleh && (
                              <div className="mt-1 text-[11px] text-[#94A3B8] whitespace-nowrap">Digantikan</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => navigate(`/admin/agreements/${agr.id}`)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#1565C0] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors">
                              Detail <ChevronRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Pemilik yang berhenti setelah Tahap 1: properti + WA sudah tercatat, data diri
 * belum. "Kirim link lanjutan" menerbitkan tiket Tahap 2 baru (7 hari) yang
 * membuka form data diri LANGSUNG — tanpa mengisi ulang properti (yang dulu
 * melahirkan listing ganda).
 */
function TabTertunda() {
  const navigate = useNavigate();
  const [list, setList] = useState<Tertunda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<Record<number, { url: string; wa_url: string | null } | string>>({});
  const [disalin, setDisalin] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/titip-jual/tertunda', { credentials: 'include' })
      .then(r => bacaJson<{ pengajuan: Tertunda[] }>(r))
      .then(d => { if (d.success) setList(d.data?.pengajuan ?? []); else setError(d.error ?? 'Gagal memuat data'); })
      .catch(() => setError('Gagal memuat data'))
      .finally(() => setLoading(false));
  }, []);

  const buatLink = useCallback(async (id: number) => {
    setLink(p => ({ ...p, [id]: 'memuat' }));
    try {
      const r = await fetch(`/api/admin/titip-jual/${id}/link-lanjut`, { method: 'POST', credentials: 'include' });
      const d = await bacaJson<{ url: string; wa_url: string | null }>(r);
      if (d.success && d.data) setLink(p => ({ ...p, [id]: d.data! }));
      else setLink(p => ({ ...p, [id]: d.error ?? 'Gagal membuat link' }));
    } catch {
      setLink(p => ({ ...p, [id]: 'Gagal menghubungi server' }));
    }
  }, []);

  const salin = (id: number, url: string) => {
    navigator.clipboard.writeText(url).then(() => { setDisalin(id); setTimeout(() => setDisalin(null), 2000); });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (list.length === 0) {
    return <p className="text-sm text-[#64748B] py-8 text-center">Tidak ada pemilik yang berhenti di tahap properti.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#64748B]">
        Pemilik ini sudah mengirim data properti dan nomor WA, tapi belum melengkapi data diri — perjanjian
        belum bisa dibuat. Hubungi via WA, lalu kirim link lanjutan (berlaku 7 hari) agar ia cukup mengisi data diri.
      </p>
      {list.map(t => {
        const l = link[t.property_id];
        return (
          <div key={t.property_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-[#0F172A]">
                  {t.kode_listing}{t.title ? ` · ${t.title}` : ''}
                  {t.tanpa_captcha === 1 && (
                    <span className="ml-2 align-middle px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold"
                      title="Dikirim lewat jalur cadangan tanpa verifikasi anti-bot — pastikan pengirimnya nyata sebelum ditindaklanjuti">
                      Tanpa verifikasi
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#64748B] capitalize">
                  {t.jenis_properti} · {t.tujuan.replace('_', ' & ')} · {[t.kecamatan, t.kabupaten].filter(Boolean).join(', ') || 'lokasi belum diisi'}
                  {' '}· {t.jumlah_foto} foto · masuk {formatDate(t.created_at)}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigate(`/admin/listing/${t.property_id}`)}
                  className="px-3 py-1.5 text-xs font-semibold text-[#475569] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-lg">
                  Lihat properti
                </button>
                {t.no_wa_1 && (
                  <a href={`https://wa.me/${t.no_wa_1}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-lg">
                    <MessageCircle size={12} /> WA {t.no_wa_1}
                  </a>
                )}
                <button onClick={() => buatLink(t.property_id)} disabled={l === 'memuat'}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#1565C0] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg disabled:opacity-50">
                  <Link2 size={12} /> {l === 'memuat' ? 'Membuat…' : 'Kirim link lanjutan'}
                </button>
              </div>
            </div>
            {typeof l === 'string' && l !== 'memuat' && <p className="text-xs text-red-600">{l}</p>}
            {typeof l === 'object' && (
              <div className="flex items-center gap-2 flex-wrap bg-[#F8FAFC] rounded-xl p-2">
                <code className="text-[11px] text-[#475569] truncate max-w-full sm:max-w-md">{l.url}</code>
                <button onClick={() => salin(t.property_id, l.url)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#1565C0] hover:underline">
                  {disalin === t.property_id ? <><Check size={11} /> Tersalin</> : <><Copy size={11} /> Salin</>}
                </button>
                {l.wa_url && (
                  <a href={l.wa_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#16A34A] hover:underline">
                    <MessageCircle size={11} /> Kirim lewat WA
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
