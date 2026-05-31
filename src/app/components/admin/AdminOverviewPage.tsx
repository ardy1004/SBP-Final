import { useState, useEffect } from 'react';
import { TrendingUp, Home, Users, Eye, MessageCircle, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const KPI_DATA = [
  { label: 'Total Listing Aktif', value: 47, delta: +3, icon: Home, color: '#1565C0', bg: '#E3F2FD' },
  { label: 'Total Leads Bulan Ini', value: 128, delta: +22, icon: Users, color: '#10B981', bg: '#F0FFF4' },
  { label: 'Total Views (30 Hari)', value: '12.4K', delta: +8.2, icon: Eye, color: '#7C3AED', bg: '#F5F3FF' },
  { label: 'Perjanjian Ditandatangani', value: 9, delta: +2, icon: FileText, color: '#F5A623', bg: '#FFF9E6' },
  { label: 'Kontak WA Hari Ini', value: 14, delta: -2, icon: MessageCircle, color: '#EF4444', bg: '#FEF2F2' },
  { label: 'Properti Terjual (MTD)', value: 4, delta: +1, icon: TrendingUp, color: '#059669', bg: '#ECFDF5' },
];

const MONTHLY_LEADS = [
  { bulan: 'Des', leads: 62 }, { bulan: 'Jan', leads: 78 }, { bulan: 'Feb', leads: 91 },
  { bulan: 'Mar', leads: 104 }, { bulan: 'Apr', leads: 115 }, { bulan: 'Mei', leads: 128 },
];

const JENIS_CHART = [
  { name: 'Rumah', value: 21, color: '#1565C0' },
  { name: 'Kost', value: 12, color: '#29B6F6' },
  { name: 'Tanah', value: 7, color: '#10B981' },
  { name: 'Villa', value: 4, color: '#F5A623' },
  { name: 'Lainnya', value: 3, color: '#94A3B8' },
];

const ACTIVITY = [
  { waktu: '09:14', tipe: 'lead', teks: 'Lead baru: Budi Santoso → Rumah Condongcatur', warna: '#10B981' },
  { waktu: '09:02', tipe: 'view', teks: 'Listing SBP-045 dilihat 8× dalam 30 menit', warna: '#7C3AED' },
  { waktu: '08:51', tipe: 'sign', teks: 'Perjanjian SBP-032 ditandatangani oleh pemilik', warna: '#F5A623' },
  { waktu: '08:30', tipe: 'listing', teks: 'Listing baru dipublikasikan: Villa Ngemplak 3KT', warna: '#1565C0' },
  { waktu: '08:15', tipe: 'lead', teks: 'Lead baru: Dewi Kartika → Kost Eksklusif Mlati', warna: '#10B981' },
  { waktu: '07:50', tipe: 'sold', teks: 'Properti SBP-018 dimarkir TERJUAL', warna: '#EF4444' },
];

export default function AdminOverviewPage() {
  const [count, setCount] = useState(KPI_DATA.map(() => 0));

  useEffect(() => {
    const timer = setTimeout(() => {
      setCount(KPI_DATA.map(k => (typeof k.value === 'number' ? k.value : 0)));
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-[#0F172A]">Overview Dashboard</h1>
        <p className="text-[#64748B] text-sm mt-0.5">Ringkasan performa SBP hari ini, Minggu 31 Mei 2026</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {KPI_DATA.map((k, i) => {
          const Icon = k.icon;
          const isUp = k.delta >= 0;
          return (
            <div key={k.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: k.bg }}>
                  <Icon size={17} style={{ color: k.color }} />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(k.delta)}
                </div>
              </div>
              <div className="font-display font-bold text-2xl text-[#0F172A]">
                {typeof k.value === 'number' ? count[i] : k.value}
              </div>
              <div className="text-xs text-[#64748B] mt-0.5">{k.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-display font-semibold text-[#0F172A] mb-4">Leads per Bulan</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MONTHLY_LEADS} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} />
              <Bar dataKey="leads" fill="#1565C0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-display font-semibold text-[#0F172A] mb-4">Distribusi Jenis</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={JENIS_CHART} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                {JENIS_CHART.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {JENIS_CHART.map(j => (
              <div key={j.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: j.color }} />
                  <span className="text-[#64748B]">{j.name}</span>
                </div>
                <span className="font-semibold text-[#0F172A]">{j.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-display font-semibold text-[#0F172A] mb-4">Aktivitas Terbaru</h2>
        <div className="space-y-3">
          {ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.warna }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#374151] leading-snug">{a.teks}</p>
              </div>
              <span className="text-xs text-[#94A3B8] flex-shrink-0">{a.waktu}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
