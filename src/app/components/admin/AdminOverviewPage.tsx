import { bacaJson } from '../../../lib/api';
import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router';
import { TrendingUp, Home, Users, Eye, MessageCircle, FileText, ArrowUpRight, ArrowDownRight, BarChart3, Settings, Video } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { findArchetype } from './viralframe/archetypes';

// Sama seperti AdminViralFrameAgentVideosPage.tsx: `gaya` disimpan sebagai ID
// arketipe, diterjemahkan ke label hanya saat ditampilkan.
function labelGaya(id: string): string {
  return findArchetype(id)?.label ?? id;
}

// Judul kelompok section — accent bar dari palet yang sudah dipakai di file
// ini (bukan warna baru), supaya scroll panjang tab Ringkasan mudah dipindai
// per kelompok alih-alih satu tumpukan card sejenis yang rata.
function SectionTitle({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-4 rounded-full" style={{ background: accent }} />
      <h2 className="font-display font-bold text-sm text-[#0F172A]">{title}</h2>
    </div>
  );
}

interface Ga4Trend { date: string; activeUsers: number; pageviews: number; sessions: number }
interface Ga4TopPage { pagePath: string; pageTitle: string; views: number }
interface Ga4Channel { channel: string; sessions: number }
interface Ga4City { city: string; activeUsers: number }
interface Ga4Device { device: string; activeUsers: number }
interface Ga4NewVsReturning { type: string; activeUsers: number }
interface Ga4Summary {
  trend: Ga4Trend[]; topPages: Ga4TopPage[]; channels: Ga4Channel[];
  cities: Ga4City[]; devices: Ga4Device[]; newVsReturning: Ga4NewVsReturning[];
}
const GA4_CHANNEL_COLORS = ['#1565C0', '#7C3AED', '#10B981', '#F5A623', '#EF4444', '#06B6D4', '#EC4899'];

const DEVICE_LABEL: Record<string, string> = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' };
const NEW_VS_RETURNING_LABEL: Record<string, string> = { new: 'Baru', returning: 'Kembali' };

interface AdminUser { sub: number; email: string; nama: string; role: string; }

interface Kpi {
  listing_published: number;  listing_draft: number;
  listing_sold: number;       listing_archived: number;
  leads_total: number;        leads_bulan_ini: number;  leads_bulan_lalu: number;
  wa_hari_ini: number;
  agreements_signed: number;  agreements_pending: number; agreements_total: number;
  views_total: number;        owners_total: number;
}
interface TopProperty { id: number; title: string; kode_listing: string; views_30d: number; leads_count: number }
interface VfAnalyticsItem { gaya: string; jumlah: number; avg_views: number; avg_likes: number; total_views: number }
interface SebaranLokasi { kota: string; jumlah: number }

interface OverviewData {
  kpi: Kpi;
  leads_per_bulan:  { bulan: string; leads: number }[];
  distribusi_jenis: { name: string; value: number; color: string }[];
  aktivitas_terbaru: { tipe: string; teks: string; waktu: string; warna: string }[];
  views_per_hari:   { tanggal: string; views: number; wa_clicks: number }[];
  top_properties:   TopProperty[];
  sebaran_lokasi:   SebaranLokasi[];
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
  const [gaData, setGaData]       = useState<Ga4Summary | null>(null);
  const [gaLoading, setGaLoading] = useState(true);
  const [gaError, setGaError]     = useState<string | null>(null);
  const [gaNotConfigured, setGaNotConfigured] = useState(false);
  const [vfAnalytics, setVfAnalytics] = useState<VfAnalyticsItem[]>([]);

  useEffect(() => {
    fetch('/api/admin/overview', { credentials: 'include' })
      .then(r => bacaJson(r))
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.error ?? 'Gagal memuat data');
      })
      .catch(() => setError('Koneksi ke server gagal'))
      .finally(() => setLoading(false));

    fetch('/api/admin/analytics/ga4-summary', { credentials: 'include' })
      .then(async r => {
        const res = await bacaJson(r);
        if (res.success) { setGaData(res.data); return; }
        if (r.status === 422) setGaNotConfigured(true);
        else setGaError(res.error ?? 'Gagal memuat data GA4');
      })
      .catch(() => setGaError('Koneksi ke Google Analytics gagal'))
      .finally(() => setGaLoading(false));

    // Best-effort: kartu ringkasan ViralFrame, silent kalau gagal/kosong — tidak
    // boleh mem-block render Ringkasan yang lain.
    fetch('/api/admin/viralframe/analytics', { credentials: 'include' })
      .then(r => bacaJson(r))
      .then(res => { if (res.success) setVfAnalytics(res.data?.items ?? []); })
      .catch(() => {});
  }, []);

  const k = data?.kpi;
  const totalListing = k ? k.listing_published + k.listing_draft + k.listing_sold + k.listing_archived : 0;
  const deltaLeads   = k ? k.leads_bulan_ini - k.leads_bulan_lalu : 0;
  const maxLokasi = data?.sebaran_lokasi.length
    ? Math.max(...data.sebaran_lokasi.map(l => l.jumlah))
    : 0;

  // Guard ringkas dipakai 3 mini-widget bersumber GA4 di section "Audiens &
  // Lokasi" — beda dari guard penuh section "Analitik Website" di bawah:
  // di sini HANYA area GA4-nya yang tersembunyi, widget first-party di
  // sebelahnya (Sebaran Lokasi Audiens) tetap tampil normal.
  const gaGuard = gaNotConfigured
    ? <p className="text-xs text-[#94A3B8] py-4">GA4 belum terhubung.</p>
    : gaError
    ? <p className="text-xs text-red-500 py-4">⚠️ {gaError}</p>
    : null;

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
    <div className="space-y-8">
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

      {/* ═══ SECTION: Performa Bisnis ═══ */}
      <div>
        <SectionTitle title="Performa Bisnis" accent="#1565C0" />
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Chart area dengan tab Leads / Views */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-[#0F172A]">
                  {chartTab === 'leads' ? 'Leads per Bulan' : 'Views Harian (30 Hari)'}
                </h3>
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
              <h3 className="font-display font-semibold text-[#0F172A] mb-4">Distribusi Jenis</h3>
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

          {/* Properti Terpopuler — ranking leads dulu, views 30 hari sebagai tiebreak */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-display font-semibold text-[#0F172A] mb-4">Properti Terpopuler (30 Hari)</h3>
            {loading ? (
              <div className="h-[160px] bg-gray-50 rounded-xl animate-pulse" />
            ) : !data?.top_properties.length ? (
              <p className="text-sm text-[#94A3B8] text-center py-8">Belum ada data views 30 hari terakhir.</p>
            ) : (
              <div className="space-y-1">
                {data.top_properties.map(p => (
                  <Link
                    key={p.id}
                    to={`/admin/listing/${p.id}`}
                    className="flex items-center justify-between gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg border-b border-gray-50 last:border-0 hover:bg-[#F8FAFC]"
                  >
                    <div className="min-w-0">
                      <div className="text-[#0F172A] truncate font-medium">{p.title}</div>
                      <div className="text-[#94A3B8]">{p.kode_listing}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[#64748B]">{p.views_30d} views</span>
                      <span className="font-semibold text-[#10B981]">{p.leads_count} leads</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SECTION: Audiens & Lokasi ═══ */}
      <div>
        <SectionTitle title="Audiens & Lokasi" accent="#7C3AED" />
        <p className="text-xs text-[#94A3B8] mb-3">
          GA4 = semua pengunjung situs · Klik = yang benar-benar tertarik (kartu properti/WA)
        </p>
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Kota Pengunjung — GA4, semua kunjungan */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-display font-semibold text-[#0F172A] mb-4">
                Kota Pengunjung <span className="text-[10px] font-normal text-[#94A3B8]">(GA4)</span>
              </h3>
              {gaLoading ? (
                <div className="h-[160px] bg-gray-50 rounded-xl animate-pulse" />
              ) : gaGuard ?? (!gaData?.cities.length ? (
                <p className="text-sm text-[#94A3B8] py-4">Belum ada data.</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxCity = Math.max(...gaData.cities.map(c => c.activeUsers));
                    return gaData.cities.map(c => (
                      <div key={c.city} className="flex items-center gap-3 text-xs">
                        <span className="w-20 flex-shrink-0 truncate text-[#374151]">{c.city}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#7C3AED] rounded-full" style={{ width: `${(c.activeUsers / maxCity) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-semibold text-[#0F172A]">{c.activeUsers}</span>
                      </div>
                    ));
                  })()}
                </div>
              ))}
            </div>

            {/* Sebaran Lokasi Audiens — first-party, dari property_click_geo (klik kartu + WA) */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-display font-semibold text-[#0F172A] mb-4">
                Sebaran Lokasi Audiens <span className="text-[10px] font-normal text-[#94A3B8]">(Klik)</span>
              </h3>
              {loading ? (
                <div className="h-[160px] bg-gray-50 rounded-xl animate-pulse" />
              ) : !data?.sebaran_lokasi.length ? (
                <p className="text-sm text-[#94A3B8] text-center py-8">Belum ada data lokasi tercatat.</p>
              ) : (
                <div className="space-y-2">
                  {data.sebaran_lokasi.map(l => (
                    <div key={l.kota} className="flex items-center gap-3 text-xs">
                      <span className="w-20 flex-shrink-0 truncate text-[#374151]">{l.kota}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1565C0] rounded-full" style={{ width: `${(l.jumlah / maxLokasi) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right font-semibold text-[#0F172A]">{l.jumlah}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Perangkat */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-display font-semibold text-[#0F172A] mb-4">Perangkat</h3>
              {gaLoading ? (
                <div className="h-[80px] bg-gray-50 rounded-xl animate-pulse" />
              ) : gaGuard ?? (!gaData?.devices.length ? (
                <p className="text-sm text-[#94A3B8] py-4">Belum ada data.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const total = gaData.devices.reduce((s, d) => s + d.activeUsers, 0);
                    return gaData.devices.map(d => (
                      <div key={d.device} className="flex-1 min-w-[80px] bg-[#F8FAFC] rounded-xl p-2.5 text-center">
                        <div className="font-display font-bold text-lg text-[#0F172A]">{d.activeUsers}</div>
                        <div className="text-[10px] text-[#64748B]">{DEVICE_LABEL[d.device] ?? d.device}</div>
                        <div className="text-[10px] text-[#94A3B8]">{total ? Math.round((d.activeUsers / total) * 100) : 0}%</div>
                      </div>
                    ));
                  })()}
                </div>
              ))}
            </div>

            {/* Pengunjung Baru vs Kembali */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-display font-semibold text-[#0F172A] mb-4">Pengunjung Baru vs Kembali</h3>
              {gaLoading ? (
                <div className="h-[80px] bg-gray-50 rounded-xl animate-pulse" />
              ) : gaGuard ?? (!gaData?.newVsReturning.length ? (
                <p className="text-sm text-[#94A3B8] py-4">Belum ada data.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const total = gaData.newVsReturning.reduce((s, n) => s + n.activeUsers, 0);
                    return gaData.newVsReturning.map(n => (
                      <div key={n.type} className="flex-1 min-w-[80px] bg-[#F8FAFC] rounded-xl p-2.5 text-center">
                        <div className="font-display font-bold text-lg text-[#0F172A]">{n.activeUsers}</div>
                        <div className="text-[10px] text-[#64748B]">{NEW_VS_RETURNING_LABEL[n.type] ?? n.type}</div>
                        <div className="text-[10px] text-[#94A3B8]">{total ? Math.round((n.activeUsers / total) * 100) : 0}%</div>
                      </div>
                    ));
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION: Analitik Website (GA4) ═══ */}
      <div>
        <SectionTitle title="Analitik Website (Google Analytics)" accent="#06B6D4" />
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-[#1565C0]" />
            <span className="text-xs text-[#94A3B8]">30 hari terakhir</span>
          </div>

          {gaLoading ? (
            <div className="h-[200px] bg-gray-50 rounded-xl animate-pulse" />
          ) : gaNotConfigured ? (
            <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
              <p className="text-sm text-[#64748B]">Google Analytics belum terhubung.</p>
              <p className="text-xs text-[#94A3B8] mt-1">Isi GA4 Property ID di Pengaturan → Tracking &amp; Analytics untuk mengaktifkan widget ini.</p>
              <Link to="/admin/pengaturan" className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF]">
                <Settings size={13} /> Buka Pengaturan
              </Link>
            </div>
          ) : gaError ? (
            <div className="text-center py-8 border border-dashed border-red-200 rounded-xl bg-red-50">
              <p className="text-sm text-red-700">⚠️ {gaError}</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-[#64748B] mb-2">Pengunjung &amp; Pageview Harian</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={gaData?.trend ?? []} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} labelFormatter={v => `Tgl ${v}`} />
                    <Line dataKey="activeUsers" name="Pengunjung" stroke="#1565C0" strokeWidth={2} dot={false} />
                    <Line dataKey="pageviews" name="Pageview" stroke="#7C3AED" strokeWidth={2} dot={false} />
                    <Line dataKey="sessions" name="Sesi" stroke="#10B981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs font-semibold text-[#64748B] mb-2">Halaman Terpopuler</h3>
                  {!gaData?.topPages.length ? (
                    <p className="text-sm text-[#94A3B8] py-4">Belum ada data.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {gaData.topPages.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                          <div className="min-w-0">
                            <div className="text-[#0F172A] truncate">{p.pageTitle || p.pagePath}</div>
                            <div className="text-[#94A3B8] truncate">{p.pagePath}</div>
                          </div>
                          <span className="font-semibold text-[#0F172A] flex-shrink-0">{p.views}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[#64748B] mb-2">Sumber Trafik</h3>
                  {!gaData?.channels.length ? (
                    <p className="text-sm text-[#94A3B8] py-4">Belum ada data.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie data={gaData.channels} dataKey="sessions" nameKey="channel" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                            {gaData.channels.map((_, i) => <Cell key={i} fill={GA4_CHANNEL_COLORS[i % GA4_CHANNEL_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-1">
                        {gaData.channels.map((c, i) => (
                          <div key={c.channel} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: GA4_CHANNEL_COLORS[i % GA4_CHANNEL_COLORS.length] }} />
                              <span className="text-[#64748B]">{c.channel}</span>
                            </div>
                            <span className="font-semibold text-[#0F172A]">{c.sessions}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ SECTION: Konten & Aktivitas ═══ */}
      <div>
        <SectionTitle title="Konten & Aktivitas" accent="#F5A623" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Ringkasan ViralFrame — highlight gaya terbaik, detail lengkap ada di
              halaman Konten Agent (situ jugalah panel "Performa per Gaya" aslinya). */}
          {vfAnalytics.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#FFF9E6' }}>
                  <Video size={17} style={{ color: '#F5A623' }} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-[#64748B]">Gaya video terbaik</div>
                  <div className="font-display font-semibold text-[#0F172A] truncate">
                    {labelGaya(vfAnalytics[0].gaya)} · rata-rata {vfAnalytics[0].avg_views.toLocaleString('id-ID')} views
                  </div>
                </div>
              </div>
              <Link to="/admin/viralframe/agent-videos" className="text-xs font-semibold text-[#1565C0] flex-shrink-0 hover:underline">
                Lihat detail →
              </Link>
            </div>
          )}

          {/* Activity Feed */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-display font-semibold text-[#0F172A] mb-4">Aktivitas Terbaru</h3>
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
      </div>
    </div>
  );
}
