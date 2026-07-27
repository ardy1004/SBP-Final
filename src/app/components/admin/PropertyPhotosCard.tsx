import { bacaJson } from '../../../lib/api';
import { useState, useRef } from 'react';
import { Star, Trash2, ImageOff, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { PHOTO_LABELS } from './viralframe/options';

interface PropertyImage {
  id: number;
  url_webp: string;
  alt_text: string | null;
  urutan: number;
  is_cover: number;
  /** Label ruangan untuk grounding prompt ViralFrame (migrasi 0026). */
  label_ruangan?: string | null;
}

interface Props {
  propertyId: string | number;
  isNew: boolean;
  initialPhotos?: PropertyImage[];
}

function coverSrc(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('property-photos/') || url.startsWith('signatures/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

function convertToWebP(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Konversi WebP gagal')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
    img.src = url;
  });
}

export default function PropertyPhotosCard({ propertyId, isNew, initialPhotos }: Props) {
  const [photos, setPhotos] = useState<PropertyImage[]>(initialPhotos ?? []);
  const [photoMsg, setPhotoMsg] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [coveringId, setCoveringId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [labelingId, setLabelingId] = useState<number | null>(null);

  /**
   * Simpan label ruangan foto. Optimistic: UI berubah dulu, dikembalikan bila
   * server menolak — dropdown ini akan sering dipakai berturut-turut, jadi
   * menunggu roundtrip tiap kali terasa berat.
   *
   * Label ini yang membuat prompt ViralFrame ter-ground ke ruangan yang benar,
   * dan satu-satunya sumber label bagi mode "Storyboard massal".
   */
  const handleSetLabel = async (imageId: number, label: string) => {
    if (isNew) return;
    const sebelumnya = photos.find(p => p.id === imageId)?.label_ruangan ?? null;
    const nilai = label || null;
    setPhotos(prev => prev.map(p => (p.id === imageId ? { ...p, label_ruangan: nilai } : p)));
    setLabelingId(imageId);
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/photos/${imageId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label_ruangan: nilai }),
      });
      const json = await bacaJson(res);
      if (!json.success) throw new Error(json.error ?? 'Gagal menyimpan label');
    } catch (err) {
      setPhotos(prev => prev.map(p => (p.id === imageId ? { ...p, label_ruangan: sebelumnya } : p)));
      setPhotoError(err instanceof Error ? err.message : 'Gagal menyimpan label foto');
    } finally {
      setLabelingId(null);
    }
  };
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const id = String(propertyId);

  const handleSetCover = async (imageId: number) => {
    setCoveringId(imageId);
    setPhotoMsg('');
    setPhotoError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}/photos/${imageId}/cover`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const json = await bacaJson(res);
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPhotos(json.data?.images ?? []);
      setPhotoMsg('Cover diubah ✓');
      setTimeout(() => setPhotoMsg(''), 3000);
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : 'Gagal mengubah cover');
    } finally {
      setCoveringId(null);
    }
  };

  const handleDeletePhoto = async (imageId: number) => {
    setConfirmDeleteId(null);
    setDeletingId(imageId);
    setPhotoMsg('');
    setPhotoError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}/photos/${imageId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await bacaJson(res);
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPhotos(json.data?.images ?? []);
      setPhotoMsg('Foto dihapus ✓');
      setTimeout(() => setPhotoMsg(''), 3000);
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : 'Gagal menghapus foto');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUploadPhotos = async (files: FileList) => {
    if (photos.length >= 20) { setPhotoError('Maksimal 20 foto per properti'); return; }
    setUploading(true);
    setPhotoError('');
    setPhotoMsg('');
    const fileArr = Array.from(files).slice(0, Math.max(0, 20 - photos.length));
    let errors = 0;
    for (let i = 0; i < fileArr.length; i++) {
      setUploadProgress(`Mengupload foto ${i + 1} dari ${fileArr.length}…`);
      try {
        const base64 = await convertToWebP(fileArr[i]);
        const res = await fetch(`/api/admin/properties/${id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ photo: base64 }),
        });
        const json = await bacaJson(res);
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setPhotos(prev => [...prev, json.data.image]);
      } catch (err: unknown) {
        errors++;
        setPhotoError(`Foto ${i + 1} gagal: ${err instanceof Error ? err.message : 'Error'}`);
      }
    }
    setUploading(false);
    setUploadProgress('');
    if (errors === 0) { setPhotoMsg('Upload selesai ✓'); setTimeout(() => setPhotoMsg(''), 3000); }
  };

  const handleReorder = async (photoId: number, direction: 'up' | 'down') => {
    const idx = photos.findIndex(p => p.id === photoId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === photos.length - 1) return;
    const newPhotos = [...photos];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newPhotos[idx], newPhotos[swapIdx]] = [newPhotos[swapIdx], newPhotos[idx]];
    setPhotos(newPhotos);
    setPhotoMsg('');
    setPhotoError('');
    const prevPhotos = photos;
    try {
      const res = await fetch(`/api/admin/properties/${id}/photos/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order: newPhotos.map(p => p.id) }),
      });
      const json = await bacaJson(res);
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (err: unknown) {
      setPhotos(prevPhotos);
      setPhotoError(err instanceof Error ? err.message : 'Gagal reorder');
    }
  };

  if (isNew) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-8">
        <ImageOff size={28} className="mx-auto mb-2 text-[#E2E8F0]" />
        <p className="text-sm text-[#64748B]">Simpan dulu untuk mulai upload foto.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[#0F172A] text-sm">Galeri Foto ({photos.length})</h2>
        {photoMsg && <span className="text-xs text-emerald-600 font-medium">{photoMsg}</span>}
        {photoError && <span className="text-xs text-red-600">{photoError}</span>}
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-10 text-[#94A3B8]">
          <ImageOff size={32} className="mx-auto mb-2 text-[#E2E8F0]" />
          <p className="text-sm">Belum ada foto</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo, photoIdx) => {
            const src = coverSrc(photo.url_webp);
            const isProcessing = coveringId === photo.id || deletingId === photo.id;
            return (
              <div key={photo.id} className={`relative group rounded-xl overflow-hidden border-2 ${photo.is_cover ? 'border-[#1565C0]' : 'border-gray-100'}`}>
                {src ? (
                  <img src={src} alt={photo.alt_text ?? ''} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                    <ImageOff size={20} className="text-gray-300" />
                  </div>
                )}

                {photo.is_cover ? (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#1565C0] text-white text-xs font-semibold flex items-center gap-1">
                    <Star size={10} fill="currentColor" /> Cover
                  </div>
                ) : null}

                {!isProcessing && photos.length > 1 && (
                  <div className="absolute top-1.5 right-1.5 flex flex-col gap-0.5 z-10">
                    {photoIdx > 0 && (
                      <button
                        onClick={() => handleReorder(photo.id, 'up')}
                        className="p-0.5 rounded bg-white/80 text-gray-700 hover:bg-white shadow-sm transition-colors"
                        title="Pindah ke atas"
                      >
                        <ChevronUp size={13} />
                      </button>
                    )}
                    {photoIdx < photos.length - 1 && (
                      <button
                        onClick={() => handleReorder(photo.id, 'down')}
                        className="p-0.5 rounded bg-white/80 text-gray-700 hover:bg-white shadow-sm transition-colors"
                        title="Pindah ke bawah"
                      >
                        <ChevronDown size={13} />
                      </button>
                    )}
                  </div>
                )}

                {isProcessing && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
                  </div>
                )}

                {!isProcessing && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2 gap-2">
                    {!photo.is_cover && (
                      <button
                        onClick={() => handleSetCover(photo.id)}
                        className="px-2 py-1 rounded-lg bg-[#1565C0] text-white text-xs font-semibold hover:bg-[#1e40af] transition-colors"
                        title="Jadikan Cover"
                      >
                        <Star size={11} className="inline mr-0.5" />Cover
                      </button>
                    )}
                    {confirmDeleteId === photo.id ? (
                      <>
                        <button
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="px-2 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold"
                        >Ya, hapus</button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded-lg bg-gray-700 text-white text-xs"
                        >Batal</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(photo.id)}
                        className="p-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                        title="Hapus foto"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}

                {/* Label ruangan — sumber grounding prompt ViralFrame, dan
                    satu-satunya sumber label bagi mode Storyboard massal.
                    Sengaja DI LUAR overlay hover agar terlihat & terisi tanpa
                    harus menemukannya lebih dulu. */}
                {!isNew && (
                  <select
                    value={photo.label_ruangan ?? ''}
                    disabled={labelingId === photo.id}
                    onChange={e => handleSetLabel(photo.id, e.target.value)}
                    title="Label ruangan — dipakai ViralFrame untuk menyusun prompt yang sesuai foto"
                    className={`w-full text-[11px] px-1.5 py-1 border-t outline-none bg-white disabled:opacity-50 ${
                      photo.label_ruangan ? 'border-gray-100 text-[#0F172A]' : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    <option value="">— Belum dilabeli —</option>
                    {PHOTO_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) handleUploadPhotos(e.target.files); e.target.value = ''; }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || photos.length >= 20}
          className="w-full flex flex-col items-center gap-1.5 py-4 border-2 border-dashed border-gray-200 rounded-xl text-center cursor-pointer hover:border-[#1565C0]/50 hover:bg-blue-50/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload size={20} className="text-[#94A3B8]" />
          <span className="text-xs font-medium text-[#64748B]">
            {photos.length >= 20 ? 'Batas 20 foto tercapai' : 'Klik untuk tambah foto'}
          </span>
          <span className="text-xs text-[#94A3B8]">JPEG, PNG, WebP • Dikonversi ke WebP otomatis</span>
        </button>
        {uploadProgress && (
          <p className="mt-2 text-xs text-[#1565C0] font-medium">{uploadProgress}</p>
        )}
      </div>
    </div>
  );
}
