import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { getBlogPosts, type ApiBlogPost } from '../../lib/api';

function formatTanggal(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BlogPage() {
  const [search, setSearch] = useState('');
  const [activeKat, setActiveKat] = useState('Semua');
  const [posts, setPosts] = useState<ApiBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const kategori = ['Semua', 'KPR', 'Investasi', 'Panduan'];

  useEffect(() => {
    setLoading(true);
    setError(null);
    getBlogPosts({ limit: 50 })
      .then(res => {
        if (res.success && res.data) setPosts(res.data.items);
        else setError(res.error ?? 'Gagal memuat artikel');
      })
      .catch(() => setError('Koneksi ke server gagal'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = posts.filter(p =>
    (activeKat === 'Semua' || p.kategori === activeKat) &&
    (p.judul.toLowerCase().includes(search.toLowerCase()) ||
     (p.excerpt ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="pt-16">
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white mb-3">Blog & Tips Properti</h1>
          <p className="text-white/70 mb-8">Panduan, insight, dan informasi properti dari tim SBP</p>
          <div className="relative max-w-md mx-auto">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari artikel..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-[#29B6F6] text-sm"
            />
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 flex-wrap mb-10">
            {kategori.map(k => (
              <button key={k} onClick={() => setActiveKat(k)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  activeKat === k ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'
                }`}>
                {k}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
                  <div className="w-full bg-gray-200" style={{ paddingTop: '56.25%' }} />
                  <div className="p-5 space-y-3">
                    <div className="h-5 w-20 bg-gray-200 rounded-full" />
                    <div className="h-4 w-full bg-gray-200 rounded" />
                    <div className="h-4 w-3/4 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">⚠️</div>
              <p className="text-[#64748B]">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📝</div>
              <p className="text-[#64748B]">Belum ada artikel{search || activeKat !== 'Semua' ? ' yang sesuai' : ''}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(post => (
                <Link key={post.id} to={`/blog/${post.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                  <div className="relative overflow-hidden" style={{ paddingTop: '56.25%' }}>
                    <img src={post.cover ?? ''} alt={post.judul}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=600&q=80'; }} />
                  </div>
                  <div className="p-5">
                    {post.kategori && (
                      <span className="inline-block px-3 py-1 bg-[#E3F2FD] text-[#1565C0] text-xs rounded-full font-medium mb-3">{post.kategori}</span>
                    )}
                    <h3 className="font-display font-bold text-[#0F172A] mb-2 line-clamp-2 group-hover:text-[#1565C0] transition-colors">{post.judul}</h3>
                    <p className="text-[#64748B] text-sm line-clamp-2 mb-4">{post.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs text-[#64748B]">
                      {post.author && (
                        <div className="flex items-center gap-1">
                          <div className="w-5 h-5 rounded-full bg-[#1565C0] flex items-center justify-center text-white text-[8px] font-bold">
                            {post.author.charAt(0)}
                          </div>
                          <span>{post.author}</span>
                        </div>
                      )}
                      {post.published_at && <><span>·</span><span>{formatTanggal(post.published_at)}</span></>}
                      {post.reading_time_menit && <><span>·</span><span>{post.reading_time_menit} mnt</span></>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
