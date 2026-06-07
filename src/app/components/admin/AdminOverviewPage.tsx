import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router';
import { TrendingUp, Home, Users, Eye, MessageCircle, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface AdminUser { sub: number; email: string; nama: string; role: string; }

interface Kpi {
  listing_published: number;  listing_draft: number;
  listing_sold: number;       listing_archived: number;
  leads_total: number;        leads_bulan_ini: number;  leads_bulan_lalu: number;
  wa_hari_ini: number;
  agreements_signed: number;  agreements_pending: number; agreements_total: number;
  views_total: number;        owners_total: number;
}
interface OverviewData {
  kpi: Kpi;
  leads_per_bulan:  { bulan: string; leads: number }[];
  distribusi_jenis: { name: string; value: number; color: string }[];
  aktivitas_terbaru: { tipe: string; teks: string; waktu: string; warna: string }[];
  views_per_hari:   { tanggal: string; views: number; wa_clicks: number }[];
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-gray-100" />
        <div className="w-8 h-4 bg-gray-100 rounded" />
      </div>
      <div className="w-16 h-7 bg-gray-100 rounded mb-1" />
      <div className="w-28 h-3 bg-gray-100 rounded" />
    </div>
  );
}

export default function AdminOverviewPage() {
  const admin = useOutletContext<AdminUser | null>();
  const [data, setData]       = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<'leads' | 'views'>('leads');

  useEffect(() => {
    fetch('/api/admin/overview', { credentials: 'include' })
      .then(r => r.json())
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.error ?? 'Gagal memuat data');
      })
      .catch(() => setError('Koneksi ke server gagal'))
      .finally(() => setLoading(false));
  }, []);

  const k = data?.kpi;
  const totalListing = k ? k.listing_published + k.listing_draft + k.listing_sold + k.listing_archived : 0;
  const deltaLeads   = k ? k.leads_bulan_ini - k.leads_bulan_lalu : 0;

  // 6 KPI cards — HANYA metrik yang bisa dihitung nyata dari DB
  const kpiCards = [
    {
      label: 'Properti Published',
      value: k?.listing_published,
      sub: k ? `Total semua status: ${totalListing}` : null,
      delta: null,        // tidak ada data historis per-bulan per status_publish
      icon: Home, color: '#1565C0', bg: '#E3F2FD',
    },
    {
      label: 'Leads Bulan Ini',
      value: k?.leads_bulan_ini,
      sub: k ? `Total semua waktu: ${k.leads_total}` : null,
      delta: k ? deltaLeads : null,   // delta = bulan ini vs bulan lalu
      icon: Users, color: '#10B981', bg: '#F0FFF4',
    },
    {
      label: 'Total Views (Kumulatif)',
      value: k?.views_total,
      sub: 'Semua listing, sepanjang waktu',
      delta: null,        // TODO: per-30-hari butuh tabel tracking event view tersendiri
      icon: Eye, color: '#7C3AED', bg: '#F5F3FF',
    },
    {
      label: 'Perjanjian Signed',
      value: k?.agreements_signed,
      sub: k ? `Pending: ${k.agreements_pending} | Total: ${k.agreements_total}` : null,
      delta: null,
      icon: FileText, color: '#F5A623', bg: '#FFF9E6',
    },
    {
      label: 'Kontak WA Hari Ini',
      value: k?.wa_hari_ini,
      sub: null,
      delta: null,
      icon: MessageCircle, color: '#EF4444', bg: '#FEF2F2',
    },
    {
      label: 'Properti Terjual (Total)',
      value: k?.listing_sold,
      sub: k ? `Draft: ${k.listing_draft} | Archived: ${k.listing_archived}` : null,
      delta: null,        // TODO: MTD butuh kolom sold_at yang belum ada di schema
      icon: TrendingUp, color: '#059669', bg: '#ECFDF5',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-[#0F172A]">
          Selamat datang, {admin?.nama ?? 'Admin'}
        </h1>
        <p className="text-[#64748B] text-sm mt-0.5">Ringkasan performa Salam Bumi Property</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : kpiCards.map(card => {
              const Icon = card.icon;
              const isUp = card.delta !== null && card.delta >= 0;
              return (
                <div key={card.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                      <Icon size={17} style={{ color: card.color }} />
                    </div>
                    {card.delta !== null && (
                      <div className={`flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                        {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {Math.abs(card.delta)}
                      </div>
                    )}
                  </div>
                  <div className="font-display font-bold text-2xl text-[#0F172A]">
                    {card.value ?? '—'}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">{card.label}</div>
                  {card.sub && <div className="text-[10px] text-[#94A3B8] mt-1">{card.sub}</div>}
                </div>
              );
            })
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart area dengan tab Leads / Views */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-[#0F172A]">
              {chartTab === 'leads' ? 'Leads per Bulan' : 'Views Harian (30 Hari)'}
            </h2>
            <div className="flex gap-1 bg-[#F1F5F9] rounded-lg p-0.5">
              {(['leads', 'views'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setChartTab(tab)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    chartTab === tab
                      ? 'bg-white text-[#0F172A] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {tab === 'leads' ? 'Leads' : 'Views'}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="h-[200px] bg-gray-50 rounded-xl animate-pulse" />
          ) : chartTab === 'leads' ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.leads_per_bulan ?? []} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} />
                <Bar dataKey="leads" fill="#1565C0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data?.views_per_hari ?? []} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="tanggal"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v.slice(5)} // MM-DD
                  interval={4}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                  labelFormatter={v => `Tgl ${v}`}
                />
                <Line dataKey="views" name="Views" stroke="#7C3AED" strokeWidth={2} dot={false} />
                <Line dataKey="wa_clicks" name="Klik WA" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart — Distribusi Jenis Properti */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-display font-semibold text-[#0F172A] mb-4">Distribusi Jenis</h2>
          {loading ? (
            <div className="h-[160px] bg-gray-50 rounded-xl animate-pulse" />
          ) : !data?.distribusi_jenis.length ? (
            <p className="text-sm text-[#94A3B8] text-center py-10">Belum ada data properti</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={data.distribusi_jenis} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {data.distribusi_jenis.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {data.distribusi_jenis.map(j => (
                  <div key={j.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: j.color }} />
                      <span className="text-[#64748B]">{j.name}</span>
                    </div>
                    <span className="font-semibold text-[#0F172A]">{j.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-display font-semibold text-[#0F172A] mb-4">Aktivitas Terbaru</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="w-2 h-2 rounded-full mt-1.5 bg-gray-200 flex-shrink-0" />
                <div className="flex-1 h-3 bg-gray-100 rounded" />
                <div className="w-10 h-3 bg-gray-100 rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : !data?.aktivitas_terbaru.length ? (
          <p className="text-sm text-[#94A3B8]">Belum ada aktivitas tercatat.</p>
        ) : (
          <div className="space-y-3">
            {data.aktivitas_terbaru.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.warna }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#374151] leading-snug">{a.teks}</p>
                </div>
                <span className="text-xs text-[#94A3B8] flex-shrink-0">{a.waktu}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
