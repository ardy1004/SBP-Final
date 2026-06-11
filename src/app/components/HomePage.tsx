import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router';
import { Search, ChevronDown, ChevronLeft, ChevronRight, Star, ArrowRight, Shield, CheckCircle, Scale, Handshake, TrendingUp, Clock, BarChart2, AlertCircle, RefreshCw } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import {
  getProperties, getLocations, normalizeProperty,
  type NormalizedProperty, type ApiLocation, formatRupiah,
  getTestimonials, type ApiTestimonial,
  getBlogPosts, type ApiBlogPost,
} from '../../lib/api';
import { PROPERTY_TYPES } from '../../lib/propertyTypes';
import PropertyCard from './PropertyCard';
import { Skeleton } from './ui/skeleton';

/* ── STATS STRIP ── */
function StatsStrip({ published, sold }: { published: number; sold: number }) {
  const [counts, setCounts] = useState([0, 0, 0, 0]);
  // [0] Listing Aktif & [1] Transaksi Selesai = angka REAL dari DB (SSR loader).
  // [2] % Dikurasi & [3] Rating Bintang = angka brand/marketing (BUKAN dari DB).
  const targets = [published, sold, 100, 5];
  const labels = ['Listing Aktif', 'Transaksi Selesai', '% Dikurasi', 'Rating Bintang'];
  const icons = ['🏠', '✅', '🔍', '⭐'];
  const suffixes = ['+', '+', '%', '.0'];
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !animated.current) {
        animated.current = true;
        targets.forEach((target, i) => {
          let start = 0;
          const step = target / 40;
          const timer = setInterval(() => {
            start = Math.min(start + step, target);
            setCounts(prev => { const n = [...prev]; n[i] = Math.round(start); return n; });
            if (start >= target) clearInterval(timer);
          }, 20);
        });
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="py-8" style={{ background: '#0B2447' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-white/10">
          {labels.map((label, i) => (
            <div key={i} className="flex flex-col items-center py-4 px-6">
              <span className="text-3xl mb-1">{icons[i]}</span>
              <span
                className="text-4xl font-bold font-display"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
              >
                {counts[i]}{suffixes[i]}
              </span>
              <span className="text-white/70 text-sm mt-1 text-center">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── SKELETON: BANNER ── */
function SkeletonBanner() {
  return (
    <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <Skeleton className="h-5 w-36 mx-auto mb-3 rounded-full" />
          <Skeleton className="h-9 w-80 mx-auto mb-2" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
        <Skeleton className="w-full rounded-3xl" style={{ minHeight: 480 }} />
      </div>
    </section>
  );
}

/* ── SKELETON: PROPERTY CARDS (6 kartu) ── */
function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <Skeleton className="w-full" style={{ paddingTop: '66.67%', display: 'block' }} />
          <div className="p-4 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── ERROR STATE ── */
function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle size={40} className="text-[#EF4444] mb-3" />
      <p className="text-[#64748B] mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
      >
        <RefreshCw size={14} /> Coba Lagi
      </button>
    </div>
  );
}

/* ── BANNER CAROUSEL ── */
function FeaturedBanner({ items }: { items: NormalizedProperty[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    const timer = setInterval(() => emblaApi.scrollNext(), 5000);
    return () => { clearInterval(timer); emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  if (items.length === 0) {
    return (
      <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[#64748B]">Belum ada properti pilihan.</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-[#1565C0] bg-blue-100 mb-3">
            ⭐ PROPERTI PILIHAN
          </span>
          <h2 className="font-display text-3xl font-bold text-[#0F172A]">Properti Unggulan Terkurasi</h2>
          <p className="text-[#64748B] mt-2">Dipilih langsung oleh tim SBP — terbaik dari yang terbaik</p>
        </div>

        <div className="relative overflow-hidden rounded-3xl shadow-2xl" ref={emblaRef}>
          <div className="flex">
            {items.map((prop) => (
              <div key={prop.id} className="flex-none w-full relative" style={{ minHeight: '480px' }}>
                <img
                  src={prop.images[0] ?? ''}
                  alt={prop.title}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=1200&q=80'; }}
                />
                <div className="absolute inset-0 flex items-end p-8 lg:p-12">
                  <div className="glass-dark rounded-2xl p-6 max-w-lg">
                    <div className="flex gap-2 mb-3">
                      {prop.badge_premium && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, #F5A623, #FFD54F)', color: '#461B00' }}>⭐ PREMIUM</span>}
                      {prop.verified && <span className="bg-[#10B981]/80 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">✅ Terverifikasi</span>}
                    </div>
                    <h3 className="font-display text-xl font-bold text-white mb-2">{prop.title}</h3>
                    <div className="text-white/70 text-sm mb-3">📍 {prop.kecamatan}, {prop.kabupaten}</div>
                    <div className="text-2xl font-bold font-display text-[#29B6F6] mb-4">{formatRupiah(prop.harga)}</div>
                    <Link
                      to={`/${prop.tujuan === 'disewa' ? 'disewa' : 'dijual'}/${prop.jenis.toLowerCase()}/${prop.provinsi.toLowerCase().replace(/\s+/g, '-')}/${prop.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${(prop.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-')}/${prop.slug}`}
                      className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                    >
                      Lihat Detail →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${i === current ? 'w-8 bg-[#1565C0]' : 'w-2 bg-[#1565C0]/30'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── SKELETON: TESTIMONI ── */
function SkeletonTestimonials() {
  return (
    <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <Skeleton className="h-5 w-28 mx-auto mb-3 rounded-full" />
          <Skeleton className="h-8 w-56 mx-auto" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-7">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-24 mb-3" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-4/5 mb-4" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── TESTIMONIALS ── */
/** foto_url bisa berupa key R2 (testimonials/…) atau URL http(s). Resolusi ke src yang valid. */
function testimoniFotoSrc(u: string | null | undefined): string {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `/api/media?key=${encodeURIComponent(u)}`;
}

function TestimonialsSection({ items }: { items: ApiTestimonial[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start' });
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    const timer = setInterval(() => emblaApi.scrollNext(), 5000);
    return () => { clearInterval(timer); emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  if (items.length === 0) {
    return (
      <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[#64748B]">Belum ada testimoni.</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-[#1565C0] bg-blue-100 mb-3">
            💬 KLIEN KAMI
          </span>
          <h2 className="font-display text-3xl font-bold text-[#0F172A]">Apa Kata Mereka?</h2>
        </div>

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-5">
            {items.map((t) => (
              <div key={t.id} className="flex-none w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.33%-14px)]">
                <div className="bg-white rounded-2xl p-7 shadow-sm h-full relative" style={{ boxShadow: '0 4px 20px rgba(11,36,71,0.08)' }}>
                  <span className="absolute top-4 left-5 text-7xl font-serif text-[#29B6F6] opacity-20 leading-none select-none">"</span>
                  <div className="flex items-center gap-3 mb-4 relative z-10">
                    <img
                      src={testimoniFotoSrc(t.foto_url)}
                      alt={t.nama_klien}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#1565C0]"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80'; }}
                    />
                    <div>
                      <div className="font-semibold text-[#0F172A] text-sm">{t.nama_klien}</div>
                      <div className="text-[#64748B] text-xs">{t.lokasi}</div>
                    </div>
                  </div>
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} size={14} fill="#F5A623" className="text-[#F5A623]" />
                    ))}
                  </div>
                  <p className="text-[#0F172A] text-sm italic leading-relaxed mb-4">"{t.isi_testimoni}"</p>
                  <span className="inline-block px-3 py-1 bg-[#E3F2FD] text-[#1565C0] text-xs rounded-full font-medium">
                    {t.jenis_transaksi}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-8 items-center">
          <button
            onClick={() => emblaApi?.scrollPrev()}
            className="p-2 rounded-full border border-[#1565C0] text-[#1565C0] hover:bg-[#1565C0] hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-[#1565C0]' : 'w-2 bg-[#1565C0]/30'}`}
            />
          ))}
          <button
            onClick={() => emblaApi?.scrollNext()}
            className="p-2 rounded-full border border-[#1565C0] text-[#1565C0] hover:bg-[#1565C0] hover:text-white transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── HERO FILTER ── */
function HeroFilter() {
  const [tab, setTab] = useState<'dijual' | 'disewa'>('dijual');
  const [jenis, setJenis] = useState('');
  const [prov, setProv] = useState('');
  const [provId, setProvId] = useState<number | null>(null);
  const [kab, setKab] = useState('');
  const [kabupatenId, setKabupatenId] = useState<number | null>(null);
  const [kec, setKec] = useState('');
  const [provList, setProvList] = useState<ApiLocation[]>([]);
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [locLoading, setLocLoading] = useState(true);
  const navigate = useNavigate();

  // Load semua provinsi saat mount
  useEffect(() => {
    setLocLoading(true);
    getLocations().then(res => {
      if (res.success && res.data) setProvList(res.data.items);
    }).catch(() => {}).finally(() => setLocLoading(false));
  }, []);

  // Load kabupaten saat provinsi dipilih
  useEffect(() => {
    if (!provId) { setKabList([]); setKecList([]); setKab(''); setKabupatenId(null); setKec(''); return; }
    getLocations(provId).then(res => {
      if (res.success && res.data) setKabList(res.data.items);
    });
  }, [provId]);

  // Load kecamatan saat kabupaten dipilih
  useEffect(() => {
    if (!kabupatenId) { setKecList([]); setKec(''); return; }
    getLocations(kabupatenId).then(res => {
      if (res.success && res.data) setKecList(res.data.items);
    });
  }, [kabupatenId]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (tab) params.set('tujuan', tab);
    if (jenis) params.set('jenis', jenis);
    if (prov) params.set('provinsi', prov);
    if (kab) params.set('kabupaten', kab);
    if (kec) params.set('kecamatan', kec);
    navigate(`/properties?${params.toString()}`);
  };

  const selectClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1565C0] transition-all appearance-none cursor-pointer";

  return (
    <div className="glass-card max-w-4xl mx-auto p-7">
      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
        {(['dijual', 'disewa'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tab === t ? 'bg-[#1565C0] text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'dijual' ? '🏠 Cari Properti Dijual' : '🔑 Cari Properti Disewa'}
          </button>
        ))}
      </div>

      {/* Row 1: Jenis + Lokasi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {/* Jenis */}
        <div className="relative">
          <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">Jenis Properti</label>
          <select value={jenis} onChange={e => setJenis(e.target.value)} className={selectClass}>
            <option value="">Semua Jenis</option>
            {PROPERTY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 bottom-3 text-gray-400 pointer-events-none" />
        </div>

        {/* Provinsi — dari API, semua provinsi */}
        <div className="relative">
          <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">Provinsi</label>
          <select
            value={provId ?? ''}
            onChange={e => {
              const id = parseInt(e.target.value, 10) || null;
              const found = provList.find(p => p.id === id);
              setProvId(id);
              setProv(found?.nama ?? '');
              setKab(''); setKabupatenId(null); setKec('');
            }}
            className={selectClass}
            disabled={locLoading}
          >
            <option value="">{locLoading ? 'Memuat…' : 'Semua Provinsi'}</option>
            {provList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 bottom-3 text-gray-400 pointer-events-none" />
        </div>

        {/* Kabupaten — dari API, cascade dari provinsi */}
        <div className="relative">
          <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">Kab./Kota</label>
          <select
            value={kab}
            onChange={e => {
              const nama = e.target.value;
              const found = kabList.find(k => k.nama === nama);
              setKab(nama);
              setKabupatenId(found?.id ?? null);
              setKec('');
            }}
            className={selectClass}
            disabled={!provId}
          >
            <option value="">Semua Kab./Kota</option>
            {kabList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 bottom-3 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Grid jadi 1 kolom: Kel./Desa disembunyikan sementara, Kecamatan full-width */}
      <div className="grid grid-cols-1 gap-3 mb-5">
        {/* Kecamatan — dari API, cascade dari kabupaten */}
        <div className="relative">
          <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">Kecamatan</label>
          <select
            value={kec}
            onChange={e => setKec(e.target.value)}
            className={selectClass}
            disabled={!kab}
          >
            <option value="">Semua Kecamatan</option>
            {kecList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 bottom-3 text-gray-400 pointer-events-none" />
        </div>

        {/* Kel./Desa — Disembunyikan sementara — TODO aktifkan kembali jika data kelurahan siap
        <div className="relative">
          <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">Kel./Desa</label>
          <select className={selectClass} disabled>
            <option value="">Semua Kel./Desa</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 bottom-3 text-gray-400 pointer-events-none" />
        </div>
        */}
      </div>

      <button
        onClick={handleSearch}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold text-white transition-all duration-200 hover:brightness-110 hover:shadow-lg active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
      >
        <Search size={18} /> Cari Properti
      </button>
    </div>
  );
}

interface HomeStats {
  published: number;
  sold: number;
}

interface HomePageProps {
  ssrProperties?: NormalizedProperty[];
  ssrTestimonials?: ApiTestimonial[];
  ssrBlogPosts?: ApiBlogPost[];
  ssrStats?: HomeStats | null;
}

/* ── MAIN HOMEPAGE ── */
export default function HomePage({ ssrProperties, ssrTestimonials, ssrBlogPosts, ssrStats }: HomePageProps) {
  const hasSSR = ssrProperties !== undefined;

  // Angka real dari DB; fallback ke angka brand hanya bila DB tak tersedia (mis. dev tanpa SSR)
  const statPublished = ssrStats?.published ?? 150;
  const statSold = ssrStats?.sold ?? 80;

  const [properties, setProperties] = useState<NormalizedProperty[]>(ssrProperties ?? []);
  const [loading, setLoading] = useState(!hasSSR);
  const [error, setError] = useState<string | null>(null);

  const [testimonials, setTestimonials] = useState<ApiTestimonial[]>(ssrTestimonials ?? []);
  const [testimonialsLoading, setTestimonialsLoading] = useState(!hasSSR);

  const [blogPosts, setBlogPosts] = useState<ApiBlogPost[]>(ssrBlogPosts ?? []);
  const [blogLoading, setBlogLoading] = useState(!hasSSR);

  const fetchProperties = () => {
    setLoading(true);
    setError(null);
    getProperties({ sort: 'terbaru', limit: 10 })
      .then(res => {
        if (res.success && res.data) {
          setProperties(res.data.items.map(normalizeProperty));
        } else {
          setError(res.error ?? 'Gagal memuat data properti');
        }
      })
      .catch(() => setError('Koneksi ke server gagal'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Skip client-side fetch jika data sudah di-render server-side
    if (hasSSR) return;

    fetchProperties();

    getTestimonials()
      .then(res => { if (res.success && res.data) setTestimonials(res.data.items); })
      .finally(() => setTestimonialsLoading(false));

    getBlogPosts({ limit: 3 })
      .then(res => { if (res.success && res.data) setBlogPosts(res.data.items); })
      .finally(() => setBlogLoading(false));
  }, []);

  // Turunan dari data yang sudah di-fetch
  const featuredItems = properties.filter(p => p.properti_pilihan);
  const cardItems = properties.slice(0, 6);
  const investProp = properties.find(p => p.income_per_bulan && p.badge_premium);

  return (
    <>
      {/* HERO */}
      <section className="relative min-h-screen flex flex-col" style={{ minHeight: '100vh' }}>
        {/* Layer 1: BG Image */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.salambumi.xyz/kost%20dijual%20jogja.webp"
            alt="Properti Jogja"
            className="hero-bg-img absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1675657144518-025804f1812c?w=1600&q=80';
            }}
          />
          {/* Layer 2: Overlay */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(6,27,53,0.52) 0%, rgba(11,36,71,0.35) 45%, rgba(6,27,53,0.48) 100%)' }} />
          {/* Layer 3: Orbs */}
          <div className="hero-orb-1 absolute" style={{ width: 600, height: 600, background: 'radial-gradient(circle, rgba(41,182,246,0.18), transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', bottom: -100, right: -100 }} />
          <div className="hero-orb-2 absolute" style={{ width: 400, height: 400, background: 'radial-gradient(circle, rgba(245,166,35,0.12), transparent 70%)', borderRadius: '50%', filter: 'blur(80px)', top: -80, left: '5%' }} />
          <div className="hero-orb-3 absolute" style={{ width: 250, height: 250, background: 'radial-gradient(circle, rgba(30,136,229,0.20), transparent 70%)', borderRadius: '50%', filter: 'blur(50px)', top: '40%', left: '20%' }} />
        </div>

        {/* Layer 4: Content */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          {/* Badge pill */}
          <div className="mb-6 px-4 py-2 rounded-full text-xs font-semibold text-white flex items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.25)' }}>
            🏠 PORTAL PROPERTI TERPERCAYA YOGYAKARTA
          </div>

          {/* Headline */}
          <h1 className="font-display text-center text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-4 max-w-4xl">
            Finding The Best Properties,<br />
            <span style={{ background: 'linear-gradient(90deg, #29B6F6, #FFFFFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Will Be Easier And More Precise
            </span>
          </h1>

          {/* Slogan */}
          <p className="text-center text-base sm:text-lg italic mb-10 max-w-xl" style={{ color: 'rgba(255,255,255,0.75)' }}>
            "Don't Wait To Buy Real Estate, Buy Real Estate And Wait"
          </p>

          {/* Filter Card */}
          <div className="w-full max-w-4xl">
            <HeroFilter />
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <StatsStrip published={statPublished} sold={statSold} />

      {/* BANNER CAROUSEL — properti_pilihan dari API */}
      {loading ? (
        <SkeletonBanner />
      ) : error ? (
        <section style={{ background: 'linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)' }} className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ErrorBlock message={error} onRetry={fetchProperties} />
          </div>
        </section>
      ) : (
        <FeaturedBanner items={featuredItems} />
      )}

      {/* PRODUCT CARDS SECTION — 6 properti terbaru dari API */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-display text-3xl font-bold text-[#0F172A]">Temukan Properti Impian Anda</h2>
              <p className="text-[#64748B] mt-2">Semua listing diverifikasi langsung oleh tim SBP</p>
            </div>
            <Link
              to="/properties"
              className="hidden sm:flex items-center gap-1 text-[#1565C0] font-semibold text-sm hover:text-[#1E88E5] transition-colors"
            >
              Lihat Semua <ArrowRight size={16} />
            </Link>
          </div>

          {loading ? (
            <SkeletonCards />
          ) : error ? (
            <ErrorBlock message={error} onRetry={fetchProperties} />
          ) : cardItems.length === 0 ? (
            <p className="text-center text-[#64748B] py-12">Belum ada properti tersedia.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {cardItems.map(p => (
                <PropertyCard key={p.id} property={p as any} />
              ))}
            </div>
          )}

          <div className="text-center mt-10">
            <Link
              to="/properties"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
            >
              Lihat Semua Properti <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* INVESTMENT INTELLIGENCE TEASER */}
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-[#FFD54F] bg-white/10 mb-4">
                💡 INVESTMENT INTELLIGENCE
              </span>
              <h2 className="font-display text-3xl font-bold text-white mb-4">
                Properti Investasi Terbaik di Yogyakarta
              </h2>
              <p className="text-white/70 mb-6 leading-relaxed">
                SBP menghadirkan analisis investasi mendalam untuk setiap properti — income bulanan, yield tahunan, payback period, dan Cap Rate. Investasi properti cerdas dimulai dari data nyata.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  { icon: TrendingUp, text: 'Yield tahunan hingga 12% per tahun' },
                  { icon: BarChart2, text: 'Analisis ROI & payback period real-time' },
                  { icon: Clock, text: 'Skor investasi otomatis per listing' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 text-white/80 text-sm">
                    <Icon size={16} className="text-[#29B6F6] flex-shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
              <Link
                to="/properties?badge=premium"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#0B2447] bg-white hover:bg-[#E3F2FD] transition-colors"
              >
                Jelajahi Properti Investasi <ArrowRight size={16} />
              </Link>
            </div>

            {/* Investment Preview Card — tampilkan jika ada properti premium dengan income */}
            {investProp && investProp.income_per_bulan && investProp.pengeluaran_per_bulan ? (() => {
              const netIncome = investProp.income_per_bulan - investProp.pengeluaran_per_bulan;
              const yieldPct = ((netIncome * 12) / investProp.harga * 100).toFixed(1);
              const payback = (investProp.harga / (netIncome * 12)).toFixed(1);
              const stars = parseFloat(yieldPct) > 8 ? 5 : parseFloat(yieldPct) > 6 ? 4 : 3;
              return (
                <div className="glass-dark rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-semibold text-sm">💡 Analisis Investasi</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: stars }).map((_, i) => (
                        <Star key={i} size={14} fill="#F5A623" className="text-[#F5A623]" />
                      ))}
                    </div>
                  </div>
                  <p className="text-white/70 text-xs mb-4 line-clamp-1">{investProp.title}</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'YIELD/TH', value: `${yieldPct}%`, color: '#F5A623' },
                      { label: 'PAYBACK', value: `~${payback} thn`, color: '#29B6F6' },
                      { label: 'NET/BLN', value: formatRupiah(netIncome), color: '#10B981' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center">
                        <div className="text-lg font-bold font-display" style={{ color }}>{value}</div>
                        <div className="text-white/50 text-[10px] mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-white/50 mb-2">Yield vs Deposito (3%)</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div className="bg-[#F5A623] rounded-full h-2" style={{ width: `${Math.min(parseFloat(yieldPct) / 15 * 100, 100)}%` }} />
                    </div>
                    <span className="text-[#F5A623] text-xs font-bold">{yieldPct}%</span>
                  </div>
                  <Link
                    to={`/${investProp.tujuan === 'disewa' ? 'disewa' : 'dijual'}/${investProp.jenis.toLowerCase()}/${investProp.provinsi.toLowerCase().replace(/\s+/g, '-')}/${investProp.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${(investProp.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-')}/${investProp.slug}`}
                    className="mt-4 block w-full text-center py-2 rounded-xl text-sm font-semibold text-[#0B2447] bg-[#29B6F6] hover:bg-[#1E88E5] transition-colors"
                  >
                    Lihat Detail →
                  </Link>
                </div>
              );
            })() : null}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS — data dari GET /api/testimonials */}
      {testimonialsLoading
        ? <SkeletonTestimonials />
        : <TestimonialsSection items={testimonials} />
      }

      {/* TRUST STRIP */}
      <section className="py-8 bg-white border-y border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, text: 'Tanpa Biaya Tersembunyi' },
              { icon: CheckCircle, text: 'Listing Diverifikasi SBP' },
              { icon: Scale, text: 'Legalitas Dicek Notaris' },
              { icon: Handshake, text: 'Transaksi Transparan' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-[#64748B]">
                <Icon size={20} className="text-[#1565C0] flex-shrink-0" />
                <span className="text-sm font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BLOG SPILL — data dari GET /api/blog?limit=3 */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-display text-3xl font-bold text-[#0F172A]">Artikel & Tips Properti</h2>
              <p className="text-[#64748B] mt-2">Panduan dan wawasan properti dari tim SBP</p>
            </div>
            <Link
              to="/blog"
              className="hidden sm:flex items-center gap-1 text-[#1565C0] font-semibold text-sm hover:text-[#1E88E5] transition-colors"
            >
              Lihat Semua <ArrowRight size={16} />
            </Link>
          </div>

          {blogLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                  <Skeleton className="w-full" style={{ paddingTop: '56.25%', display: 'block' }} />
                  <div className="p-5 space-y-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : blogPosts.length === 0 ? (
            <p className="text-center text-[#64748B] py-12">Belum ada artikel tersedia.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {blogPosts.map(post => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-1"
                >
                  <div className="relative overflow-hidden" style={{ paddingTop: '56.25%' }}>
                    <img
                      src={post.cover ?? ''}
                      alt={post.judul}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=600&q=80'; }}
                    />
                  </div>
                  <div className="p-5">
                    <span className="inline-block px-3 py-1 bg-[#E3F2FD] text-[#1565C0] text-xs rounded-full font-medium mb-3">
                      {post.kategori}
                    </span>
                    <h3 className="font-display font-bold text-[#0F172A] text-base mb-2 line-clamp-2 group-hover:text-[#1565C0] transition-colors">
                      {post.judul}
                    </h3>
                    <p className="text-[#64748B] text-sm line-clamp-2 mb-4">{post.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs text-[#64748B]">
                      <div className="flex items-center gap-1">
                        <div className="w-5 h-5 rounded-full bg-[#1565C0] flex items-center justify-center text-white text-[8px] font-bold">
                          {post.author ? post.author.charAt(0) : 'S'}
                        </div>
                        <span>{post.author ?? 'SBP'}</span>
                      </div>
                      <span>·</span>
                      <span>{post.published_at ? post.published_at.slice(0, 10) : ''}</span>
                      <span>·</span>
                      <span>{post.reading_time_menit} mnt baca</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="sm:hidden text-center mt-8">
            <Link to="/blog" className="inline-flex items-center gap-2 text-[#1565C0] font-semibold">
              Lihat Semua Artikel <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
