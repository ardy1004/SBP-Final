import { useState, useEffect, useRef, type ComponentType } from 'react';
import { useParams, Link } from 'react-router';
import { MapPin, Eye, Calendar, Share2, Heart, BedDouble, Bath, Maximize2, ChevronLeft, ChevronRight, X, MessageCircle, Star, TrendingUp, Clock, BarChart2, Home, Search } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import {
  getPropertyBySlug, getProperties, normalizeProperty, normalizePropertyDetail,
  postLead,
  type NormalizedPropertyDetail, type NormalizedProperty, type InvestmentIntelligence,
  formatRupiah, formatRupiahFull,
} from '../../lib/api';
import { formatRibuan } from '../../lib/format';
import { trackEvent } from '../../lib/tracking';
// KPRCalculator dimuat hanya di klien — recharts akses window saat import, crash SSR.
// Pola mounted-flag: server & render-klien-pertama tampilkan placeholder identik → no hydration mismatch.
function KPRCalculatorClient({ defaultHarga }: { defaultHarga: number }) {
  type KPRComp = ComponentType<{ defaultHarga: number }>;
  const [Comp, setComp] = useState<KPRComp | null>(null);
  useEffect(() => {
    let alive = true;
    import('./KPRCalculator').then((m) => { if (alive) setComp(() => m.default as KPRComp); });
    return () => { alive = false; };
  }, []);
  if (!Comp) return <div className="bg-white rounded-2xl p-5 shadow-sm h-40 animate-pulse" />;
  return <Comp defaultHarga={defaultHarga} />;
}
import PropertyCard from './PropertyCard';
import { Skeleton } from './ui/skeleton';
import ContactAdminSheet from './ContactAdminSheet';

// Jenis properti yang menghasilkan income sewa — analisis investasi relevan di sini
const INCOME_TYPES = ['kost', 'hotel', 'homestay', 'villa', 'apartment', 'gudang', 'komersial'];

// ─────────────────────────────────────────────────────────────────────────────
// Investment Intelligence Panel — pakai nilai pre-computed dari API
// ─────────────────────────────────────────────────────────────────────────────
function InvestmentPanel({ ii }: { ii: InvestmentIntelligence }) {
  const stars = ii.skor_investasi;
  return (
    <div className="rounded-2xl p-6 my-6" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-white flex items-center gap-2">💡 Analisis Investasi</h3>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={14} fill={i < stars ? '#F5A623' : 'transparent'} className={i < stars ? 'text-[#F5A623]' : 'text-white/30'} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'YIELD/TAHUN', value: `${ii.yield_persen.toFixed(1)}%`,   color: '#F5A623' },
          { label: 'PAYBACK',     value: `~${ii.payback_tahun.toFixed(1)} thn`, color: '#29B6F6' },
          { label: 'CAP RATE',   value: `${ii.cap_rate_persen.toFixed(1)}%`, color: '#10B981' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-bold font-display" style={{ color }}>{value}</div>
            <div className="text-white/50 text-[10px] mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-white/70 mb-3">
        Income bersih/bln: <span className="text-white font-semibold">{formatRupiah(ii.income_bersih_per_bulan)}</span> ·
        Income/tahun: <span className="text-white font-semibold">{formatRupiah(ii.income_bersih_per_tahun)}</span>
      </div>
      <div className="mb-1">
        <div className="text-xs text-white/50 mb-1">Yield vs Deposito (3%)</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/10 rounded-full h-2.5 overflow-hidden">
            <div className="h-full bg-[#F5A623] rounded-full" style={{ width: `${Math.min(ii.yield_persen / 15 * 100, 100)}%` }} />
          </div>
          <span className="text-[#F5A623] text-xs font-bold">{ii.yield_persen.toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-[10px] text-white/40 mt-3">*Estimasi berdasarkan data yang diberikan pemilik, bukan jaminan imbal hasil.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LeadForm — Tugas 4: tipe diperbarui ke NormalizedPropertyDetail.
// K6 (POST /api/leads sebelum buka WA) dikerjakan di Tugas 5.
// ─────────────────────────────────────────────────────────────────────────────
// Mapping label rencana pembayaran → nilai enum API
const RENCANA_MAP: Record<string, 'hard_cash' | 'soft_cash' | 'kpr'> = {
  'Hard Cash': 'hard_cash',
  'Soft Cash': 'soft_cash',
  'KPR': 'kpr',
};

function LeadForm({ property }: { property: NormalizedPropertyDetail }) {
  const [tipe, setTipe] = useState('');
  const [nama, setNama] = useState('');
  const [no_wa, setNoWa] = useState('');
  const [asal, setAsal] = useState('');
  const [budget, setBudget] = useState('');
  const [rencana, setRencana] = useState('');
  const [pesan, setPesan] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const isValid = Boolean(tipe && nama && no_wa.trim() && asal && (tipe !== 'pembeli' || (budget && rencana)));

  // K6 KRITIS: POST /api/leads dulu → simpan lead ke DB → baru buka wa_url dari response
  const handleWA = async () => {
    if (!isValid || sending) return;
    setSending(true);
    setApiError(null);

    const res = await postLead({
      nama,
      no_wa: no_wa.trim(),
      tipe_pengirim: tipe as 'pembeli' | 'penjual' | 'broker',
      source_page: window.location.href,
      property_id: property.id,
      asal_daerah: asal || undefined,
      budget: budget || undefined,
      rencana_pembayaran: RENCANA_MAP[rencana] ?? undefined,
      pesan: pesan || undefined,
    });

    setSending(false);

    if (res.success && res.data) {
      setSubmitted(true);
      trackEvent('Lead', {
        content_name: property.title,
        content_ids: [property.kode],
        content_category: tipe,
        value: property.harga,
        currency: 'IDR',
      }, { eventID: res.data.event_id });
      // Gunakan location.href (bukan window.open) agar tidak diblokir in-app browser (Meta Ads, IG)
      window.location.href = res.data.wa_url;
    } else {
      setApiError(res.error ?? 'Gagal menyimpan pesan. Coba lagi.');
    }
  };

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] transition-all";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {/* Agent */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
        <img
          src="https://images.salambumi.xyz/monic%20sbp.webp"
          alt="Monica Vera S"
          className="w-14 h-14 rounded-full object-cover border-2 border-[#1565C0]"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80'; }}
        />
        <div>
          <div className="font-semibold text-[#0F172A]">Monica Vera S</div>
          <div className="text-xs text-[#64748B]">Admin/Agent Properti</div>
          <div className="flex gap-0.5 mt-1">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={10} fill="#F5A623" className="text-[#F5A623]" />)}
          </div>
        </div>
      </div>

      <h4 className="font-semibold text-[#0F172A] mb-4 text-sm">Kirim Pesan ke Admin</h4>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-[#64748B] mb-1">Beritahu Kami Siapakah Anda?</label>
        <select value={tipe} onChange={e => setTipe(e.target.value)} className={inputClass}>
          <option value="">-- Pilih --</option>
          <option value="pembeli">Calon Pembeli</option>
          <option value="penjual">Penjual/Pemilik</option>
          <option value="broker">Broker/Agent</option>
        </select>
      </div>

      {tipe && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama *</label>
              <input value={nama} onChange={e => setNama(e.target.value)} placeholder="Nama lengkap" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Asal Daerah *</label>
              <input value={asal} onChange={e => setAsal(e.target.value)} placeholder="Jakarta, dll" className={inputClass} />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WhatsApp *</label>
            <input
              value={no_wa}
              onChange={e => setNoWa(e.target.value)}
              placeholder="08xx / 628xx"
              type="tel"
              inputMode="numeric"
              className={inputClass}
            />
            <p className="text-[10px] text-[#64748B] mt-0.5">Format: 08xx, 628xx, atau +628xx</p>
          </div>

          {tipe === 'pembeli' && (
            <>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Estimasi Budget *</label>
                <select value={budget} onChange={e => setBudget(e.target.value)} className={inputClass}>
                  <option value="">-- Pilih Budget --</option>
                  {['< 500 Jt', '500 Jt – 1 M', '1 M – 2 M', '2 M – 3 M', '3 M – 5 M', '> 5 M'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Rencana Pembayaran *</label>
                <div className="flex gap-2">
                  {['Hard Cash', 'Soft Cash', 'KPR'].map(r => (
                    <button key={r} onClick={() => setRencana(r)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${rencana === r ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Pesan Tambahan</label>
            <textarea value={pesan} onChange={e => setPesan(e.target.value)} rows={3}
              placeholder="Tulis pesan Anda..."
              className={`${inputClass} resize-none`} />
          </div>
        </>
      )}

      {!isValid && tipe && (
        <p className="text-xs text-[#64748B] text-center mb-3">Lengkapi semua field wajib (*) untuk menghubungi via WhatsApp</p>
      )}

      {apiError && (
        <p className="text-xs text-[#EF4444] text-center mb-3 bg-red-50 rounded-xl px-3 py-2">⚠️ {apiError}</p>
      )}

      <button
        onClick={handleWA}
        disabled={!isValid || sending}
        className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 ${
          isValid && !sending ? 'bg-[#10B981] hover:bg-[#059669] shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        <MessageCircle size={18} />
        {sending
          ? 'Menyimpan data...'
          : isValid
          ? 'Hubungi via WhatsApp'
          : 'Lengkapi Form Terlebih Dahulu'}
      </button>

      {submitted && <p className="text-xs text-[#10B981] text-center mt-2">✅ Lead tersimpan! WhatsApp dibuka...</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loading — mirip layout halaman detail
// ─────────────────────────────────────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="pt-16 min-h-screen" style={{ background: '#F0F4F8' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Skeleton className="h-4 w-80 mb-5" />
        <div className="flex gap-6 flex-col lg:flex-row">
          <div className="flex-1 min-w-0">
            <Skeleton className="w-full rounded-2xl mb-5" style={{ paddingTop: '56.25%', display: 'block' }} />
            <div className="flex gap-2 mb-4">
              {[80, 60, 100, 90].map((w, i) => <Skeleton key={i} className="h-6 rounded-full" style={{ width: w }} />)}
            </div>
            <div className="bg-white rounded-2xl p-5 mb-5">
              <Skeleton className="h-3 w-32 mb-2" />
              <Skeleton className="h-7 w-full mb-1" />
              <Skeleton className="h-7 w-3/4 mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 mb-5">
              <Skeleton className="h-5 w-40 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
            <div className="bg-white rounded-2xl p-5 mb-4">
              <Skeleton className="h-9 w-48 mb-2" />
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl p-5">
              <Skeleton className="h-14 w-full rounded-xl mb-4" />
              <Skeleton className="h-10 w-full rounded-xl mb-3" />
              <Skeleton className="h-10 w-full rounded-xl mb-3" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 404 inline — slug tidak ditemukan di DB
// ─────────────────────────────────────────────────────────────────────────────
function PropertyNotFound() {
  return (
    <div className="pt-16 min-h-screen flex items-center justify-center px-4" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold font-display text-[#E2E8F0] mb-2">404</div>
        <div className="text-5xl mb-4">🏚️</div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Properti Tidak Ditemukan</h1>
        <p className="text-[#64748B] mb-8 leading-relaxed">
          Properti yang Anda cari tidak tersedia atau sudah tidak tayang. Mungkin sudah terjual atau URL berubah.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            <Home size={16} /> Ke Beranda
          </Link>
          <Link to="/properties" className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#1565C0] border border-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
            <Search size={16} /> Lihat Properti
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
interface PropertyDetailPageProps {
  ssrProperty?: NormalizedPropertyDetail;
}

export default function PropertyDetailPage({ ssrProperty }: PropertyDetailPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const hasSSR = ssrProperty !== undefined;

  const [property, setProperty] = useState<NormalizedPropertyDetail | null>(ssrProperty ?? null);
  const [similar, setSimilar] = useState<NormalizedProperty[]>([]);
  const [loading, setLoading] = useState(!hasSSR);
  const [notFound, setNotFound] = useState(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [currentImg, setCurrentImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(true);
  const [showSheet, setShowSheet] = useState(false);

  // Guard: kode_listing yang sudah di-fire agar tidak double-fire di StrictMode / SPA nav
  const viewContentFiredRef = useRef<string | null>(null);

  // Sync carousel index
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', () => setCurrentImg(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  // Sticky bar — hide when form is visible
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setShowStickyBar(!e.isIntersecting), { threshold: 0.3 });
    if (formRef.current) observer.observe(formRef.current);
    return () => observer.disconnect();
  }, [property]); // re-attach after property loads

  // Fetch detail + similar
  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }

    setNotFound(false);
    setSimilar([]);

    if (ssrProperty && ssrProperty.slug === slug) {
      // Data dari SSR loader tersedia — skip fetch utama, ambil properti serupa saja
      setProperty(ssrProperty);
      setLoading(false);
      getProperties({ kabupaten: ssrProperty.kabupaten, limit: 5 })
        .then(simRes => {
          if (simRes.success && simRes.data) {
            setSimilar(
              simRes.data.items
                .map(normalizeProperty)
                .filter(p => p.id !== ssrProperty.id)
                .slice(0, 4)
            );
          }
        });
      return;
    }

    // CSR fallback — saat SSR data tidak tersedia atau slug tidak cocok
    setLoading(true);
    setProperty(null);

    getPropertyBySlug(slug).then(res => {
      if (res.success && res.data) {
        const normalized = normalizePropertyDetail(res.data);
        setProperty(normalized);

        // Ambil properti serupa berdasarkan kabupaten (non-blocking)
        getProperties({ kabupaten: normalized.kabupaten, limit: 5 })
          .then(simRes => {
            if (simRes.success && simRes.data) {
              setSimilar(
                simRes.data.items
                  .map(normalizeProperty)
                  .filter(p => p.id !== normalized.id)
                  .slice(0, 4)
              );
            }
          });
      } else {
        setNotFound(true);
      }
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, ssrProperty]);

  // ViewContent — fire sekali per kode_listing saat property pertama kali tersedia
  useEffect(() => {
    if (!property) return;
    if (viewContentFiredRef.current === property.kode) return;
    viewContentFiredRef.current = property.kode;
    trackEvent('ViewContent', {
      content_ids: [property.kode],
      content_type: 'product',
      content_name: property.title,
      value: property.harga,
      currency: 'IDR',
    });
  }, [property]);

  if (loading) return <DetailSkeleton />;
  if (notFound || !property) return <PropertyNotFound />;

  const images = property.images.length > 0 ? property.images : [''];
  const hargaPerM2 = property.harga_per_m2 ?? (property.luas_tanah ? Math.round(property.harga / property.luas_tanah) : null);

  const breadcrumbParts = [
    { label: 'Home', href: '/' },
    { label: 'Properties', href: '/properties' },
    { label: property.jenis, href: `/properties?jenis=${property.jenis.toLowerCase()}` },
    { label: property.kabupaten, href: `/properties?kabupaten=${encodeURIComponent(property.kabupaten)}` },
    { label: property.kecamatan, href: `/properties?kecamatan=${encodeURIComponent(property.kecamatan)}` },
    { label: property.title, href: '' },
  ];

  return (
    <div className="pt-16 min-h-screen" style={{ background: '#F0F4F8' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-[#64748B] mb-5 flex-wrap">
          {breadcrumbParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              {part.href ? (
                <Link to={part.href} className="hover:text-[#1565C0] transition-colors">{part.label}</Link>
              ) : (
                <span className="text-[#0F172A] font-semibold line-clamp-1 max-w-32">{part.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex gap-6 items-start flex-col lg:flex-row">

          {/* ── Main Content ── */}
          <div className="flex-1 min-w-0">

            {/* Gallery */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-5 relative">
              <div ref={emblaRef} className="overflow-hidden">
                <div className="flex">
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="flex-none w-full relative cursor-zoom-in"
                      style={{ paddingTop: '56.25%' }}
                      onClick={() => { setCurrentImg(i); setLightbox(true); }}
                    >
                      <img
                        src={img}
                        alt={`${property.title} ${i + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=1200&q=80'; }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {images.length > 1 && (
                <>
                  <button onClick={() => emblaApi?.scrollPrev()} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/40 text-white rounded-full hover:bg-black/60">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => emblaApi?.scrollNext()} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/40 text-white rounded-full hover:bg-black/60">
                    <ChevronRight size={16} />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentImg ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Badge Row */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#1565C0] text-white">{property.jenisEmoji} {property.jenis}</span>
              {(property.tujuan === 'dijual' || property.tujuan === 'dijual_disewa') && <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#10B981] text-white">Dijual</span>}
              {(property.tujuan === 'disewa' || property.tujuan === 'dijual_disewa') && <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#29B6F6] text-white">Disewa</span>}
              {property.verified && <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#10B981]/10 text-[#10B981] border border-[#10B981]">✅ Terverifikasi SBP</span>}
              {property.badge_premium && <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'linear-gradient(135deg, #F5A623, #FFD54F)', color: '#461B00' }}>⭐ PREMIUM</span>}
            </div>

            {/* Title + Meta */}
            <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
              <p className="text-xs text-gray-400 font-mono mb-1">{property.kode}</p>
              <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-2">{property.title}</h1>
              <div className="flex items-center gap-2 text-[#64748B] text-sm mb-4">
                <MapPin size={14} />
                <span>{property.kecamatan}, {property.kabupaten}, {property.provinsi}</span>
              </div>

              {/* Quick Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  property.luas_tanah    ? { icon: Maximize2, label: 'Luas Tanah',    value: `${property.luas_tanah} m²`    } : null,
                  property.luas_bangunan ? { icon: Maximize2, label: 'Luas Bangunan', value: `${property.luas_bangunan} m²` } : null,
                  property.kamar_tidur   ? { icon: BedDouble, label: 'Kamar Tidur',   value: `${property.kamar_tidur} kamar`  } : null,
                  property.kamar_mandi   ? { icon: Bath,      label: 'Kamar Mandi',   value: `${property.kamar_mandi} kamar`  } : null,
                  property.lantai        ? { icon: BarChart2, label: 'Lantai',         value: `${property.lantai} lantai`      } : null,
                ].filter(Boolean).map((spec) => spec && (
                  <div key={spec.label} className="bg-[#F0F4F8] rounded-xl p-3 flex items-center gap-2">
                    <spec.icon size={16} className="text-[#1565C0] flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-[#64748B]">{spec.label}</div>
                      <div className="text-sm font-semibold text-[#0F172A]">{spec.value}</div>
                    </div>
                  </div>
                ))}
                <div className="bg-[#F0F4F8] rounded-xl p-3">
                  <div className="text-[10px] text-[#64748B]">Legalitas</div>
                  <div className="text-xs font-semibold text-[#0F172A]">{property.legalitas}</div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
              <h2 className="font-display font-bold text-[#0F172A] mb-3">Deskripsi Properti</h2>
              <p className="text-[#64748B] text-sm leading-relaxed whitespace-pre-line">{property.deskripsi}</p>
              <div className="mt-4 p-4 bg-[#F0F4F8] rounded-xl">
                <p className="text-sm text-[#64748B] leading-relaxed">
                  Properti {property.jenis.toLowerCase()} ini berlokasi di {property.kecamatan}, {property.kabupaten}, salah satu kawasan strategis di {property.provinsi}.
                  {property.luas_tanah ? ` Dengan luas tanah ${property.luas_tanah} m²` : ''}
                  {property.kamar_tidur ? ` dan ${property.kamar_tidur} kamar tidur` : ''}, properti ini {property.tujuan === 'dijual' ? 'dijual' : property.tujuan === 'disewa' ? 'disewakan' : 'dijual dan disewakan'} dengan harga {formatRupiah(property.harga)}.
                  {property.income_per_bulan ? ` Sangat cocok untuk investasi dengan income potensial ${formatRupiah(property.income_per_bulan)} per bulan.` : ''}
                </p>
              </div>
            </div>

            {/* Investment Intelligence — dari API (atau info bila data income belum ada) */}
            {property.investment_intelligence ? (
              <InvestmentPanel ii={property.investment_intelligence} />
            ) : INCOME_TYPES.includes(property.jenisRaw) ? (
              <div className="rounded-2xl p-6 my-6 bg-white border border-dashed border-gray-300">
                <h3 className="font-display font-bold text-[#0F172A] flex items-center gap-2 mb-2">💡 Analisis Investasi</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  Estimasi yield, payback, dan cap rate belum dapat ditampilkan karena data{' '}
                  <span className="font-medium text-[#0F172A]">income &amp; pengeluaran bulanan</span>{' '}
                  properti ini belum tersedia. Hubungi admin untuk informasi potensi investasi lebih lanjut.
                </p>
              </div>
            ) : null}

            {/* KPR Calculator — client-only via KPRCalculatorClient (mounted-flag pattern) */}
            {(property.tujuan === 'dijual' || property.tujuan === 'dijual_disewa') && (
              <div className="mb-5">
                <KPRCalculatorClient defaultHarga={property.harga} />
              </div>
            )}

            {/* Lokasi — lat/lng dari API */}
            <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
              <h2 className="font-display font-bold text-[#0F172A] mb-3">📍 Lokasi Properti</h2>
              <div className="bg-[#E3F2FD] rounded-xl h-48 flex flex-col items-center justify-center gap-2">
                <MapPin size={32} className="text-[#1565C0]" />
                <p className="text-[#1565C0] font-semibold text-sm">{property.kecamatan}, {property.kabupaten}</p>
                {(property.latitude || property.gmaps_link) && (
                  <a
                    href={property.gmaps_link ?? `https://maps.google.com?q=${property.latitude},${property.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#1565C0] underline hover:text-[#1E88E5]"
                  >
                    Buka di Google Maps ↗
                  </a>
                )}
              </div>
            </div>

            {/* Video YouTube jika ada */}
            {property.video_youtube && (
              <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm">
                <h2 className="font-display font-bold text-[#0F172A] mb-3">🎬 Video Properti</h2>
                <div className="relative" style={{ paddingTop: '56.25%' }}>
                  <iframe src={property.video_youtube} className="absolute inset-0 w-full h-full rounded-xl" allowFullScreen title="Video Properti" />
                </div>
              </div>
            )}

          </div>

          {/* ── Sidebar Kanan ── */}
          <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 lg:sticky lg:top-20">

            {/* Harga Box */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
              <div className="flex items-start justify-between mb-1">
                <div>
                  {property.harga_lama && (
                    <div className="text-sm text-gray-400 line-through">{formatRupiah(property.harga_lama)}</div>
                  )}
                  <div className="text-3xl font-bold font-display text-[#1565C0]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRupiah(property.harga)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFavorited(!favorited)}
                    className={`p-2 rounded-xl border transition-colors ${favorited ? 'bg-red-50 border-red-200 text-red-500' : 'border-gray-200 text-gray-400 hover:text-red-500'}`}
                  >
                    <Heart size={16} fill={favorited ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => { if (navigator.share) navigator.share({ title: property.title, url: window.location.href }); }}
                    className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-[#1565C0] transition-colors"
                  >
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
              {hargaPerM2 && <div className="text-xs text-gray-400 mb-2">~{formatRupiah(hargaPerM2)}/m²</div>}
              <div className="flex gap-2 mb-3">
                {property.nego && <span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-600 border border-orange-200">Nego</span>}
                {property.nett && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-[#1565C0] border border-blue-200">Nett</span>}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1"><Eye size={12} /> Dilihat {formatRibuan(property.views_count)} kali</div>
                <div className="flex items-center gap-1"><Calendar size={12} /> {property.updated_at?.slice(0, 10) ?? ''}</div>
              </div>
            </div>

            {/* Lead Form — Desktop */}
            <div className="hidden lg:block" ref={formRef}>
              <LeadForm property={property} />
            </div>
          </aside>
        </div>

        {/* Smart Suggestion — properti serupa dari API */}
        {similar.length > 0 && (
          <section className="mt-12 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-12 rounded-2xl" style={{ background: '#E3F2FD' }}>
            <div className="text-center mb-8">
              <span className="text-xs text-[#1565C0] font-semibold block mb-2">🔍 REKOMENDASI CERDAS</span>
              <h2 className="font-display text-2xl font-bold text-[#0F172A]">Properti Serupa yang Mungkin Anda Suka</h2>
              <p className="text-[#64748B] text-sm mt-1">Dipilih otomatis berdasarkan lokasi dan jenis properti yang serupa</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {similar.map(p => {
                const reason = p.kecamatan === property.kecamatan ? '🏘️ Kecamatan Sama'
                  : p.kabupaten === property.kabupaten ? '📍 Kabupaten Sama'
                  : '🏠 Jenis Sama';
                return (
                  <div key={p.id} className="relative">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <span className="bg-white border border-[#1565C0] text-[#1565C0] text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                        {reason}
                      </span>
                    </div>
                    <PropertyCard property={p as any} className="mt-3" />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Sticky Bottom Bar (Mobile) */}
      {showStickyBar && (
        <div className="sticky-bottom-bar fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-gray-200 shadow-lg px-4 py-3">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div>
              <div className="font-bold text-[#1565C0] font-display">{formatRupiah(property.harga)}</div>
              <div className="text-xs text-gray-500">{property.jenis} · {property.kecamatan}</div>
            </div>
            <button
              onClick={() => setShowSheet(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-[#10B981] hover:bg-[#059669] transition-colors"
            >
              <MessageCircle size={16} /> Hubungi Admin Via WA
            </button>
          </div>
        </div>
      )}

      {/* Contact Admin — Bottom Sheet (mobile) */}
      <ContactAdminSheet
        property={property}
        isOpen={showSheet}
        onClose={() => setShowSheet(false)}
      />

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 p-2 text-white hover:text-gray-300">
            <X size={24} />
          </button>
          <img src={images[currentImg]} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        </div>
      )}
    </div>
  );
}
