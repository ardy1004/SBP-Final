import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Save, AlertTriangle, ChevronDown, Sparkles } from 'lucide-react';
import { PROPERTY_TYPES } from '../../../lib/propertyTypes';
import PropertyPhotosCard from './PropertyPhotosCard';
import { getLocations, type ApiLocation } from '../../../lib/api';
// Reuse logic generate meta SEO yang sama dengan endpoint CREATE (jangan duplikasi).
import { generateMetaSeo } from '../../../../functions/_lib/metaSeo.js';

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
  latitude: number | null;
  longitude: number | null;
  lebar_jalan_m: number | null;
  jarak_sungai_m: number | null;
  jarak_makam_m: number | null;
  jarak_sutet_m: number | null;
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
  status_sold: number;
  status_publish: string;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  details: Record<string, unknown> | null;
  images: PropertyImage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JENIS_OPTIONS = PROPERTY_TYPES;
const TUJUAN_OPTS = [
  { value: 'dijual', label: 'Dijual' },
  { value: 'disewa', label: 'Disewakan' },
  { value: 'dijual_disewa', label: 'Dijual & Disewakan' },
];
const LEGALITAS_OPTIONS = [
  'SHM & IMB/PBG Lengkap', 'SHGB & IMB/PBG Lengkap',
  'SHM Pekarangan Tanpa IMB/PBG', 'SHM Sawah/Tegalan',
  'SHGB Tanpa IMB/PBG', 'Girik/Letter C/PPJB/dll', 'Izin Usaha',
];
const FURNISHED_OPTS = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi', label: 'Semi Furnished' },
  { value: 'fully', label: 'Fully Furnished' },
];
const STATUS_OPTIONS = ['draft', 'published', 'sold', 'archived'] as const;
type StatusValue = typeof STATUS_OPTIONS[number];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: { label: 'Published', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-500 border border-slate-200' },
  sold:      { label: 'Sold',      cls: 'bg-red-100 text-red-600 border border-red-200' },
  archived:  { label: 'Arsip',     cls: 'bg-gray-200 text-gray-500 border border-gray-300' },
};

type LingkunganType = 'jauh' | 'sungai' | 'makam' | 'sutet';

// Field visibility per jenis_properti
const SHOW_LUAS_TANAH    = new Set(['rumah','tanah','kost','hotel','homestay','villa','gudang','komersial','ruko']);
const SHOW_LUAS_BANGUNAN = new Set(['rumah','kost','hotel','homestay','villa','apartment','gudang','komersial','ruko']);
const SHOW_LEBAR_DEPAN   = new Set(['rumah','tanah','kost','hotel','homestay','villa','gudang','komersial','ruko']);
const SHOW_LANTAI        = new Set(['rumah','kost','hotel','homestay','villa','apartment','ruko']);
const SHOW_KT_KM         = new Set(['rumah','kost','hotel','homestay','villa','apartment']);
const SHOW_FURNISHED     = new Set(['kost','hotel','homestay','villa','apartment']);
const SHOW_SEWA_KAMAR    = new Set(['kost','hotel','homestay','villa']);
const SHOW_INCOME        = new Set(['hotel','homestay','villa']);
const SHOW_PENGELUARAN   = new Set(['kost','hotel','homestay','villa']);

// ─── UI primitives ────────────────────────────────────────────────────────────

// Counter karakter dengan indikator warna: hijau ≤ ideal, kuning ≤ +10%, merah > +10%.
function CharCounter({ value, ideal }: { value: string; ideal: number }) {
  const len = value.length;
  const cls = len === 0
    ? 'text-[#94A3B8]'
    : len <= ideal
      ? 'text-emerald-600'
      : len <= Math.ceil(ideal * 1.1)
        ? 'text-amber-600'
        : 'text-red-600';
  return <div className={`text-[11px] mt-1 ${cls}`}>{len} / {ideal} karakter{len > ideal ? ' (melebihi ideal)' : ''}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
const inputCls  = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors";
const selectCls = `${inputCls} bg-white cursor-pointer`;

function detectLingkungan(d: PropertyDetail): LingkunganType {
  if (d.jarak_sungai_m) return 'sungai';
  if (d.jarak_makam_m)  return 'makam';
  if (d.jarak_sutet_m)  return 'sutet';
  return 'jauh';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [property, setProperty]       = useState<PropertyDetail | null>(null);
  const [loadedPhotos, setLoadedPhotos] = useState<PropertyImage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState('');

  const [form, setForm]               = useState<Partial<PropertyDetail>>({});
  const [detailsMap, setDetailsMap]   = useState<Record<string, unknown>>({});
  const [lingkungan, setLingkungan]   = useState<LingkunganType>('jauh');

  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');
  const [saveError, setSaveError]     = useState('');
  const [geoCoords, setGeoCoords]     = useState<{ latitude: number | null; longitude: number | null } | null>(null);

  // Location cascade
  const [provList, setProvList] = useState<ApiLocation[]>([]);
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [provId, setProvId] = useState<number | null>(null);
  const [kabId, setKabId] = useState<number | null>(null);
  const locationInitRef = useRef(false);
  const [statusPending, setStatusPending] = useState<StatusValue | ''>('');
  const [statusSaving, setStatusSaving]   = useState(false);
  const [statusMsg, setStatusMsg]         = useState('');
  const [statusError, setStatusError]     = useState('');

  const [isGenerating, setIsGenerating]   = useState(false);
  const [aiNotif, setAiNotif]             = useState('');

  const setF        = (patch: Partial<PropertyDetail>) => setForm(f => ({ ...f, ...patch }));

  const handleGenerateAI = async () => {
    if (!form.kecamatan || !form.kabupaten) {
      alert('Lengkapi data lokasi terlebih dahulu');
      return;
    }
    setIsGenerating(true);
    setAiNotif('');
    try {
      const res = await fetch('/api/admin/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jenis_properti: form.jenis_properti,
          tujuan: form.tujuan,
          harga: form.harga,
          kecamatan: form.kecamatan,
          kabupaten: form.kabupaten,
          provinsi: form.provinsi,
          luas_tanah: form.luas_tanah,
          luas_bangunan: form.luas_bangunan,
          kamar_tidur: form.jumlah_kamar_tidur,
          kamar_mandi: form.jumlah_kamar_mandi,
          legalitas: form.legalitas,
          nego: form.nego,
          kondisi: null,
          fasilitas: null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setF({
        title: json.judul,
        deskripsi: json.deskripsi,
        meta_title: json.meta_title,
        meta_description: json.meta_description,
      });
      setAiNotif('Konten AI berhasil di-generate — silakan review sebelum menyimpan.');
      setTimeout(() => setAiNotif(''), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal generate konten AI');
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-fill Meta Title/Description dari data form (reuse generateMetaSeo, hanya isi — tidak auto-save).
  const handleAutoFillSeo = () => {
    const { meta_title, meta_description } = generateMetaSeo({
      jenis_properti: form.jenis_properti ?? '',
      tujuan: form.tujuan ?? '',
      harga: form.harga ?? 0,
      kecamatan: form.kecamatan ?? '',
      kabupaten: form.kabupaten ?? '',
      luas_tanah: form.luas_tanah ?? null,
      luas_bangunan: form.luas_bangunan ?? null,
      nego: form.nego ?? 0,
    });
    setF({ meta_title, meta_description });
  };
  const getDetail   = (key: string) => detailsMap[key] ?? '';
  const setDetail   = (key: string, value: unknown) => setDetailsMap(prev => ({ ...prev, [key]: value }));

  const loadProperty = useCallback(async () => {
    locationInitRef.current = false;
    setProvId(null); setKabId(null); setKabList([]); setKecList([]);
    if (isNew) {
      setForm({
        title: '', jenis_properti: 'rumah', tujuan: 'dijual', harga: 0,
        provinsi: 'DI Yogyakarta', kabupaten: '', kecamatan: '', kelurahan: '',
        alamat: '', nego: 0, nett: 0,
        badge_premium: 0, badge_featured: 0, badge_hot: 0,
        properti_pilihan: 0, verified: 0, status_sold: 0,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/admin/properties/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const d: PropertyDetail = json.data;
      setProperty(d);
      setLoadedPhotos(d.images ?? []);
      setDetailsMap(d.details ?? {});
      setLingkungan(detectLingkungan(d));
      setForm({
        title: d.title, jenis_properti: d.jenis_properti, tujuan: d.tujuan,
        harga: d.harga, harga_lama: d.harga_lama, harga_sewa_tahun: d.harga_sewa_tahun,
        nego: d.nego, nett: d.nett,
        luas_tanah: d.luas_tanah, luas_bangunan: d.luas_bangunan,
        lebar_depan: d.lebar_depan, lantai: d.lantai,
        jumlah_kamar_tidur: d.jumlah_kamar_tidur, jumlah_kamar_mandi: d.jumlah_kamar_mandi,
        legalitas: d.legalitas, status_legalitas: d.status_legalitas,
        bank_agunan: d.bank_agunan, outstanding_bank: d.outstanding_bank,
        furnished: d.furnished,
        provinsi: d.provinsi, kabupaten: d.kabupaten,
        kecamatan: d.kecamatan, kelurahan: d.kelurahan,
        alamat: d.alamat, gmaps_link: d.gmaps_link,
        lebar_jalan_m: d.lebar_jalan_m,
        jarak_sungai_m: d.jarak_sungai_m, jarak_makam_m: d.jarak_makam_m, jarak_sutet_m: d.jarak_sutet_m,
        deskripsi: d.deskripsi, info_tambahan: d.info_tambahan,
        alasan_dijual: d.alasan_dijual, video_youtube: d.video_youtube,
        meta_title: d.meta_title, meta_description: d.meta_description,
        income_per_bulan: d.income_per_bulan, pengeluaran_per_bulan: d.pengeluaran_per_bulan,
        harga_sewa_kamar_bulan: d.harga_sewa_kamar_bulan,
        badge_premium: d.badge_premium, badge_featured: d.badge_featured, badge_hot: d.badge_hot,
        properti_pilihan: d.properti_pilihan, verified: d.verified, status_sold: d.status_sold,
      });
      setGeoCoords({ latitude: d.latitude ?? null, longitude: d.longitude ?? null });
      setStatusPending(d.status_publish as StatusValue);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Gagal memuat properti');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { loadProperty(); }, [loadProperty]);

  const handleHargaLama = (val: number | null) => {
    setF({ harga_lama: val, ...(val ? { badge_hot: 1 } : {}) });
  };

  const handleLingkungan = (type: LingkunganType) => {
    setLingkungan(type);
    setF({
      jarak_sungai_m: type === 'sungai' ? (form.jarak_sungai_m ?? null) : null,
      jarak_makam_m:  type === 'makam'  ? (form.jarak_makam_m ?? null)  : null,
      jarak_sutet_m:  type === 'sutet'  ? (form.jarak_sutet_m ?? null)  : null,
    });
  };

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
    const pid = parseInt(e.target.value, 10) || null;
    const nama = provList.find(p => p.id === pid)?.nama ?? null;
    setProvId(pid); setKabId(null); setKabList([]); setKecList([]);
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
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    setSaveError('');
    try {
      const detailsVal = Object.keys(detailsMap).length > 0 ? detailsMap : null;
      if (isNew) {
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
            details: detailsVal,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        navigate(`/admin/listing/${json.data.id}`);
        return;
      }
      const body: Record<string, unknown> = {
        title: form.title ?? '',
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
        jarak_sungai_m: lingkungan === 'sungai' ? (form.jarak_sungai_m ?? null) : null,
        jarak_makam_m:  lingkungan === 'makam'  ? (form.jarak_makam_m ?? null)  : null,
        jarak_sutet_m:  lingkungan === 'sutet'  ? (form.jarak_sutet_m ?? null)  : null,
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
        status_sold: form.status_sold ? 1 : 0,
        details: detailsVal,
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
      const saved = json.data?.properti;
      if (saved) setGeoCoords({ latitude: saved.latitude ?? null, longitude: saved.longitude ?? null });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusSave = async () => {
    if (!statusPending || statusPending === property?.status_publish) return;
    if (statusPending === 'archived') {
      if (!window.confirm('Arsipkan properti ini? Data tidak dihapus.')) return;
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

  const jenis   = form.jenis_properti ?? 'rumah';
  const tujuan  = form.tujuan ?? 'dijual';
  const showHarga = tujuan === 'dijual' || tujuan === 'dijual_disewa';
  const showSewa  = tujuan === 'disewa' || tujuan === 'dijual_disewa';
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
                <select value={statusPending} onChange={e => setStatusPending(e.target.value as StatusValue)} className={selectCls}>
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
              <AlertTriangle size={12} /> Properti akan disembunyikan dari semua halaman publik.
            </p>
          )}
          {statusMsg   && <p className="mt-2 text-xs text-emerald-600">{statusMsg}</p>}
          {statusError && <p className="mt-2 text-xs text-red-600">{statusError}</p>}
          {property!.published_at && (
            <p className="mt-2 text-xs text-[#94A3B8]">
              Pertama dipublish: {new Date(property!.published_at).toLocaleString('id-ID')}
            </p>
          )}
        </div>
      )}

      {/* ── EDIT FORM ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-6">
        <h2 className="font-semibold text-[#0F172A] text-sm">Detail Properti</h2>

        {/* (A) Informasi Dasar */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Informasi Dasar</h3>
          <Field label="Judul Listing *">
            <input type="text" value={form.title ?? ''} onChange={e => setF({ title: e.target.value })} className={inputCls} placeholder="Judul listing properti" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Jenis Properti">
              <select value={jenis} onChange={e => setF({ jenis_properti: e.target.value })} className={selectCls}>
                {JENIS_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Tujuan">
              <div className="flex gap-2">
                {TUJUAN_OPTS.map(t => (
                  <button key={t.value} type="button" onClick={() => setF({ tujuan: t.value })}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      tujuan === t.value
                        ? 'bg-[#1565C0] text-white border-[#1565C0]'
                        : 'bg-white text-[#64748B] border-gray-200 hover:border-[#1565C0]/50'
                    }`}
                  >{t.label}</button>
                ))}
              </div>
            </Field>
          </div>
        </section>

        {/* (B) Harga — kondisional per tujuan */}
        <section className="pt-4 border-t border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Harga</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showHarga && <>
              <Field label="Harga Penawaran (Rp)">
                <input type="number" min={0} value={form.harga ?? ''} onChange={e => setF({ harga: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} placeholder="0" />
              </Field>
              <Field label="Harga Lama / Coret (Rp)">
                <input type="number" min={0} value={form.harga_lama ?? ''} onChange={e => handleHargaLama(e.target.value ? parseInt(e.target.value) : null)} className={inputCls} placeholder="Kosong jika tidak ada" />
              </Field>
            </>}
            {showSewa && (
              <Field label="Harga Sewa / Tahun (Rp)">
                <input type="number" min={0} value={form.harga_sewa_tahun ?? ''} onChange={e => setF({ harga_sewa_tahun: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
          </div>
          {showHarga && (
            <div className="flex gap-4">
              {(['nego', 'nett'] as const).map(k => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form[k]} onChange={e => setF({ [k]: e.target.checked ? 1 : 0 })} className="w-4 h-4 accent-[#1565C0]" />
                  <span className="text-sm text-[#0F172A] capitalize">{k}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* (C) Detail Properti — kondisional per jenis */}
        <section className="pt-4 border-t border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Detail Properti</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {jenis === 'kost' && (
              <Field label="Jenis Kost">
                <select value={String(getDetail('jenis_kost'))} onChange={e => setDetail('jenis_kost', e.target.value || null)} className={selectCls}>
                  <option value="">— pilih —</option>
                  {['putra','putri','campur'].map(v => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>
                  ))}
                </select>
              </Field>
            )}
            {jenis === 'hotel' && (
              <Field label="Jenis Hotel">
                <select value={String(getDetail('jenis_hotel'))} onChange={e => setDetail('jenis_hotel', e.target.value || null)} className={selectCls}>
                  <option value="">— pilih —</option>
                  {['budget','bintang1','bintang2','bintang3','bintang4','bintang5','boutique'].map(v => (
                    <option key={v} value={v}>{v.startsWith('bintang') ? `Bintang ${v.slice(-1)}` : v.charAt(0).toUpperCase()+v.slice(1)}</option>
                  ))}
                </select>
              </Field>
            )}
            {jenis === 'apartment' && (
              <Field label="No. Unit">
                <input type="text" value={String(getDetail('no_unit'))} onChange={e => setDetail('no_unit', e.target.value || null)} className={inputCls} placeholder="contoh: A-12" />
              </Field>
            )}
            {SHOW_LUAS_TANAH.has(jenis) && (
              <Field label="Luas Tanah (m²)">
                <input type="number" min={0} value={form.luas_tanah ?? ''} onChange={e => setF({ luas_tanah: e.target.value ? parseFloat(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
            {SHOW_LUAS_BANGUNAN.has(jenis) && (
              <Field label="Luas Bangunan (m²)">
                <input type="number" min={0} value={form.luas_bangunan ?? ''} onChange={e => setF({ luas_bangunan: e.target.value ? parseFloat(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
            {SHOW_LEBAR_DEPAN.has(jenis) && (
              <Field label="Lebar Depan (m)">
                <input type="number" min={0} value={form.lebar_depan ?? ''} onChange={e => setF({ lebar_depan: e.target.value ? parseFloat(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
            {SHOW_LANTAI.has(jenis) && (
              <Field label="Jumlah Lantai">
                <input type="number" min={0} value={form.lantai ?? ''} onChange={e => setF({ lantai: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
            {SHOW_KT_KM.has(jenis) && <>
              <Field label="Kamar Tidur">
                <input type="number" min={0} value={form.jumlah_kamar_tidur ?? ''} onChange={e => setF({ jumlah_kamar_tidur: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
              <Field label="Kamar Mandi">
                <input type="number" min={0} value={form.jumlah_kamar_mandi ?? ''} onChange={e => setF({ jumlah_kamar_mandi: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            </>}
            {SHOW_FURNISHED.has(jenis) && (
              <Field label="Kelengkapan Furnitur">
                <select value={form.furnished ?? ''} onChange={e => setF({ furnished: e.target.value || null })} className={selectCls}>
                  <option value="">— pilih —</option>
                  {FURNISHED_OPTS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </Field>
            )}
            {SHOW_SEWA_KAMAR.has(jenis) && (
              <Field label="Harga Sewa Kamar / Bulan (Rp)">
                <input type="number" min={0} value={form.harga_sewa_kamar_bulan ?? ''} onChange={e => setF({ harga_sewa_kamar_bulan: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
            {SHOW_INCOME.has(jenis) && (
              <Field label="Pendapatan / Bulan (Rp)">
                <input type="number" min={0} value={form.income_per_bulan ?? ''} onChange={e => setF({ income_per_bulan: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
            {SHOW_PENGELUARAN.has(jenis) && (
              <Field label="Pengeluaran / Bulan (Rp)">
                <input type="number" min={0} value={form.pengeluaran_per_bulan ?? ''} onChange={e => setF({ pengeluaran_per_bulan: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
          </div>
        </section>

        {/* (D) Lokasi */}
        <section className="pt-4 border-t border-gray-100">
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
              {geoCoords?.latitude != null
                ? <p className="text-xs mt-1 text-emerald-600">📍 Koordinat: {geoCoords.latitude}, {geoCoords.longitude}</p>
                : form.gmaps_link
                  ? <p className="text-xs mt-1 text-amber-600">⚠️ Koordinat tidak terdeteksi — simpan untuk mencoba lagi</p>
                  : null}
            </Field>
          </div>
        </section>

        {/* (E) Legalitas */}
        <section className="pt-4 border-t border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Legalitas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Legalitas">
              <select value={form.legalitas ?? ''} onChange={e => setF({ legalitas: e.target.value || null })} className={selectCls}>
                <option value="">— pilih —</option>
                {LEGALITAS_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Status Legalitas">
              <div className="flex gap-4 pt-1">
                {[{v:'on_hand',l:'On Hand (bersih)'},{v:'on_bank',l:'On Bank (agunan)'}].map(s => (
                  <label key={s.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="status_legalitas" value={s.v} checked={form.status_legalitas === s.v} onChange={() => setF({ status_legalitas: s.v })} className="accent-[#1565C0]" />
                    <span className="text-sm text-[#0F172A]">{s.l}</span>
                  </label>
                ))}
              </div>
            </Field>
            {form.status_legalitas === 'on_bank' && <>
              <Field label="Bank Agunan">
                <input type="text" value={form.bank_agunan ?? ''} onChange={e => setF({ bank_agunan: e.target.value || null })} className={inputCls} />
              </Field>
              <Field label="Sisa KPR / Hutang Bank (Rp)">
                <input type="number" min={0} value={form.outstanding_bank ?? ''} onChange={e => setF({ outstanding_bank: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} />
              </Field>
            </>}
          </div>
        </section>

        {/* (F) Lingkungan */}
        <section className="pt-4 border-t border-gray-100 space-y-3">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Lingkungan</h3>
          <div className="flex flex-wrap gap-4">
            {([
              { value: 'jauh',   label: 'Jauh dari semuanya' },
              { value: 'sungai', label: 'Dekat Sungai' },
              { value: 'makam',  label: 'Dekat Makam' },
              { value: 'sutet',  label: 'Dekat Sutet' },
            ] as { value: LingkunganType; label: string }[]).map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="lingkungan" value={opt.value} checked={lingkungan === opt.value} onChange={() => handleLingkungan(opt.value)} className="accent-[#1565C0]" />
                <span className="text-sm text-[#0F172A]">{opt.label}</span>
              </label>
            ))}
          </div>
          {lingkungan === 'sungai' && (
            <Field label="Jarak ke Sungai (m)"><input type="number" min={0} value={form.jarak_sungai_m ?? ''} onChange={e => setF({ jarak_sungai_m: e.target.value ? parseFloat(e.target.value) : null })} className={`${inputCls} max-w-xs`} /></Field>
          )}
          {lingkungan === 'makam' && (
            <Field label="Jarak ke Makam (m)"><input type="number" min={0} value={form.jarak_makam_m ?? ''} onChange={e => setF({ jarak_makam_m: e.target.value ? parseFloat(e.target.value) : null })} className={`${inputCls} max-w-xs`} /></Field>
          )}
          {lingkungan === 'sutet' && (
            <Field label="Jarak ke Sutet (m)"><input type="number" min={0} value={form.jarak_sutet_m ?? ''} onChange={e => setF({ jarak_sutet_m: e.target.value ? parseFloat(e.target.value) : null })} className={`${inputCls} max-w-xs`} /></Field>
          )}
        </section>

        {/* (G) Info Tambahan & Narasi */}
        <section className="pt-4 border-t border-gray-100 space-y-4">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Info Tambahan & Narasi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Lebar Jalan (m)">
              <input type="number" min={0} value={form.lebar_jalan_m ?? ''} onChange={e => setF({ lebar_jalan_m: e.target.value ? parseFloat(e.target.value) : null })} className={inputCls} />
            </Field>
            <Field label="Video YouTube (URL)">
              <input type="text" value={form.video_youtube ?? ''} onChange={e => setF({ video_youtube: e.target.value || null })} className={inputCls} />
            </Field>
          </div>
          <Field label="Deskripsi">
            <textarea value={form.deskripsi ?? ''} onChange={e => setF({ deskripsi: e.target.value || null })} rows={4} className={`${inputCls} resize-y`} />
          </Field>
          <Field label="Info Tambahan">
            <textarea value={form.info_tambahan ?? ''} onChange={e => setF({ info_tambahan: e.target.value || null })} rows={3} className={`${inputCls} resize-y`} />
          </Field>
          <Field label="Alasan Dijual">
            <textarea value={form.alasan_dijual ?? ''} onChange={e => setF({ alasan_dijual: e.target.value || null })} rows={2} className={`${inputCls} resize-y`} />
          </Field>

          {/* AI Generate: mengisi judul, deskripsi, meta_title, meta_description sekaligus */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  ✨ Generate Deskripsi &amp; SEO dengan AI
                </>
              )}
            </button>
            {aiNotif && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {aiNotif}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">SEO</span>
            <button
              type="button"
              onClick={handleAutoFillSeo}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors"
              title="Isi otomatis dari jenis, lokasi, harga, & luas (bisa diedit sebelum Simpan)"
            >
              <Sparkles size={13} /> Auto-fill dari data properti
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Meta Title (SEO)">
              <input type="text" value={form.meta_title ?? ''} onChange={e => setF({ meta_title: e.target.value || null })} className={inputCls} />
              <CharCounter value={form.meta_title ?? ''} ideal={60} />
            </Field>
            <Field label="Meta Description (SEO)">
              <textarea value={form.meta_description ?? ''} onChange={e => setF({ meta_description: e.target.value || null })} rows={2} className={`${inputCls} resize-y`} placeholder="~150 karakter" />
              <CharCounter value={form.meta_description ?? ''} ideal={160} />
            </Field>
          </div>
        </section>

        {/* (H) Badges & Status */}
        <section className="pt-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Badges & Status</h3>
          <div className="flex flex-wrap gap-4">
            {([
              ['badge_premium',    'Premium'],
              ['badge_featured',   'Featured'],
              ['badge_hot',        'Hot'],
              ['status_sold',      'SOLD'],
              ['properti_pilihan', 'Properti Pilihan'],
              ['verified',         'Verified'],
            ] as [keyof typeof form, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!form[key]} onChange={e => setF({ [key]: e.target.checked ? 1 : 0 })} className="w-4 h-4 accent-[#1565C0]" />
                <span className={`text-sm ${key === 'status_sold' ? 'text-red-600 font-semibold' : 'text-[#0F172A]'}`}>{label}</span>
              </label>
            ))}
          </div>
          {!!form.status_sold && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle size={12} />
              TODO: SOLD overlay di PropertyCard (tampilan publik) belum diimplementasi.
            </p>
          )}
        </section>

        {/* Save */}
        <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
          >
            <Save size={15} />
            {saving ? 'Menyimpan…' : isNew ? 'Buat Properti' : 'Simpan Perubahan'}
          </button>
          {saveMsg   && <span className="text-sm text-emerald-600 font-medium">{saveMsg}</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </div>

      {/* (I) Foto */}
      <PropertyPhotosCard propertyId={id!} isNew={isNew} initialPhotos={loadedPhotos} />
    </div>
  );
}
