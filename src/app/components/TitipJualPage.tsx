import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, Upload, X, AlertCircle } from 'lucide-react';
import { getLocations, bacaJson, type ApiLocation } from '../../lib/api';
import { PROPERTY_TYPES } from '../../lib/propertyTypes';
// Aturan tampil per jenis + opsi dropdown: SATU SUMBER bersama form admin
// (src/app/components/admin/AdminPropertyDetailPage.tsx). Sebelumnya form ini
// punya salinan sendiri (showLT/showKTKM/dst) yang sudah melenceng dari admin —
// lihat komentar di propertyFields.ts.
import {
  SHOW_LUAS_TANAH, SHOW_LUAS_BANGUNAN, SHOW_LEBAR_DEPAN, SHOW_LANTAI,
  SHOW_KT_KM, SHOW_FURNISHED, SHOW_SEWA_KAMAR, SHOW_INCOME, SHOW_HARGA_PER_M2,
  LEGALITAS_OPTIONS, FURNISHED_OPTS, JENIS_KOST_OPTS, JENIS_HOTEL_OPTS,
  LINGKUNGAN_OPTIONS, labelJenisHotel,
} from '../../lib/propertyFields';
// Konversi harga total ↔ per-m² untuk tanah. SATU SUMBER dengan endpoint admin
// (functions/_lib/hargaTanah.js) — jangan tulis rumus sendiri.
import { HARGA_MODE_TOTAL, HARGA_MODE_PER_M2 } from '../../../functions/_lib/hargaTanah.js';
import Turnstile, { type TurnstileHandle, type TurnstileStatus } from './Turnstile';
import { pageMeta } from '../../lib/pageMeta';
// Autosave isian ke localStorage. NIK dan foto sengaja TIDAK ikut disimpan —
// alasannya panjang dan penting, ada di titipJualDraft.ts.
import { bacaDraft, simpanDraft, hapusDraft } from '../../lib/titipJualDraft';

export const meta = () => pageMeta({
  title: 'Titip Jual Properti Yogyakarta | Salam Bumi Property',
  description: 'Jual rumah, kost, tanah, atau villa Anda di Yogyakarta lewat Salam Bumi Property — pemasaran profesional, perjanjian tertulis, tanpa biaya di muka.',
  path: '/titip-jual',
});

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
      // Downscale ke maks 1920px sisi terpanjang — foto kamera modern (20MP+)
      // tanpa downscale membuat total payload base64 bisa melebihi limit body
      // request Cloudflare dan memperlambat upload di Worker.
      const MAX_DIM = 1920;
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

/**
 * Apakah objek isian punya nilai yang berarti? Dipakai sebagai rem autosave:
 * tanpa ini, effect autosave menulis objek kosong ~800 ms setelah halaman
 * dibuka, sehingga bacaDraft() selalu mengembalikan sesuatu dan banner
 * "isian dipulihkan" muncul pada pengunjung yang belum mengetik apa pun.
 */
function adaIsi(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(v =>
    typeof v === 'string' ? v.trim() !== '' : typeof v === 'number' ? true : v === true);
}

/**
 * Kunci error Step 2 menurut URUTAN TAMPILNYA di layar — perhatikan `jenis`
 * ada SETELAH `harga`, mengikuti tata letak sebenarnya, bukan urutan
 * pemeriksaan di handleSubmit.
 */
const URUTAN_FIELD_STEP2 = [
  'harga', 'harga_sewa_tahun', 'jenis', 'gmaps_link', 'legalitas',
  'photos', 'consent', 'turnstile',
];

/**
 * Gulir ke field bermasalah pertama. Memakai id DOM, bukan ref per-field:
 * titik error tersebar di ±600 baris JSX dan menambahkan delapan ref semata-mata
 * untuk menggulir jauh lebih berisik daripada satu id di tiap pembungkus.
 */
function fokuskanErrorPertama(errs: Record<string, string>): void {
  const kunci = URUTAN_FIELD_STEP2.find(k => errs[k]);
  if (!kunci) return;
  document.getElementById(`f-${kunci}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

/**
 * Catat calon penjual ke CRM begitu Step 1 valid — tanpa menunggu Step 2 selesai.
 *
 * Sengaja TIDAK di-await oleh pemanggil: kegagalan mencatat prospek tidak boleh
 * menahan user satu milidetik pun, dan `keepalive` membuat request tetap
 * terkirim walau tab langsung ditutup setelah klik "Lanjut".
 *
 * ⚠️ NIK sengaja tidak ikut. Tabel `leads` tidak terenkripsi — lihat alasan
 * lengkapnya di functions/api/titip-jual-prospek.js.
 */
async function kirimProspek(form: Step1State): Promise<void> {
  try {
    const res = await fetch('/api/titip-jual-prospek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        nama:      form.nama_ktp,
        no_wa:     form.no_wa,
        kecamatan: form.kecamatan,
        kabupaten: form.kab_owner,
        lead_id:   bacaDraft()?.leadId,
      }),
    });
    const json = await bacaJson<{ lead_id: number | null }>(res);
    const id = json.data?.lead_id;
    // Simpan id-nya supaya klik "Lanjut" berikutnya memperbarui baris yang sama,
    // bukan menumpuk prospek duplikat di papan CRM.
    if (typeof id === 'number') simpanDraft({ leadId: id });
  } catch {
    /* diam: prospek adalah jaring pengaman, bukan jalur utama */
  }
}

function Step1({ onNext }: { onNext: (data: Step1State) => void }) {
  const [form, setForm] = useState<Step1State>({
    nama_ktp: '', nik: '', rt_rw: '',
    kelurahan: '', kecamatan: '', prov_owner: '', kab_owner: '', bertindak: '',
    ahli_waris_jumlah: '', ahli_waris_sepakat: false, ahli_waris_kuasa: false, ahli_waris_turun: false,
    no_wa: '', no_wa_2: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pulihkan draft. WAJIB di useEffect, bukan initializer useState: halaman ini
  // publik dan ikut dirender di server, sedangkan localStorage hanya ada di
  // client — membacanya saat render = hydration mismatch (aturan CLAUDE.md).
  // `nik: ''` ditulis eksplisit: NIK memang tidak pernah disimpan, dan penegasan
  // ini menutup draft lama dari build yang barangkali sempat menyimpannya.
  useEffect(() => {
    const d = bacaDraft();
    if (d?.s1) setForm(p => ({ ...p, ...(d.s1 as Partial<Step1State>), nik: '' }));
  }, []);

  // Autosave (debounce 800 ms). Efek ini juga jalan saat mount dengan form
  // kosong, tapi timernya dibatalkan oleh cleanup begitu efek pemulihan di atas
  // memicu render ulang — jadi draft yang sudah ada tidak tertimpa kosong.
  useEffect(() => {
    const t = setTimeout(() => {
      const { nik: _nik, ...tanpaNik } = form;
      if (adaIsi(tanpaNik)) simpanDraft({ s1: tanpaNik });
    }, 800);
    return () => clearTimeout(t);
  }, [form]);

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
    // Tanpa await — Step 2 harus tampil seketika.
    void kirimProspek(form);
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

// Key error milik Step 1 — tidak punya field terikat di Step 2, jadi kalau
// backend menolak salah satunya, setErrors() saja membuat pesannya HILANG dan
// user cuma melihat kalimat generik tanpa satu pun kolom disorot. Persis inilah
// yang membuat regresi 422 `nama_pemilik` (f7bc909, 18 Jul 2026) tidak
// terdiagnosa selama ±3 minggu. Key di sini ditampilkan apa adanya di banner.
const STEP1_ERROR_KEYS = new Set([
  'nama_pemilik', 'nama_ktp', 'nik', 'alamat_ktp', 'rt_rw',
  'kelurahan', 'kecamatan', 'bertindak_sebagai', 'no_wa', 'no_wa_2',
]);

// ⚠️ Fungsi show*() lokal DIHAPUS — aturannya sudah melenceng dari form admin
// (Lantai muncul untuk gudang/komersial, KT/KM untuk ruko/komersial, sedangkan
// Kelengkapan Furnitur justru TIDAK muncul untuk kost). Sekarang seluruhnya
// memakai Set bersama dari lib/propertyFields.ts — jangan bikin salinan lagi.

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
  // kelId ada supaya dropdown Kelurahan bisa jadi controlled seperti tiga
  // saudaranya — tanpa ini, isian yang dipulihkan dari draft tersimpan benar di
  // state tapi dropdown-nya tetap menampilkan "-- Pilih Kelurahan --".
  const [kelId, setKelId]   = useState<number | null>(null);
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
  // Mode harga tanah: owner mengetik total ATAU per-m². Konversi ke total
  // dilakukan backend lewat normalisasiHarga() — kolom `harga` di D1 WAJIB
  // selalu total rupiah (lihat kontrak di functions/_lib/hargaTanah.js).
  const [hargaMode, setHargaMode] = useState<string>(HARGA_MODE_TOTAL);
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
  const [jenisHotel, setJenisHotel] = useState('');
  const [noUnit, setNoUnit]         = useState('');
  const [kelengkapan, setKelengkapan] = useState('');
  const [incomePerBulan, setIncomePerBulan]         = useState('');
  const [pengeluaranPerBulan, setPengeluaranPerBulan] = useState('');
  const [sewaKamarBulan, setSewaBulan]               = useState('');

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFiles, setPhotoFiles]     = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  // Berapa foto yang ada di sesi sebelumnya. File-nya sendiri tidak bisa ikut
  // disimpan di draft, jadi satu-satunya hal jujur yang bisa dilakukan adalah
  // memberi tahu user berapa yang perlu dipilih ulang.
  const [fotoPerluUlang, setFotoPerluUlang] = useState(0);

  // Consent + submission
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('memuat');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  // ─── Autosave & pemulihan draft Step 2 ──────────────────────────────────────
  // Satu snapshot datar berisi seluruh field yang layak dipulihkan. FOTO tidak
  // ikut — 20 foto base64 (8–11 MB) melewati kuota localStorage dan melempar
  // QuotaExceededError yang menggagalkan SELURUH autosave, bukan cuma fotonya.
  // Yang disimpan hanya jumlahnya, supaya UI bisa memberi tahu berapa yang
  // perlu dipilih ulang. Selengkapnya di lib/titipJualDraft.ts.
  const snapshotS2 = {
    provId, kabId, kecId, kelId, provinsi, kabupaten, kecProp, kelProp,
    judul, jenis, tujuan, harga, hargaSewa, hargaMode, kondisi, alamat,
    lt, lb, kt, km, lebar_depan, lantai, lebar_jalan,
    legalitas, statusLeg, bankAgunan, outstanding, lingkungan, gmaps,
    infoTambahan, alasanJual, jenisKost, jenisHotel, noUnit, kelengkapan,
    incomePerBulan, pengeluaranPerBulan, sewaKamarBulan,
  };

  useEffect(() => {
    const d = bacaDraft();
    const s = (d?.s2 ?? {}) as Partial<typeof snapshotS2>;
    const str = (v: unknown, set: (x: string) => void) => { if (typeof v === 'string' && v) set(v); };
    const num = (v: unknown, set: (x: number | null) => void) => { if (typeof v === 'number') set(v); };

    num(s.provId, setProvId); num(s.kabId, setKabId); num(s.kecId, setKecId); num(s.kelId, setKelId);
    str(s.provinsi, setProvinsi); str(s.kabupaten, setKabupaten); str(s.kecProp, setKecProp); str(s.kelProp, setKelProp);
    str(s.judul, setJudul); str(s.jenis, setJenis); str(s.tujuan, setTujuan);
    str(s.harga, setHarga); str(s.hargaSewa, setHargaSewa); str(s.hargaMode, setHargaMode);
    str(s.alamat, setAlamat); str(s.lt, setLt); str(s.lb, setLb); str(s.kt, setKt); str(s.km, setKm);
    str(s.lebar_depan, setLebarDepan); str(s.lantai, setLantai); str(s.lebar_jalan, setLebarJalan);
    str(s.legalitas, setLegalitas); str(s.bankAgunan, setBankAgunan); str(s.outstanding, setOutstanding);
    str(s.lingkungan, setLingkungan); str(s.gmaps, setGmaps);
    str(s.infoTambahan, setInfoTambahan); str(s.alasanJual, setAlasanJual);
    str(s.jenisKost, setJenisKost); str(s.jenisHotel, setJenisHotel); str(s.noUnit, setNoUnit);
    str(s.kelengkapan, setKelengkapan);
    str(s.incomePerBulan, setIncomePerBulan); str(s.pengeluaranPerBulan, setPengeluaranPerBulan);
    str(s.sewaKamarBulan, setSewaBulan);
    if (s.kondisi === 'nego' || s.kondisi === 'nett') setKondisi(s.kondisi);
    if (s.statusLeg === 'on_hand' || s.statusLeg === 'on_bank') setStatusLeg(s.statusLeg);

    if (d?.jumlahFoto) setFotoPerluUlang(d.jumlahFoto);
    // Sekali saat mount saja — snapshotS2 sengaja tidak jadi dependensi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `tujuan`, `hargaMode`, dan `kondisi` SELALU berisi nilai default, jadi tidak
  // boleh ikut menentukan "sudah ada isian" — kalau ikut, autosave menulis draft
  // pada setiap pengunjung yang cuma membuka halaman, dan banner pemulihan
  // muncul tanpa sebab di kunjungan berikutnya.
  const s2Json = JSON.stringify(snapshotS2);
  const adaIsiS2 = adaIsi({ ...snapshotS2, tujuan: '', hargaMode: '', kondisi: '' });
  const jumlahFoto = photoPreviews.length;
  useEffect(() => {
    if (!adaIsiS2 && jumlahFoto === 0) return;
    const t = setTimeout(() => {
      try { simpanDraft({ s2: JSON.parse(s2Json) as Record<string, unknown>, jumlahFoto }); }
      catch { /* snapshot tak terbaca — autosave memang best-effort */ }
    }, 800);
    return () => clearTimeout(t);
  }, [s2Json, adaIsiS2, jumlahFoto]);

  // Load all provinces
  useEffect(() => {
    setLocLoading(true);
    getLocations().then(res => {
      if (res.success && res.data) setProvList(res.data.items);
    }).catch(() => {}).finally(() => setLocLoading(false));
  }, []);

  // Load kabupaten saat provinsi dipilih
  useEffect(() => {
    if (!provId) { setKabList([]); setKecList([]); setKelList([]); setKabupaten(''); setKecProp(''); setKelProp(''); setKelId(null); return; }
    getLocations(provId).then(res => { if (res.success && res.data) setKabList(res.data.items); });
  }, [provId]);

  useEffect(() => {
    if (!kabId) { setKecList([]); setKelList([]); setKecProp(''); setKelProp(''); setKelId(null); return; }
    getLocations(kabId).then(res => { if (res.success && res.data) setKecList(res.data.items); });
  }, [kabId]);

  useEffect(() => {
    if (!kecId) { setKelList([]); setKelProp(''); setKelId(null); return; }
    getLocations(kecId).then(res => { if (res.success && res.data) setKelList(res.data.items); });
  }, [kecId]);

  const handleProvChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = provList.find(p => p.id === id)?.nama ?? '';
    setProvId(id); setProvinsi(nama); setKabId(null); setKabupaten(''); setKecId(null); setKecProp(''); setKelProp(''); setKelId(null);
  }, [provList]);

  const handleKabChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kabList.find(k => k.id === id)?.nama ?? '';
    setKabId(id); setKabupaten(nama); setKecId(null); setKecProp(''); setKelProp(''); setKelId(null);
    clearErr('kabupaten');
  }, [kabList]);

  const handleKecChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kecList.find(k => k.id === id)?.nama ?? '';
    setKecId(id); setKecProp(nama); setKelProp(''); setKelId(null); clearErr('kecamatan_prop');
  }, [kecList]);

  const handleKelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kelList.find(k => k.id === id)?.nama ?? '';
    setKelId(id); setKelProp(nama); clearErr('kelurahan_prop');
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

  // Mode per-m² hanya sah untuk tanah dijual; jenis lain dipaksa total oleh
  // modeHargaValid() di backend, tapi UI-nya juga tidak boleh menawarkannya.
  const modePerM2 = SHOW_HARGA_PER_M2.has(jenis) && hargaMode === HARGA_MODE_PER_M2 && tujuan !== 'disewa';
  const totalDariPerM2 = modePerM2 && harga && lt
    ? Math.round(parseFloat(harga) * parseFloat(lt))
    : null;

  // Build jenis-specific details object
  const buildDetails = () => {
    const d: Record<string, unknown> = {};
    if (jenis === 'kost' && jenisKost)   d.jenis_kost  = jenisKost;
    if (jenis === 'hotel' && jenisHotel) d.jenis_hotel = jenisHotel;
    // Backend memetakan details.kelengkapan → kolom `furnished`. Pakai Set
    // bersama supaya kost ikut terkirim (dulu hardcoded tanpa kost).
    if (SHOW_FURNISHED.has(jenis) && kelengkapan) d.kelengkapan = kelengkapan;
    if (jenis === 'apartment' && noUnit) d.no_unit = noUnit;
    return Object.keys(d).length > 0 ? d : undefined;
  };

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!jenis) e.jenis = 'Jenis properti wajib dipilih';
    if (!harga || parseInt(harga) <= 0) e.harga = 'Harga wajib diisi';
    // Cegah 422 dari normalisasiHarga(): mode per-m² mustahil dihitung tanpa
    // luas tanah, dan pesan servernya baru muncul setelah upload foto terkirim.
    else if (modePerM2 && (!lt || parseInt(lt) <= 0)) e.harga = 'Mode harga per m² membutuhkan Luas Tanah — isi Luas Tanah dulu atau ganti ke Harga Total';
    if (tujuan === 'dijual_disewa' && (!hargaSewa || parseInt(hargaSewa) <= 0)) e.harga_sewa_tahun = 'Harga sewa/tahun wajib diisi untuk opsi Dijual & Disewakan';
    if (!gmaps.trim()) e.gmaps_link = 'Link Google Maps wajib diisi';
    if (!legalitas) e.legalitas = 'Legalitas wajib dipilih';
    if (!photoPreviews.length) e.photos = 'Minimal 1 foto wajib diupload';
    if (!consent) e.consent = 'Persetujuan privasi wajib dicentang';
    // Token anti-bot: backend FAIL-CLOSED, jadi submit tanpa token pasti ditolak
    // 403 setelah user menunggu seluruh foto terunggah. Hentikan di sini, dengan
    // pesan yang menyebut tombol "Verifikasi ulang" — bukan "muat ulang halaman".
    if (!turnstileToken) {
      e.turnstile = turnstileStatus === 'gagal'
        ? 'Verifikasi anti-bot gagal dimuat. Klik "Verifikasi ulang" di bawah — bila tetap gagal, matikan penghemat data/pemblokir iklan lalu coba lagi.'
        : 'Verifikasi anti-bot belum selesai. Tunggu beberapa detik hingga bertanda ✓, lalu tekan Kirim lagi.';
    }
    if (Object.keys(e).length) {
      setErrors(e);
      // ⚠️ Dulu tombol Kirim di-disable saat form belum lengkap, sehingga
      // handleSubmit TIDAK PERNAH jalan dan seluruh pesan di atas mustahil
      // muncul. Form ini tingginya ±1000px: user yang lupa satu centang di
      // paling bawah hanya melihat tombol abu-abu diam = "upload gagal".
      // Sekarang tombolnya selalu bisa diklik dan halaman melompat ke masalahnya.
      setApiError('Ada isian yang belum lengkap — lihat kolom yang ditandai merah.');
      fokuskanErrorPertama(e);
      return;
    }

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
        // Mode per-m²: kolom `harga` diisi 0 dan backend menghitung totalnya
        // dari harga_per_m2 × luas_tanah lewat normalisasiHarga(). JANGAN kirim
        // angka per-meter ke `harga` — itu persis kesalahan yang dulu membuat
        // 39 listing tanah tampil seharga per-meternya.
        harga:             tujuan === 'disewa' ? undefined : (modePerM2 ? 0 : (parseInt(harga) || 0)),
        harga_mode:        tujuan === 'disewa' ? undefined : hargaMode,
        harga_per_m2:      modePerM2 ? (parseInt(harga) || undefined) : undefined,
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
        alasan_dijual:     alasanJual   || undefined,
        income_per_bulan:       incomePerBulan     ? parseInt(incomePerBulan)      : undefined,
        pengeluaran_per_bulan:  pengeluaranPerBulan ? parseInt(pengeluaranPerBulan) : undefined,
        harga_sewa_kamar_bulan: sewaKamarBulan     ? parseInt(sewaKamarBulan)      : undefined,
        details:           buildDetails(),
        photos:            photoPreviews,
        cf_turnstile_token: turnstileToken || undefined,
        // Supaya prospek yang dicatat di Step 1 ditandai selesai — kalau tidak,
        // admin akan mengejar orang yang sebenarnya sudah menyelesaikan formnya.
        prospek_lead_id:   bacaDraft()?.leadId,
      };

      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const res = await fetch('/api/titip-jual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await bacaJson<ApiResult>(res);

      if (!res.ok) {
        if (res.status === 422 && json.details) {
          setErrors(json.details);
          // Error milik Step 1 tidak punya kolom di layar ini — tanpa penanganan
          // khusus pesannya lenyap dan user tidak punya petunjuk sama sekali.
          const pesanStep1 = Object.entries(json.details)
            .filter(([k]) => STEP1_ERROR_KEYS.has(k))
            .map(([, v]) => v);
          setApiError(
            pesanStep1.length
              ? `Ada masalah pada Data Diri (Step 1): ${pesanStep1.join(', ')}. Klik "← Kembali" untuk memperbaikinya.`
              : 'Mohon periksa kembali isian form Anda.'
          );
          fokuskanErrorPertama(json.details);
        } else if (res.status === 403) {
          // Token anti-bot ditolak (paling sering: kedaluwarsa karena form ini
          // panjang — masa berlaku token hanya ±5 menit). Terbitkan token baru
          // otomatis dan minta user menekan Kirim sekali lagi. JANGAN menyuruh
          // muat ulang halaman: isian memang kini terselamatkan autosave, tapi
          // foto tetap hilang dan itu pekerjaan berat di HP.
          setTurnstileToken('');
          turnstileRef.current?.reset();
          setApiError('Verifikasi anti-bot kedaluwarsa. Kami sudah memperbaruinya — tunggu tanda ✓ hijau di bawah, lalu tekan Kirim sekali lagi. Isian Anda tetap aman.');
          fokuskanErrorPertama({ turnstile: 'x' });
        } else {
          setApiError(json.error ?? 'Terjadi kesalahan. Silakan coba lagi.');
        }
        return;
      }

      // Sudah tersimpan di server — draft lokal tidak lagi diperlukan dan
      // justru berbahaya kalau tertinggal (submit berikutnya akan dimulai
      // dengan isian properti lama).
      hapusDraft();
      onSuccess({ ...json.data!, photos_total_sent: photoPreviews.length });
    } catch {
      setApiError('Koneksi ke server gagal. Periksa koneksi internet Anda dan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

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

        {/* Harga — tanah boleh diketik per-m² (cara agen mengiklankan tanah),
            jenis lain selalu total. Padanan toggle yang sudah ada di form admin. */}
        <div id="f-harga">
          {SHOW_HARGA_PER_M2.has(jenis) && tujuan !== 'disewa' && (
            <div className="flex gap-2 mb-2">
              {[{ v: HARGA_MODE_TOTAL, l: 'Harga Total' }, { v: HARGA_MODE_PER_M2, l: 'Harga per m²' }].map(o => (
                <button key={o.v} onClick={() => { setHargaMode(o.v); clearErr('harga'); }} className={toggleBtnCls(hargaMode === o.v)}>{o.l}</button>
              ))}
            </div>
          )}
          <label className="block text-xs font-semibold text-[#64748B] mb-1">
            {tujuan === 'disewa'
              ? 'Harga Sewa/Tahun (Rp) *'
              : modePerM2 ? 'Harga per m² (Rp) *' : 'Harga Penawaran (Rp) *'}
          </label>
          <input value={harga} onChange={e => { setHarga(e.target.value); clearErr('harga'); }}
            type="number" placeholder={modePerM2 ? 'Contoh: 4900000' : 'Contoh: 850000000'} className={inputCls(errors.harga)} />
          {modePerM2 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {totalDariPerM2 != null
                ? `Total: Rp ${totalDariPerM2.toLocaleString('id-ID')} (${harga || 0}/m² × ${lt} m²)`
                : 'Isi Luas Tanah di bawah agar total harga bisa dihitung.'}
            </p>
          )}
          <FieldErr msg={errors.harga} />
        </div>

        {/* Harga Sewa/Tahun (kondisional — Dijual & Disewakan) */}
        {tujuan === 'dijual_disewa' && (
          <div id="f-harga_sewa_tahun">
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
        <div id="f-jenis">
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
              {JENIS_KOST_OPTS.map(v => (
                <button key={v} onClick={() => setJenisKost(v)} className={toggleBtnCls(jenisKost === v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Jenis Hotel (kondisional) — padanan Jenis Kost, sebelumnya hanya ada
            di form admin sehingga owner hotel tidak punya cara mengisinya. */}
        {jenis === 'hotel' && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Jenis Hotel</label>
            <select value={jenisHotel} onChange={e => setJenisHotel(e.target.value)} className={selectCls()}>
              <option value="">-- Pilih Jenis Hotel --</option>
              {JENIS_HOTEL_OPTS.map(v => <option key={v} value={v}>{labelJenisHotel(v)}</option>)}
            </select>
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

        {/* Kelengkapan Furnitur — kini termasuk KOST (inventori terbesar, 184
            listing). Sebelumnya kondisinya hardcoded tanpa kost, sehingga kolom
            `furnished` selalu kosong untuk kost dari jalur Titip Jual. */}
        {SHOW_FURNISHED.has(jenis) && (
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-2">Kelengkapan Furnitur</label>
            <div className="flex gap-2">
              {FURNISHED_OPTS.map(o => (
                <button key={o.value} onClick={() => setKelengkapan(o.value)} className={toggleBtnCls(kelengkapan === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Dimensi kondisional */}
        {jenis && (
          <div className="grid grid-cols-2 gap-3">
            {SHOW_LUAS_TANAH.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Tanah (m²)</label>
                <input type="number" value={lt} onChange={e => { setLt(e.target.value); clearErr('harga'); }} placeholder="m²" className={inputCls()} />
              </div>
            )}
            {SHOW_LUAS_BANGUNAN.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Bangunan (m²)</label>
                <input type="number" value={lb} onChange={e => setLb(e.target.value)} placeholder="m²" className={inputCls()} />
              </div>
            )}
            {SHOW_LEBAR_DEPAN.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Lebar Depan (m)</label>
                <input type="number" value={lebar_depan} onChange={e => setLebarDepan(e.target.value)} placeholder="m" className={inputCls()} />
              </div>
            )}
            {SHOW_LANTAI.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Jumlah Lantai</label>
                <input type="number" value={lantai} onChange={e => setLantai(e.target.value)} placeholder="1" className={inputCls()} />
              </div>
            )}
            {SHOW_KT_KM.has(jenis) && (
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

        {/* Income per bulan (kost/hotel/homestay/villa) */}
        {jenis && SHOW_INCOME.has(jenis) && (
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
            {/* Dulu dibatasi `jenis === 'kost'` saja, padahal admin memberikannya
                ke hotel/homestay/villa juga. */}
            {SHOW_SEWA_KAMAR.has(jenis) && (
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
              {/* Ketiga select di bawah WAJIB controlled (`value=`), bukan
                  `defaultValue=""`: isian yang dipulihkan dari draft tersimpan
                  benar di state, tapi dengan defaultValue dropdown-nya tetap
                  menampilkan "-- Pilih ... --" sehingga user mengira lokasinya
                  hilang lalu memilih ulang. */}
              <select onChange={handleKabChange} value={kabId ?? ''} className={selectCls()} disabled={!provId}>
                <option value="">-- Pilih Kabupaten --</option>
                {kabList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
              {kabId && (
                <select onChange={handleKecChange} value={kecId ?? ''} className={selectCls()}>
                  <option value="">-- Pilih Kecamatan --</option>
                  {kecList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              )}
              {/* Kelurahan/Desa — diaktifkan 2026-08-10. Komentar lama "TODO
                  aktifkan jika data kelurahan siap" sudah usang: D1 berisi
                  81.903 kelurahan (Kec. Depok DIY mengembalikan tepat 3:
                  Caturtunggal, Condongcatur, Maguwoharjo). Selama dimatikan,
                  kolom `kelurahan` SELALU lahir kosong dari jalur Titip Jual —
                  padahal dipakai meta_title SEO dan halaman programmatic
                  /kost-dijual-condongcatur. Pola disabled + peringatan amber
                  mengikuti form admin. */}
              {kecId && (
                <>
                  <select onChange={handleKelChange} value={kelId ?? ''} className={selectCls()}>
                    <option value="">-- Pilih Kelurahan/Desa --</option>
                    {kelList.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                  </select>
                  {kelList.length === 0 && (
                    <p className="text-xs text-amber-600">⚠️ Data kelurahan belum tersedia untuk kecamatan ini — boleh dilewati.</p>
                  )}
                </>
              )}
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
        <div id="f-gmaps_link">
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
        <div id="f-legalitas">
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
        <div id="f-photos">
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

          {/* Foto tidak ikut tersimpan di draft (terlalu besar untuk
              localStorage) — katakan terus terang alih-alih membiarkan user
              mengira fotonya masih ada. */}
          {fotoPerluUlang > 0 && photoPreviews.length === 0 && (
            <div className="flex items-start gap-2 p-3 mt-2 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Isian teks Anda berhasil dipulihkan, tetapi <strong>{fotoPerluUlang} foto</strong> perlu
                dipilih ulang — file foto terlalu besar untuk disimpan di perangkat.
              </p>
            </div>
          )}

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
        <label id="f-consent" className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${errors.consent ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-[#1565C0]'}`}>
          <input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); clearErr('consent'); }}
            className="mt-0.5 w-4 h-4 accent-[#1565C0] flex-shrink-0" />
          <span className="text-xs text-[#64748B] leading-relaxed">
            Saya menyetujui data pribadi saya dikumpulkan dan diproses oleh Salam Bumi Property sesuai{' '}
            <Link to="/privacy" className="text-[#1565C0] hover:underline">Kebijakan Privasi</Link> yang berlaku.
          </span>
        </label>
        <FieldErr msg={errors.consent} />

        {/* Anti-bot Turnstile — statusnya WAJIB terlihat. Backend fail-closed,
            jadi widget yang gagal dimuat berarti setiap submit ditolak 403.
            Sampai audit 12 Agu 2026 kondisi itu sama sekali tidak ditampilkan:
            user mengisi form, mengunggah 20 foto, lalu ditolak tanpa tahu
            sebabnya — dan pesan errornya menyuruh "muat ulang halaman" yang
            justru menghapus seluruh isiannya. */}
        <div id="f-turnstile" className="mt-1">
          <Turnstile
            ref={turnstileRef}
            onVerify={t => { setTurnstileToken(t); clearErr('turnstile'); }}
            onExpire={() => setTurnstileToken('')}
            onStatusChange={setTurnstileStatus}
          />
          <div className="flex items-center gap-2 mt-1.5">
            {turnstileToken ? (
              <span className="text-xs text-[#10B981] font-medium flex items-center gap-1">
                <Check size={13} /> Terverifikasi
              </span>
            ) : turnstileStatus === 'gagal' ? (
              <>
                <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                  <AlertCircle size={13} /> Verifikasi gagal dimuat
                </span>
                <button type="button" onClick={() => turnstileRef.current?.reset()}
                  className="text-xs font-semibold text-[#1565C0] hover:underline">
                  Verifikasi ulang
                </button>
              </>
            ) : (
              <span className="text-xs text-[#64748B]">Memverifikasi bahwa Anda bukan robot…</span>
            )}
          </div>
          <FieldErr msg={errors.turnstile} />
        </div>

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
        {/* ⚠️ JANGAN kembalikan `disabled={!isValid || loading}`. Selama tombol
            ini mati saat form belum lengkap, handleSubmit tidak pernah jalan,
            sehingga SELURUH pesan error per-field mustahil muncul untuk field
            yang justru memblokir. Form ini ±1000px: user yang melewatkan satu
            centang di paling bawah cuma melihat tombol abu-abu diam, dan itu
            dilaporkan sebagai "upload gagal". Biarkan diklik — handleSubmit yang
            menjelaskan apa yang kurang lalu menggulir ke sana. */}
        <button onClick={handleSubmit} disabled={loading}
          className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${loading ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110'}`}
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

  // Banner "isian dipulihkan". Dibaca di useEffect (bukan saat render) karena
  // halaman ini SSR — localStorage tidak ada di server dan membacanya saat
  // render menghasilkan hydration mismatch. Efek induk berjalan SETELAH efek
  // anak, tapi autosave anak di-debounce 800 ms sehingga pembacaan di sini
  // masih melihat draft lama, bukan tulisan barusan.
  const [adaDraftPulih, setAdaDraftPulih] = useState(false);
  useEffect(() => { setAdaDraftPulih(bacaDraft() !== null); }, []);

  const mulaiBaru = () => { hapusDraft(); window.location.reload(); };

  // Gulir ke atas tiap ganti step. Formulir ini panjang: tanpa ini user bisa
  // mendarat di tengah halaman dan mengira isiannya hilang — persis persepsi
  // yang sedang diperbaiki. Render pertama dilewati agar tidak mengganggu
  // pemuatan halaman (mis. saat masuk lewat anchor).
  const stepPertamaKali = useRef(true);
  useEffect(() => {
    if (stepPertamaKali.current) { stepPertamaKali.current = false; return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

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
        {adaDraftPulih && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-[#E3F2FD] border border-[#90CAF9] rounded-xl">
            <Check size={16} className="text-[#1565C0] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#0F172A] flex-1">
              Isian Anda sebelumnya sudah dipulihkan. Demi keamanan, <strong>NIK</strong> dan{' '}
              <strong>foto</strong> tidak ikut tersimpan — keduanya perlu diisi ulang.
            </p>
            <button onClick={mulaiBaru} className="text-xs font-semibold text-[#1565C0] hover:underline flex-shrink-0">
              Mulai baru
            </button>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <Stepper step={step} />
          {/* ⚠️ Kedua step SENGAJA tetap terpasang; yang tidak aktif hanya
              disembunyikan CSS. JANGAN kembalikan ke
              `{step === 1 ? <Step1/> : <Step2/>}` — mengganti tipe komponen
              membuat React MELEPAS yang lama sehingga seluruh isian terhapus,
              termasuk foto yang sudah dikonversi WebP (bisa 20 file, kerja
              berat di HP). Ditemukan 2026-08-10: klik "← Kembali" mengosongkan
              Step 1 DAN Step 2 sekaligus.
              Step 1 tidak perlu prop nilai awal — state internalnya bertahan
              sendiri justru karena tidak pernah dilepas. */}
          <div style={{ display: step === 1 ? undefined : 'none' }}>
            <Step1 onNext={handleStep1} />
          </div>
          {/* Step 2 WAJIB tetap lazy (baru dipasang setelah Step 1 selesai),
              dua alasan keras:
              1. Hidrasi SSR — Step 2 merender genDisplayKode() yang memanggil
                 `new Date()`. Selama ini aman HANYA karena Step 2 tak pernah
                 dirender di server; memasangnya sejak awal = hydration mismatch.
              2. Token Turnstile — widgetnya dirender saat mount dan tokennya
                 kedaluwarsa. Dipasang sejak halaman dibuka, token bisa basi
                 sebelum user sampai ke tombol Kirim.
              Sesudah terpasang ia TIDAK dilepas lagi, jadi isian Step 2 aman
              saat user bolak-balik. */}
          {step1Data !== null && (
            <div style={{ display: step === 2 ? undefined : 'none' }}>
              <Step2 step1={step1Data} onBack={() => setStep(1)} onSuccess={handleSuccess} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
