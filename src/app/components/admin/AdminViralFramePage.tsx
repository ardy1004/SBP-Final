import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Search, Filter, ImageOff, Video, X, Sparkles, PenLine, Clapperboard } from 'lucide-react';

interface PropertyRow {
  id: number;
  kode_listing: string;
  title: string;
  jenis_properti: string;
  tujuan: string;
  status_publish: string;
  kecamatan: string;
  kabupaten: string;
  cover_url: string | null;
}

const JENIS_COLORS: Record<string, string> = {
  rumah: '#1565C0', kost: '#7C3AED', villa: '#10B981',
  tanah: '#F5A623', hotel: '#EF4444', apartment: '#0891B2',
  homestay: '#059669', gudang: '#78716C', komersial: '#DC2626',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: { label: 'Published', cls: 'bg-emerald-100 text-emerald-700' },
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-500' },
  sold:      { label: 'Sold',      cls: 'bg-red-100 text-red-600' },
  archived:  { label: 'Arsip',     cls: 'bg-gray-200 text-gray-500 line-through' },
};

function coverSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith('property-photos/') || url.startsWith('signatures/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

interface SelectedProperty { id: number; judul: string }

function ModeSelectionModal({ property, onClose, onPick }: {
  property: SelectedProperty;
  onClose: () => void;
  onPick: (mode: 'ai-generate' | 'manual' | 'video-vo' | 'youtube-long') => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display font-bold text-[#0F172A] flex items-center gap-2">
              🎬 Buat Video
            </h3>
            <p className="text-sm text-[#64748B] mt-0.5 line-clamp-1">{property.judul}</p>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onPick('ai-generate')}
            className="w-full text-left p-4 rounded-xl border-2 border-[#1565C0]/30 bg-[#F0F7FF] hover:border-[#1565C0] transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-[#1565C0]" />
              <span className="font-semibold text-sm text-[#0F172A]">⚡ AI Generate</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white bg-[#1565C0]">REKOMENDASI</span>
            </div>
            <p className="text-xs text-[#64748B] mb-2">Gemini / Groq / OpenRouter / DeepSeek dengan fallback otomatis. Lewat 3 langkah singkat (foto + karakter) untuk hasil akurat, lalu naskah per-scene siap pakai.</p>
            <span className="text-xs font-semibold text-[#1565C0]">Mulai →</span>
          </button>

          <button
            onClick={() => onPick('manual')}
            className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-[#1565C0]/40 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <PenLine size={16} className="text-[#64748B]" />
              <span className="font-semibold text-sm text-[#0F172A]">Manual (4 Step)</span>
            </div>
            <p className="text-xs text-[#64748B] mb-2">Kontrol penuh atas setiap detail.</p>
            <span className="text-xs font-semibold text-[#1565C0]">Buat Manual →</span>
          </button>

          <button
            onClick={() => onPick('video-vo')}
            className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-[#1565C0]/40 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Clapperboard size={16} className="text-[#64748B]" />
              <span className="font-semibold text-sm text-[#0F172A]">Generate Video VO</span>
            </div>
            <p className="text-xs text-[#64748B] mb-2">Video + voiceover AI langsung.</p>
            <span className="text-xs font-semibold text-[#1565C0]">Generate →</span>
          </button>

          <button
            onClick={() => onPick('youtube-long')}
            className="w-full text-left p-4 rounded-xl border-2 border-red-200 bg-red-50/50 hover:border-red-400 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">📺</span>
              <span className="font-semibold text-sm text-[#0F172A]">YouTube Long (16:9)</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white bg-red-500">16:9</span>
            </div>
            <p className="text-xs text-[#64748B] mb-2">Pilih foto + label + gaya visual/kamera → AI susun storyboard: prompt JSON thumbnail, opening, scene per foto, ending. Siap copy-paste.</p>
            <span className="text-xs font-semibold text-red-500">Generate Storyboard →</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminViralFramePage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [displayLimit, setDisplayLimit] = useState(24);
  const [selectedProperty, setSelectedProperty] = useState<SelectedProperty | null>(null);
  // Status konten per properti (R6)
  const [withScript, setWithScript] = useState<Set<number>>(new Set());
  const [withVideo, setWithVideo] = useState<Set<number>>(new Set());
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  // R9 batch
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const toggleSelect = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const refreshStatus = () => fetch('/api/admin/viralframe/status', { credentials: 'include' }).then(r => r.json())
    .then(j => { if (j.success) { setWithScript(new Set(j.data?.with_script ?? [])); setWithVideo(new Set(j.data?.with_video ?? [])); } }).catch(() => {});
  const runBatch = async () => {
    const ids = [...selected]; if (ids.length === 0 || batchRunning) return;
    setBatchRunning(true); setBatchDone(0);
    for (let i = 0; i < ids.length; i++) {
      try {
        await fetch('/api/admin/viralframe/youtube-long', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: ids[i] }) });
      } catch { /* lanjut */ }
      setBatchDone(i + 1);
    }
    setBatchRunning(false); setSelected(new Set()); refreshStatus();
  };

  const openModeModal = (id: number, judul: string) => setSelectedProperty({ id, judul });
  const closeModal = () => setSelectedProperty(null);
  const handlePickMode = (mode: 'ai-generate' | 'manual' | 'video-vo' | 'youtube-long') => {
    if (!selectedProperty) return;
    const id = selectedProperty.id;
    closeModal();
    if (mode === 'manual') navigate(`/admin/viralframe/${id}`);
    else navigate(`/admin/viralframe/${id}?mode=${mode}`);
  };

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/properties', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProperties(json.data?.properties ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { setDisplayLimit(24); }, [search, onlyEmpty]);

  // Status konten (R6)
  useEffect(() => {
    fetch('/api/admin/viralframe/status', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) { setWithScript(new Set(j.data?.with_script ?? [])); setWithVideo(new Set(j.data?.with_video ?? [])); } })
      .catch(() => {});
  }, []);

  const contentStatus = (id: number): 'video' | 'script' | 'empty' =>
    withVideo.has(id) ? 'video' : withScript.has(id) ? 'script' : 'empty';

  const filtered = properties.filter(p => {
    if (onlyEmpty && contentStatus(p.id) !== 'empty') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.kode_listing ?? '').toLowerCase().includes(q)
    );
  });

  const totalWithContent = properties.filter(p => contentStatus(p.id) !== 'empty').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Video size={20} className="text-[#1565C0]" /> Viral Frame
          </h1>
          <p className="text-[#64748B] text-sm mt-0.5">
            {loading ? 'Memuat…' : `Pilih properti untuk membuat prompt video AI — ${filtered.length} properti`}
          </p>
        </div>
      </div>

      {/* KPI produksi konten (R6) */}
      {!loading && properties.length > 0 && (
        <div className="bg-gradient-to-r from-[#1565C0] to-[#29B6F6] rounded-2xl p-4 text-white flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Produksi Konten Video</div>
            <div className="text-2xl font-bold">{totalWithContent}<span className="text-base font-normal">/{properties.length} listing</span></div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{properties.length ? Math.round((totalWithContent / properties.length) * 100) : 0}%</div>
            <div className="text-xs text-white/80">sudah ada konten</div>
          </div>
        </div>
      )}

      {/* Search bar + filter */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari judul atau kode listing…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors"
          />
        </div>
        <button onClick={() => setOnlyEmpty(v => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${onlyEmpty ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'}`}>
          ⬜ Belum ada konten {onlyEmpty ? '(aktif)' : ''}
        </button>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 rounded-2xl border border-red-100">
          {error} —{' '}
          <button onClick={fetchProperties} className="underline font-medium">Coba lagi</button>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-[#94A3B8] text-sm">
          <div className="w-6 h-6 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin mx-auto mb-2" />
          Memuat data…
        </div>
      )}

      {/* R9: Batch action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 bg-[#0F172A] text-white rounded-2xl p-3 flex items-center justify-between gap-3 shadow-lg">
          <span className="text-sm font-medium">{selected.size} properti dipilih</span>
          <div className="flex items-center gap-2">
            {batchRunning
              ? <span className="text-xs">Memproses {batchDone}/{selected.size}…</span>
              : <button onClick={() => setSelected(new Set())} className="text-xs text-white/70 hover:text-white">Batal</button>}
            <button onClick={runBatch} disabled={batchRunning}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-600 disabled:opacity-50">
              📺 Generate Storyboard Massal
            </button>
          </div>
        </div>
      )}

      {/* Grid properti */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.slice(0, displayLimit).map(p => {
            const badge = STATUS_BADGE[p.status_publish] ?? { label: p.status_publish, cls: 'bg-gray-100 text-gray-500' };
            const src = coverSrc(p.cover_url);
            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col"
              >
                <div className="relative w-full bg-gray-100" style={{ paddingBottom: '56.25%' }}>
                  {src ? (
                    <img src={src} alt={p.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageOff size={24} className="text-gray-300" />
                    </div>
                  )}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {/* Badge status konten ViralFrame (R6) */}
                  {(() => {
                    const st = contentStatus(p.id);
                    const meta = st === 'video' ? { t: '🎬 Video', c: 'bg-emerald-500 text-white' }
                      : st === 'script' ? { t: '📝 Naskah', c: 'bg-amber-400 text-white' }
                      : { t: '⬜ Belum', c: 'bg-white/90 text-gray-500 border border-gray-200' };
                    return <span className={`absolute top-2 left-10 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.c}`}>{meta.t}</span>;
                  })()}
                  {/* R9: checkbox pilih untuk batch */}
                  <button onClick={() => toggleSelect(p.id)} title="Pilih untuk batch"
                    className={`absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${selected.has(p.id) ? 'bg-[#1565C0] border-[#1565C0]' : 'bg-white/90 border-gray-300 hover:border-[#1565C0]'}`}>
                    {selected.has(p.id) && <span className="text-white text-xs font-bold">✓</span>}
                  </button>
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-semibold"
                      style={{ background: JENIS_COLORS[p.jenis_properti] ?? '#64748B', fontSize: '10px' }}>
                      {p.jenis_properti}
                    </span>
                    <span className="text-xs text-[#94A3B8] truncate">{p.kode_listing}</span>
                  </div>
                  <div className="font-medium text-[#0F172A] text-sm leading-snug line-clamp-2">{p.title}</div>
                  <div className="text-xs text-[#64748B]">{p.kecamatan}, {p.kabupaten}</div>
                  <div className="mt-auto pt-2">
                    <button
                      onClick={() => openModeModal(p.id, p.title)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
                    >
                      🎬 Buat Video
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12">
          <Filter size={32} className="text-[#E2E8F0] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">Tidak ada properti yang sesuai pencarian</p>
        </div>
      )}

      {!loading && filtered.length > displayLimit && (
        <div className="flex justify-center">
          <button
            onClick={() => setDisplayLimit(prev => prev + 24)}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
          >
            Muat Lebih Banyak ({filtered.length - displayLimit} tersisa)
          </button>
        </div>
      )}

      {selectedProperty && (
        <ModeSelectionModal
          property={selectedProperty}
          onClose={closeModal}
          onPick={handlePickMode}
        />
      )}
    </div>
  );
}
