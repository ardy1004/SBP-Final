import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, Upload, X, AlertCircle } from 'lucide-react';
import { getLocations, bacaJson, type ApiLocation } from '../../lib/api';
import { trackEvent } from '../../lib/tracking';
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
import { bacaDraft, simpanDraft, hapusDraft, submitIdMasihSah } from '../../lib/titipJualDraft';
import { laporKendalaForm } from '../../lib/laporKendala';

export const meta = () => pageMeta({
  title: 'Titip Jual Properti Yogyakarta | Salam Bumi Property',
  description: 'Jual rumah, kost, tanah, atau villa Anda di Yogyakarta lewat Salam Bumi Property — pemasaran profesional, perjanjian tertulis, tanpa biaya di muka.',
  path: '/titip-jual',
});

// ─── Types ────────────────────────────────────────────────────────────────────
//
// 🔥 ALUR DIBALIK 2026-09-19: dulu Step1=Data Diri→Step2=Properti (submit sekali
// di akhir Step2). Sekarang StepProperti (termasuk No. WA) submit DULUAN ke
// /api/titip-jual-mulai — properti+owner ringan lahir nyata di DB walau user
// berhenti di situ. StepDataDiri (KYC, TANPA WA — sudah diisi di StepProperti)
// jadi OPSIONAL, submit belakangan ke /api/titip-jual-lengkapi memakai tiket
// JWT `tiket_lanjut` (BUKAN property_id mentah — lihat PLAN-TITIP-JUAL-PROPERTI-DULU.md
// §2.3 soal kenapa: property_id dari klien tidak tepercaya/IDOR).

interface DataDiriState {
  nama_ktp: string;
  nik: string;
  rt_rw: string;
  kelurahan: string;
  kecamatan: string;
  prov_owner: string;
  kab_owner: string;
  bertindak_sebagai: string;
  ahli_waris_jumlah: string;
  ahli_waris_sepakat: boolean;
  ahli_waris_kuasa: boolean;
  ahli_waris_turun: boolean;
}

interface Stage1Result {
  kode_listing: string;
  // Opsional: absen saat state ini direkonstruksi dari draft sesudah reload
  // (lihat efek pemulihan di TitipJualPage) — draft hanya menyimpan
  // kode_listing + tiket_lanjut, bukan ID mentah (lihat titipJualDraft.ts).
  // Tidak dipakai untuk apa pun di StepDataDiri, jadi aman kosong.
  property_id?: number;
  owner_id?: number;
  /** Tiket JWT (scope titipjual-lanjut) — satu-satunya kunci menuju Tahap 2. */
  tiket_lanjut: string;
  photos_uploaded?: number;
  photos_failed?: number;
  photos_total_sent?: number;
  photos_warning?: string | null;
  // Hanya ada pada respons 201 (submit BARU) — lihat catatan di ApiResult lama
  // soal kenapa field ini WAJIB dideklarasikan: kalau tidak, ia lenyap diam-diam
  // dan jalur idempoten tidak bisa dibedakan dari sukses baru.
  event_id?: string;
  duplikat?: boolean;
  pesan?: string;
}

interface Stage2Result {
  kode_perjanjian: string;
  kode_listing: string;
  property_id: number;
  owner_id: number;
  agreement_id: number;
  event_id?: string;
  duplikat?: boolean;
  pesan?: string;
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
 * POST JSON sambil melaporkan progres UNGGAHAN.
 *
 * fetch() tidak punya cara apa pun melaporkan progres upload — request body
 * berupa ReadableStream belum didukung lintas browser. Padahal payload di sini
 * memuat seluruh foto sebagai base64 (8–11 MB untuk 20 foto) dan di uplink
 * seluler bisa memakan 60–90 detik. Tanpa angka yang bergerak, user hanya
 * melihat spinner "Memproses…", menyimpulkan formnya menggantung, lalu menutup
 * tab — dan submit yang sebenarnya sedang berjalan ikut mati.
 * XMLHttpRequest satu-satunya jalan mendapat `upload.onprogress`.
 */
function postDenganProgres(
  url: string, body: string, onProgress: (pct: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload  = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error('jaringan'));
    xhr.send(body);
  });
}

/**
 * Ukuran biner sebenarnya dari sebuah data URL base64 — dipakai untuk menolak
 * payload kebesaran SEBELUM user menunggu satu setengah menit sia-sia.
 */
function ukuranBase64(dataUrl: string): number {
  return Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
}

/**
 * Unggah SATU foto ke R2 lewat /api/titip-jual-foto, kembalikan key-nya.
 *
 * KENAPA satu per satu. Sampai 8 Sep 2026 seluruh foto ikut di dalam body
 * /api/titip-jual — 8–11 MB sekali kirim, 60–90 detik di uplink seluler. Sekali
 * koneksi putus di tengah, `request.json()` di server gagal dan SELURUH form
 * hilang: data diri, harga, legalitas, semuanya. Tiga klien kehilangan submitnya
 * pada hari yang sama dan tidak satu pun meninggalkan jejak.
 *
 * Sekarang tiap foto request tersendiri (~1 MB): putus hanya merugikan satu foto,
 * dan foto itu bisa diulang tanpa menyentuh sisa formulir.
 *
 * `tiket` diterbitkan /api/titip-jual-tiket-foto saat StepProperti mount —
 * BUKAN token Turnstile. Token Turnstile sekali pakai; memakainya di sini akan
 * menghanguskan token yang dibutuhkan submit akhir beberapa detik kemudian.
 * titip-jual-foto.js sendiri TIDAK berubah — scope tiket (`titipjual-foto`) sama persis.
 */
async function unggahSatuFoto(dataUrl: string, tiket: string | undefined): Promise<string> {
  const res = await fetch('/api/titip-jual-foto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foto: dataUrl, tiket }),
  });
  const json = await bacaJson<{ key: string }>(res);
  if (!res.ok || !json.data?.key) {
    throw new Error(json.error ?? `Foto gagal diunggah (HTTP ${res.status})`);
  }
  return json.data.key;
}

/**
 * Minta tiket unggah foto begitu StepProperti mount — dipanggil sedini mungkin
 * karena foto sekarang diunggah progresif SEJAK Tahap 1 (dulu dipicu selesainya
 * Step 1 lewat kirimProspek(); prospek/leads sekarang dipensiunkan dari alur
 * baru — baris `properties` nyata di akhir Tahap 1 sudah jauh lebih kaya
 * informasi daripada baris `leads`). Tanpa Turnstile (token sekali pakai, lihat
 * unggahSatuFoto), gagal-diam (tiket adalah pendukung, bukan jalur utama).
 */
async function mintaTiketFoto(): Promise<void> {
  try {
    const res = await fetch('/api/titip-jual-tiket-foto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await bacaJson<{ tiket_foto: string | null }>(res);
    if (json.data?.tiket_foto) simpanDraft({ tiketFoto: json.data.tiket_foto });
  } catch {
    /* diam: tiket foto adalah pendukung, kegagalannya tidak boleh menghentikan pengisian form */
  }
}

/**
 * Kunci error StepProperti menurut URUTAN TAMPILNYA di layar.
 */
const URUTAN_FIELD_PROPERTI = [
  'no_wa', 'harga', 'harga_sewa_tahun', 'jenis', 'lokasi', 'gmaps_link', 'legalitas',
  'photos', 'consent', 'turnstile',
];

/**
 * Gulir ke field bermasalah pertama. Memakai id DOM, bukan ref per-field:
 * titik error tersebar di ±600 baris JSX dan menambahkan ref per-field semata-mata
 * untuk menggulir jauh lebih berisik daripada satu id di tiap pembungkus.
 */
function fokuskanErrorPertama(errs: Record<string, string>, urutan: string[] = URUTAN_FIELD_PROPERTI): void {
  const kunci = urutan.find(k => errs[k]);
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
      {[{ num: 1, label: 'Info Properti' }, { num: 2, label: 'Data Diri' }].map((s, i) => (
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

// ─── STEP 1: Info Properti (dulu "Step2") ─────────────────────────────────────

const JENIS_OPTIONS = PROPERTY_TYPES.map(t => ({ value: t.value, label: t.label }));

// Preview kode listing (display only; server assigns actual sequence).
// ⚠️ `new Date()` — HANYA boleh dipanggil setelah mount client (lihat guard
// `siapTampilKode` di StepProperti). StepProperti sekarang komponen PERTAMA yang
// dirender (ikut SSR), beda dari dulu ketika genDisplayKode() ada di Step2 yang
// tidak pernah dirender server. Memanggilnya tanpa guard = hydration mismatch
// (aturan CLAUDE.md).
function genDisplayKode() {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `SBP-${ds}-???`;
}

interface StepPropertiProps {
  onSuccess: (result: Stage1Result) => void;
}

function StepProperti({ onSuccess }: StepPropertiProps) {
  // Tiket foto — diminta begitu komponen ini mount (lihat mintaTiketFoto()).
  useEffect(() => { void mintaTiketFoto(); }, []);

  // Guard hydration untuk genDisplayKode() — lihat komentar di atas fungsinya.
  const [siapTampilKode, setSiapTampilKode] = useState(false);
  useEffect(() => { setSiapTampilKode(true); }, []);

  // No. WA — DIPINDAH ke sini dari komponen Data Diri (2026-09-19): properti
  // yang lahir di akhir langkah ini harus sudah punya nomor kontak yang bisa
  // dihubungi admin, walau user tidak pernah lanjut ke Data Diri.
  const [noWa, setNoWa]   = useState('');
  const [noWa2, setNoWa2] = useState('');

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
  const [uploadPct, setUploadPct] = useState(0);
  // dataUrl → key R2. Dipakai supaya percobaan ulang submit tidak mengunggah
  // ulang foto yang sudah berhasil. Sengaja `useRef`: isinya tidak memengaruhi
  // tampilan, dan menyimpannya di state akan memicu render ulang di tengah
  // perulangan unggah.
  const keyFotoRef = useRef<Map<string, string>>(new Map());
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  // ─── Autosave & pemulihan draft ──────────────────────────────────────────
  // Satu snapshot datar berisi seluruh field yang layak dipulihkan (termasuk
  // No. WA sekarang). FOTO tidak ikut — 20 foto base64 (8–11 MB) melewati kuota
  // localStorage dan melempar QuotaExceededError yang menggagalkan SELURUH
  // autosave, bukan cuma fotonya. Yang disimpan hanya jumlahnya, supaya UI bisa
  // memberi tahu berapa yang perlu dipilih ulang. Selengkapnya di titipJualDraft.ts.
  const snapshot = {
    noWa, noWa2,
    provId, kabId, kecId, kelId, provinsi, kabupaten, kecProp, kelProp,
    judul, jenis, tujuan, harga, hargaSewa, hargaMode, kondisi, alamat,
    lt, lb, kt, km, lebar_depan, lantai, lebar_jalan,
    legalitas, statusLeg, bankAgunan, outstanding, lingkungan, gmaps,
    infoTambahan, alasanJual, jenisKost, jenisHotel, noUnit, kelengkapan,
    incomePerBulan, pengeluaranPerBulan, sewaKamarBulan,
  };

  useEffect(() => {
    const d = bacaDraft();
    const s = (d?.s2 ?? {}) as Partial<typeof snapshot>;
    const str = (v: unknown, set: (x: string) => void) => { if (typeof v === 'string' && v) set(v); };
    const num = (v: unknown, set: (x: number | null) => void) => { if (typeof v === 'number') set(v); };

    str(s.noWa, setNoWa); str(s.noWa2, setNoWa2);
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
    // Sekali saat mount saja — snapshot sengaja tidak jadi dependensi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `tujuan`, `hargaMode`, dan `kondisi` SELALU berisi nilai default, jadi tidak
  // boleh ikut menentukan "sudah ada isian" — kalau ikut, autosave menulis draft
  // pada setiap pengunjung yang cuma membuka halaman, dan banner pemulihan
  // muncul tanpa sebab di kunjungan berikutnya.
  const snapshotJson = JSON.stringify(snapshot);
  const adaIsiSnapshot = adaIsi({ ...snapshot, tujuan: '', hargaMode: '', kondisi: '' });
  const jumlahFoto = photoPreviews.length;
  useEffect(() => {
    if (!adaIsiSnapshot && jumlahFoto === 0) return;
    const t = setTimeout(() => {
      try { simpanDraft({ s2: JSON.parse(snapshotJson) as Record<string, unknown>, jumlahFoto }); }
      catch { /* snapshot tak terbaca — autosave memang best-effort */ }
    }, 800);
    return () => clearTimeout(t);
  }, [snapshotJson, adaIsiSnapshot, jumlahFoto]);

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
    clearErr('lokasi');
  }, [provList]);

  const handleKabChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kabList.find(k => k.id === id)?.nama ?? '';
    setKabId(id); setKabupaten(nama); setKecId(null); setKecProp(''); setKelProp(''); setKelId(null);
    clearErr('kabupaten'); clearErr('lokasi');
  }, [kabList]);

  const handleKecChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10) || null;
    const nama = kecList.find(k => k.id === id)?.nama ?? '';
    setKecId(id); setKecProp(nama); setKelProp(''); setKelId(null); clearErr('kecamatan_prop'); clearErr('lokasi');
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
    if (!noWa) { e.no_wa = 'Nomor WhatsApp wajib diisi'; }
    else if (!/^(0|62|8)\d{8,12}$/.test(noWa.replace(/\D/g, ''))) e.no_wa = 'Nomor WhatsApp tidak valid';
    if (noWa2 && !/^(0|62|8)\d{8,12}$/.test(noWa2.replace(/\D/g, ''))) e.no_wa_2 = 'Nomor WA kedua tidak valid';
    if (!jenis) e.jenis = 'Jenis properti wajib dipilih';
    if (!harga || parseInt(harga) <= 0) e.harga = 'Harga wajib diisi';
    // Cegah 422 dari normalisasiHarga(): mode per-m² mustahil dihitung tanpa
    // luas tanah, dan pesan servernya baru muncul setelah upload foto terkirim.
    else if (modePerM2 && (!lt || parseInt(lt) <= 0)) e.harga = 'Mode harga per m² membutuhkan Luas Tanah — isi Luas Tanah dulu atau ganti ke Harga Total';
    if (tujuan === 'dijual_disewa' && (!hargaSewa || parseInt(hargaSewa) <= 0)) e.harga_sewa_tahun = 'Harga sewa/tahun wajib diisi untuk opsi Dijual & Disewakan';
    if (!gmaps.trim()) e.gmaps_link = 'Link Google Maps wajib diisi';
    // Lokasi properti dulu sepenuhnya opsional, sehingga listing bisa lahir
    // tanpa lokasi sama sekali — dan judul serta meta SEO-nya lalu jatuh ke
    // alamat KTP pemilik (lihat komentar di functions/api/titip-jual.js).
    // Kelurahan tetap opsional: tidak semua kecamatan punya datanya di D1.
    if (!provinsi || !kabupaten || !kecProp) {
      e.lokasi = 'Provinsi, Kabupaten/Kota, dan Kecamatan properti wajib dipilih';
    }
    if (!legalitas) e.legalitas = 'Legalitas wajib dipilih';
    if (!photoPreviews.length) e.photos = 'Minimal 1 foto wajib diupload';
    else {
      // Batas server 40 MB. Ditolak DI SINI supaya user tahu sekarang, bukan
      // setelah menunggu unggahan 8–11 MB selesai lalu kena 422.
      const totalMB = photoPreviews.reduce((n, p) => n + ukuranBase64(p), 0) / 1024 / 1024;
      if (totalMB > 35) {
        e.photos = `Total ukuran foto ${totalMB.toFixed(1)} MB, melebihi batas 35 MB. Kurangi jumlah foto atau pilih foto beresolusi lebih rendah.`;
      }
    }
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
      // Dilaporkan HANYA bila yang menahan adalah Turnstile — itu kendala SISTEM
      // kita, dan sampai 10 Sep 2026 ia menghentikan submit tanpa jejak di mana
      // pun. Isian yang kurang (harga, foto, centang) SENGAJA tidak dilaporkan:
      // itu perilaku normal sepanjang hari dan akan menenggelamkan yang penting.
      if (e.turnstile) {
        laporKendalaForm('titip-jual', 'turnstile-menahan', {
          status: turnstileStatus,
          field_lain: Object.keys(e).filter(k => k !== 'turnstile').length,
        });
      }
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
    setUploadPct(0);

    // Dipertahankan di draft supaya percobaan ulang memakai id yang sama —
    // tanpa itu idempotensinya tidak ada artinya.
    //
    // ⚠️ TAPI HANYA SELAMA MASIH SAH (2 jam). Dulu di sini `bacaDraft()?.submitId`
    // telanjang, dan karena `ts` draft diperbarui tiap autosave, id itu bisa
    // bertahan berhari-hari. Sekali ia berhasil membuat listing, pengisian
    // properti BERIKUTNYA dari perangkat yang sama dibalas jalur idempoten:
    // server mengembalikan listing LAMA, properti baru tidak pernah lahir, dan
    // layar tetap menampilkan "berhasil". Terjadi 8 Sep 2026 dan butuh audit
    // penuh untuk ketahuan, karena tidak ada satu pun error yang tercatat.
    const sah = submitIdMasihSah(bacaDraft());
    const submitId = sah ?? crypto.randomUUID();
    // `submitIdTs` hanya disetel saat id BARU dibuat — memperbaruinya di tiap
    // submit akan mengembalikan bug yang sama lewat pintu belakang.
    simpanDraft(sah ? { submitId } : { submitId, submitIdTs: Date.now() });

    // ─── Unggah foto DULU, satu per satu ────────────────────────────────────
    // Hasilnya di-cache per dataUrl, jadi percobaan ulang setelah kegagalan
    // hanya mengunggah foto yang memang belum berhasil — bukan mengulang
    // semuanya dari nol dan meninggalkan salinan yatim di R2.
    const tiketFoto = bacaDraft()?.tiketFoto;
    const photoKeys: string[] = [];
    for (let i = 0; i < photoPreviews.length; i++) {
      const dataUrl = photoPreviews[i];
      const tersimpan = keyFotoRef.current.get(dataUrl);
      if (tersimpan) { photoKeys.push(tersimpan); continue; }

      setUploadPct(Math.round((i / photoPreviews.length) * 90));
      let gagal: unknown = null;
      for (let coba = 0; coba < 2; coba++) {
        try {
          const key = await unggahSatuFoto(dataUrl, tiketFoto);
          keyFotoRef.current.set(dataUrl, key);
          photoKeys.push(key);
          gagal = null;
          break;
        } catch (err) { gagal = err; }
      }
      if (gagal) {
        setLoading(false);
        setUploadPct(0);
        setApiError(
          `Foto ke-${i + 1} gagal diunggah. Isian Anda TIDAK hilang — periksa koneksi lalu tekan "Kirim" lagi; foto yang sudah berhasil tidak akan diunggah ulang.`,
        );
        return;
      }
    }
    setUploadPct(90);

    try {
      const payload: Record<string, unknown> = {
        no_wa:  noWa,
        no_wa_2: noWa2 || undefined,
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
        // Bentuk BARU: hanya referensi, beberapa KB. Backend tetap menerima
        // `photos` base64 untuk pengunjung dengan bundle lama — jangan hapus
        // jalur itu di server.
        photo_keys:        photoKeys,
        gmaps_link:        gmaps || undefined,
        cf_turnstile_token: turnstileToken || undefined,
        // Kunci idempotensi: SAMA sepanjang sesi form ini, termasuk saat
        // mencoba ulang setelah gagal. Tanpa ini, submit yang datanya sudah
        // tersimpan tapi response-nya tidak sampai akan melahirkan listing
        // kedua saat user menekan Kirim lagi.
        submit_id:         submitId,
      };

      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const { status, text } = await postDenganProgres(
        '/api/titip-jual-mulai', JSON.stringify(payload), setUploadPct,
      );
      let json: { success?: boolean; data?: Stage1Result; error?: string; details?: Record<string, string> };
      try {
        json = JSON.parse(text);
      } catch {
        // Body bukan JSON (mis. halaman error HTML dari platform) — padanan
        // perilaku bacaJson(), jangan lempar SyntaxError mentah ke UI.
        json = { success: false, error: `Server mengembalikan respons tak terduga (HTTP ${status}).` };
      }
      const res = { ok: status >= 200 && status < 300, status };

      if (!res.ok) {
        if (res.status === 422 && json.details) {
          setErrors(json.details);
          setApiError('Mohon periksa kembali isian form Anda.');
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

      // Meta Pixel — pasangan browser dari CAPI Lead yang dikirim
      // titip-jual-mulai.js. eventID WAJIB sama supaya Meta mendeduplikasi;
      // tanpa itu satu konversi terhitung dua kali.
      //
      // Digantungkan pada ADANYA event_id, bukan pada kode status: respons
      // jalur idempoten (submit ulang) tidak memuatnya, jadi percobaan ulang
      // otomatis tidak menembakkan konversi kedua.
      if (json.data?.event_id) {
        // content_category HARUS 'titip_jual_prospek' — sama dengan yang dikirim
        // CAPI di titip-jual-mulai.js. 'titip_jual' dipakai khusus event
        // CompleteRegistration (Tahap 2 tuntas); memakainya di sini menyamakan
        // dua tahap corong yang berbeda (lihat skill meta-ads-tracking).
        trackEvent('Lead', { content_category: 'titip_jual_prospek' }, { eventID: json.data.event_id });
      }

      // ⚠️ Draft SENGAJA TIDAK dihapus di sini (beda dari alur lama) — Tahap 2
      // opsional masih mungkin dipakai, dan `tiket_lanjut` disimpan justru untuk
      // itu. hapusDraft() baru terjadi setelah Tahap 2 benar-benar tuntas, atau
      // saat user memilih "Mulai baru".
      simpanDraft({ tiketLanjut: json.data!.tiket_lanjut, kodeListingTahap1: json.data!.kode_listing });
      onSuccess({ ...json.data!, photos_total_sent: photoPreviews.length });
    } catch {
      // Draft SENGAJA tidak dihapus di sini — submit_id di dalamnya justru yang
      // membuat percobaan ulang aman dari duplikat.
      laporKendalaForm('titip-jual', 'jaringan-putus', {
        foto_terunggah: photoKeys.length,
        foto_total: photoPreviews.length,
      });
      setApiError('Koneksi ke server terputus saat mengirim. Tekan Kirim sekali lagi — bila data Anda ternyata sudah masuk, sistem mengenalinya dan tidak akan membuat listing ganda.');
    } finally {
      setLoading(false);
      setUploadPct(0);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Informasi Properti</h2>
      <p className="text-sm text-[#64748B] mb-2">Lengkapi data properti yang ingin Anda pasarkan.</p>

      {siapTampilKode && (
        <div className="flex items-center gap-2 mb-6 px-4 py-2 bg-[#F0F4F8] rounded-xl">
          <span className="text-xs text-[#64748B]">Kode Listing:</span>
          <span className="font-mono font-bold text-[#1565C0] text-sm">{genDisplayKode()}</span>
          <span className="text-xs text-gray-400">(ditetapkan saat submit)</span>
        </div>
      )}

      <div className="space-y-4">
        {/* No. WA — dipindah dari Data Diri: properti butuh kontak yang bisa
            dihubungi admin sejak lahir, walau user tidak lanjut ke Tahap 2. */}
        <div id="f-no_wa" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 1 *</label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={noWa} onChange={e => { setNoWa(e.target.value); clearErr('no_wa'); }}
                placeholder="81391278889" className={`${inputCls(errors.no_wa)} rounded-l-none`} />
            </div>
            <FieldErr msg={errors.no_wa} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 2 <span className="font-normal text-gray-400">(Opsional)</span></label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={noWa2} onChange={e => { setNoWa2(e.target.value); clearErr('no_wa_2'); }}
                placeholder="Opsional" className={`${inputCls(errors.no_wa_2)} rounded-l-none`} />
            </div>
            <FieldErr msg={errors.no_wa_2} />
          </div>
        </div>

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

        {/* Jenis Hotel (kondisional) — padanan Jenis Kost. */}
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

        {/* Kelengkapan Furnitur — termasuk KOST. Pakai Set bersama dari
            propertyFields.ts, jangan bikin salinan lagi. */}
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
        <div id="f-lokasi">
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Lokasi Properti *</label>
          {locLoading ? (
            <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
          ) : (
            <div className="space-y-2">
              <select onChange={handleProvChange} value={provId ?? ''} className={selectCls(errors.lokasi)}>
                <option value="">-- Pilih Provinsi --</option>
                {provList.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
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
          <FieldErr msg={errors.lokasi} />
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
            jadi widget yang gagal dimuat berarti setiap submit ditolak 403. */}
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

      <button onClick={handleSubmit} disabled={loading}
        className={`w-full mt-6 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${loading ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110'}`}
        style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {uploadPct > 0 && uploadPct < 100 ? `Mengunggah ${uploadPct}%…` : 'Menyimpan…'}
          </>
        ) : '📄 Kirim Properti →'}
      </button>
    </div>
  );
}

// ─── STEP 2: Data Diri (dulu "Step1", sekarang OPSIONAL & belakangan) ────────

const BERTINDAK_OPTIONS = [
  { value: 'pemilik_sertifikat', label: 'Pemilik A/n Sertifikat' },
  { value: 'suami_istri',        label: 'Suami/Istri (Bukan A/n Sertifikat)' },
  { value: 'ahli_waris',         label: 'Ahli Waris' },
  { value: 'lainnya',            label: 'Lainnya' },
];

interface StepDataDiriProps {
  /** Kode Listing dari Tahap 1 — ditampilkan sebagai pengingat kecil, BUKAN
   *  layar sukses penuh (lihat catatan 2026-09-19 di bawah kenapa dihapus). */
  kodeListing: string;
  /** true bila sebagian foto Tahap 1 gagal tersimpan — ditampilkan sebagai
   *  peringatan kecil, dulu bagian dari AntaraScreen yang sudah dihapus. */
  photosBelumLengkap?: boolean;
  /** Ganti "← Kembali" lama — tidak ada lagi form properti untuk dikembalikan
   *  (sudah tersimpan di Tahap 1), jadi ini keluar ke DitundaPage. */
  onNanti: () => void;
  onSuccess: (result: Stage2Result) => void;
}

function StepDataDiri({ kodeListing, photosBelumLengkap, onNanti, onSuccess }: StepDataDiriProps) {
  const [form, setForm] = useState<DataDiriState>({
    nama_ktp: '', nik: '', rt_rw: '',
    kelurahan: '', kecamatan: '', prov_owner: '', kab_owner: '', bertindak_sebagai: '',
    ahli_waris_jumlah: '', ahli_waris_sepakat: false, ahli_waris_kuasa: false, ahli_waris_turun: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  // Tiket kedaluwarsa/rusak = jalan buntu permanen untuk sesi ini (tidak ada
  // rute penerbitan tiket_lanjut baru tanpa admin) — layar tetap, bukan retry.
  const [tiketKedaluwarsa, setTiketKedaluwarsa] = useState(false);

  // Pulihkan draft. WAJIB di useEffect, bukan initializer useState: halaman ini
  // publik dan ikut dirender di server, sedangkan localStorage hanya ada di
  // client — membacanya saat render = hydration mismatch (aturan CLAUDE.md).
  useEffect(() => {
    const d = bacaDraft();
    if (d?.s1) setForm(p => ({ ...p, ...(d.s1 as Partial<DataDiriState>), nik: '' }));
  }, []);

  // Autosave (debounce 800 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      const { nik: _nik, ...tanpaNik } = form;
      if (adaIsi(tanpaNik)) simpanDraft({ s1: tanpaNik });
    }, 800);
    return () => clearTimeout(t);
  }, [form]);

  const f = (k: keyof DataDiriState, v: string | boolean) =>
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
    if (!form.bertindak_sebagai) e.bertindak_sebagai = 'Wajib dipilih';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    const tiketLanjut = bacaDraft()?.tiketLanjut;
    if (!tiketLanjut) {
      setTiketKedaluwarsa(true);
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      const payload = {
        tiket_lanjut: tiketLanjut,
        nama_ktp: form.nama_ktp,
        nik: form.nik,
        // alamat_ktp disusun dari field lokasi terstruktur (semua wajib) —
        // pola yang sama dengan alur lama.
        alamat_ktp: `Kel. ${form.kelurahan}, Kec. ${form.kecamatan}, ${form.kab_owner}, ${form.prov_owner} (RT/RW ${form.rt_rw})`,
        rt_rw: form.rt_rw,
        kelurahan_owner: form.kelurahan,
        kecamatan_owner: form.kecamatan,
        bertindak_sebagai: form.bertindak_sebagai,
        data_ahli_waris: form.bertindak_sebagai === 'ahli_waris' ? {
          jumlah_ahli_waris: parseInt(form.ahli_waris_jumlah) || 0,
          semua_sepakat:     form.ahli_waris_sepakat,
          kuasa_notaris:     form.ahli_waris_kuasa,
          turun_waris:       form.ahli_waris_turun,
        } : undefined,
      };

      const res = await fetch('/api/titip-jual-lengkapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await bacaJson<Stage2Result>(res);

      if (!res.ok) {
        if (res.status === 422 && json.details) {
          setErrors(json.details);
          setApiError('Mohon periksa kembali isian Data Diri Anda.');
        } else if (res.status === 403) {
          setTiketKedaluwarsa(true);
        } else {
          setApiError(json.error ?? 'Terjadi kesalahan. Silakan coba lagi.');
        }
        return;
      }

      // Meta Pixel — pasangan browser dari CAPI CompleteRegistration yang
      // dikirim titip-jual-lengkapi.js. Sama seperti Tahap 1: hanya menyala
      // saat event_id ada (jalur fresh), jalur idempoten tetap diam.
      if (json.data?.event_id) {
        trackEvent('CompleteRegistration', {
          content_ids: [json.data.kode_listing],
          content_category: 'titip_jual',
        }, { eventID: json.data.event_id });
      }

      // Sudah tersimpan di server — draft lokal tidak lagi diperlukan.
      hapusDraft();
      onSuccess(json.data!);
    } catch {
      laporKendalaForm('titip-jual', 'jaringan-putus');
      setApiError('Koneksi ke server terputus saat mengirim. Tekan Kirim sekali lagi — bila data Anda ternyata sudah masuk, sistem mengenalinya dan tidak akan membuat perjanjian ganda.');
    } finally {
      setLoading(false);
    }
  };

  if (tiketKedaluwarsa) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">⏳</div>
        <h2 className="font-display text-xl font-bold text-[#0F172A] mb-3">Sesi Kedaluwarsa</h2>
        <p className="text-[#64748B] leading-relaxed mb-6">
          Sesi kedaluwarsa — admin kami akan menghubungi Anda via WhatsApp untuk melanjutkan proses.
        </p>
        <Link to="/" className="inline-block px-6 py-3 rounded-xl font-semibold border border-[#1565C0] text-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
          ← Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Data Diri Pemilik</h2>
      <p className="text-sm text-[#64748B] mb-4">Isi sesuai KTP yang masih berlaku.</p>

      {/* Pengingat kecil, BUKAN layar sukses penuh — lihat catatan 2026-09-19:
          layar "Properti Anda Sudah Tercatat!" dengan tombol "Nanti Saja"
          dihapus karena membuat sebagian user mengira prosesnya sudah selesai
          padahal Data Diri di bawah ini masih wajib untuk proses perjanjian
          resmi. Kode Listing tetap ditampilkan di sini supaya tidak hilang. */}
      <div className="flex items-start gap-2 mb-4 p-3 bg-[#E3F2FD] border border-[#90CAF9] rounded-xl">
        <Check size={16} className="text-[#1565C0] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#0F172A]">
          Properti Anda sudah tercatat dengan Kode Listing{' '}
          <strong className="font-mono">{kodeListing}</strong>. Lengkapi data diri di bawah untuk
          melanjutkan proses perjanjian resmi.
        </p>
      </div>
      {photosBelumLengkap && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Sebagian foto properti belum sepenuhnya tersimpan — tim kami akan menghubungi Anda untuk melengkapinya.
          </p>
        </div>
      )}

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
          <FieldErr msg={errors.alamat_ktp} />
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
                form.bertindak_sebagai === o.value ? 'border-[#1565C0] bg-[#E3F2FD]' : 'border-gray-200 hover:border-[#1565C0]'
              }`}>
                <input type="radio" name="bertindak" value={o.value}
                  checked={form.bertindak_sebagai === o.value}
                  onChange={() => { f('bertindak_sebagai', o.value); clearErr('bertindak_sebagai'); }}
                  className="accent-[#1565C0]" />
                <span className="text-sm">{o.label}</span>
              </label>
            ))}
          </div>
          <FieldErr msg={errors.bertindak_sebagai} />
        </div>

        {/* Kondisional: Ahli Waris */}
        {form.bertindak_sebagai === 'ahli_waris' && (
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

        {/* API Error */}
        {apiError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{apiError}</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <button onClick={handleSubmit} disabled={loading}
          className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${loading ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110'}`}
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Menyimpan…
            </>
          ) : <>Kirim Data Diri <ChevronRight size={18} /></>}
        </button>
        {/* Sengaja diredupkan (bukan tombol setara "Kembali") — supaya "Kirim
            Data Diri" tetap satu-satunya aksi yang menonjol. Properti tetap
            aman tersimpan dari Tahap 1 walau ini diklik. */}
        <button onClick={onNanti} disabled={loading}
          className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
          Nanti saja, lengkapi belakangan
        </button>
      </div>
    </div>
  );
}

function DitundaPage({ kodeListing }: { kodeListing: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">👍</div>
      <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Baik, Sudah Kami Catat</h2>
      <p className="text-[#64748B] leading-relaxed mb-2">
        Properti Anda dengan Kode Listing <strong className="font-mono">{kodeListing}</strong> sudah aman di sistem kami.
      </p>
      <p className="text-[#64748B] text-sm mb-8">
        Tim Salam Bumi Property akan menghubungi Anda via WhatsApp dalam <strong>1×24 jam</strong> untuk melengkapi data diri dan proses selanjutnya.
      </p>
      <Link to="/" className="inline-block px-6 py-3 rounded-xl font-semibold border border-[#1565C0] text-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
        ← Kembali ke Beranda
      </Link>
    </div>
  );
}

// ─── Selesai: Tahap 2 tuntas ──────────────────────────────────────────────────

function SelesaiPage({ stage2 }: { stage2: Stage2Result }) {
  // 🔥 DUA JALUR, DUA TAMPILAN — jangan pernah disamakan lagi (lihat catatan
  // lama di alur ini soal kenapa: jalur idempoten TIDAK membuat baris baru).
  if (stage2.duplikat) {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">📋</div>
        <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Data Diri Ini Sudah Pernah Kami Terima</h2>
        <p className="text-[#64748B] leading-relaxed mb-2">
          {stage2.pesan ?? 'Data diri Anda sudah tercatat sebelumnya di sistem kami.'}
        </p>
        <p className="text-[#64748B] text-sm mb-3">Kode Perjanjian:</p>
        <div className="inline-block px-6 py-3 bg-[#FFF7ED] border border-amber-200 rounded-xl mb-6">
          <span className="font-mono font-bold text-amber-700 text-lg">{stage2.kode_perjanjian}</span>
        </div>
        <Link to="/" className="inline-block px-6 py-3 rounded-xl font-semibold border border-[#1565C0] text-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
          ← Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">✅</div>
      <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Data Diri Berhasil Dilengkapi!</h2>
      <p className="text-[#64748B] leading-relaxed mb-2">
        Terima kasih! Perjanjian Titip Jual Anda sudah kami buat dengan Kode:
      </p>
      <div className="inline-block px-6 py-3 bg-[#E3F2FD] rounded-xl mb-4">
        <span className="font-mono font-bold text-[#1565C0] text-lg">{stage2.kode_perjanjian}</span>
      </div>
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

type Layar = 'properti' | 'datadiri' | 'selesai' | 'ditunda';

export default function TitipJualPage() {
  const [layar, setLayar] = useState<Layar>('properti');
  const [stage1, setStage1] = useState<Stage1Result | null>(null);
  const [stage2, setStage2] = useState<Stage2Result | null>(null);

  // 🔥 2026-09-19: layar "Antara" (✅ "Properti Anda Sudah Tercatat!" dengan
  // pilihan "Lengkapi Sekarang"/"Nanti Saja") DIHAPUS setelah uji langsung —
  // sebagian user mengira prosesnya sudah selesai di situ dan tidak lanjut ke
  // Data Diri, padahal itu masih wajib untuk proses perjanjian resmi. Sekarang
  // Tahap 1 sukses langsung lanjut ke StepDataDiri; pengingat Kode Listing
  // dipindah jadi banner kecil di dalam StepDataDiri sendiri (lihat di atas).
  const handleStage1Success = (r: Stage1Result) => { setStage1(r); setLayar('datadiri'); };
  const handleStage2Success = (r: Stage2Result) => { setStage2(r); setLayar('selesai'); };

  // Banner "isian dipulihkan". Dibaca di useEffect (bukan saat render) karena
  // halaman ini SSR — localStorage tidak ada di server dan membacanya saat
  // render menghasilkan hydration mismatch.
  const [adaDraftPulih, setAdaDraftPulih] = useState(false);
  useEffect(() => {
    const d = bacaDraft();
    setAdaDraftPulih(d !== null);

    // Pulihkan langsung ke Data Diri bila Tahap 1 sudah pernah sukses tapi
    // user reload/tutup-tab sebelum sempat menyelesaikan Tahap 2. Tanpa ini,
    // `layar` selalu mulai dari 'properti' — user mendarat lagi di form
    // properti, padahal `tiketLanjut` masih sah 7 hari. `hapusDraft()` selalu
    // dipanggil begitu Tahap 2 benar-benar tuntas (StepDataDiri.handleSubmit),
    // jadi draft yang masih memuat tiketLanjut di sini berarti Tahap 2 memang
    // belum diselesaikan.
    if (d?.tiketLanjut && d?.kodeListingTahap1) {
      setStage1({ kode_listing: d.kodeListingTahap1, tiket_lanjut: d.tiketLanjut });
      setLayar('datadiri');
    }
  }, []);

  const mulaiBaru = () => { hapusDraft(); window.location.reload(); };

  // Gulir ke atas tiap ganti layar. Render pertama dilewati agar tidak
  // mengganggu pemuatan halaman (mis. saat masuk lewat anchor).
  const layarPertamaKali = useRef(true);
  useEffect(() => {
    if (layarPertamaKali.current) { layarPertamaKali.current = false; return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [layar]);

  const tampilkanStepper = layar === 'properti' || layar === 'datadiri';
  const stepAktif = layar === 'datadiri' ? 2 : 1;
  // 'selesai' hanya tercapai lewat StepDataDiri.onSuccess, jadi StepDataDiri
  // pasti sudah pernah dipasang begitu 'selesai' tercapai — dipakai untuk
  // menjaga StepDataDiri tetap terpasang (CSS-toggle, bukan unmount) begitu
  // pertama kali disentuh, persis alasan StepProperti selalu terpasang.
  const dataDiriSudahDipasang = layar === 'datadiri' || layar === 'selesai';

  return (
    <div className="pt-nav min-h-screen" style={{ background: '#F0F4F8' }}>
      <div className="max-w-2xl mx-auto px-4 py-12">
        {tampilkanStepper && (
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">Titip Jual Properti</h1>
            <p className="text-[#64748B] text-sm mt-1">Pasarkan properti Anda bersama tim SBP</p>
          </div>
        )}
        {tampilkanStepper && adaDraftPulih && (
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
          {tampilkanStepper && <Stepper step={stepAktif} />}

          {/* ⚠️ StepProperti SENGAJA tetap terpasang sepanjang sesi (CSS-toggle,
              bukan unmount) — mengganti tipe komponen membuat React MELEPAS yang
              lama sehingga seluruh isian terhapus, termasuk foto yang sudah
              dikonversi WebP. Ditemukan 2026-08-10 untuk pasangan step lama;
              aturannya tetap berlaku di sini. StepProperti ikut SSR (ini layar
              pertama), jadi ia selalu terpasang sejak render pertama. */}
          <div style={{ display: layar === 'properti' ? undefined : 'none' }}>
            <StepProperti onSuccess={handleStage1Success} />
          </div>

          {/* StepDataDiri baru dipasang setelah pertama dibutuhkan (tidak pernah
              ikut SSR — genDisplayKode tidak ada di sini jadi aman, tapi tetap
              dijaga lazy untuk konsistensi pola). Sesudah terpasang ia TIDAK
              dilepas lagi, jadi isian KYC aman kalau layar berpindah lagi. */}
          {dataDiriSudahDipasang && (
            <div style={{ display: layar === 'datadiri' ? undefined : 'none' }}>
              <StepDataDiri
                kodeListing={stage1?.kode_listing ?? ''}
                photosBelumLengkap={!!(stage1 && typeof stage1.photos_uploaded === 'number'
                  && typeof stage1.photos_total_sent === 'number'
                  && stage1.photos_uploaded < stage1.photos_total_sent)}
                onNanti={() => setLayar('ditunda')}
                onSuccess={handleStage2Success}
              />
            </div>
          )}
          {layar === 'selesai' && stage2 && <SelesaiPage stage2={stage2} />}
          {layar === 'ditunda' && stage1 && <DitundaPage kodeListing={stage1.kode_listing} />}
        </div>
      </div>
    </div>
  );
}
