// Backsound Picker — bank musik latar (upload/pilih/hapus) + slider volume.
// Controlled component (pola sama CharacterStep) dipakai di dalam UploadAgentVideo
// (tab "Upload Hasil"), TEPAT SEBELUM upload ke Cloudinary — lihat komentar di
// AdminViralFrameWorkspacePage.tsx (applyBacksound) untuk kenapa logic merge ffmpeg
// SENGAJA tidak ditaruh di sini (butuh akses ke `file` lokal milik parent).

import { bacaJson } from '../../../../lib/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Music, Plus, Trash2, Loader2, Check } from 'lucide-react';

export interface BacksoundItem { id: number; label: string; r2_key: string; duration_sec: number | null; size_bytes: number | null; created_at: string }

export const backsoundMediaUrl = (key: string) => `/api/admin/media?key=${encodeURIComponent(key)}`;

export default function BacksoundPicker({ selectedId, onSelect, volumePct, onVolumeChange }: {
  selectedId: number | null;
  onSelect: (id: number | null, item: BacksoundItem | null) => void;
  volumePct: number;
  onVolumeChange: (v: number) => void;
}) {
  const [items, setItems] = useState<BacksoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setListError('');
    try {
      const r = await fetch('/api/admin/viralframe/backsounds', { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) setItems(j.data?.items ?? []);
      else setListError(j.error ?? 'Gagal memuat bank backsound');
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Gagal memuat bank backsound');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const uploadBacksound = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setListError('');
    try {
      const res = await fetch(`/api/admin/viralframe/backsounds?label=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        body: file,
      });
      const j = await bacaJson(res);
      if (!res.ok || !j.success) throw new Error(j.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Gagal upload backsound');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteBacksound = async (id: number) => {
    if (!window.confirm('Hapus backsound ini dari bank?')) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/admin/viralframe/backsounds/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const j = await bacaJson(r); alert(`Gagal menghapus: ${j.error ?? `HTTP ${r.status}`}`); }
      if (selectedId === id) onSelect(null, null);
      await load();
    } catch (err: unknown) {
      alert(`Gagal menghapus: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-[#0F172A]">🎵 Bank Backsound</span>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">Musik latar Anda sendiri — pastikan bebas hak cipta untuk konten promosi publik.</p>
        </div>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={e => uploadBacksound(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] disabled:opacity-50 transition-colors flex-shrink-0">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {uploading ? 'Mengunggah…' : 'Upload'}
        </button>
      </div>

      {loading && <div className="py-4 text-center text-[#94A3B8] text-xs"><Loader2 size={16} className="animate-spin mx-auto mb-1" /> Memuat…</div>}
      {listError && <p className="text-xs text-red-600">{listError} — <button onClick={load} className="underline">Coba lagi</button></p>}
      {!loading && !listError && items.length === 0 && (
        <div className="text-center py-4 border border-dashed border-gray-200 rounded-xl">
          <Music size={18} className="text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-[#64748B]">Belum ada backsound. Klik "Upload".</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map(b => {
            const selected = selectedId === b.id;
            return (
              <div key={b.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${selected ? 'border-[#1565C0] bg-[#EFF6FF]' : 'border-gray-200'}`}>
                <button type="button" onClick={() => onSelect(selected ? null : b.id, selected ? null : b)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[#1565C0]' : 'bg-gray-100'}`}>
                    {selected ? <Check size={12} className="text-white" /> : <Music size={11} className="text-[#94A3B8]" />}
                  </span>
                  <span className="text-xs text-[#0F172A] truncate">{b.label}</span>
                </button>
                <audio src={backsoundMediaUrl(b.r2_key)} controls preload="none" className="h-6 w-24 flex-shrink-0" />
                <button type="button" onClick={() => deleteBacksound(b.id)} disabled={deletingId === b.id}
                  className="p-1 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40 flex-shrink-0">
                  {deletingId === b.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedId != null && (
        <div>
          <label className="flex items-center justify-between text-xs text-[#64748B] mb-1">
            <span>Volume Backsound</span><span className="font-semibold text-[#0F172A]">{volumePct}%</span>
          </label>
          <input type="range" min={0} max={100} value={volumePct} onChange={e => onVolumeChange(parseInt(e.target.value, 10))} className="w-full" />
          <p className="text-[10px] text-[#94A3B8] mt-1">Disarankan 20-30% agar dialog tetap jelas terdengar di atas musik.</p>
        </div>
      )}
    </div>
  );
}
