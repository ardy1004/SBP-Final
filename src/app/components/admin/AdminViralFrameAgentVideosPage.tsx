import { bacaJson } from '../../../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import {
  Users, Loader2, Download, Trash2, Pencil, Check, X, Copy, Layers, ChevronDown, ChevronUp,
  Archive, RotateCcw, CheckCircle2, Circle, Send,
} from 'lucide-react';
import { buildOverlayVideoUrl, composeOverlaysForProperty, pickStatusBadgeType, toAttachmentUrl, toImageThumbnailUrl, type BadgeAsset, type BadgeType } from '../../lib/cloudinaryOverlay';
import BadgeLogoSettings from './viralframe/BadgeLogoSettings';
import SlotIndicatorStrip from './viralframe/SlotIndicatorStrip';

const STATUS_BADGE_LABEL: Record<BadgeType, string> = {
  sold: 'SOLD', premium: 'Premium', featured: 'Featured', hot: 'Hot', pilihan: 'Pilihan', logo: 'Logo',
};

interface CharacterOption {
  id: number;
  nama: string;
  foto_url: string;
}

interface AgentVideo {
  id: number;
  character_id: number;
  property_id: number;
  caption: string | null;
  hashtags: string | null;
  cloudinary_url: string;
  resource_type: string;
  duration_sec: number | null;
  bytes: number | null;
  format: string | null;
  width: number | null;
  height: number | null;
  status: string;
  post_url: string | null;
  trashed_at: string | null;
  created_at: string;
  character_nama: string;
  character_foto_url: string;
  kode_listing: string;
  property_title: string;
  status_sold: number | null;
  badge_premium: number | null;
  badge_featured: number | null;
  badge_hot: number | null;
  properti_pilihan: number | null;
}

function mediaUrl(key: string) {
  return `/api/admin/media?key=${encodeURIComponent(key)}`;
}

// Klasifikasi aspek rasio otomatis dari dimensi asli video (dari Cloudinary),
// bukan input manual — supaya tidak pernah salah/lupa diisi.
type RatioClass = 'vertikal' | 'horizontal' | 'square' | 'lainnya';
const RATIO_LABEL: Record<RatioClass, string> = {
  vertikal: 'Vertikal (9:16)', horizontal: 'Horizontal (16:9)', square: 'Square (1:1)', lainnya: 'Lainnya',
};
function classifyRatio(width: number | null, height: number | null): RatioClass {
  if (!width || !height) return 'lainnya';
  const r = width / height;
  if (r <= 0.8) return 'vertikal';
  if (r >= 1.2) return 'horizontal';
  return 'square';
}

// Sisa hari sebelum dihapus permanen otomatis oleh worker cron (30 hari sejak
// dipindah ke Sampah). Kalau sudah lewat 0, berarti cron belum sempat jalan lagi.
function daysUntilPurge(trashedAt: string): number {
  const trashedMs = new Date(trashedAt).getTime();
  if (Number.isNaN(trashedMs)) return 30;
  const purgeMs = trashedMs + 30 * 24 * 60 * 60 * 1000;
  return Math.ceil((purgeMs - Date.now()) / (24 * 60 * 60 * 1000));
}

// Ukuran tampilan kartu — lebar kolom grid tetap (bukan stretch penuh), supaya
// video vertikal tidak membengkak. Dipilih Kecil/Sedang/Besar, tersimpan per browser.
type CardSize = 'kecil' | 'sedang' | 'besar';
const CARD_SIZE_PX: Record<CardSize, number> = { kecil: 200, sedang: 260, besar: 340 };
const CARD_SIZE_LABEL: Record<CardSize, string> = { kecil: 'Kecil', sedang: 'Sedang', besar: 'Besar' };
const CARD_SIZE_STORAGE_KEY = 'sbp_agent_videos_card_size';

type ViewMode = 'active' | 'trash';

interface ContextMenuState { x: number; y: number; videoId: number }

export default function AdminViralFrameAgentVideosPage() {
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null);
  const [videos, setVideos] = useState<AgentVideo[]>([]);
  const [loadingChars, setLoadingChars] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [edits, setEdits] = useState<Record<number, { caption: string; hashtags: string }>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [ratioFilter, setRatioFilter] = useState<RatioClass | 'semua'>('semua');
  const [cardSize, setCardSize] = useState<CardSize>('sedang');
  const [badgeAssets, setBadgeAssets] = useState<Partial<Record<BadgeType, BadgeAsset>>>({});
  const [showBadgeEditor, setShowBadgeEditor] = useState(false);
  const [view, setView] = useState<ViewMode>('active');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<{ video: AgentVideo; displayUrl: string } | null>(null);
  const [slotRefreshTick, setSlotRefreshTick] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(CARD_SIZE_STORAGE_KEY) as CardSize | null;
    if (saved && saved in CARD_SIZE_PX) setCardSize(saved);
  }, []);

  const loadBadges = useCallback(async (characterId: number) => {
    try {
      const r = await fetch(`/api/admin/viralframe/badges?character_id=${characterId}`, { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) setBadgeAssets(Object.fromEntries((j.data?.items ?? []).map((a: BadgeAsset) => [a.type, a])));
    } catch { /* noop */ }
  }, []);

  const changeCardSize = (size: CardSize) => {
    setCardSize(size);
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, size);
  };

  const loadCharacters = useCallback(async () => {
    setLoadingChars(true);
    try {
      const r = await fetch('/api/admin/viralframe/characters', { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) {
        const items: CharacterOption[] = j.data?.items ?? [];
        setCharacters(items);
        if (items.length > 0) setSelectedCharId(prev => prev ?? items[0].id);
      }
    } catch { /* noop */ } finally { setLoadingChars(false); }

    try {
      // counts_by=character_id — agregat GROUP BY di database (tidak kena batas
      // limit/200 sama sekali). Dulu endpoint list biasa dipanggil dengan
      // limit=200 lalu dihitung manual di client — kalau video aktif di semua
      // karakter gabungan lebih dari 200, sebagian karakter dapat angka salah
      // tanpa indikasi apa pun (audit 2026-07-28).
      const r = await fetch('/api/admin/viralframe/agent-videos?counts_by=character_id&view=active', { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) {
        const rows: { character_id: number; count: number }[] = j.data?.counts ?? [];
        const c: Record<number, number> = {};
        rows.forEach(row => { c[row.character_id] = row.count; });
        setCounts(c);
      }
    } catch { /* noop */ }
  }, []);

  const loadVideos = useCallback(async (characterId: number, viewMode: ViewMode) => {
    setLoadingVideos(true);
    try {
      const r = await fetch(`/api/admin/viralframe/agent-videos?character_id=${characterId}&view=${viewMode}`, { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) {
        const items: AgentVideo[] = j.data?.items ?? [];
        setVideos(items);
        setEdits(Object.fromEntries(items.map(v => [v.id, { caption: v.caption ?? '', hashtags: v.hashtags ?? '' }])));
      }
    } catch { /* noop */ } finally { setLoadingVideos(false); }
  }, []);

  useEffect(() => { loadCharacters(); }, [loadCharacters]);
  useEffect(() => {
    if (selectedCharId != null) {
      setRatioFilter('semua'); setSelectedIds(new Set()); setContextMenu(null);
      loadVideos(selectedCharId, view);
      if (view === 'active') loadBadges(selectedCharId);
    }
  }, [selectedCharId, view, loadVideos, loadBadges]);

  const selectedCharacter = characters.find(c => c.id === selectedCharId) ?? null;

  const ratioCounts = videos.reduce<Record<RatioClass, number>>((acc, v) => {
    const k = classifyRatio(v.width, v.height);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, { vertikal: 0, horizontal: 0, square: 0, lainnya: 0 });
  const filteredVideos = ratioFilter === 'semua' ? videos : videos.filter(v => classifyRatio(v.width, v.height) === ratioFilter);

  const refreshAfterAction = () => {
    if (selectedCharId != null) loadVideos(selectedCharId, view);
    loadCharacters();
  };

  // ── Seleksi multi ──
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault();
        setSelectedIds(new Set(filteredVideos.map(v => v.id)));
      }
      if (e.key === 'Escape') { setSelectedIds(new Set()); setContextMenu(null); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredVideos]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const openContextMenu = (e: React.MouseEvent, videoId: number) => {
    e.preventDefault();
    if (!selectedIds.has(videoId)) setSelectedIds(new Set([videoId]));
    setContextMenu({ x: e.clientX, y: e.clientY, videoId });
  };

  // ── Aksi bulk (dipakai toolbar & context menu) ──
  const bulkAction = async (action: 'trash' | 'restore' | 'delete', ids: number[]) => {
    if (ids.length === 0) return;
    if (action === 'delete' && !window.confirm(`Hapus permanen ${ids.length} video? File Cloudinary ikut terhapus, tidak bisa dipulihkan.`)) return;
    setBulkBusy(true);
    try {
      await fetch('/api/admin/viralframe/agent-videos/bulk', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
    } catch { /* noop */ } finally {
      setBulkBusy(false);
      clearSelection();
      setContextMenu(null);
      refreshAfterAction();
    }
  };

  // ── Aksi per-item (klik cepat tanpa perlu select dulu) ──
  const trashOne = async (id: number) => {
    try { await fetch(`/api/admin/viralframe/agent-videos/${id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trash: true }),
    }); } catch { /* noop */ }
    refreshAfterAction();
  };
  const restoreOne = async (id: number) => {
    try { await fetch(`/api/admin/viralframe/agent-videos/${id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trash: false }),
    }); } catch { /* noop */ }
    refreshAfterAction();
  };
  const deletePermanentOne = async (id: number) => {
    if (!window.confirm('Hapus permanen video ini? File di Cloudinary juga akan dihapus, tidak bisa dipulihkan.')) return;
    try { await fetch(`/api/admin/viralframe/agent-videos/${id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* noop */ }
    refreshAfterAction();
  };

  const saveEdit = async (id: number) => {
    const e = edits[id]; if (!e) return;
    setSavingId(id);
    try {
      await fetch(`/api/admin/viralframe/agent-videos/${id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: e.caption, hashtags: e.hashtags }),
      });
    } catch { /* noop */ } finally {
      setSavingId(null); setEditingId(null);
      if (selectedCharId != null) loadVideos(selectedCharId, view);
    }
  };

  const setEdit = (id: number, k: 'caption' | 'hashtags', val: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? { caption: '', hashtags: '' }), [k]: val } }));

  const copyCaption = async (v: AgentVideo) => {
    const prefix = pickStatusBadgeType(v) === 'sold' ? '[SOLD] ' : '';
    const text = `${prefix}${v.caption ?? ''}${v.hashtags ? `\n\n${v.hashtags}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(v.id);
      setTimeout(() => setCopiedId(c => (c === v.id ? null : c)), 1500);
    } catch { /* noop */ }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-xl text-[#0F172A] flex items-center gap-2">
          <Users size={22} className="text-[#1565C0]" /> Konten Agent
        </h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Video hasil upload manual (Cloudinary), dikelompokkan per karakter/agent — lintas semua properti.
        </p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar karakter */}
        <div className="w-56 flex-shrink-0 bg-white rounded-2xl border border-gray-100 p-2 space-y-1">
          {loadingChars ? (
            <div className="py-8 text-center"><Loader2 size={18} className="animate-spin mx-auto text-[#94A3B8]" /></div>
          ) : characters.length === 0 ? (
            <p className="text-xs text-[#94A3B8] p-3">Belum ada karakter. Buat dulu lewat Step 3 — Pilih Karakter di ViralFrame.</p>
          ) : (
            characters.map(c => (
              <button key={c.id} onClick={() => setSelectedCharId(c.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                  selectedCharId === c.id ? 'bg-[#F0F7FF] text-[#1565C0]' : 'hover:bg-gray-50 text-[#0F172A]'
                }`}>
                <img src={mediaUrl(c.foto_url)} alt={c.nama} className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-gray-100" />
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{c.nama}</span>
                <span className="text-[11px] text-[#94A3B8] flex-shrink-0">{counts[c.id] ?? 0}</span>
              </button>
            ))
          )}
        </div>

        {/* Grid video */}
        <div className="flex-1 min-w-0 space-y-3">
          <SlotIndicatorStrip refreshKey={slotRefreshTick} />
          {/* Tab Aktif/Sampah */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full p-0.5 w-fit">
            {([{ v: 'active', label: 'Aktif' }, { v: 'trash', label: 'Sampah' }] as const).map(t => (
              <button key={t.v} onClick={() => setView(t.v)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  view === t.v ? 'bg-[#1565C0] text-white' : 'text-[#64748B] hover:bg-gray-50'
                }`}>
                {t.v === 'trash' && <Archive size={12} />} {t.label}
              </button>
            ))}
          </div>

          {view === 'active' && selectedCharacter && (
            <div>
              <button onClick={() => setShowBadgeEditor(s => !s)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-white border border-gray-100 text-sm font-semibold text-[#0F172A] hover:border-[#1565C0]/30">
                <span className="flex items-center gap-2"><Layers size={16} className="text-[#F97316]" /> Badge &amp; Logo — {selectedCharacter.nama}</span>
                {showBadgeEditor ? <ChevronUp size={16} className="text-[#94A3B8]" /> : <ChevronDown size={16} className="text-[#94A3B8]" />}
              </button>
              {showBadgeEditor && (
                <div className="mt-3">
                  <BadgeLogoSettings
                    characterId={selectedCharacter.id}
                    characterName={selectedCharacter.nama}
                    assets={Object.values(badgeAssets).filter((a): a is BadgeAsset => !!a)}
                    sampleVideos={videos}
                    onChanged={() => loadBadges(selectedCharacter.id)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Toolbar seleksi bulk */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#0F172A] text-white text-sm sticky top-2 z-10">
              <span className="font-semibold">{selectedIds.size} video dipilih</span>
              <div className="flex-1" />
              {view === 'active' ? (
                <button disabled={bulkBusy} onClick={() => bulkAction('trash', Array.from(selectedIds))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 disabled:opacity-50">
                  <Archive size={13} /> Pindahkan ke Sampah
                </button>
              ) : (
                <>
                  <button disabled={bulkBusy} onClick={() => bulkAction('restore', Array.from(selectedIds))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 disabled:opacity-50">
                    <RotateCcw size={13} /> Pulihkan
                  </button>
                  <button disabled={bulkBusy} onClick={() => bulkAction('delete', Array.from(selectedIds))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/90 hover:bg-red-500 disabled:opacity-50">
                    <Trash2 size={13} /> Hapus Permanen
                  </button>
                </>
              )}
              <button onClick={clearSelection} className="text-xs text-white/70 hover:text-white">Batal</button>
            </div>
          )}

          {loadingVideos ? (
            <div className="py-16 text-center text-sm text-[#94A3B8]"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Memuat video…</div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl bg-white">
              <p className="text-sm text-[#64748B]">{view === 'trash' ? 'Sampah kosong.' : 'Belum ada video untuk karakter ini.'}</p>
              {view === 'active' && <p className="text-xs text-[#94A3B8] mt-1">Upload dari halaman workspace properti → Step 4 → tab "Upload Hasil".</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Filter aspek rasio — otomatis dari dimensi asli video (Cloudinary), bukan input manual */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['semua', 'vertikal', 'horizontal', 'square'] as const).map(f => (
                    <button key={f} onClick={() => setRatioFilter(f)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        ratioFilter === f ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-white text-[#64748B] border-gray-200 hover:border-[#1565C0]/40'
                      }`}>
                      {f === 'semua' ? `Semua (${videos.length})` : `${RATIO_LABEL[f]} (${ratioCounts[f]})`}
                    </button>
                  ))}
                </div>

                {/* Ukuran tampilan kartu */}
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full p-0.5">
                  {(['kecil', 'sedang', 'besar'] as const).map(s => (
                    <button key={s} onClick={() => changeCardSize(s)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        cardSize === s ? 'bg-[#1565C0] text-white' : 'text-[#64748B] hover:bg-gray-50'
                      }`}>
                      {CARD_SIZE_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              {filteredVideos.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl bg-white">
                  <p className="text-sm text-[#64748B]">Tidak ada video dengan rasio ini.</p>
                </div>
              ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_SIZE_PX[cardSize]}px, ${CARD_SIZE_PX[cardSize]}px))` }}>
              {filteredVideos.map(v => {
                const e = edits[v.id] ?? { caption: '', hashtags: '' };
                const editing = editingId === v.id;
                const ratio = classifyRatio(v.width, v.height);
                const statusBadgeType = pickStatusBadgeType(v);
                const overlays = composeOverlaysForProperty(badgeAssets, v);
                const displayUrl = buildOverlayVideoUrl(v.cloudinary_url, overlays);
                const selected = selectedIds.has(v.id);
                const purgeDays = v.trashed_at ? daysUntilPurge(v.trashed_at) : null;
                return (
                  <div key={v.id} onContextMenu={e2 => openContextMenu(e2, v.id)}
                    className={`border rounded-2xl overflow-hidden bg-white flex flex-col transition-colors ${selected ? 'border-[#1565C0] ring-2 ring-[#1565C0]/30' : 'border-gray-100'}`}>
                    <div className="relative">
                      <video key={displayUrl} src={displayUrl} poster={toImageThumbnailUrl(displayUrl)} controls preload="none" className="w-full bg-black"
                        style={{ aspectRatio: v.width && v.height ? `${v.width} / ${v.height}` : '16 / 9', objectFit: 'contain' }} />
                      <button onClick={() => toggleSelect(v.id)}
                        className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white"
                        title="Pilih video">
                        {selected ? <CheckCircle2 size={16} className="text-[#4FC3F7]" /> : <Circle size={16} />}
                      </button>
                      {purgeDays != null && (
                        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${purgeDays <= 0 ? 'bg-[#94A3B8]' : 'bg-red-500'}`}>
                          {purgeDays <= 0 ? 'Menunggu pembersihan…' : `Terhapus otomatis ${purgeDays} hari lagi`}
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-2 flex-1 flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/admin/viralframe/${v.property_id}`} className="min-w-0 group">
                          <div className="text-sm font-medium text-[#0F172A] truncate group-hover:text-[#1565C0]">{v.property_title}</div>
                          <div className="text-[11px] text-[#94A3B8] flex items-center gap-1.5 flex-wrap">
                            <span>{v.kode_listing}</span>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[#64748B] font-semibold">{RATIO_LABEL[ratio]}</span>
                            {statusBadgeType && (
                              <span className={`px-1.5 py-0.5 rounded-full font-semibold text-white ${statusBadgeType === 'sold' ? 'bg-red-500' : 'bg-[#1565C0]'}`}>
                                {STATUS_BADGE_LABEL[statusBadgeType]}
                              </span>
                            )}
                            {v.bytes && <><span>·</span><span>{(v.bytes / 1024 / 1024).toFixed(1)}MB</span></>}
                            <span>·</span>
                            <span>{new Date(v.created_at).toLocaleDateString('id-ID')}</span>
                          </div>
                        </Link>
                        <div className="flex gap-1 flex-shrink-0">
                          <a href={toAttachmentUrl(displayUrl)} className="p-1.5 rounded-lg text-[#1565C0] hover:bg-[#F0F7FF]" title="Download (versi siap-post)"><Download size={14} /></a>
                          {view === 'active' ? (
                            <button onClick={() => trashOne(v.id)} className="p-1.5 rounded-lg text-[#64748B] hover:bg-gray-100" title="Pindahkan ke Sampah"><Archive size={14} /></button>
                          ) : (
                            <>
                              <button onClick={() => restoreOne(v.id)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Pulihkan ke Aktif"><RotateCcw size={14} /></button>
                              <button onClick={() => deletePermanentOne(v.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Hapus permanen sekarang"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      </div>

                      {editing ? (
                        <div className="space-y-1.5 pt-1 border-t border-gray-50">
                          <textarea value={e.caption} onChange={ev => setEdit(v.id, 'caption', ev.target.value)} placeholder="Caption..."
                            className="w-full h-16 text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0] resize-y" />
                          <textarea value={e.hashtags} onChange={ev => setEdit(v.id, 'hashtags', ev.target.value)} placeholder="#hashtag..."
                            className="w-full h-10 text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0] resize-y" />
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-[#94A3B8] hover:bg-gray-50"><X size={14} /></button>
                            <button onClick={() => saveEdit(v.id)} disabled={savingId === v.id} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
                              {savingId === v.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-1 border-t border-gray-50 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-[#0F172A] whitespace-pre-wrap line-clamp-3 flex-1">
                              {statusBadgeType === 'sold' && <span className="font-bold text-red-500">[SOLD] </span>}
                              {v.caption || <span className="text-[#94A3B8]">Belum ada caption</span>}
                            </p>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => copyCaption(v)} className="p-1 rounded text-[#94A3B8] hover:text-[#1565C0]" title="Copy caption (dgn prefix [SOLD] jika sold)">
                                {copiedId === v.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                              <button onClick={() => setEditingId(v.id)} className="p-1 rounded text-[#94A3B8] hover:text-[#1565C0]" title="Edit caption"><Pencil size={12} /></button>
                            </div>
                          </div>
                          {v.hashtags && <p className="text-[11px] text-[#1565C0] font-medium mt-1 line-clamp-1">{v.hashtags}</p>}
                        </div>
                      )}

                      {view === 'active' && (
                        <button onClick={() => setScheduleTarget({ video: v, displayUrl })}
                          className="mt-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700">
                          <Send size={12} /> Jadwalkan ke Sosmed
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context menu klik-kanan */}
      {contextMenu && (
        <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[200px]"
          style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 text-[11px] text-[#94A3B8] border-b border-gray-50">{selectedIds.size} video dipilih</div>
          {view === 'active' ? (
            <button onClick={() => bulkAction('trash', Array.from(selectedIds))}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#0F172A] hover:bg-gray-50 text-left">
              <Archive size={14} /> Pindahkan ke Sampah
            </button>
          ) : (
            <>
              <button onClick={() => bulkAction('restore', Array.from(selectedIds))}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#0F172A] hover:bg-gray-50 text-left">
                <RotateCcw size={14} /> Pulihkan
              </button>
              <button onClick={() => bulkAction('delete', Array.from(selectedIds))}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left">
                <Trash2 size={14} /> Hapus Permanen
              </button>
            </>
          )}
        </div>
      )}

      {scheduleTarget && (
        <AgentScheduleModal video={scheduleTarget.video} assetUrl={scheduleTarget.displayUrl} onClose={() => setScheduleTarget(null)}
          onScheduled={() => { setScheduleTarget(null); setSlotRefreshTick(t => t + 1); if (selectedCharId != null) loadVideos(selectedCharId, view); }} />
      )}
    </div>
  );
}

// ── Modal "Jadwalkan ke Sosmed" untuk Konten Agent — TIDAK butuh upload
// presign seperti Content Library, karena cloudinary_url sudah publik begitu
// video ini diupload. Satu panggilan server saja cukup. `assetUrl` dikirim dari
// parent (bukan cloudinary_url mentah dari DB) — itu URL versi "siap-post" YANG
// SUDAH ADA overlay badge (SOLD/Hot/Featured) dari buildOverlayVideoUrl(), sama
// persis dengan yang dipreview & di-download admin. cloudinary_url mentah TIDAK
// PERNAH punya badge, cuma jadi bahan baku overlay.
function AgentScheduleModal({ video, assetUrl, onClose, onScheduled }: { video: AgentVideo; assetUrl: string; onClose: () => void; onScheduled: () => void }) {
  const [caption, setCaption] = useState(video.caption ?? '');
  const [phase, setPhase] = useState<'form' | 'submitting' | 'done' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState<{ platform: string; status: 'scheduled' | 'failed'; error: string | null }[]>([]);

  const submit = async () => {
    setErrorMsg('');
    setPhase('submitting');
    try {
      const res = await fetch('/api/admin/viralframe/schedule/commit-agent', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: video.id, caption, asset_url: assetUrl }),
      });
      const json = await bacaJson<{ results: typeof results; trashed: boolean }>(res);
      if (!json.success || !json.data) throw new Error(json.error ?? 'Gagal menjadwalkan post');
      setResults(json.data.results);
      setPhase('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menjadwalkan');
      setPhase('error');
    }
  };

  const platformLabel: Record<string, string> = { youtube: 'YouTube Shorts', tiktok: 'TikTok', threads: 'Threads', facebook: 'Facebook Pages', instagram: 'Instagram' };

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={phase === 'form' || phase === 'error' ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#0F172A]">Jadwalkan ke Sosmed</h3>
          {phase !== 'submitting' && (
            <button onClick={phase === 'done' ? onScheduled : onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
          )}
        </div>

        {(phase === 'form' || phase === 'error') && (
          <>
            <p className="text-xs text-[#64748B] mb-3">Video akan dijadwalkan otomatis ke 5 akun (YT Shorts, TikTok, Threads, FB Pages, Instagram) pada slot jam primetime berikutnya yang masih kosong hari ini.</p>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} placeholder="Caption / deskripsi post…"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl outline-none focus:border-[#1565C0] mb-3" />
            {errorMsg && <p className="text-xs text-red-600 mb-3">{errorMsg}</p>}
            <button onClick={submit} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90">
              Jadwalkan Sekarang
            </button>
          </>
        )}

        {phase === 'submitting' && (
          <div className="py-6 text-center text-sm text-[#64748B]">
            <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Menjadwalkan ke 5 akun…
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-1.5">
            {results.map(r => (
              <div key={r.platform} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-gray-50">
                <span className="font-medium text-[#0F172A]">{platformLabel[r.platform] ?? r.platform}</span>
                {r.status === 'scheduled'
                  ? <span className="text-emerald-600 font-semibold">✅ Terjadwal</span>
                  : <span className="text-red-500 font-semibold" title={r.error ?? ''}>❌ Gagal</span>}
              </div>
            ))}
            {results.some(r => r.status === 'failed') && (
              <p className="text-[11px] text-[#94A3B8] pt-1">Platform yang gagal bisa dicoba ulang manual nanti. Video sudah pindah ke Sampah karena minimal 1 platform sukses.</p>
            )}
            <button onClick={onScheduled} className="w-full mt-2 py-2 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90">Selesai</button>
          </div>
        )}
      </div>
    </div>
  );
}
