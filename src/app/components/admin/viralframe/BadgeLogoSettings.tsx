import { useState, useEffect, useCallback, useRef } from 'react';
import { Layers, Upload, Loader2, Trash2, ImageOff } from 'lucide-react';
import { buildOverlayVideoUrl, toImageThumbnailUrl, type BadgeAsset, type BadgeType, type BadgeGravity } from '../../../lib/cloudinaryOverlay';

const SLOTS: { type: BadgeType; label: string; hint: string; defaultGravity: BadgeGravity }[] = [
  { type: 'sold', label: 'Sold', hint: 'Pojok kiri-atas · properti sudah terjual', defaultGravity: 'north_west' },
  { type: 'premium', label: 'Premium', hint: 'Pojok kiri-atas', defaultGravity: 'north_west' },
  { type: 'featured', label: 'Featured', hint: 'Pojok kiri-atas', defaultGravity: 'north_west' },
  { type: 'hot', label: 'Hot', hint: 'Pojok kiri-atas', defaultGravity: 'north_west' },
  { type: 'pilihan', label: 'Pilihan', hint: 'Pojok kiri-atas', defaultGravity: 'north_west' },
  { type: 'logo', label: 'Logo Watermark', hint: 'Biasanya pojok kanan-bawah — menimpa watermark Google Flow/Gemini', defaultGravity: 'south_east' },
];

const GRAVITY_OPTIONS: { value: BadgeGravity; label: string }[] = [
  { value: 'north_west', label: 'Kiri-Atas' },
  { value: 'north_east', label: 'Kanan-Atas' },
  { value: 'south_west', label: 'Kiri-Bawah' },
  { value: 'south_east', label: 'Kanan-Bawah' },
  { value: 'center', label: 'Tengah' },
];
const GRAVITY_LABEL: Record<BadgeGravity, string> = Object.fromEntries(GRAVITY_OPTIONS.map(g => [g.value, g.label])) as Record<BadgeGravity, string>;

interface Draft { gravity: BadgeGravity; offset_x: number; offset_y: number; width_pct: number }

function defaultDraft(defaultGravity: BadgeGravity): Draft {
  return { gravity: defaultGravity, offset_x: 16, offset_y: 16, width_pct: 0.18 };
}

interface SampleVideo { id: number; cloudinary_url: string; width: number | null; height: number | null; kode_listing: string; property_title: string }

interface CloudinaryImageUploadResult { public_id: string; secure_url: string; error?: { message: string } }

function BadgeSlot({ type, label, hint, defaultGravity, asset, sampleVideo, onSaved, onDeleted }: {
  type: BadgeType; label: string; hint: string; defaultGravity: BadgeGravity;
  asset: BadgeAsset | null; sampleVideo: SampleVideo | null;
  onSaved: () => void; onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(asset ? { gravity: asset.gravity, offset_x: asset.offset_x, offset_y: asset.offset_y, width_pct: asset.width_pct } : defaultDraft(defaultGravity));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (asset) setDraft({ gravity: asset.gravity, offset_x: asset.offset_x, offset_y: asset.offset_y, width_pct: asset.width_pct });
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
          gravity: draft.gravity, offset_x: draft.offset_x, offset_y: draft.offset_y, width_pct: draft.width_pct,
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

  const previewAsset: BadgeAsset = asset
    ? { ...asset, ...draft }
    : { id: 0, type, cloudinary_public_id: '', cloudinary_url: '', ...draft };
  const canPreview = !!(asset && sampleVideo);
  const previewThumbUrl = canPreview ? toImageThumbnailUrl(buildOverlayVideoUrl(sampleVideo!.cloudinary_url, [previewAsset])) : null;
  const previewAspect = sampleVideo?.width && sampleVideo?.height ? `${sampleVideo.width} / ${sampleVideo.height}` : '16 / 9';
  const overlayWidthPx = sampleVideo?.width ? Math.round(draft.width_pct * sampleVideo.width) : null;
  const positionChanged = asset && (draft.gravity !== asset.gravity || draft.offset_x !== asset.offset_x || draft.offset_y !== asset.offset_y || draft.width_pct !== asset.width_pct);

  return (
    <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">{label}</div>
          <div className="text-[11px] text-[#94A3B8]">{hint}</div>
        </div>
        {asset && (
          <button onClick={del} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 flex-shrink-0" title="Hapus badge">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Preview besar — gambar statis (frame video + overlay), bukan video autoplay, supaya ringan & stabil */}
      <div className="w-full bg-[#0B2447] rounded-xl overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: previewAspect, maxHeight: 320 }}>
        {previewThumbUrl ? (
          <img key={previewThumbUrl} src={previewThumbUrl} alt={`Preview ${label}`} className="w-full h-full object-contain" />
        ) : asset ? (
          <div className="text-center px-3">
            <img src={asset.cloudinary_url} alt={label} className="max-w-[80px] max-h-[80px] object-contain mx-auto mb-2 opacity-70" />
            <span className="text-[10px] text-white/50">Belum ada video contoh untuk preview posisi</span>
          </div>
        ) : (
          <div className="text-center px-3">
            <ImageOff size={20} className="text-white/30 mx-auto mb-1" />
            <span className="text-[10px] text-white/40">Belum ada gambar {label.toLowerCase()}</span>
          </div>
        )}
      </div>

      {canPreview && overlayWidthPx != null && (
        <p className="text-[10px] text-[#94A3B8]">
          Lebar overlay ≈ <strong className="text-[#0F172A]">{overlayWidthPx}px</strong> dari {sampleVideo!.width}px ·
          {' '}offset {GRAVITY_LABEL[draft.gravity]}: {draft.offset_x}px, {draft.offset_y}px
        </p>
      )}

      {/* Controls */}
      <div className="space-y-2">
        <input ref={fileRef} type="file" accept="image/png,image/webp" disabled={uploading}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0] disabled:opacity-50" />

        <div className="grid grid-cols-2 gap-1.5">
          <select value={draft.gravity} onChange={e => setDraft(d => ({ ...d, gravity: e.target.value as BadgeGravity }))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]">
            {GRAVITY_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#94A3B8]">Lebar</span>
            <input type="number" min={2} max={100} value={Math.round(draft.width_pct * 100)}
              onChange={e => setDraft(d => ({ ...d, width_pct: Math.min(Math.max(Number(e.target.value) / 100, 0.02), 1) }))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]" />
            <span className="text-[10px] text-[#94A3B8]">%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#94A3B8]">X</span>
            <input type="number" value={draft.offset_x} onChange={e => setDraft(d => ({ ...d, offset_x: Number(e.target.value) || 0 }))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#94A3B8]">Y</span>
            <input type="number" value={draft.offset_y} onChange={e => setDraft(d => ({ ...d, offset_y: Number(e.target.value) || 0 }))}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1565C0]" />
          </div>
        </div>

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
          <p className="text-xs text-[#64748B]">Ditempel otomatis ke video Konten Agent sesuai status properti. Cuma 1 badge status yang tampil (prioritas: Sold &gt; Premium &gt; Featured &gt; Hot &gt; Pilihan), logo selalu tampil.</p>
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
