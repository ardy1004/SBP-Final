import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, Upload, X, AlertCircle } from 'lucide-react';
import { getLocations, type ApiLocation } from '../../lib/api';
import { PROPERTY_TYPES } from '../../lib/propertyTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step1State {
  nama_ktp: string;
  nik: string;
  rt_rw: string;
  kelurahan: string;
  kecamatan: string;
  prov_owner: string;
  kab_owner: string;
  bertindak: string;
  ahli_waris_jumlah: string;
  ahli_waris_sepakat: boolean;
  ahli_waris_kuasa: boolean;
  ahli_waris_turun: boolean;
  no_wa: string;
  no_wa_2: string;
}

interface ApiResult {
  kode_listing: string;
  kode_perjanjian: string;
  photos_uploaded?: number;
  photos_total_sent?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

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

const inputCls = (err?: string) =>
  `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] transition-all ${err ? 'border-red-400 bg-red-50' : 'border-gray-200'}`;

const toggleBtnCls = (active: boolean) =>
  `flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${active ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`;

const selectCls = (err?: string) =>
  `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] appearance-none ${err ? 'border-red-400 bg-red-50' : 'border-gray-200'}`;

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-red-500 text-xs mt-1">{msg}</p>;
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {[{ num: 1, label: 'Data Diri' }, { num: 2, label: 'Info Properti' }].map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              step > s.num ? 'bg-[#10B981] border-[#10B981] text-white' :
              step === s.num ? 'bg-[#1565C0] border-[#1565C0] text-white' :
              'bg-white border-gray-300 text-gray-400'
            }`}>
              {step > s.num ? <Check size={16} /> : s.num}
            </div>
            <span className={`text-xs mt-1 font-medium ${step === s.num ? 'text-[#1565C0]' : step > s.num ? 'text-[#10B981]' : 'text-gray-400'}`}>
              {s.label}
            </span>
          </div>
          {i < 1 && <div className={`h-0.5 w-16 sm:w-24 mx-2 mb-4 transition-all ${step > s.num ? 'bg-[#10B981]' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── STEP 1: Data Diri ────────────────────────────────────────────────────────

const BERTINDAK_OPTIONS = [
  { value: 'pemilik_sertifikat', label: 'Pemilik A/n Sertifikat' },
  { value: 'suami_istri',        label: 'Suami/Istri (Bukan A/n Sertifikat)' },
  { value: 'ahli_waris',         label: 'Ahli Waris' },
  { value: 'lainnya',            label: 'Lainnya' },
];

function Step1({ onNext }: { onNext: (data: Step1State) => void }) {
  const [form, setForm] = useState<Step1State>({
    nama_ktp: '', nik: '', rt_rw: '',
    kelurahan: '', kecamatan: '', prov_owner: '', kab_owner: '', bertindak: '',
    ahli_waris_jumlah: '', ahli_waris_sepakat: false, ahli_waris_kuasa: false, ahli_waris_turun: false,
    no_wa: '', no_wa_2: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const f = (k: keyof Step1State, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }));
  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nama_ktp) e.nama_ktp = 'Nama sesuai KTP wajib diisi';
    if (!form.nik) e.nik = 'NIK wajib diisi';
    else if (!/^\d{16}$/.test(form.nik)) e.nik = 'NIK harus tepat 16 digit angka';
    if (!form.prov_owner) e.prov_owner = 'Provinsi wajib diisi';
    if (!form.kab_owner) e.kab_owner = 'Kabupaten/Kota wajib diisi';
    if (!form.kecamatan) e.kecamatan = 'Kecamatan wajib diisi';
    if (!form.kelurahan) e.kelurahan = 'Kelurahan wajib diisi';
    if (!form.rt_rw) e.rt_rw = 'RT/RW wajib diisi';
    if (!form.bertindak) e.bertindak = 'Wajib dipilih';
    if (!form.no_wa) e.no_wa = 'Nomor WhatsApp wajib diisi';
    else if (!/^(0|62|8)\d{8,12}$/.test(form.no_wa.replace(/\D/g, ''))) e.no_wa = 'Nomor WhatsApp tidak valid';
    return e;
  };

  const handleNext = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onNext(form);
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Data Diri Pemilik</h2>
      <p className="text-sm text-[#64748B] mb-6">Isi sesuai KTP yang masih berlaku.</p>

      <div className="space-y-4">
        {/* Nama KTP */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama Lengkap Sesuai KTP *</label>
          <input value={form.nama_ktp} onChange={e => { f('nama_ktp', e.target.value); clearErr('nama_ktp'); }}
            placeholder="Sesuai KTP" className={inputCls(errors.nama_ktp)} />
          <FieldErr msg={errors.nama_ktp} />
        </div>

        {/* NIK */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">NIK (KTP) *</label>
          <input
            type="text"
            value={form.nik}
            onChange={e => { f('nik', e.target.value.replace(/\D/g, '').slice(0, 16)); clearErr('nik'); }}
            placeholder="16 digit NIK"
            className={inputCls(errors.nik)}
          />
          <p className="text-xs text-gray-400 mt-0.5">NIK dienkripsi untuk keamanan data Anda.</p>
          <FieldErr msg={errors.nik} />
        </div>

        {/* Alamat Lengkap Sesuai KTP — label statis (input dihapus; detail alamat diisi via kolom lokasi di bawah) */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alamat Lengkap Sesuai KTP</label>
        </div>

        {/* Provinsi + Kab./Kota KTP */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Provinsi (KTP) *</label>
            <input value={form.prov_owner} onChange={e => { f('prov_owner', e.target.value); clearErr('prov_owner'); }}
              placeholder="Mis: Jawa Timur" className={inputCls(errors.prov_owner)} />
            <FieldErr msg={errors.prov_owner} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Kab./Kota (KTP) *</label>
            <input value={form.kab_owner} onChange={e => { f('kab_owner', e.target.value); clearErr('kab_owner'); }}
              placeholder="Mis: Kabupaten Sleman" className={inputCls(errors.kab_owner)} />
            <FieldErr msg={errors.kab_owner} />
          </div>
        </div>

        {/* Kecamatan + Kelurahan/Desa */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Kecamatan *</label>
            <input value={form.kecamatan} onChange={e => { f('kecamatan', e.target.value); clearErr('kecamatan'); }}
              placeholder="Kecamatan" className={inputCls(errors.kecamatan)} />
            <FieldErr msg={errors.kecamatan} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Kelurahan/Desa *</label>
            <input value={form.kelurahan} onChange={e => { f('kelurahan', e.target.value); clearErr('kelurahan'); }}
              placeholder="Kelurahan" className={inputCls(errors.kelurahan)} />
            <FieldErr msg={errors.kelurahan} />
          </div>
        </div>

        {/* RT/RW */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">RT/RW *</label>
            <input value={form.rt_rw} onChange={e => { f('rt_rw', e.target.value); clearErr('rt_rw'); }} placeholder="001/002"
              className={inputCls(errors.rt_rw)} />
            <FieldErr msg={errors.rt_rw} />
          </div>
          <div />
        </div>

        {/* Bertindak Sebagai */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Bertindak Sebagai *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BERTINDAK_OPTIONS.map(o => (
              <label key={o.value} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                form.bertindak === o.value ? 'border-[#1565C0] bg-[#E3F2FD]' : 'border-gray-200 hover:border-[#1565C0]'
              }`}>
                <input type="radio" name="bertindak" value={o.value}
                  checked={form.bertindak === o.value}
                  onChange={() => { f('bertindak', o.value); clearErr('bertindak'); }}
                  className="accent-[#1565C0]" />
                <span className="text-sm">{o.label}</span>
              </label>
            ))}
          </div>
          <FieldErr msg={errors.bertindak} />
        </div>

        {/* Kondisional: Ahli Waris */}
        {form.bertindak === 'ahli_waris' && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-amber-800">Detail Ahli Waris</p>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Total Ahli Waris</label>
              <input type="number" min="1" value={form.ahli_waris_jumlah}
                onChange={e => f('ahli_waris_jumlah', e.target.value)}
                placeholder="Jumlah ahli waris" className={inputCls()} />
            </div>
            {([
              { key: 'ahli_waris_sepakat', label: 'Semua ahli waris sepakat untuk dijual/disewakan?' },
              { key: 'ahli_waris_kuasa',   label: 'Sudah dikuasakan via notaris?' },
              { key: 'ahli_waris_turun',   label: 'Turun waris sudah diurus via notaris?' },
            ] as const).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-[#0F172A]">{label}</span>
                <div className="flex gap-2">
                  {(['Ya', 'Tidak'] as const).map(opt => (
                    <button key={opt} type="button"
                      onClick={() => f(key, opt === 'Ya')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        form[key] === (opt === 'Ya') ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-300 text-gray-600'
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No WA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 1 *</label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={form.no_wa} onChange={e => { f('no_wa', e.target.value); clearErr('no_wa'); }}
                placeholder="81391278889" className={`${inputCls(errors.no_wa)} rounded-l-none`} />
            </div>
            <FieldErr msg={errors.no_wa} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 2 <span className="font-normal text-gray-400">(Opsional)</span></label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={form.no_wa_2} onChange={e => f('no_wa_2', e.target.value)}
                placeholder="Opsional" className="w-full border border-gray-200 rounded-r-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleNext}
        className="w-full mt-6 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110"
        style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
        Lanjut ke Info Properti <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ─── STEP 2: Info Properti ────────────────────────────────────────────────────

const JENIS_OPTIONS = PROPERTY_TYPES.map(t => ({ value: t.value, label: t.label }));
const LEGALITAS_OPTIONS = [
  'SHM & IMB/PBG Lengkap', 'SHGB & IMB/PBG Lengkap',
  'SHM Pekarangan Tanpa IMB/PBG', 'SHM Sawah/Tegalan',
  'SHGB Tanpa IMB/PBG', 'Girik/Letter C/PPJB/dll', 'Izin Usaha',
];
const LINGKUNGAN_OPTIONS = [
  { value: 'jauh_dari_semuanya', label: 'Jauh dari Semuanya' },
  { value: 'dekat_sungai',       label: 'Dekat Sungai' },
  { value: 'dekat_makam',        label: 'Dekat Makam' },
  { value: 'dekat_sutet',        label: 'Dekat Sutet' },
];

const showLT   = (j: string) => j !== 'apartment';
const showLB   = (j: string) => !['tanah'].includes(j);
const showKTKM = (j: string) => !['tanah', 'gudang'].includes(j);
const showLD   = (j: string) => !['apartment'].includes(j);
const showLant = (j: string) => !['tanah'].includes(j);
const showIncome = (j: string) => ['kost', 'hotel', 'homestay', 'villa'].includes(j);

// Preview kode listing (display only; server assigns actual sequence)
function genDisplayKode() {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `SBP-${ds}-???`;
}

interface Step2Props {
  step1: Step1State;
  onBack: () => void;
  onSuccess: (result: ApiResult) => void;
}

function Step2({ step1, onBack, onSuccess }: Step2Props) {
  // Location cascade
  const [provId, setProvId] = useState<number | null>(null);
  const [kabId, setKabId]   = useState<number | null>(null);
  const [kecId, setKecId]   = useState<number | null>(null);
  const [provList, setProvList] = useState<ApiLocation[]>([]);
  const [kabList, setKabList] = useState<ApiLocation[]>([]);
  const [kecList, setKecList] = useState<ApiLocation[]>([]);
  const [kelList, setKelList] = useState<ApiLocation[]>([]);
  const [provinsi, setProvinsi]   = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [kecProp, setKecProp]     = useState('');
  const [kelProp, setKelProp]     = useState('');
  const [locLoading, setLocLoading] = useState(true);

  // Property fields
  const [judul, setJudul]   = useState('');
  const [jenis, setJenis]   = useState('');
  const [tujuan, setTujuan] = useState('dijual');
  const [harga, setHarga]   = useState('');
  const [hargaSewa, setHargaSewa] = useState('');
  const [kondisi, setKondisi] = useState<'nego' | 'nett'>('nego');
  const [alamat, setAlamat] = useState('');
  const [lt, setLt]         = useState('');
  const [lb, setLb]         = useState('');
  const [kt, setKt]         = useState('');
  const [km, setKm]         = useState('');
  const [lebar_depan, setLebarDepan] = useState('');
  const [lantai, setLantai]         = useState('');
  const [lebar_jalan, setLebarJalan] = useState('');
  const [legalitas, setLegalitas]   = useState('');
  const [statusLeg, setStatusLeg]   = useState<'on_hand' | 'on_bank'>('on_hand');
  const [bankAgunan, setBankAgunan] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [lingkungan, setLingkungan] = useState('');
  const [gmaps, setGmaps] = useState('');
  const [infoTambahan, setInfoTambahan] = useState('');
  const [alasanJual, setAlasanJual]     = useState('');
  // Jenis-specific
  const [jenisKost, setJenisKost]   = useState('');
  const [noUnit, setNoUnit]         = useState('');
  const [kelengkapan, setKelengkapan] = useState('');
  const [incomePerBulan, setIncomePerBulan]         = useState('');
  const [pengeluaranPerBulan, setPengeluaranPerBulan] = useState('');
  const [sewaKamarBulan, setSewaBulan]               = useState('');

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFiles, setPhotoFiles]     = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  // Consent + submission
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  // Load all provinces
  useEffect(() => {
    setLocLoading(true);
    getLocations().then(res => {
      if (res.success && res.data) setProvList(res.data.items);
    }).catch(() => {}).finally(() => setLocLoading(false));
  }, []);

  // Load kabupaten saat provinsi dipilih
  useEffect(() => {
    if (!provId) { setKabList([]); setKecList([]); setKelList([]); setKabupaten(''); setKecProp(''); setKelProp(''); return; }
    getLocations(provId).then(res => { if (res.success && res.data) setKabList(res.data.items); });
  }, [provId]);

  useEffect(() => {
    if (!kabId) { setKecList([]); setKelList([]); setKecProp(''); setKelProp(''); return; }
    getLocations(kabId).then(res => { if (res.success && res.data) setKecList(res.data.items); });
  }, [kabId]);

  useEffect(() => {
    if (!kecId) { setKelList([]); setKelProp(''); return; }
    getLocations(kecId).then(res => { if (res.success && res.data) setKelList(res.data.items); });
  }, [kecId]);

  const handleProvChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = provList.find(p => p.id === id)?.nama ?? '';
    setProvId(id); setProvinsi(nama); setKabId(null); setKabupaten(''); setKecId(null); setKecProp(''); setKelProp('');
  }, [provList]);

  const handleKabChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kabList.find(k => k.id === id)?.nama ?? '';
    setKabId(id); setKabupaten(nama); setKecId(null); setKecProp(''); setKelProp('');
    clearErr('kabupaten');
  }, [kabList]);

  const handleKecChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kecList.find(k => k.id === id)?.nama ?? '';
    setKecId(id); setKecProp(nama); setKelProp(''); clearErr('kecamatan_prop');
  }, [kecList]);

  const handleKelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const nama = kelList.find(k => k.id === parseInt(e.target.value, 10))?.nama ?? '';
    setKelProp(nama); clearErr('kelurahan_prop');
  }, [kelList]);

  // Photo handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const toAdd: File[] = [];
    let photoErr = '';
    for (const file of files) {
      if (photoFiles.length + toAdd.length >= 20) { photoErr = 'Maksimal 20 foto'; break; }
      if (!file.type.startsWith('image/')) {
        photoErr = `${file.name}: Hanya file gambar yang didukung.`; continue;
      }
      if (file.size > 8 * 1024 * 1024) { photoErr = `${file.name}: ukuran melebihi 8MB`; continue; }
      toAdd.push(file);
    }
    if (!toAdd.length) {
      if (photoErr) setErrors(p => ({ ...p, photos: photoErr }));
      else clearErr('photos');
      e.target.value = '';
      return;
    }
    const settled = await Promise.allSettled(toAdd.map(convertToWebP));
    const okFiles: File[] = [];
    const okPreviews: string[] = [];
    const failedNames: string[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        okFiles.push(toAdd[i]);
        okPreviews.push(result.value);
      } else {
        failedNames.push(toAdd[i].name);
      }
    });
    if (okFiles.length) {
      setPhotoFiles(p => [...p, ...okFiles]);
      setPhotoPreviews(p => [...p, ...okPreviews]);
    }
    const convertErr = failedNames.length
      ? `${failedNames.join(', ')}: format foto ini tidak didukung browser Anda — coba screenshot foto lalu upload ulang, atau export sebagai JPG dari galeri HP.`
      : '';
    const combinedErr = [photoErr, convertErr].filter(Boolean).join(' ');
    if (combinedErr) setErrors(p => ({ ...p, photos: combinedErr }));
    else clearErr('photos');
    e.target.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotoFiles(p => p.filter((_, i) => i !== idx));
    setPhotoPreviews(p => p.filter((_, i) => i !== idx));
  };

  // Build jenis-specific details object
  const buildDetails = () => {
    const d: Record<string, unknown> = {};
    if (jenis === 'kost' && jenisKost) d.jenis_kost = jenisKost;
    if (['hotel','homestay','villa','apartment'].includes(jenis) && kelengkapan) d.kelengkapan = kelengkapan;
    if (jenis === 'apartment' && noUnit) d.no_unit = noUnit;
    return Object.keys(d).length > 0 ? d : undefined;
  };

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!jenis) e.jenis = 'Jenis properti wajib dipilih';
    if (!harga || parseInt(harga) <= 0) e.harga = 'Harga wajib diisi';
    if (tujuan === 'dijual_disewa' && (!hargaSewa || parseInt(hargaSewa) <= 0)) e.harga_sewa_tahun = 'Harga sewa/tahun wajib diisi untuk opsi Dijual & Disewakan';
    if (!gmaps.trim()) e.gmaps_link = 'Link Google Maps wajib diisi';
    if (!legalitas) e.legalitas = 'Legalitas wajib dipilih';
    if (!photoPreviews.length) e.photos = 'Minimal 1 foto wajib diupload';
    if (!consent) e.consent = 'Persetujuan privasi wajib dicentang';
    if (Object.keys(e).length) { setErrors(e); return; }

    setLoading(true);
    setApiError(null);

    try {
      const payload: Record<string, unknown> = {
        // owner (step 1)
        nama_ktp:         step1.nama_ktp,
        nik:              step1.nik,
        // alamat_ktp tidak lagi punya input sendiri — disusun dari field lokasi terstruktur (semua wajib)
        alamat_ktp:       `Kel. ${step1.kelurahan}, Kec. ${step1.kecamatan}, ${step1.kab_owner}, ${step1.prov_owner} (RT/RW ${step1.rt_rw})`,
        rt_rw:            step1.rt_rw || undefined,
        prov_owner:       step1.prov_owner || undefined,
        kab_owner:        step1.kab_owner || undefined,
        kelurahan_owner:  step1.kelurahan,
        kecamatan_owner:  step1.kecamatan,
        bertindak_sebagai: step1.bertindak,
        gmaps_link:       gmaps || undefined,
        no_wa:            step1.no_wa,
        no_wa_2:          step1.no_wa_2 || undefined,
        data_ahli_waris:  step1.bertindak === 'ahli_waris' ? {
          jumlah_ahli_waris: parseInt(step1.ahli_waris_jumlah) || 0,
          semua_sepakat:     step1.ahli_waris_sepakat,
          kuasa_notaris:     step1.ahli_waris_kuasa,
          turun_waris:       step1.ahli_waris_turun,
        } : undefined,
        // property (step 2)
        jenis_properti:    jenis,
        tujuan,
        title:             judul.trim() || undefined,
        harga:             tujuan === 'disewa' ? undefined : (parseInt(harga) || 0),
        harga_sewa_tahun:  tujuan === 'disewa'        ? (parseInt(harga) || undefined)
                          : tujuan === 'dijual_disewa' ? (hargaSewa ? parseInt(hargaSewa) : undefined)
                          : undefined,
        nego:              kondisi === 'nego',
        nett:              kondisi === 'nett',
        provinsi,
        kabupaten:         kabupaten || undefined,
        kecamatan_prop:    kecProp   || undefined,
        kelurahan_prop:    kelProp   || undefined,
        alamat:            alamat    || undefined,
        luas_tanah:        lt ? parseInt(lt) : undefined,
        luas_bangunan:     lb ? parseInt(lb) : undefined,
        jumlah_kamar_tidur:  kt ? parseInt(kt) : undefined,
        jumlah_kamar_mandi:  km ? parseInt(km) : undefined,
        lebar_depan:         lebar_depan  ? parseFloat(lebar_depan)  : undefined,
        lantai:              lantai        ? parseInt(lantai)          : undefined,
        lebar_jalan_m:       lebar_jalan  ? parseFloat(lebar_jalan)  : undefined,
        legalitas,
        status_legalitas:  statusLeg,
        bank_agunan:       statusLeg === 'on_bank' ? bankAgunan   || undefined : undefined,
        outstanding_bank:  statusLeg === 'on_bank' ? parseInt(outstanding) || undefined : undefined,
        lingkungan:        lingkungan || undefined,
        deskripsi:         infoTambahan || undefined,
        info_tambahan:     infoTambahan || undefined,
        alasan_dijual:     alasanJual   || undefined,
        income_per_bulan:       incomePerBulan     ? parseInt(incomePerBulan)      : undefined,
        pengeluaran_per_bulan:  pengeluaranPerBulan ? parseInt(pengeluaranPerBulan) : undefined,
        harga_sewa_kamar_bulan: sewaKamarBulan     ? parseInt(sewaKamarBulan)      : undefined,
        details:           buildDetails(),
        photos:            photoPreviews,
      };

      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const res = await fetch('/api/titip-jual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { success: boolean; data?: ApiResult; error?: string; details?: Record<string, string> };

      if (!res.ok) {
        if (res.status === 422 && json.details) {
          setErrors(json.details);
          setApiError('Mohon periksa kembali isian form Anda.');
        } else {
          setApiError(json.error ?? 'Terjadi kesalahan. Silakan coba lagi.');
        }
        return;
      }

      onSuccess({ ...json.data!, photos_total_sent: photoPreviews.length });
    } catch {
      setApiError('Koneksi ke server gagal. Periksa koneksi internet Anda dan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const isValid = jenis && harga && parseInt(harga) > 0 && legalitas && photoPreviews.length > 0 && consent
    && gmaps.trim() && (tujuan !== 'dijual_disewa' || (hargaSewa && parseInt(hargaSewa) > 0));

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Informasi Properti</h2>
      <p className="text-sm text-[#64748B] mb-2">Lengkapi data properti yang ingin Anda pasarkan.</p>

      <div className="flex items-center gap-2 mb-6 px-4 py-2 bg-[#F0F4F8] rounded-xl">
        <span className="text-xs text-[#64748B]">Kode Listing:</span>
        <span className="font-mono font-bold text-[#1565C0] text-sm">{genDisplayKode()}</span>
        <span className="text-xs text-gray-400">(ditetapkan saat submit)</span>
      </div>

      <div className="space-y-4">
        {/* Judul Properti */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Judul Properti <span className="font-normal text-gray-400">(Opsional)</span></label>
          <input value={judul} onChange={e => setJudul(e.target.value)}
            placeholder="Kosongkan untuk judul otomatis" className={inputCls()} />
        </div>

        {/* Tujuan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Tujuan *</label>
          <div className="flex gap-2">
            {[{v:'dijual',l:'Dijual'},{v:'disewa',l:'Disewakan'},{v:'dijual_disewa',l:'Dijual & Disewakan'}].map(o => (
              <button key={o.v} onClick={() => setTujuan(o.v)} className={toggleBtnCls(tujuan === o.v)}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* Harga */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">
            Harga {tujuan === 'disewa' ? 'Sewa/Tahun' : 'Penawaran'} (Rp) *
          </label>
          <input value={harga} onChange={e => { setHarga(e.target.value); clearErr('harga'); }}
            type="number" placeholder="Contoh: 850000000" className={inputCls(errors.harga)} />
          <FieldErr msg={errors.harga} />
        </div>

        {/* Harga Sewa/Tahun (kondisional — Dijual & Disewakan) */}
        {tujuan === 'dijual_disewa' && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Harga Sewa/Tahun (Rp) *</label>
            <input value={hargaSewa} onChange={e => { setHargaSewa(e.target.value); clearErr('harga_sewa_tahun'); }}
              type="number" placeholder="Contoh: 25000000" className={inputCls(errors.harga_sewa_tahun)} />
            <FieldErr msg={errors.harga_sewa_tahun} />
          </div>
        )}

        {/* Kondisi Harga */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Kondisi Harga *</label>
          <div className="flex gap-2">
            {[{v:'nego',l:'Nego'},{v:'nett',l:'Nett'}].map(o => (
              <button key={o.v} onClick={() => setKondisi(o.v as 'nego'|'nett')} className={toggleBtnCls(kondisi === o.v)}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* Jenis Properti */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Jenis Properti *</label>
          <select value={jenis} onChange={e => { setJenis(e.target.value); clearErr('jenis'); }}
            className={selectCls(errors.jenis)}>
            <option value="">-- Pilih Jenis --</option>
            {JENIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <FieldErr msg={errors.jenis} />
        </div>

        {/* Jenis Kost (kondisional) */}
        {jenis === 'kost' && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-2">Jenis Kost</label>
            <div className="flex gap-2">
              {['putra','putri','campur'].map(v => (
                <button key={v} onClick={() => setJenisKost(v)} className={toggleBtnCls(jenisKost === v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No. Unit (Apartment) */}
        {jenis === 'apartment' && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. Unit</label>
            <input value={noUnit} onChange={e => setNoUnit(e.target.value)} placeholder="Mis: A-12"
              className={inputCls()} />
          </div>
        )}

        {/* Kelengkapan Furnitur (hotel/homestay/villa/apartment) */}
        {['hotel','homestay','villa','apartment'].includes(jenis) && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-2">Kelengkapan Furnitur</label>
            <div className="flex gap-2">
              {[{v:'fully',l:'Fully Furnished'},{v:'semi',l:'Semi Furnished'},{v:'unfurnished',l:'Unfurnished'}].map(o => (
                <button key={o.v} onClick={() => setKelengkapan(o.v)} className={toggleBtnCls(kelengkapan === o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
        )}

        {/* Dimensi kondisional */}
        {jenis && (
          <div className="grid grid-cols-2 gap-3">
            {showLT(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Tanah (m²)</label>
                <input type="number" value={lt} onChange={e => setLt(e.target.value)} placeholder="m²" className={inputCls()} />
              </div>
            )}
            {showLB(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Bangunan (m²)</label>
                <input type="number" value={lb} onChange={e => setLb(e.target.value)} placeholder="m²" className={inputCls()} />
              </div>
            )}
            {showLD(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Lebar Depan (m)</label>
                <input type="number" value={lebar_depan} onChange={e => setLebarDepan(e.target.value)} placeholder="m" className={inputCls()} />
              </div>
            )}
            {showLant(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Jumlah Lantai</label>
                <input type="number" value={lantai} onChange={e => setLantai(e.target.value)} placeholder="1" className={inputCls()} />
              </div>
            )}
            {showKTKM(jenis) && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Kamar Tidur</label>
                  <input type="number" value={kt} onChange={e => setKt(e.target.value)} placeholder="KT" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Kamar Mandi</label>
                  <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="KM" className={inputCls()} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Income per bulan (kost/hotel/villa) */}
        {jenis && showIncome(jenis) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Income/Bulan (Rp)</label>
              <input type="number" value={incomePerBulan} onChange={e => setIncomePerBulan(e.target.value)}
                placeholder="Opsional" className={inputCls()} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Pengeluaran/Bulan (Rp)</label>
              <input type="number" value={pengeluaranPerBulan} onChange={e => setPengeluaranPerBulan(e.target.value)}
                placeholder="Opsional" className={inputCls()} />
            </div>
            {jenis === 'kost' && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Harga Sewa/Kamar/Bulan (Rp)</label>
                <input type="number" value={sewaKamarBulan} onChange={e => setSewaBulan(e.target.value)}
                  placeholder="Opsional" className={inputCls()} />
              </div>
            )}
          </div>
        )}

        {/* Lokasi cascade */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Lokasi Properti</label>
          {locLoading ? (
            <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
          ) : (
            <div className="space-y-2">
              <select onChange={handleProvChange} value={provId ?? ''} className={selectCls()}>
                <option value="">-- Pilih Provinsi --</option>
                {provList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
              <select onChange={handleKabChange} defaultValue="" className={selectCls()} disabled={!provId}>
                <option value="">-- Pilih Kabupaten --</option>
                {kabList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
              {kabId && (
                <select onChange={handleKecChange} defaultValue="" className={selectCls()}>
                  <option value="">-- Pilih Kecamatan --</option>
                  {kecList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              )}
              {/* Disembunyikan sementara — TODO aktifkan kembali jika data kelurahan siap.
                  State (kelList, kelProp, setKelProp) & handler (handleKelChange) sengaja dipertahankan.
              {kecId && (
                <select onChange={handleKelChange} defaultValue="" className={selectCls()}>
                  <option value="">-- Pilih Kelurahan --</option>
                  {kelList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              )}
              */}
            </div>
          )}
        </div>

        {/* Alamat Properti */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alamat Lengkap Properti <span className="font-normal text-gray-400">(Opsional)</span></label>
          <textarea value={alamat} onChange={e => setAlamat(e.target.value)} rows={2}
            placeholder="Nomor, nama jalan, RT/RW — tidak ditampilkan publik" className={`${inputCls()} resize-none`} />
        </div>

        {/* Google Maps Properti */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Link Google Maps Properti *</label>
          <input value={gmaps} onChange={e => { setGmaps(e.target.value); clearErr('gmaps_link'); }}
            placeholder="https://maps.google.com/..." className={inputCls(errors.gmaps_link)} />
          <p className="text-xs text-gray-400 mt-0.5">Buka Google Maps → cari properti → share link → paste di sini.</p>
          <FieldErr msg={errors.gmaps_link} />
        </div>

        {/* Lebar Jalan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Lebar Jalan di Depan (m) <span className="font-normal text-gray-400">(Opsional)</span></label>
          <input type="number" value={lebar_jalan} onChange={e => setLebarJalan(e.target.value)}
            placeholder="Mis: 6" className={inputCls()} />
        </div>

        {/* Legalitas */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Legalitas *</label>
          <select value={legalitas} onChange={e => { setLegalitas(e.target.value); clearErr('legalitas'); }}
            className={selectCls(errors.legalitas)}>
            <option value="">-- Pilih Legalitas --</option>
            {LEGALITAS_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <FieldErr msg={errors.legalitas} />
        </div>

        {/* Status Legalitas */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Status Sertifikat *</label>
          <div className="flex gap-2">
            <button onClick={() => setStatusLeg('on_hand')} className={toggleBtnCls(statusLeg === 'on_hand')}>On Hand (Pegang Sendiri)</button>
            <button onClick={() => setStatusLeg('on_bank')} className={toggleBtnCls(statusLeg === 'on_bank')}>On Bank (Di Bank)</button>
          </div>
          {statusLeg === 'on_bank' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama Bank</label>
                <input value={bankAgunan} onChange={e => setBankAgunan(e.target.value)} placeholder="BRI, BCA, dll" className={inputCls()} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Outstanding (Rp)</label>
                <input type="number" value={outstanding} onChange={e => setOutstanding(e.target.value)} placeholder="Sisa KPR" className={inputCls()} />
              </div>
            </div>
          )}
        </div>

        {/* Lingkungan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Lingkungan Sekitar</label>
          <select value={lingkungan} onChange={e => setLingkungan(e.target.value)} className={selectCls()}>
            <option value="">-- Pilih --</option>
            {LINGKUNGAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Upload Foto */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">
            Upload Foto Properti * <span className="font-normal text-gray-400">({photoPreviews.length}/20 foto)</span>
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${errors.photos ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-[#1565C0]'}`}>
            <Upload size={28} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-[#64748B]">Klik atau drag foto ke sini</p>
            <p className="text-xs text-gray-400 mt-1">JPG/PNG/WebP · Maks 20 foto · Maks 8MB/foto · Foto pertama jadi cover</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*"
            multiple className="hidden" onChange={handleFileSelect} />
          <FieldErr msg={errors.photos} />

          {photoPreviews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
              {photoPreviews.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                  <img src={src} alt="" className="w-full h-full object-cover" suppressHydrationWarning />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-[#1565C0] text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Cover</span>
                  )}
                  <button onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Tambahan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Deskripsi & Fasilitas <span className="font-normal text-gray-400">(Opsional)</span></label>
          <textarea value={infoTambahan} onChange={e => setInfoTambahan(e.target.value)} rows={3}
            placeholder="Fasilitas, kondisi bangunan, keunggulan properti..." className={`${inputCls()} resize-none`} />
        </div>

        {/* Alasan Dijual */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alasan Dijual/Disewakan <span className="font-normal text-gray-400">(Opsional)</span></label>
          <textarea value={alasanJual} onChange={e => setAlasanJual(e.target.value)} rows={2}
            placeholder="Opsional" className={`${inputCls()} resize-none`} />
        </div>

        {/* Consent PDP — PLACEHOLDER: teks dapat disesuaikan dengan kebijakan privasi resmi SBP */}
        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${errors.consent ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-[#1565C0]'}`}>
          <input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); clearErr('consent'); }}
            className="mt-0.5 w-4 h-4 accent-[#1565C0] flex-shrink-0" />
          <span className="text-xs text-[#64748B] leading-relaxed">
            Saya menyetujui data pribadi saya dikumpulkan dan diproses oleh Salam Bumi Property sesuai{' '}
            <Link to="/privacy" className="text-[#1565C0] hover:underline">Kebijakan Privasi</Link> yang berlaku.
          </span>
        </label>
        <FieldErr msg={errors.consent} />

        {/* API Error */}
        {apiError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{apiError}</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold border border-gray-200 text-gray-600 hover:border-[#1565C0] transition-colors disabled:opacity-50">
          ← Kembali
        </button>
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${isValid && !loading ? 'hover:brightness-110' : 'opacity-60 cursor-not-allowed'}`}
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</>
          ) : '📄 Kirim Properti →'}
        </button>
      </div>
    </div>
  );
}

// ─── Success Page ─────────────────────────────────────────────────────────────

function SuccessPage({ result }: { result: ApiResult }) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">✅</div>
      <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Properti Berhasil Terkirim!</h2>
      <p className="text-[#64748B] leading-relaxed mb-2">
        Terima kasih! Tim Salam Bumi Property telah menerima data properti Anda dengan Kode Listing:
      </p>
      <div className="inline-block px-6 py-3 bg-[#E3F2FD] rounded-xl mb-4">
        <span className="font-mono font-bold text-[#1565C0] text-lg">{result.kode_listing}</span>
      </div>
      {typeof result.photos_uploaded === 'number' && typeof result.photos_total_sent === 'number' && result.photos_uploaded < result.photos_total_sent && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            {result.photos_uploaded} dari {result.photos_total_sent} foto berhasil tersimpan. Jika Anda butuh foto lengkap tersimpan, silakan hubungi admin kami via WhatsApp setelah menerima konfirmasi.
          </p>
        </div>
      )}
      <p className="text-[#64748B] text-sm mb-6">
        Kami akan menghubungi Anda via WhatsApp dalam <strong>1×24 jam</strong> untuk proses selanjutnya.
      </p>
      <p className="text-xs text-gray-500 mb-8 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
        Belum ada yang tampil di website — properti baru tayang setelah Anda menandatangani perjanjian via link yang kami kirimkan.
      </p>
      <Link to="/" className="inline-block px-6 py-3 rounded-xl font-semibold border border-[#1565C0] text-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
        ← Kembali ke Beranda
      </Link>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TitipJualPage() {
  const [step, setStep]         = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1State | null>(null);
  const [result, setResult]     = useState<ApiResult | null>(null);

  const handleStep1 = (data: Step1State) => { setStep1Data(data); setStep(2); };
  const handleSuccess = (r: ApiResult) => setResult(r);

  if (result) {
    return (
      <div className="pt-16 min-h-screen" style={{ background: '#F0F4F8' }}>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
            <SuccessPage result={result} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 min-h-screen" style={{ background: '#F0F4F8' }}>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Titip Jual Properti</h1>
          <p className="text-[#64748B] text-sm mt-1">Pasarkan properti Anda bersama tim SBP</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <Stepper step={step} />
          {step === 1 ? (
            <Step1 onNext={handleStep1} />
          ) : (
            <Step2 step1={step1Data!} onBack={() => setStep(1)} onSuccess={handleSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}
