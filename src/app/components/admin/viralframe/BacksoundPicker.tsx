// Backsound Picker — bank musik latar (upload/pilih/hapus) + slider volume.
// Controlled component (pola sama CharacterStep) dipakai di dalam UploadAgentVideo
// (tab "Upload Hasil"), TEPAT SEBELUM upload ke Cloudinary — lihat komentar di
// AdminViralFrameWorkspacePage.tsx (applyBacksound) untuk kenapa logic merge ffmpeg
// SENGAJA tidak ditaruh di sini (butuh akses ke `file` lokal milik parent).
//
// Redesain 2026-07-28: baris lama pakai native <audio controls> yang disempitkan
// (w-24) sampai nyaris tak terlihat — user mengira itu area "pilih" dan bingung
// kenapa tidak ada yang terjadi. Sekarang: radio bulat eksplisit = area pilih,
// tombol ▶/⏸ terpisah = preview (satu <audio> tersembunyi dipakai bersama,
// gantian src per klik, bukan satu <audio> per baris).

import { bacaJson } from '../../../../lib/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Music, Plus, Trash2, Loader2, Check, Play, Pause } from 'lucide-react';

export interface BacksoundItem { id: number; label: string; r2_key: string; duration_sec: number | null; size_bytes: number | null; created_at: string }

export const backsoundMediaUrl = (key: string) => `/api/admin/media?key=${encodeURIComponent(key)}`;

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

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

  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  // Hentikan preview yang sedang jalan kalau item-nya dihapus/komponen unmount.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePlay = (b: BacksoundItem) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === b.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = backsoundMediaUrl(b.r2_key);
    audio.play().catch(() => {});
    setPlayingId(b.id);
  };

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
    if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); }
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
      {/* Satu <audio> tersembunyi dipakai bergantian oleh semua tombol ▶ preview. */}
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />

      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">Bank Backsound</span>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">Klik salah satu untuk memilih. Tombol ▶ cuma memutar preview.</p>
        </div>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={e => uploadBacksound(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] disabled:opacity-50 transition-colors flex-shrink-0">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {uploading ? 'Mengunggah…' : 'Upload dari PC'}
        </button>
      </div>

      {loading && <div className="py-4 text-center text-[#94A3B8] text-xs"><Loader2 size={16} className="animate-spin mx-auto mb-1" /> Memuat…</div>}
      {listError && <p className="text-xs text-red-600">{listError} — <button onClick={load} className="underline">Coba lagi</button></p>}
      {!loading && !listError && items.length === 0 && (
        <div className="text-center py-4 border border-dashed border-gray-200 rounded-xl">
          <Music size={18} className="text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-[#64748B]">Belum ada backsound. Klik "Upload dari PC".</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map(b => {
            const selected = selectedId === b.id;
            const playing = playingId === b.id;
            return (
              <div key={b.id}
                onClick={() => onSelect(selected ? null : b.id, selected ? null : b)}
                role="radio" aria-checked={selected} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(selected ? null : b.id, selected ? null : b); } }}
                className={`grid grid-cols-[20px_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-xl border-[1.5px] cursor-pointer transition-colors ${
                  selected ? 'border-[#1565C0] bg-[#EFF6FF]' : 'border-gray-200 hover:border-[#C7D9EE] hover:bg-[#FAFCFF]'
                }`}>
                <span className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-[#1565C0]' : 'border-gray-300'}`}>
                  {selected && <span className="w-[9px] h-[9px] rounded-full bg-[#1565C0]" />}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#0F172A] truncate">{b.label}</div>
                  {b.duration_sec != null && b.duration_sec > 0 && (
                    <div className="text-[11px] text-[#94A3B8] mt-0.5">{fmtDuration(b.duration_sec)}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => togglePlay(b)}
                    title="Putar preview"
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 transition-colors ${
                      playing ? 'text-[#1565C0] border-[#BFDBFE] bg-[#EFF6FF]' : 'text-[#64748B] border-gray-200 hover:border-gray-300'
                    }`}>
                    {playing ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button type="button" onClick={() => deleteBacksound(b.id)} disabled={deletingId === b.id}
                    title="Hapus"
                    className="w-8 h-8 rounded-lg border border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-200 disabled:opacity-40 flex items-center justify-center flex-shrink-0">
                    {deletingId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId != null && (
        <div className="pt-3 mt-1 border-t border-gray-100">
          <label className="flex items-center justify-between text-xs text-[#64748B] mb-1">
            <span className="font-semibold text-[#0F172A]">Volume Backsound</span><span className="font-bold text-[#0F172A]">{volumePct}%</span>
          </label>
          <input type="range" min={0} max={100} value={volumePct} onChange={e => onVolumeChange(parseInt(e.target.value, 10))} className="w-full" />
          <p className="text-[10.5px] text-[#94A3B8] mt-1">Disarankan 20-30% agar dialog tetap jelas terdengar di atas musik.</p>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 mt-2">
            <Check size={10} /> Diingat sebagai volume default berikutnya
          </span>
        </div>
      )}
    </div>
  );
}
