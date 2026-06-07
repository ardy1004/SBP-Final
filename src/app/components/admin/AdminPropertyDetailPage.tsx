import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Save, Star, Trash2, ImageOff, AlertTriangle, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { PROPERTY_TYPES } from '../../../lib/propertyTypes';
import { getLocations, type ApiLocation } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PropertyImage {
  id: number;
  url_webp: string;
  alt_text: string | null;
  urutan: number;
  is_cover: number;
}

interface PropertyDetail {
  id: number;
  kode_listing: string;
  title: string;
  slug: string;
  jenis_properti: string;
  tujuan: string;
  harga: number | null;
  harga_lama: number | null;
  harga_sewa_tahun: number | null;
  nego: number;
  nett: number;
  luas_tanah: number | null;
  luas_bangunan: number | null;
  lebar_depan: number | null;
  lantai: number | null;
  jumlah_kamar_tidur: number | null;
  jumlah_kamar_mandi: number | null;
  legalitas: string | null;
  status_legalitas: string | null;
  bank_agunan: string | null;
  outstanding_bank: number | null;
  furnished: string | null;
  provinsi: string | null;
  kabupaten: string | null;
  kecamatan: string | null;
  kelurahan: string | null;
  alamat: string | null;
  gmaps_link: string | null;
  lebar_jalan_m: number | null;
  deskripsi: string | null;
  info_tambahan: string | null;
  alasan_dijual: string | null;
  video_youtube: string | null;
  income_per_bulan: number | null;
  pengeluaran_per_bulan: number | null;
  harga_sewa_kamar_bulan: number | null;
  badge_premium: number;
  badge_featured: number;
  badge_hot: number;
  properti_pilihan: number;
  verified: number;
  status_publish: string;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  details: Record<string, unknown> | null;
  images: PropertyImage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JENIS_OPTIONS = PROPERTY_TYPES;
const TUJUAN_OPTIONS = ['dijual','disewa','dijual_disewa'];
const LEGALITAS_OPTIONS = [
  'SHM & IMB/PBG Lengkap','SHGB & IMB/PBG Lengkap',
  'SHM Pekarangan Tanpa IMB/PBG','SHM Sawah/Tegalan',
  'SHGB Tanpa IMB/PBG','Girik/Letter C/PPJB/dll','Izin Usaha',
];
const STATUS_LEGALITAS_OPTIONS: { value: string; label: string }[] = [
  { value: 'on_hand', label: 'On Hand (bersih)' },
  { value: 'on_bank', label: 'On Bank (agunan)' },
];
const FURNISHED_OPTIONS: { value: string; label: string }[] = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi', label: 'Semi Furnished' },
  { value: 'fully', label: 'Fully Furnished' },
];

const STATUS_OPTIONS = ['draft','published','sold','archived'] as const;
type StatusValue = typeof STATUS_OPTIONS[number];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: { label: 'Published', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-500 border border-slate-200' },
  sold:      { label: 'Sold',      cls: 'bg-red-100 text-red-600 border border-red-200' },
  archived:  { label: 'Arsip',     cls: 'bg-gray-200 text-gray-500 border border-gray-300' },
};

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors";
const selectCls = `${inputCls} bg-white cursor-pointer`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Form state
  const [form, setForm] = useState<Partial<PropertyDetail>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  // Location cascade
  const [provList, setProvList] = useState<ApiLocation[]>([]);
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [provId, setProvId] = useState<number | null>(null);
  const [kabId, setKabId] = useState<number | null>(null);
  const locationInitRef = useRef(false);

  // Status
  const [statusPending, setStatusPending] = useState<StatusValue | ''>('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusError, setStatusError] = useState('');

  // Photos
  const [photos, setPhotos] = useState<PropertyImage[]>([]);
  const [photoMsg, setPhotoMsg] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [coveringId, setCoveringId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProperty = useCallback(async () => {
    locationInitRef.current = false;
    setProvId(null); setKabId(null); setKabList([]); setKecList([]);
    if (id === 'new') {
      setForm({ title: '', jenis_properti: 'rumah', tujuan: 'dijual', harga: 0,
        provinsi: 'DI Yogyakarta', kabupaten: '', kecamatan: '', kelurahan: '',
        alamat: '', nego: 0, nett: 0, badge_premium: 0, badge_featured: 0,
        badge_hot: 0, properti_pilihan: 0, verified: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data: PropertyDetail = json.data;
      setProperty(data);
      setPhotos(data.images ?? []);
      setForm({
        title: data.title,
        jenis_properti: data.jenis_properti,
        tujuan: data.tujuan,
        harga: data.harga,
        harga_lama: data.harga_lama,
        harga_sewa_tahun: data.harga_sewa_tahun,
        nego: data.nego,
        nett: data.nett,
        luas_tanah: data.luas_tanah,
        luas_bangunan: data.luas_bangunan,
        lebar_depan: data.lebar_depan,
        lantai: data.lantai,
        jumlah_kamar_tidur: data.jumlah_kamar_tidur,
        jumlah_kamar_mandi: data.jumlah_kamar_mandi,
        legalitas: data.legalitas,
        status_legalitas: data.status_legalitas,
        bank_agunan: data.bank_agunan,
        outstanding_bank: data.outstanding_bank,
        furnished: data.furnished,
        provinsi: data.provinsi,
        kabupaten: data.kabupaten,
        kecamatan: data.kecamatan,
        kelurahan: data.kelurahan,
        alamat: data.alamat,
        gmaps_link: data.gmaps_link,
        lebar_jalan_m: data.lebar_jalan_m,
        deskripsi: data.deskripsi,
        info_tambahan: data.info_tambahan,
        alasan_dijual: data.alasan_dijual,
        video_youtube: data.video_youtube,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        income_per_bulan: data.income_per_bulan,
        pengeluaran_per_bulan: data.pengeluaran_per_bulan,
        harga_sewa_kamar_bulan: data.harga_sewa_kamar_bulan,
        badge_premium: data.badge_premium,
        badge_featured: data.badge_featured,
        badge_hot: data.badge_hot,
        properti_pilihan: data.properti_pilihan,
        verified: data.verified,
      });
      setStatusPending(data.status_publish as StatusValue);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Gagal memuat properti');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProperty(); }, [loadProperty]);

  // ─── Location cascade ─────────────────────────────────────────────
  useEffect(() => {
    getLocations().then(res => { if (res.success && res.data) setProvList(res.data.items); });
  }, []);

  useEffect(() => {
    if (locationInitRef.current || !provList.length || !form?.provinsi) return;
    const prov = provList.find(p => p.nama === form.provinsi);
    if (!prov) return;
    locationInitRef.current = true;
    setProvId(prov.id);
  }, [provList, form?.provinsi]); // eslint-disable-line

  useEffect(() => {
    if (!provId) { setKabList([]); setKecList([]); setKabId(null); return; }
    getLocations(provId).then(res => {
      if (!res.success || !res.data) return;
      const list = res.data.items;
      setKabList(list);
      if (form?.kabupaten) {
        const kab = list.find(k => k.nama === form.kabupaten);
        if (kab) setKabId(kab.id);
      }
    });
  }, [provId]); // eslint-disable-line

  useEffect(() => {
    if (!kabId) { setKecList([]); return; }
    getLocations(kabId).then(res => { if (res.success && res.data) setKecList(res.data.items); });
  }, [kabId]);

  const handleProvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = provList.find(p => p.id === id)?.nama ?? null;
    setProvId(id); setKabId(null); setKabList([]); setKecList([]);
    setForm(f => ({ ...f, provinsi: nama, kabupaten: null, kecamatan: null }));
  };
  const handleKabChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nama = e.target.value || null;
    const found = kabList.find(k => k.nama === nama);
    setKabId(found?.id ?? null); setKecList([]);
    setForm(f => ({ ...f, kabupaten: nama, kecamatan: null }));
  };
  const handleKecChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm(f => ({ ...f, kecamatan: e.target.value || null }));
  };

  // ─── Save field changes ───────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    setSaveError('');
    try {
      if (id === 'new') {
        const res = await fetch('/api/admin/properties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: form.title ?? '',
            jenis_properti: form.jenis_properti,
            tujuan: form.tujuan,
            harga: form.harga ?? 0,
            kecamatan: form.kecamatan ?? '',
            kabupaten: form.kabupaten ?? '',
            provinsi: form.provinsi ?? 'DI Yogyakarta',
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        navigate(`/admin/listing/${json.data.id}`);
        return;
      }
      const body: Record<string, unknown> = {
        jenis_properti: form.jenis_properti,
        tujuan: form.tujuan,
        harga: form.harga,
        harga_lama: form.harga_lama ?? null,
        harga_sewa_tahun: form.harga_sewa_tahun ?? null,
        nego: form.nego ? 1 : 0,
        nett: form.nett ? 1 : 0,
        luas_tanah: form.luas_tanah ?? null,
        luas_bangunan: form.luas_bangunan ?? null,
        lebar_depan: form.lebar_depan ?? null,
        lantai: form.lantai ?? null,
        jumlah_kamar_tidur: form.jumlah_kamar_tidur ?? null,
        jumlah_kamar_mandi: form.jumlah_kamar_mandi ?? null,
        legalitas: form.legalitas ?? null,
        status_legalitas: form.status_legalitas ?? null,
        bank_agunan: form.bank_agunan ?? null,
        outstanding_bank: form.outstanding_bank ?? null,
        furnished: form.furnished ?? null,
        provinsi: form.provinsi ?? null,
        kabupaten: form.kabupaten ?? null,
        kecamatan: form.kecamatan ?? null,
        kelurahan: form.kelurahan ?? null,
        alamat: form.alamat ?? null,
        gmaps_link: form.gmaps_link ?? null,
        lebar_jalan_m: form.lebar_jalan_m ?? null,
        deskripsi: form.deskripsi ?? null,
        info_tambahan: form.info_tambahan ?? null,
        alasan_dijual: form.alasan_dijual ?? null,
        video_youtube: form.video_youtube ?? null,
        meta_title: form.meta_title ?? null,
        meta_description: form.meta_description ?? null,
        income_per_bulan: form.income_per_bulan ?? null,
        pengeluaran_per_bulan: form.pengeluaran_per_bulan ?? null,
        harga_sewa_kamar_bulan: form.harga_sewa_kamar_bulan ?? null,
        badge_premium: form.badge_premium ? 1 : 0,
        badge_featured: form.badge_featured ? 1 : 0,
        badge_hot: form.badge_hot ? 1 : 0,
        properti_pilihan: form.properti_pilihan ? 1 : 0,
        verified: form.verified ? 1 : 0,
      };

      const res = await fetch(`/api/admin/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSaveMsg('Tersimpan ✓');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  // ─── Save status ──────────────────────────────────────────────────
  const handleStatusSave = async () => {
    if (!statusPending || statusPending === property?.status_publish) return;
    if (statusPending === 'archived') {
      if (!window.confirm('Arsipkan properti ini? Properti akan disembunyikan dari publik (soft-delete, data tidak dihapus).')) return;
    }
    setStatusSaving(true);
    setStatusMsg('');
    setStatusError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: statusPending }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setProperty(prev => prev ? { ...prev, status_publish: statusPending } : prev);
      setStatusMsg(`Status diubah ke "${statusPending}" ✓`);
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Gagal mengubah status');
    } finally {
      setStatusSaving(false);
    }
  };

  // ─── Set cover ────────────────────────────────────────────────────
  const handleSetCover = async (imageId: number) => {
    setCoveringId(imageId);
    setPhotoMsg('');
    setPhotoError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}/photos/${imageId}/cover`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const json = await res.json();
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

  // ─── Delete photo ─────────────────────────────────────────────────
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
      const json = await res.json();
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

  // ─── Upload photos ────────────────────────────────────────────────
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
        const json = await res.json();
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

  // ─── Reorder photos ───────────────────────────────────────────────
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (err: unknown) {
      setPhotos(prevPhotos);
      setPhotoError(err instanceof Error ? err.message : 'Gagal reorder');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
          <span className="text-sm text-[#64748B]">Memuat data properti…</span>
        </div>
      </div>
    );
  }

  if (!isNew && (fetchError || !property)) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/admin/listing')} className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#0F172A]">
          <ArrowLeft size={16} /> Kembali ke daftar
        </button>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium">{fetchError || 'Properti tidak ditemukan'}</p>
          <button onClick={loadProperty} className="mt-3 text-sm underline text-red-600">Coba lagi</button>
        </div>
      </div>
    );
  }

  const currentBadge = isNew
    ? STATUS_BADGE['draft']
    : (STATUS_BADGE[property!.status_publish] ?? { label: property!.status_publish, cls: 'bg-gray-100 text-gray-500 border border-gray-200' });

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/admin/listing')} className="mt-1 text-[#64748B] hover:text-[#0F172A] transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold text-[#0F172A] line-clamp-2">
            {isNew ? 'Buat Properti Baru' : property!.title}
          </h1>
          {!isNew && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs text-[#94A3B8]">{property!.kode_listing}</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${currentBadge.cls}`}>
                {currentBadge.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── STATUS CARD ── */}
      {!isNew && (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-[#0F172A] text-sm mb-3">Status Publikasi</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-[#64748B] mb-1">Ubah Status</label>
            <div className="relative">
              <select
                value={statusPending}
                onChange={e => setStatusPending(e.target.value as StatusValue)}
                className={selectCls}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {s === 'published' ? 'Published — tampil publik' :
                     s === 'draft'     ? 'Draft — tidak tampil publik' :
                     s === 'sold'      ? 'Sold — terjual' :
                                        'Arsip — soft-delete (sembunyikan)'}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
            </div>
          </div>
          <button
            onClick={handleStatusSave}
            disabled={statusSaving || statusPending === property!.status_publish}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1e40af] transition-colors"
          >
            {statusSaving ? 'Menyimpan…' : 'Terapkan Status'}
          </button>
        </div>
        {statusPending === 'archived' && statusPending !== property!.status_publish && (
          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle size={12} />
            Properti akan disembunyikan dari semua halaman publik (soft-delete, data tidak dihapus).
          </p>
        )}
        {statusMsg && <p className="mt-2 text-xs text-emerald-600">{statusMsg}</p>}
        {statusError && <p className="mt-2 text-xs text-red-600">{statusError}</p>}
        {property!.published_at && (
          <p className="mt-2 text-xs text-[#94A3B8]">Pertama dipublish: {new Date(property!.published_at).toLocaleString('id-ID')}</p>
        )}
      </div>
      )}

      {/* ── EDIT FORM ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-[#0F172A] text-sm mb-4">Detail Properti</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Judul Listing *">
              <input type="text" value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Judul listing properti" />
            </Field>
          </div>

          <Field label="Jenis Properti">
            <select value={form.jenis_properti ?? ''} onChange={e => setForm(f => ({ ...f, jenis_properti: e.target.value }))} className={selectCls}>
              {JENIS_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="Tujuan">
            <select value={form.tujuan ?? ''} onChange={e => setForm(f => ({ ...f, tujuan: e.target.value }))} className={selectCls}>
              {TUJUAN_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Harga (Rp)">
            <input type="number" min={0} value={form.harga ?? ''} onChange={e => setForm(f => ({ ...f, harga: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} placeholder="0" />
          </Field>

          <Field label="Harga Lama (Rp)">
            <input type="number" min={0} value={form.harga_lama ?? ''} onChange={e => setForm(f => ({ ...f, harga_lama: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} placeholder="Kosong jika tidak ada" />
          </Field>

          <Field label="Harga Sewa / Tahun (Rp)">
            <input type="number" min={0} value={form.harga_sewa_tahun ?? ''} onChange={e => setForm(f => ({ ...f, harga_sewa_tahun: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} placeholder="Kosong jika tidak berlaku" />
          </Field>

          <Field label="Legalitas">
            <select value={form.legalitas ?? ''} onChange={e => setForm(f => ({ ...f, legalitas: e.target.value || null }))} className={selectCls}>
              <option value="">— pilih —</option>
              {LEGALITAS_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>

          <Field label="Status Legalitas">
            <select value={form.status_legalitas ?? ''} onChange={e => setForm(f => ({ ...f, status_legalitas: e.target.value || null }))} className={selectCls}>
              <option value="">— pilih —</option>
              {STATUS_LEGALITAS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Furnished">
            <select value={form.furnished ?? ''} onChange={e => setForm(f => ({ ...f, furnished: e.target.value || null }))} className={selectCls}>
              <option value="">— pilih —</option>
              {FURNISHED_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>

          <Field label="Luas Tanah (m²)">
            <input type="number" min={0} value={form.luas_tanah ?? ''} onChange={e => setForm(f => ({ ...f, luas_tanah: e.target.value ? parseFloat(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Luas Bangunan (m²)">
            <input type="number" min={0} value={form.luas_bangunan ?? ''} onChange={e => setForm(f => ({ ...f, luas_bangunan: e.target.value ? parseFloat(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Kamar Tidur">
            <input type="number" min={0} value={form.jumlah_kamar_tidur ?? ''} onChange={e => setForm(f => ({ ...f, jumlah_kamar_tidur: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Kamar Mandi">
            <input type="number" min={0} value={form.jumlah_kamar_mandi ?? ''} onChange={e => setForm(f => ({ ...f, jumlah_kamar_mandi: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Lantai">
            <input type="number" min={0} value={form.lantai ?? ''} onChange={e => setForm(f => ({ ...f, lantai: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Lebar Depan (m)">
            <input type="number" min={0} value={form.lebar_depan ?? ''} onChange={e => setForm(f => ({ ...f, lebar_depan: e.target.value ? parseFloat(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Lebar Jalan (m)">
            <input type="number" min={0} value={form.lebar_jalan_m ?? ''} onChange={e => setForm(f => ({ ...f, lebar_jalan_m: e.target.value ? parseFloat(e.target.value) : null }))} className={inputCls} />
          </Field>

          <Field label="Bank Agunan">
            <input type="text" value={form.bank_agunan ?? ''} onChange={e => setForm(f => ({ ...f, bank_agunan: e.target.value || null }))} className={inputCls} placeholder="Nama bank jika ada agunan" />
          </Field>

          <Field label="Sisa KPR / Hutang Bank (Rp)">
            <input type="number" min={0} value={form.outstanding_bank ?? ''} onChange={e => setForm(f => ({ ...f, outstanding_bank: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} placeholder="Kosong jika lunas" />
          </Field>
        </div>

        {/* Lokasi */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Lokasi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Provinsi">
              <select value={provId ?? ''} onChange={handleProvChange} className={selectCls}>
                <option value="">-- Pilih Provinsi --</option>
                {provList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
            </Field>
            <Field label="Kabupaten / Kota">
              <select value={form.kabupaten ?? ''} onChange={handleKabChange} className={selectCls} disabled={!provId}>
                <option value="">-- Pilih Kabupaten --</option>
                {kabList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
              </select>
            </Field>
            <Field label="Kecamatan">
              <select value={form.kecamatan ?? ''} onChange={handleKecChange} className={selectCls} disabled={!kabId}>
                <option value="">-- Pilih Kecamatan --</option>
                {kecList.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
              </select>
            </Field>
            <Field label="Kelurahan">
              <input type="text" value={form.kelurahan ?? ''} onChange={e => setForm(f => ({ ...f, kelurahan: e.target.value || null }))} className={inputCls} />
            </Field>
            <Field label="Alamat Lengkap">
              <input type="text" value={form.alamat ?? ''} onChange={e => setForm(f => ({ ...f, alamat: e.target.value || null }))} className={inputCls} placeholder="Hanya tampil ke admin" />
            </Field>
            <Field label="Link Google Maps">
              <input type="text" value={form.gmaps_link ?? ''} onChange={e => setForm(f => ({ ...f, gmaps_link: e.target.value || null }))} className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Deskripsi */}
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Narasi</h3>
          <Field label="Deskripsi">
            <textarea value={form.deskripsi ?? ''} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value || null }))}
              rows={4} className={`${inputCls} resize-y`} />
          </Field>
          <Field label="Info Tambahan">
            <textarea value={form.info_tambahan ?? ''} onChange={e => setForm(f => ({ ...f, info_tambahan: e.target.value || null }))}
              rows={3} className={`${inputCls} resize-y`} />
          </Field>
          <Field label="Alasan Dijual">
            <textarea value={form.alasan_dijual ?? ''} onChange={e => setForm(f => ({ ...f, alasan_dijual: e.target.value || null }))}
              rows={2} className={`${inputCls} resize-y`} />
          </Field>
          <Field label="Video YouTube (URL)">
            <input type="text" value={form.video_youtube ?? ''} onChange={e => setForm(f => ({ ...f, video_youtube: e.target.value || null }))} className={inputCls} />
          </Field>
        </div>

        {/* Investasi */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Data Investasi (Opsional)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Pendapatan / Bulan (Rp)">
              <input type="number" min={0} value={form.income_per_bulan ?? ''} onChange={e => setForm(f => ({ ...f, income_per_bulan: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} />
            </Field>
            <Field label="Pengeluaran / Bulan (Rp)">
              <input type="number" min={0} value={form.pengeluaran_per_bulan ?? ''} onChange={e => setForm(f => ({ ...f, pengeluaran_per_bulan: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} />
            </Field>
            <Field label="Harga Sewa Kamar / Bulan (Rp)">
              <input type="number" min={0} value={form.harga_sewa_kamar_bulan ?? ''} onChange={e => setForm(f => ({ ...f, harga_sewa_kamar_bulan: e.target.value ? parseInt(e.target.value) : null }))} className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Toggle flags */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Flags</h3>
          <div className="flex flex-wrap gap-3">
            {([
              ['nego', 'Nego'],
              ['nett', 'Nett'],
              ['badge_premium', 'Premium'],
              ['badge_featured', 'Featured'],
              ['badge_hot', 'Hot'],
              ['properti_pilihan', 'Pilihan'],
              ['verified', 'Verified'],
            ] as [keyof typeof form, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 accent-[#1565C0]"
                />
                <span className="text-sm text-[#0F172A]">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* SEO */}
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">SEO (Opsional)</h3>
          <Field label="Meta Title">
            <input type="text" value={form.meta_title ?? ''} onChange={e => setForm(f => ({ ...f, meta_title: e.target.value || null }))} className={inputCls} placeholder="Judul halaman untuk mesin pencari" />
          </Field>
          <Field label="Meta Description">
            <textarea value={form.meta_description ?? ''} onChange={e => setForm(f => ({ ...f, meta_description: e.target.value || null }))} rows={3} className={`${inputCls} resize-y`} placeholder="Deskripsi singkat untuk Google ~150 karakter" />
          </Field>
        </div>

        {/* Save button */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
          >
            <Save size={15} />
            {saving ? 'Menyimpan…' : isNew ? 'Buat Properti' : 'Simpan Perubahan'}
          </button>
          {saveMsg && <span className="text-sm text-emerald-600 font-medium">{saveMsg}</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </div>

      {/* ── GALERI FOTO ── */}
      {isNew ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-8">
          <ImageOff size={28} className="mx-auto mb-2 text-[#E2E8F0]" />
          <p className="text-sm text-[#64748B]">Simpan dulu untuk mulai upload foto.</p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
