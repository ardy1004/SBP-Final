import { useState, useEffect, useCallback, useRef } from 'react';
import { Layers, Upload, Loader2, Trash2, ImageOff, Move } from 'lucide-react';
import { toImageThumbnailUrl, toTrimmedImageUrl, type BadgeAsset, type BadgeType } from '../../../lib/cloudinaryOverlay';

const SLOTS: { type: BadgeType; label: string; hint: string }[] = [
  { type: 'sold', label: 'Sold', hint: 'Properti sudah terjual' },
  { type: 'premium', label: 'Premium', hint: '' },
  { type: 'featured', label: 'Featured', hint: '' },
  { type: 'hot', label: 'Hot', hint: '' },
  { type: 'pilihan', label: 'Pilihan', hint: '' },
  { type: 'logo', label: 'Logo Watermark', hint: 'Biasanya pojok kanan-bawah — menimpa watermark Google Flow/Gemini' },
];

interface Draft { x_pct: number; y_pct: number; width_pct: number }

function defaultDraft(type: BadgeType): Draft {
  return type === 'logo' ? { x_pct: 0.78, y_pct: 0.82, width_pct: 0.18 } : { x_pct: 0.05, y_pct: 0.05, width_pct: 0.18 };
}

interface SampleVideo { id: number; cloudinary_url: string; width: number | null; height: number | null; kode_listing: string; property_title: string }

interface CloudinaryImageUploadResult { public_id: string; secure_url: string; error?: { message: string } }

type DragMode = 'move' | 'resize';
interface DragState { mode: DragMode; startClientX: number; startClientY: number; startDraft: Draft }

function BadgeSlot({ type, label, hint, asset, sampleVideo, onSaved, onDeleted }: {
  type: BadgeType; label: string; hint: string;
  asset: BadgeAsset | null; sampleVideo: SampleVideo | null;
  onSaved: () => void; onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(asset ? { x_pct: asset.x_pct, y_pct: asset.y_pct, width_pct: asset.width_pct } : defaultDraft(type));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (asset) setDraft({ x_pct: asset.x_pct, y_pct: asset.y_pct, width_pct: asset.width_pct });
  }, [asset]);

  const upload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const signRes = await fetch('/api/admin/viralframe/cloudinary-sign', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'sbp-viralframe/badges' }),
      });
      const signJson = await signRes.json();
      if (!signJson.success) throw new Error(signJson.error ?? 'Gagal menyiapkan upload');
      const { cloudName, apiKey, timestamp, folder, signature } = signJson.data;

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', apiKey);
      form.append('timestamp', String(timestamp));
      form.append('folder', folder);
      form.append('signature', signature);

      const cloudinaryResult = await new Promise<CloudinaryImageUploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
        xhr.onload = () => {
          try {
            const j = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(j); else reject(new Error(j.error?.message ?? 'Upload Cloudinary gagal'));
          } catch { reject(new Error('Respons Cloudinary tidak valid')); }
        };
        xhr.onerror = () => reject(new Error('Koneksi ke Cloudinary gagal'));
        xhr.send(form);
      });

      const saveRes = await fetch('/api/admin/viralframe/badges', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, cloudinary_public_id: cloudinaryResult.public_id, cloudinary_url: cloudinaryResult.secure_url,
          x_pct: draft.x_pct, y_pct: draft.y_pct, width_pct: draft.width_pct,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) throw new Error(saveJson.error ?? 'Gagal menyimpan badge');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const savePosition = async () => {
    if (!asset) return;
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/admin/viralframe/badges/${asset.id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? 'Gagal menyimpan posisi');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally { setSaving(false); }
  };

  const del = async () => {
    if (!asset) return;
    if (!window.confirm(`Hapus badge ${label}?`)) return;
    try { await fetch(`/api/admin/viralframe/badges/${asset.id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* noop */ }
    onDeleted();
  };

  // ── Drag (pindah posisi) & resize (ubah ukuran) langsung di atas preview ──
  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    if (mode === 'resize') e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startDraft: draft };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = (e.clientX - drag.startClientX) / rect.width;
    const dyPct = (e.clientY - drag.startClientY) / rect.height;
    if (drag.mode === 'move') {
      const w = drag.startDraft.width_pct;
      const x = Math.min(Math.max(drag.startDraft.x_pct + dxPct, 0), Math.max(0, 1 - w));
      const y = Math.min(Math.max(drag.startDraft.y_pct + dyPct, 0), 0.95);
      setDraft(d => ({ ...d, x_pct: x, y_pct: y }));
    } else {
      const w = Math.min(Math.max(drag.startDraft.width_pct + dxPct, 0.02), 0.6);
      setDraft(d => ({ ...d, width_pct: w }));
    }
  };
  const endDrag = () => { dragRef.current = null; };

  const previewAspect = sampleVideo?.width && sampleVideo?.height ? `${sampleVideo.width} / ${sampleVideo.height}` : '16 / 9';
  const overlayWidthPx = sampleVideo?.width ? Math.round(draft.width_pct * sampleVideo.width) : null;
  const positionChanged = asset && (draft.x_pct !== asset.x_pct || draft.y_pct !== asset.y_pct || draft.width_pct !== asset.width_pct);

  return (
    <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">{label}</div>
          {hint && <div className="text-[11px] text-[#94A3B8]">{hint}</div>}
        </div>
        {asset && (
          <button onClick={del} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 flex-shrink-0" title="Hapus badge">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Preview interaktif — frame video statis + kotak badge yang bisa di-drag & resize langsung */}
      {/* maxWidth (bukan maxHeight) supaya kotak preview SELALU sama persis rasionya
          dengan video asli — kalau dibatasi via maxHeight, lebar kotak tetap 100% kartu
          sementara tingginya dipangkas, foto jadi "pesek"/pillarbox di tengah, dan posisi
          badge (dihitung dari lebar kotak) jadi meleset dari posisi asli di video. */}
      <div ref={containerRef} className="relative mx-auto bg-[#0B2447] rounded-xl overflow-hidden select-none touch-none"
        style={{ aspectRatio: previewAspect, width: '100%', maxWidth: 260 }}>
        {sampleVideo ? (
          <img src={toImageThumbnailUrl(sampleVideo.cloudinary_url)} alt="" draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center px-3">
            <div>
              <ImageOff size={20} className="text-white/30 mx-auto mb-1" />
              <span className="text-[10px] text-white/40">Belum ada video contoh untuk preview posisi</span>
            </div>
          </div>
        )}

        {asset && sampleVideo && (
          <div
            onPointerDown={startDrag('move')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute cursor-move border-2 border-[#1565C0] border-dashed group"
            style={{ left: `${draft.x_pct * 100}%`, top: `${draft.y_pct * 100}%`, width: `${draft.width_pct * 100}%` }}
          >
            <img src={toTrimmedImageUrl(asset.cloudinary_url)} alt={label} draggable={false} className="w-full h-auto pointer-events-none select-none" />
            <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-[#1565C0] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Move size={10} />
            </div>
            <div
              onPointerDown={startDrag('resize')}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="absolute -right-1.5 -bottom-1.5 w-4 h-4 bg-[#1565C0] rounded-sm cursor-se-resize border border-white"
              title="Tarik untuk ubah ukuran"
            />
          </div>
        )}

        {!asset && sampleVideo && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-3">
            <span className="text-[10px] text-white/40">Belum ada gambar {label.toLowerCase()} — upload dulu di bawah</span>
          </div>
        )}
      </div>

      {asset && sampleVideo && overlayWidthPx != null && (
        <p className="text-[10px] text-[#94A3B8]">
          Posisi: <strong className="text-[#0F172A]">{Math.round(draft.x_pct * 100)}%, {Math.round(draft.y_pct * 100)}%</strong> ·
          {' '}Lebar ≈ <strong className="text-[#0F172A]">{overlayWidthPx}px</strong> dari {sampleVideo.width}px ({Math.round(draft.width_pct * 100)}%)
        </p>
      )}

      {/* Controls */}
      <div className="space-y-2">
        <input ref={fileRef} type="file" accept="image/png,image/webp" disabled={uploading}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0] disabled:opacity-50" />

        {asset && (
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#94A3B8]">X</span>
              <input type="number" min={0} max={100} value={Math.round(draft.x_pct * 100)}
                onChange={e => setDraft(d => ({ ...d, x_pct: Math.min(Math.max(Number(e.target.value) / 100, 0), 1) }))}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]" />
              <span className="text-[10px] text-[#94A3B8]">%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#94A3B8]">Y</span>
              <input type="number" min={0} max={100} value={Math.round(draft.y_pct * 100)}
                onChange={e => setDraft(d => ({ ...d, y_pct: Math.min(Math.max(Number(e.target.value) / 100, 0), 1) }))}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]" />
              <span className="text-[10px] text-[#94A3B8]">%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[#94A3B8]">Lebar</span>
              <input type="number" min={2} max={60} value={Math.round(draft.width_pct * 100)}
                onChange={e => setDraft(d => ({ ...d, width_pct: Math.min(Math.max(Number(e.target.value) / 100, 0.02), 0.6) }))}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]" />
              <span className="text-[10px] text-[#94A3B8]">%</span>
            </div>
          </div>
        )}

        {asset && (
          <button onClick={savePosition} disabled={saving || !positionChanged}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null} Simpan Posisi
          </button>
        )}
      </div>

      {uploading && <p className="text-[11px] text-[#1565C0] flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Mengupload…</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

export default function BadgeLogoSettings() {
  const [assets, setAssets] = useState<BadgeAsset[]>([]);
  const [sampleVideos, setSampleVideos] = useState<SampleVideo[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/viralframe/badges', { credentials: 'include' });
      const j = await r.json();
      if (j.success) setAssets(j.data?.items ?? []);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    fetch('/api/admin/viralframe/agent-videos?limit=10', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          const items: SampleVideo[] = j.data?.items ?? [];
          setSampleVideos(items);
          if (items.length > 0) setSelectedSampleId(prev => prev ?? items[0].id);
        }
      })
      .catch(() => {});
  }, [load]);

  const byType = Object.fromEntries(assets.map(a => [a.type, a])) as Partial<Record<BadgeType, BadgeAsset>>;
  const sampleVideo = sampleVideos.find(v => v.id === selectedSampleId) ?? sampleVideos[0] ?? null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#FFF7ED]"><Layers size={17} color="#F97316" /></div>
        <div>
          <h2 className="font-display font-semibold text-[#0F172A]">Badge &amp; Logo (ViralFrame)</h2>
          <p className="text-xs text-[#64748B]">Ditempel otomatis ke video Konten Agent sesuai status properti. Cuma 1 badge status yang tampil (prioritas: Sold &gt; Premium &gt; Featured &gt; Hot &gt; Pilihan), logo selalu tampil. Geser kotak biru di preview untuk pindah posisi, tarik sudutnya untuk ubah ukuran.</p>
        </div>
      </div>

      {!loading && sampleVideos.length === 0 && (
        <p className="text-xs text-[#94A3B8] mb-3 flex items-center gap-1.5">
          <Upload size={12} /> Belum ada video di Konten Agent — upload minimal 1 video dulu supaya preview posisi badge/logo bisa muncul.
        </p>
      )}

      {!loading && sampleVideos.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <label className="text-xs font-semibold text-[#0F172A] flex-shrink-0">Video contoh untuk preview:</label>
          <select value={selectedSampleId ?? ''} onChange={e => setSelectedSampleId(parseInt(e.target.value, 10))}
            className="flex-1 min-w-[200px] text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]">
            {sampleVideos.map(v => (
              <option key={v.id} value={v.id}>{v.kode_listing} — {v.property_title}</option>
            ))}
          </select>
          <span className="text-[10px] text-[#94A3B8]">Pilih video yang jelas kelihatan watermark Google Flow/Gemini-nya, untuk mengepaskan posisi logo.</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center"><Loader2 size={18} className="animate-spin mx-auto text-[#94A3B8]" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {SLOTS.map(s => (
            <BadgeSlot key={s.type} {...s} asset={byType[s.type] ?? null} sampleVideo={sampleVideo} onSaved={load} onDeleted={load} />
          ))}
        </div>
      )}
    </div>
  );
}
