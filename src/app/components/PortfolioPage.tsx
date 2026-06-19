import { useState } from 'react';
import { PORTFOLIO_ITEMS, formatRupiah } from '../data/mockData';

export default function PortfolioPage() {
  const [filter, setFilter] = useState('Semua');
  const jenis = ['Semua', 'Rumah', 'Kost', 'Villa', 'Tanah', 'Hotel', 'Apartemen'];

  const filtered = filter === 'Semua' ? PORTFOLIO_ITEMS : PORTFOLIO_ITEMS.filter(p => p.jenis === filter);

  return (
    <div className="pt-16">
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white mb-3">Portofolio Transaksi</h1>
          <p className="text-white/70">Rekam jejak nyata properti yang berhasil kami pasarkan</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap mb-10 justify-center">
            {jenis.map(j => (
              <button key={j} onClick={() => setFilter(j)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  filter === j ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'
                }`}>
                {j}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(item => (
              <div key={item.id} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm group">
                <div className="relative" style={{ paddingTop: '66.67%' }}>
                  <img src={item.foto} alt={item.judul}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=600&q=80'; }}
                    suppressHydrationWarning />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
                  <div className="absolute top-3 right-3">
                    <span className="bg-[#EF4444] text-white px-3 py-1 rounded-full text-xs font-bold">✓ TERJUAL</span>
                  </div>
                  <div className="absolute bottom-3 left-3">
                    <span className="bg-[#1565C0] text-white px-2 py-0.5 rounded-full text-xs font-bold">{item.jenis}</span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-display font-bold text-[#0F172A] mb-1">{item.judul}</h3>
                  <p className="text-xs text-[#64748B] mb-2">📍 {item.lokasi}</p>
                  <div className="font-bold text-[#1565C0] font-display">{formatRupiah(item.harga)}</div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🏘️</div>
              <p className="text-[#64748B]">Belum ada portofolio di kategori ini</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
