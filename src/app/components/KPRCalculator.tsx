import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatRupiahFull } from '../data/mockData';

interface Props {
  defaultHarga?: number;
}

export default function KPRCalculator({ defaultHarga = 500000000 }: Props) {
  const [harga, setHarga] = useState(defaultHarga);
  const [dp, setDp] = useState(20);
  const [rate, setRate] = useState(7);
  const [tenor, setTenor] = useState(15);
  const [showTable, setShowTable] = useState(false);

  const calc = useMemo(() => {
    const P = harga * (1 - dp / 100);
    const i = rate / 100 / 12;
    const n = tenor * 12;
    const M = i === 0 ? P / n : P * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    const totalPayment = M * n;
    const totalBunga = totalPayment - P;
    return { M, P, totalPayment, totalBunga, n };
  }, [harga, dp, rate, tenor]);

  const chartData = [
    { name: 'Pokok', value: calc.P, color: '#1565C0' },
    { name: 'Bunga', value: calc.totalBunga, color: '#29B6F6' },
  ];

  const amortisasi = useMemo(() => {
    const rows = [];
    let sisa = calc.P;
    const i = rate / 100 / 12;
    for (let y = 1; y <= tenor; y++) {
      let totalPokok = 0, totalBunga = 0;
      for (let m = 1; m <= 12; m++) {
        const bunga = sisa * i;
        const pokok = calc.M - bunga;
        totalPokok += pokok;
        totalBunga += bunga;
        sisa = Math.max(sisa - pokok, 0);
      }
      rows.push({ tahun: y, sisa: Math.max(sisa, 0), pokok: totalPokok, bunga: totalBunga });
    }
    return rows;
  }, [calc, rate, tenor]);

  const formatM = (v: number) => new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-display font-bold text-[#0F172A] text-lg mb-6 flex items-center gap-2">
        🏦 Kalkulator KPR
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL KIRI - Input */}
        <div className="space-y-5">
          {/* Harga */}
          <div>
            <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Harga Properti</label>
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rp</span>
              <input
                type="number"
                value={harga}
                onChange={e => setHarga(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]"
              />
            </div>
            <input type="range" min={100000000} max={50000000000} step={50000000}
              value={harga} onChange={e => setHarga(Number(e.target.value))}
              className="w-full accent-[#1565C0]" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>100 Jt</span><span>50 M</span></div>
          </div>

          {/* DP */}
          <div>
            <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">Uang Muka (DP)</label>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <input type="number" min={0} max={80} value={dp} onChange={e => setDp(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">Rp</span>
                <input type="text" readOnly value={formatM(harga * dp / 100)}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500" />
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[10, 20, 30, 40].map(v => (
                <button key={v} onClick={() => setDp(v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${dp === v ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`}>
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* Bunga */}
          <div>
            <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">
              Suku Bunga/Tahun <span className="text-gray-400 font-normal normal-case">~7% rata-rata KPR</span>
            </label>
            <div className="relative mb-2">
              <input type="number" min={1} max={20} step={0.25} value={rate} onChange={e => setRate(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            <input type="range" min={1} max={20} step={0.25} value={rate} onChange={e => setRate(Number(e.target.value))}
              className="w-full accent-[#1565C0]" />
          </div>

          {/* Tenor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Tenor</label>
              <span className="text-2xl font-bold text-[#1565C0] font-display">{tenor} Tahun</span>
            </div>
            <input type="range" min={1} max={30} value={tenor} onChange={e => setTenor(Number(e.target.value))}
              className="w-full accent-[#1565C0] mb-2" />
            <div className="flex gap-1.5 flex-wrap">
              {[5, 10, 15, 20, 25, 30].map(v => (
                <button key={v} onClick={() => setTenor(v)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${tenor === v ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`}>
                  {v} thn
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL KANAN - Output */}
        <div className="space-y-4">
          {/* Angsuran utama */}
          <div className="rounded-xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)' }}>
            <div className="text-xs text-white/70 uppercase tracking-wide mb-1">ANGSURAN PER BULAN</div>
            <div className="text-3xl font-bold font-display" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatRupiahFull(Math.round(calc.M))}
            </div>
            <div className="text-xs text-white/60 mt-1">{tenor} tahun · bunga {rate}% per tahun</div>
          </div>

          {/* 3 summary cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Pinjaman', value: calc.P },
              { label: 'Total Bunga', value: calc.totalBunga },
              { label: 'Total Bayar', value: calc.totalPayment },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-1">{label}</div>
                <div className="text-xs font-bold text-[#0F172A]">{formatM(value)}</div>
              </div>
            ))}
          </div>

          {/* Donut Chart */}
          <div className="flex items-center gap-4">
            <div style={{ width: 100, height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={28} outerRadius={45} dataKey="value">
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRupiahFull(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-sm space-y-2">
              {chartData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-gray-600">{d.name}</span>
                  <span className="font-bold text-[#0F172A] text-xs">{Math.round(d.value / calc.totalPayment * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* DP vs Pinjaman bar */}
          <div>
            <div className="text-xs text-gray-500 mb-2">DP vs Pinjaman</div>
            <div className="flex rounded-full overflow-hidden h-3">
              <div className="bg-[#10B981]" style={{ width: `${dp}%` }} />
              <div className="bg-[#1565C0]" style={{ width: `${100 - dp}%` }} />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-[#10B981] font-medium">DP {dp}%</span>
              <span className="text-[#1565C0] font-medium">Pinjaman {100 - dp}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Amortisasi Toggle */}
      <button
        onClick={() => setShowTable(!showTable)}
        className="flex items-center gap-1 text-xs text-[#1565C0] font-semibold mt-5 hover:underline"
      >
        {showTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Lihat Tabel Amortisasi Tahunan
      </button>
      {showTable && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-[#F0F4F8]">
              <tr className="text-[#64748B]">
                {['Tahun', 'Sisa Pokok', 'Pokok/thn', 'Bunga/thn'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {amortisasi.map(row => (
                <tr key={row.tahun} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2">{row.tahun}</td>
                  <td className="px-3 py-2">{formatM(row.sisa)}</td>
                  <td className="px-3 py-2">{formatM(row.pokok)}</td>
                  <td className="px-3 py-2">{formatM(row.bunga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-4">
        ⚠️ Simulasi ini hanya estimasi, bukan penawaran resmi dari lembaga perbankan manapun.
      </p>
    </div>
  );
}
