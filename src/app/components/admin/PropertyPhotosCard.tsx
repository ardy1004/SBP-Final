import { bacaJson } from '../../../lib/api';
import { useState, useRef, useEffect } from 'react';
import { Star, Trash2, ImageOff, GripVertical, Upload } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PHOTO_LABELS } from '../../../../functions/_lib/viralframe.js';

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

// Sama dengan atribut `accept` pada <input type="file"> di bawah — dataTransfer
// bisa membawa apa saja (PDF, folder), dan tanpa filter convertToWebP() gagal
// satu per satu dengan pesan "Gagal membaca gambar" yang menyesatkan.
const JENIS_DITERIMA = ['image/jpeg', 'image/png', 'image/webp'];

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

// Pola sama dengan Konten Agent (AdminViralFrameAgentVideosPage.tsx): `useSortable`
// WAJIB di komponen tersendiri per item, bukan di dalam .map() milik induk — jumlah
// panggilan hook per instance harus tetap. Seret dipasang HANYA di pegangan kecil,
// karena kartu foto penuh kontrol (tombol hover, dropdown label).
interface SortableCardArgs {
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef'];
  style: React.CSSProperties;
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
  isDragging: boolean;
}
function SortableItem({ id, disabled, children }: {
  id: number;
  disabled?: boolean;
  children: (args: SortableCardArgs) => React.ReactElement;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  return children({ setNodeRef, style, attributes, listeners, isDragging });
}

export default function PropertyPhotosCard({ propertyId, isNew, initialPhotos }: Props) {
  const [photos, setPhotos] = useState<PropertyImage[]>(initialPhotos ?? []);
  const [photoMsg, setPhotoMsg] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
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
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cegah browser membuka file yang MELESET dari drop zone. Perilaku bawaannya
  // adalah menavigasi ke file itu — artinya seluruh isian form properti yang
  // belum disimpan hilang. Aman terhadap drop zone kita sendiri: event
  // menggelembung dari target ke window, jadi handleDrop sudah jalan lebih dulu
  // dan handler ini hanya mematikan aksi bawaan.
  useEffect(() => {
    const tolak = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', tolak);
    window.addEventListener('drop', tolak);
    return () => {
      window.removeEventListener('dragover', tolak);
      window.removeEventListener('drop', tolak);
    };
  }, []);

  const id = String(propertyId);

  // Satu-satunya jalur mengubah urutan (seret maupun "Jadikan utama"). Posisi
  // pertama otomatis jadi foto utama di server (_lib/fotoUtama.js), jadi tidak
  // ada lagi endpoint cover terpisah. Optimistic: grid langsung berubah, dan
  // dikembalikan bila server menolak (mis. tab lain menambah/menghapus foto).
  const simpanUrutan = async (baru: PropertyImage[]) => {
    const sebelumnya = photos;
    setPhotos(baru);
    setPhotoMsg('');
    setPhotoError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}/photos/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ order: baru.map(p => p.id) }),
      });
      const json = await bacaJson<{ images: PropertyImage[] }>(res);
      if (!res.ok || !Array.isArray(json.data?.images)) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPhotos(json.data.images);
      setPhotoMsg('Urutan disimpan ✓');
      setTimeout(() => setPhotoMsg(''), 3000);
    } catch (err: unknown) {
      setPhotos(sebelumnya);
      setPhotoError(err instanceof Error ? err.message : 'Gagal menyimpan urutan');
    }
  };

  const jadikanUtama = (photoId: number) => {
    const idx = photos.findIndex(p => p.id === photoId);
    if (idx > 0) void simpanUrutan(arrayMove(photos, idx, 0));
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

  // FileList (jalur klik) maupun File[] (jalur drop, hasil filter jenis file).
  // Isinya sudah `Array.from(files)` sejak awal, jadi keduanya jalan apa adanya.
  const handleUploadPhotos = async (files: FileList | File[]) => {
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // handleUploadPhotos tidak punya guard pemanggilan ganda — dua loop
    // bersamaan saling menimpa uploadProgress dan meng-append foto kacau.
    if (uploading) return;
    const berkas = Array.from(e.dataTransfer.files).filter(f => JENIS_DITERIMA.includes(f.type));
    if (berkas.length === 0) { setPhotoError('Hanya JPEG, PNG, atau WebP yang bisa diunggah'); return; }
    handleUploadPhotos(berkas); // batas 20 foto sudah diguard di dalamnya
  };

  // Reorder di tengah upload/hapus mengirim daftar foto yang tak lengkap →
  // server menolak 422 (wajib permutasi penuh). Kunci saja selama itu.
  const urutanTerkunci = uploading || deletingId !== null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (urutanTerkunci || !over || active.id === over.id) return;
    const lama = photos.findIndex(p => p.id === active.id);
    const baru = photos.findIndex(p => p.id === over.id);
    if (lama === -1 || baru === -1) return;
    void simpanUrutan(arrayMove(photos, lama, baru));
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo, photoIdx) => {
            const src = coverSrc(photo.url_webp);
            const isProcessing = deletingId === photo.id;
            // Foto utama diturunkan dari POSISI, bukan photo.is_cover: server menjaga
            // keduanya sama, tapi posisi sudah benar seketika saat update optimistic.
            const utama = photoIdx === 0;
            return (
              <SortableItem key={photo.id} id={photo.id} disabled={urutanTerkunci}>
                {({ setNodeRef, style, attributes, listeners, isDragging }) => (
              <div
                ref={setNodeRef}
                style={style}
                className={`relative group rounded-xl overflow-hidden border-2 ${utama ? 'border-[#1565C0]' : 'border-gray-100'} ${isDragging ? 'opacity-60 z-20 shadow-lg' : ''}`}
              >
                {/* draggable={false}: seret-native gambar akan jatuh ke drop zone
                    upload di bawah dan memicu pesan "Hanya JPEG, PNG, atau WebP". */}
                {src ? (
                  <img src={src} alt={photo.alt_text ?? ''} draggable={false} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                    <ImageOff size={20} className="text-gray-300" />
                  </div>
                )}

                {utama && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#1565C0] text-white text-xs font-semibold flex items-center gap-1">
                    <Star size={10} fill="currentColor" /> Utama
                  </div>
                )}

                {/* z-10 WAJIB: overlay hover di bawah adalah saudara berikutnya di
                    DOM (absolute inset-0) dan tanpa z-index terlukis DI ATAS pegangan. */}
                {!isProcessing && photos.length > 1 && (
                  <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    disabled={urutanTerkunci}
                    className="absolute top-1.5 right-1.5 z-10 p-1 rounded bg-white/85 text-gray-700 hover:bg-white shadow-sm cursor-grab active:cursor-grabbing touch-none disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Seret untuk mengatur urutan — posisi pertama jadi foto utama"
                    aria-label="Seret untuk mengatur urutan foto"
                  >
                    <GripVertical size={14} />
                  </button>
                )}

                {isProcessing && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
                  </div>
                )}

                {!isProcessing && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2 gap-2">
                    {!utama && (
                      <button
                        onClick={() => jadikanUtama(photo.id)}
                        disabled={urutanTerkunci}
                        className="px-2 py-1 rounded-lg bg-[#1565C0] text-white text-xs font-semibold hover:bg-[#1e40af] transition-colors disabled:opacity-50"
                        title="Pindahkan ke posisi pertama sebagai foto utama"
                      >
                        <Star size={11} className="inline mr-0.5" />Jadikan utama
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
                )}
              </SortableItem>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
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
        {/* preventDefault() di onDragOver adalah baris paling menentukan: tanpanya
            event drop TIDAK PERNAH dipancarkan dan browser tetap membuka file.
            Anak-anak diberi pointer-events-none supaya dragleave tidak ikut
            terpancar saat kursor melintasinya (penanda visual jadi berkedip). */}
        <button
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          disabled={uploading || photos.length >= 20}
          className={`w-full flex flex-col items-center gap-1.5 py-4 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            dragOver ? 'border-[#1565C0] bg-blue-50' : 'border-gray-200 hover:border-[#1565C0]/50 hover:bg-blue-50/30'
          }`}
        >
          <Upload size={20} className="text-[#94A3B8] pointer-events-none" />
          <span className="text-xs font-medium text-[#64748B] pointer-events-none">
            {photos.length >= 20 ? 'Batas 20 foto tercapai' : 'Seret foto ke sini, atau klik untuk memilih'}
          </span>
          <span className="text-xs text-[#94A3B8] pointer-events-none">JPEG, PNG, WebP • Dikonversi ke WebP otomatis</span>
        </button>
        {uploadProgress && (
          <p className="mt-2 text-xs text-[#1565C0] font-medium">{uploadProgress}</p>
        )}
      </div>
    </div>
  );
}
