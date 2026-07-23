import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { Users, Loader2, Download, Trash2, Pencil, Check, X, Clock } from 'lucide-react';

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
  status: string;
  post_url: string | null;
  created_at: string;
  character_nama: string;
  character_foto_url: string;
  kode_listing: string;
  property_title: string;
}

function mediaUrl(key: string) {
  return `/api/admin/media?key=${encodeURIComponent(key)}`;
}

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

  const loadCharacters = useCallback(async () => {
    setLoadingChars(true);
    try {
      const r = await fetch('/api/admin/viralframe/characters', { credentials: 'include' });
      const j = await r.json();
      if (j.success) {
        const items: CharacterOption[] = j.data?.items ?? [];
        setCharacters(items);
        if (items.length > 0) setSelectedCharId(prev => prev ?? items[0].id);
      }
    } catch { /* noop */ } finally { setLoadingChars(false); }

    try {
      const r = await fetch('/api/admin/viralframe/agent-videos?limit=200', { credentials: 'include' });
      const j = await r.json();
      if (j.success) {
        const items: AgentVideo[] = j.data?.items ?? [];
        const c: Record<number, number> = {};
        items.forEach(v => { c[v.character_id] = (c[v.character_id] ?? 0) + 1; });
        setCounts(c);
      }
    } catch { /* noop */ }
  }, []);

  const loadVideos = useCallback(async (characterId: number) => {
    setLoadingVideos(true);
    try {
      const r = await fetch(`/api/admin/viralframe/agent-videos?character_id=${characterId}`, { credentials: 'include' });
      const j = await r.json();
      if (j.success) {
        const items: AgentVideo[] = j.data?.items ?? [];
        setVideos(items);
        setEdits(Object.fromEntries(items.map(v => [v.id, { caption: v.caption ?? '', hashtags: v.hashtags ?? '' }])));
      }
    } catch { /* noop */ } finally { setLoadingVideos(false); }
  }, []);

  useEffect(() => { loadCharacters(); }, [loadCharacters]);
  useEffect(() => { if (selectedCharId != null) loadVideos(selectedCharId); }, [selectedCharId, loadVideos]);

  const del = async (id: number) => {
    if (!window.confirm('Hapus video ini? File di Cloudinary juga akan dihapus.')) return;
    try { await fetch(`/api/admin/viralframe/agent-videos/${id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* noop */ }
    if (selectedCharId != null) loadVideos(selectedCharId);
    loadCharacters();
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
      if (selectedCharId != null) loadVideos(selectedCharId);
    }
  };

  const setEdit = (id: number, k: 'caption' | 'hashtags', val: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? { caption: '', hashtags: '' }), [k]: val } }));

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
        <div className="flex-1 min-w-0">
          {loadingVideos ? (
            <div className="py-16 text-center text-sm text-[#94A3B8]"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Memuat video…</div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl bg-white">
              <p className="text-sm text-[#64748B]">Belum ada video untuk karakter ini.</p>
              <p className="text-xs text-[#94A3B8] mt-1">Upload dari halaman workspace properti → Step 4 → tab "Upload Hasil".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map(v => {
                const e = edits[v.id] ?? { caption: '', hashtags: '' };
                const editing = editingId === v.id;
                return (
                  <div key={v.id} className="border border-gray-100 rounded-2xl overflow-hidden bg-white flex flex-col">
                    <video src={v.cloudinary_url} controls preload="none" className="w-full bg-black aspect-video" />
                    <div className="p-3 space-y-2 flex-1 flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/admin/viralframe/${v.property_id}`} className="min-w-0 group">
                          <div className="text-sm font-medium text-[#0F172A] truncate group-hover:text-[#1565C0]">{v.property_title}</div>
                          <div className="text-[11px] text-[#94A3B8]">{v.kode_listing} · {v.bytes ? `${(v.bytes / 1024 / 1024).toFixed(1)}MB` : ''} · {new Date(v.created_at).toLocaleDateString('id-ID')}</div>
                        </Link>
                        <div className="flex gap-1 flex-shrink-0">
                          <a href={v.cloudinary_url} download target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-[#1565C0] hover:bg-[#F0F7FF]" title="Download"><Download size={14} /></a>
                          <button onClick={() => del(v.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Hapus"><Trash2 size={14} /></button>
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
                            <p className="text-xs text-[#0F172A] whitespace-pre-wrap line-clamp-3 flex-1">{v.caption || <span className="text-[#94A3B8]">Belum ada caption</span>}</p>
                            <button onClick={() => setEditingId(v.id)} className="p-1 rounded text-[#94A3B8] hover:text-[#1565C0] flex-shrink-0" title="Edit caption"><Pencil size={12} /></button>
                          </div>
                          {v.hashtags && <p className="text-[11px] text-[#1565C0] font-medium mt-1 line-clamp-1">{v.hashtags}</p>}
                        </div>
                      )}

                      <button disabled title="Segera hadir"
                        className="mt-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#94A3B8] bg-gray-50 cursor-not-allowed">
                        <Clock size={12} /> Jadwalkan ke Medsos
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
