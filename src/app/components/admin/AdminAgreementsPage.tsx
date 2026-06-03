import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FileText, ChevronRight, AlertCircle } from 'lucide-react';

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
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft:              { label: 'Draft',          bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' },
  opsi_dikonfigurasi: { label: 'Dikonfigurasi',  bg: '#EDE9FE', text: '#5B21B6', dot: '#7C3AED' },
  menunggu_ttd:       { label: 'Menunggu TTD',   bg: '#FEF9C3', text: '#854D0E', dot: '#F5A623' },
  signed:             { label: 'Signed',         bg: '#DCFCE7', text: '#166534', dot: '#16A34A' },
  expired:            { label: 'Expired',        bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
};

const FILTER_OPTIONS = [
  { value: '',             label: 'Semua' },
  { value: 'draft',        label: 'Draft' },
  { value: 'menunggu_ttd', label: 'Menunggu TTD' },
  { value: 'signed',       label: 'Signed' },
];

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminAgreementsPage() {
  const navigate = useNavigate();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    fetch(`/api/admin/agreements${qs}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) setAgreements(d.data.agreements ?? []);
        else setError(d.error ?? 'Gagal memuat data');
      })
      .catch(() => setError('Gagal memuat data'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-[#0F172A]">Titip Jual / Perjanjian</h1>
        <p className="text-[#64748B] text-sm mt-0.5">
          {loading ? 'Memuat…' : `${agreements.length} pengajuan`}
        </p>
      </div>

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
    </div>
  );
}
