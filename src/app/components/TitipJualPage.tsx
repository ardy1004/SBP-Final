import { useState, useEffect, useRef, useCallback, lazy, Suspense, type ComponentType } from 'react';
import { Link } from 'react-router';
import { Check, Upload, AlertCircle } from 'lucide-react';
import { getLocations, bacaJson, type ApiLocation } from '../../lib/api';
import { trackEvent } from '../../lib/tracking';
import { PROPERTY_TYPES } from '../../lib/propertyTypes';
import KartuFoto, { type FotoLokal } from './titipjual/KartuFoto';
// Hanya TIPE (terhapus saat kompilasi). Komponennya dimuat lewat import() dinamis
// di StepProperti — impor statis menyeret @dnd-kit ke bundle SSR eager.
import type { GridFotoSortableProps } from './titipjual/GridFotoSortable';
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
import { adaIsi, inputCls, FieldErr, type Stage2Result } from './titipjual/bersama';
// Tahap 2 dimuat malas — tidak pernah dirender saat SSR (lihat komentar di
// titipjual/StepDataDiri.tsx). JANGAN render tanpa guard dataDiriSudahDipasang.
const StepDataDiri = lazy(() => import('./titipjual/StepDataDiri'));
import {
  bacaDraft, simpanDraft, hapusDraft, submitIdMasihSah, bacaPayloadTiket, tiketMasihBerlaku,
  simpanTiketFoto, ambilTiketFoto, idAcak,
} from '../../lib/titipJualDraft';
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
      const selesai = (blob: Blob | null) => {
        // Lepas memori kanvas segera (1920px RGBA ≈ 15 MB) — di HP murah,
        // kanvas yang menumpuk membuat WebView crash dan SEMUA foto hilang.
        canvas.width = 0; canvas.height = 0;
        if (!blob) { reject(new Error('Konversi foto gagal')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      };
      canvas.toBlob(blob => {
        // ⚠️ Safari/WKWebView (iPhone) TIDAK punya encoder WebP: toBlob diam-diam
        // mengembalikan PNG (5–10× lebih besar, 9 foto di produksi). Ulangi
        // sebagai JPEG — didukung semua peramban dan tetap kecil.
        if (blob && blob.type !== 'image/webp') { canvas.toBlob(selesai, 'image/jpeg', 0.85); return; }
        selesai(blob);
      }, 'image/webp', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
    img.src = url;
  });
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
async function unggahSatuFoto(dataUrl: string, tiket: string | null): Promise<string> {
  const res = await fetch('/api/titip-jual-foto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foto: dataUrl, tiket }),
  });
  const json = await bacaJson<{ key: string }>(res);
  if (!res.ok || !json.data?.key) {
    // Status ikut dibawa: 403 = tiket basi (minta baru & ulangi), 422 = foto
    // ini sendiri ditolak (tak ada gunanya diulang), lainnya = jaringan/server.
    throw Object.assign(new Error(json.error ?? `Foto gagal diunggah (HTTP ${res.status})`), { status: res.status });
  }
  return json.data.key;
}

/**
 * Jalankan `fn` atas `items` dengan paling banyak `n` sekaligus. Dipakai
 * konversi foto: dulu 20 foto kamera didekode BERSAMAAN (±48 MB per foto) →
 * WebView HP murah crash, atau iOS mencapai batas memori kanvas sehingga
 * getContext() null dan user diberi tahu "format tidak didukung" secara keliru.
 */
async function petakTerbatas<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const hasil: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  const pekerja = async () => {
    while (i < items.length) {
      const k = i++;
      try { hasil[k] = { status: 'fulfilled', value: await fn(items[k]) }; }
      catch (reason) { hasil[k] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, pekerja));
  return hasil;
}

/**
 * Minta tiket unggah foto begitu StepProperti mount — dipanggil sedini mungkin
 * karena foto sekarang diunggah progresif SEJAK Tahap 1 (dulu dipicu selesainya
 * Step 1 lewat kirimProspek(); prospek/leads sekarang dipensiunkan dari alur
 * baru — baris `properties` nyata di akhir Tahap 1 sudah jauh lebih kaya
 * informasi daripada baris `leads`). Tanpa Turnstile (token sekali pakai, lihat
 * unggahSatuFoto), gagal-diam (tiket adalah pendukung, bukan jalur utama).
 */
async function mintaTiketFoto(): Promise<string | null> {
  try {
    const res = await fetch('/api/titip-jual-tiket-foto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await bacaJson<{ tiket_foto: string | null }>(res);
    if (json.data?.tiket_foto) { simpanTiketFoto(json.data.tiket_foto); return json.data.tiket_foto; }
  } catch {
    /* diam: tiket foto adalah pendukung, kegagalannya tidak boleh menghentikan pengisian form */
  }
  return null;
}

/**
 * Tiket foto yang MASIH berlaku ≥ 5 menit, diminta ulang bila perlu.
 * Dulu tiket hanya diminta SEKALI saat halaman dibuka: form yang diisi lebih
 * dari 1 jam, permintaan pertama yang gagal di jaringan buruk, atau rem yang
 * sedang menahan = setiap unggahan 403 selamanya, dengan pesan "periksa
 * koneksi" yang menyesatkan dan jalan keluar (muat ulang) yang menghapus foto.
 */
async function pastikanTiketFoto(): Promise<string | null> {
  const t = ambilTiketFoto();
  if (t && tiketMasihBerlaku(t, 300)) return t;
  return mintaTiketFoto();
}

/**
 * Kunci error StepProperti menurut URUTAN TAMPILNYA di layar.
 */
const URUTAN_FIELD_PROPERTI = [
  'no_wa', 'no_wa_2', 'harga', 'harga_sewa_tahun', 'jenis', 'luas', 'lokasi', 'gmaps_link', 'legalitas',
  'photos', 'consent', 'turnstile',
];

/**
 * Kunci galat 422 dari server → kunci yang PUNYA tempat tampil di form ini.
 * Dulu `jenis_properti`/`tujuan`/`kecamatan_prop` dll. dipasang apa adanya ke
 * state errors, padahal form memakai kunci lain (`jenis`, `lokasi`) — galatnya
 * tidak terlihat di mana pun, user hanya membaca "periksa kembali isian".
 * Kunci yang tetap tak dikenal dikembalikan terpisah untuk ditampilkan di kotak
 * galat umum, supaya tidak ada pesan server yang hilang.
 */
const PETA_GALAT_SERVER: Record<string, string> = {
  jenis_properti: 'jenis', tujuan: 'jenis', title: 'jenis',
  provinsi: 'lokasi', kabupaten: 'lokasi', kecamatan_prop: 'lokasi', kelurahan_prop: 'lokasi',
  luas_tanah: 'luas', luas_bangunan: 'luas', jumlah_kamar_tidur: 'luas', jumlah_kamar_mandi: 'luas',
  lebar_depan: 'luas', lantai: 'luas', lebar_jalan_m: 'gmaps_link',
};
function petakGalatServer(details: Record<string, string>): { errs: Record<string, string>; sisa: string[] } {
  const errs: Record<string, string> = {};
  const sisa: string[] = [];
  const dikenal = new Set(URUTAN_FIELD_PROPERTI);
  for (const [k, v] of Object.entries(details)) {
    const tujuanKunci = PETA_GALAT_SERVER[k] ?? k;
    if (dikenal.has(tujuanKunci)) errs[tujuanKunci] = errs[tujuanKunci] ? `${errs[tujuanKunci]} · ${v}` : v;
    else sisa.push(v);
  }
  return { errs, sisa };
}

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


/** Angka fisik (luas, kamar, lantai) tidak pernah negatif — buang tanda minus saat diketik. */
const tanpaMinus = (v: string) => v.replace(/-/g, '');

const toggleBtnCls = (active: boolean) =>
  `flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${active ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`;

const selectCls = (err?: string) =>
  `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] appearance-none ${err ? 'border-red-400 bg-red-50' : 'border-gray-200'}`;


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

// ID foto dari penghitung, BUKAN crypto.randomUUID() — tidak tersedia di WebView
// Android lama (in-app browser Meta, sumber mayoritas trafik form ini). Foto hanya
// lahir di klien, jadi tidak ada risiko ketidakcocokan SSR.
let seqFoto = 0;
const idFotoBaru = () => `f${++seqFoto}`;

function StepProperti({ onSuccess }: StepPropertiProps) {
  // Tiket foto — disiapkan begitu komponen ini mount, dan DIPERIKSA ULANG
  // sebelum unggah (pastikanTiketFoto) supaya tiket basi diganti otomatis.
  useEffect(() => { void pastikanTiketFoto(); }, []);

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
  // Satu array berisi {id, preview}. Dulu dua array sejajar (File[] + string[])
  // ber-key index — tak bisa diurutkan ulang dengan aman. File-nya sendiri tak
  // pernah dibaca lagi setelah jadi pratinjau (hanya .length), jadi dibuang.
  const [photos, setPhotos] = useState<FotoLokal[]>([]);
  // Titik BACA lama (loop submit, validasi, autosave, penghitung) sengaja tetap
  // memakai array pratinjau biasa — hanya titik TULIS yang berubah. Urutan array
  // ini = urutan yang dikirim = `urutan` di DB (foto pertama = foto utama).
  const photoPreviews = photos.map(p => p.preview);
  const [dragOverFoto, setDragOverFoto] = useState(false);
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
  // Salinan `loading` yang terbaca SINKRON oleh handler foto (state bisa basi
  // di closure). true selama unggah+kirim: daftar foto dikunci.
  const sedangKirimRef = useRef(false);
  // Token Turnstile dibaca dari ref SAAT payload dikirim, bukan saat Kirim
  // ditekan: unggah 20 foto bisa lebih lama dari umur token (±300 dtk), dan
  // widget memperbaruinya sendiri lewat onVerify selama itu.
  const turnstileTokenRef = useRef('');
  // Jalur cadangan bila widget Turnstile macet (lihat efek di bawah).
  const [bolehTanpaCaptcha, setBolehTanpaCaptcha] = useState(false);
  const tanpaCaptchaRef = useRef(false);
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
    // Pilihan ber-daftar WAJIB divalidasi: draft = input tak tepercaya dari
    // build mana pun. Nilai di luar daftar dulu dipulihkan mentah — tombol
    // pilihan tak satu pun menyala, tapi nilainya tetap terkirim ke server.
    const opsi = (v: unknown, daftar: readonly string[], set: (x: string) => void) => {
      if (typeof v === 'string' && daftar.includes(v)) set(v);
    };

    str(s.noWa, setNoWa); str(s.noWa2, setNoWa2);
    num(s.provId, setProvId); num(s.kabId, setKabId); num(s.kecId, setKecId); num(s.kelId, setKelId);
    str(s.provinsi, setProvinsi); str(s.kabupaten, setKabupaten); str(s.kecProp, setKecProp); str(s.kelProp, setKelProp);
    str(s.judul, setJudul);
    opsi(s.jenis, JENIS_OPTIONS.map(o => o.value), setJenis);
    opsi(s.tujuan, ['dijual', 'disewa', 'dijual_disewa'], setTujuan);
    str(s.harga, setHarga); str(s.hargaSewa, setHargaSewa);
    opsi(s.hargaMode, [HARGA_MODE_TOTAL, HARGA_MODE_PER_M2], setHargaMode);
    str(s.alamat, setAlamat); str(s.lt, setLt); str(s.lb, setLb); str(s.kt, setKt); str(s.km, setKm);
    str(s.lebar_depan, setLebarDepan); str(s.lantai, setLantai); str(s.lebar_jalan, setLebarJalan);
    opsi(s.legalitas, LEGALITAS_OPTIONS, setLegalitas);
    str(s.bankAgunan, setBankAgunan); str(s.outstanding, setOutstanding);
    opsi(s.lingkungan, LINGKUNGAN_OPTIONS.map(o => o.value), setLingkungan);
    str(s.gmaps, setGmaps);
    str(s.infoTambahan, setInfoTambahan); str(s.alasanJual, setAlasanJual);
    opsi(s.jenisKost, JENIS_KOST_OPTS, setJenisKost);
    opsi(s.jenisHotel, JENIS_HOTEL_OPTS, setJenisHotel);
    str(s.noUnit, setNoUnit);
    opsi(s.kelengkapan, FURNISHED_OPTS.map(o => o.value), setKelengkapan);
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
  // ⚠️ SETIAP field ber-nilai-bawaan WAJIB dikosongkan di sini. `statusLeg`
  // (bawaan 'on_hand') sempat terlewat: form yang sama sekali tak disentuh
  // dihitung "ada isian", s2 tersimpan di kunjungan pertama, dan banner
  // "isian dipulihkan" muncul palsu setelah reload (terverifikasi di produksi
  // 2026-09-26). Menambah field ber-default baru = tambahkan juga ke sini.
  const adaIsiSnapshot = adaIsi({ ...snapshot, tujuan: '', hargaMode: '', kondisi: '', statusLeg: '' });
  const jumlahFoto = photoPreviews.length;
  useEffect(() => {
    if (!adaIsiSnapshot && jumlahFoto === 0) return;
    const t = setTimeout(() => {
      try { simpanDraft({ s2: JSON.parse(snapshotJson) as Record<string, unknown>, jumlahFoto }); }
      catch { /* snapshot tak terbaca — autosave memang best-effort */ }
    }, 800);
    return () => clearTimeout(t);
  }, [snapshotJson, adaIsiSnapshot, jumlahFoto]);

  // Load all provinces. Gagal = pesan + tombol "Coba lagi" (dulu diam: dropdown
  // kosong tanpa penjelasan, padahal lokasi WAJIB — form mustahil dikirim).
  const [locGagal, setLocGagal] = useState(false);
  const [locPercobaan, setLocPercobaan] = useState(0);
  useEffect(() => {
    setLocLoading(true);
    setLocGagal(false);
    getLocations().then(res => {
      if (res.success && res.data) setProvList(res.data.items);
      else setLocGagal(true);
    }).catch(() => setLocGagal(true)).finally(() => setLocLoading(false));
  }, [locPercobaan]);

  // ⚠️ Efek cascade di bawah HANYA mengosongkan DAFTAR pilihan saat induknya
  // kosong — TIDAK mengosongkan nama (kabupaten/kecProp/kelProp) maupun kelId.
  // Dulu mengosongkan keduanya: efek-efek ini berjalan SETELAH efek pemulihan
  // draft pada mount pertama dengan id awal null, sehingga nama yang baru
  // dipulihkan terhapus lagi. Dropdown tetap tampak terisi (id selamat), tapi
  // kiriman gagal "Provinsi, Kabupaten/Kota, dan Kecamatan wajib dipilih" dan
  // autosave menulis nama kosong itu kembali ke draft. Pengosongan nama anak
  // saat induk BERUBAH sudah dilakukan handler onChange di bawah.
  useEffect(() => {
    if (!provId) { setKabList([]); setKecList([]); setKelList([]); return; }
    getLocations(provId).then(res => { if (res.success && res.data) setKabList(res.data.items); });
  }, [provId]);

  useEffect(() => {
    if (!kabId) { setKecList([]); setKelList([]); return; }
    getLocations(kabId).then(res => { if (res.success && res.data) setKecList(res.data.items); });
  }, [kabId]);

  useEffect(() => {
    if (!kecId) { setKelList([]); return; }
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

  // Photo handlers — dipakai input file (klik) DAN drop zone (seret file).
  const tambahFoto = async (files: FileList | File[]) => {
    // Selama unggah berjalan, daftar foto DIKUNCI: loop unggah memakai daftar
    // saat Kirim ditekan — foto yang ditambah di tengahnya dulu hilang diam-diam.
    if (sedangKirimRef.current) return;
    const list = Array.from(files);
    const toAdd: File[] = [];
    let photoErr = '';
    for (const file of list) {
      if (photos.length + toAdd.length >= 20) { photoErr = 'Maksimal 20 foto'; break; }
      if (!file.type.startsWith('image/')) {
        photoErr = `${file.name}: Hanya file gambar yang didukung.`; continue;
      }
      if (file.size > 8 * 1024 * 1024) { photoErr = `${file.name}: ukuran melebihi 8MB`; continue; }
      toAdd.push(file);
    }
    if (!toAdd.length) {
      if (photoErr) setErrors(p => ({ ...p, photos: photoErr }));
      else clearErr('photos');
      return;
    }
    const settled = await petakTerbatas(toAdd, 2, convertToWebP);
    const okPreviews: string[] = [];
    const failedNames: string[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') okPreviews.push(result.value);
      else failedNames.push(toAdd[i].name);
    });
    // Foto yang SAMA (hasil konversi identik) dilewati. Dulu dua kartu merujuk
    // satu objek R2 — menghapus salah satunya di admin merusak yang lain.
    // Penyaringan sungguhan terjadi di updater (murni, aman dipanggil ulang
    // StrictMode); hitungan untuk pesan memakai daftar saat ini.
    if (okPreviews.length) {
      const idBaru = okPreviews.map(() => idFotoBaru());
      setPhotos(p => {
        const sudah = new Set(p.map(f => f.preview));
        const baru: FotoLokal[] = [];
        okPreviews.forEach((preview, i) => {
          if (sudah.has(preview)) return;
          sudah.add(preview);
          baru.push({ id: idBaru[i], preview });
        });
        // slice(0, 20) di SINI, bukan hanya cek di atas: `photos.length` di atas
        // bisa basi bila dua batch dikonversi bersamaan (klik lalu langsung drop),
        // dan keduanya sama-sama lolos cek → lebih dari 20 foto.
        return [...p, ...baru].slice(0, 20);
      });
    }
    const convertErr = failedNames.length
      ? `${failedNames.join(', ')}: format foto ini tidak didukung browser Anda — coba screenshot foto lalu upload ulang, atau export sebagai JPG dari galeri HP.`
      : '';
    const sudahAda = new Set(photos.map(f => f.preview));
    const kembar = okPreviews.filter((p, i) => sudahAda.has(p) || okPreviews.indexOf(p) !== i).length;
    const kembarErr = kembar ? `${kembar} foto yang sama sudah dipilih — dilewati.` : '';
    const combinedErr = [photoErr, convertErr, kembarErr].filter(Boolean).join(' ');
    if (combinedErr) setErrors(p => ({ ...p, photos: combinedErr }));
    else clearErr('photos');
  };

  const removePhoto = (id: string) => {
    if (sedangKirimRef.current) return;   // lihat komentar di tambahFoto
    setPhotos(p => p.filter(f => f.id !== id));
  };

  // Foto pertama = foto utama (backend: is_cover = index 0, dijaga _lib/fotoUtama.js).
  const jadikanUtama = (id: string) => {
    if (sedangKirimRef.current) return;
    setPhotos(p => {
      const i = p.findIndex(f => f.id === id);
      if (i <= 0) return p;
      return [p[i], ...p.slice(0, i), ...p.slice(i + 1)];
    });
  };

  // Cegah browser membuka FILE yang meleset dari drop zone foto — perilaku bawaannya
  // pindah halaman, dan foto yang sudah dipilih hilang (draft hanya menyimpan
  // jumlahnya). Sengaja hanya untuk seretan berisi file: seret TEKS ke kolom
  // isian tetap berfungsi seperti biasa.
  useEffect(() => {
    const tolak = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', tolak);
    window.addEventListener('drop', tolak);
    return () => {
      window.removeEventListener('dragover', tolak);
      window.removeEventListener('drop', tolak);
    };
  }, []);

  // Grid seret-urutkan (@dnd-kit) dimuat BELAKANGAN, begitu ada foto — pola sama
  // dengan KPRCalculatorClient. Selama chunk belum tiba atau GAGAL dimuat, grid
  // biasa di bawah tetap berfungsi penuh (★ jadikan utama + hapus).
  const [GridSortable, setGridSortable] = useState<ComponentType<GridFotoSortableProps> | null>(null);
  const adaFoto = photos.length > 0;
  useEffect(() => {
    // import.meta.env.SSR: buang @dnd-kit dari build server/Worker (lihat MODUL_KOSONG).
    if (import.meta.env.SSR || !adaFoto || GridSortable) return;
    let alive = true;
    import('./titipjual/GridFotoSortable')
      .then(m => { if (alive) setGridSortable(() => m.default); })
      .catch(() => { /* grid biasa tetap dipakai */ });
    return () => { alive = false; };
  }, [adaFoto, GridSortable]);

  // Tawarkan jalur cadangan bila widget Turnstile GAGAL, atau masih "memuat"
  // 20 detik tanpa token. Hilang lagi begitu token didapat.
  useEffect(() => {
    if (turnstileToken) { setBolehTanpaCaptcha(false); return; }
    if (turnstileStatus === 'gagal') { setBolehTanpaCaptcha(true); return; }
    const t = setTimeout(() => setBolehTanpaCaptcha(true), 20000);
    return () => clearTimeout(t);
  }, [turnstileStatus, turnstileToken]);

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

  // Token Turnstile SEKALI PAKAI. Server kini memvalidasi isian SEBELUM captcha,
  // jadi 422 validasi TIDAK menghabiskannya — token tetap dipakai untuk kiriman
  // berikutnya. Tapi 422 foto (dicek sesudah captcha), 5xx, dan koneksi putus
  // bisa sudah menghabiskannya → widget diperbarui supaya kiriman ulang tidak
  // mentok 403 ("tekan Kirim tiga kali").
  const perbaruiToken = () => {
    turnstileTokenRef.current = '';
    setTurnstileToken('');
    turnstileRef.current?.reset();
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
    if (!turnstileTokenRef.current && !tanpaCaptchaRef.current) {
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
    sedangKirimRef.current = true;
    setApiError(null);
    setUploadPct(0);
    // ⚠️ SELURUH proses kirim di dalam try/finally: galat tak terduga apa pun
    // (dulu: crypto.randomUUID tidak ada di WebView lama) tidak boleh
    // meninggalkan tombol macet di "Menyimpan…" dan daftar foto terkunci.
    try {
      await kirimProperti();
    } catch (err) {
      laporKendalaForm('titip-jual', 'galat-tak-terduga', { pesan: String((err as Error)?.message ?? err).slice(0, 120) });
      setApiError('Terjadi kendala tak terduga. Isian Anda tetap aman — tekan Kirim sekali lagi.');
    } finally {
      sedangKirimRef.current = false;
      setLoading(false);
      setUploadPct(0);
    }
  };

  const kirimProperti = async () => {
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
    const submitId = sah ?? idAcak();
    // `submitIdTs` hanya disetel saat id BARU dibuat — memperbaruinya di tiap
    // submit akan mengembalikan bug yang sama lewat pintu belakang.
    simpanDraft(sah ? { submitId } : { submitId, submitIdTs: Date.now() });

    // ─── Unggah foto DULU, satu per satu ────────────────────────────────────
    // Hasilnya di-cache per dataUrl, jadi percobaan ulang setelah kegagalan
    // hanya mengunggah foto yang memang belum berhasil — bukan mengulang
    // semuanya dari nol dan meninggalkan salinan yatim di R2.
    const photoKeys: string[] = [];
    const perluUnggah = photoPreviews.some(p => !keyFotoRef.current.has(p));
    let tiketFoto = perluUnggah ? await pastikanTiketFoto() : null;
    if (perluUnggah && !tiketFoto) {
      setApiError('Layanan unggah foto sedang sibuk. Tunggu sekitar 1 menit lalu tekan Kirim lagi — isian dan foto Anda tetap aman.');
      return;
    }
    let tiketSudahDiperbarui = false;
    for (let i = 0; i < photoPreviews.length; i++) {
      const dataUrl = photoPreviews[i];
      const tersimpan = keyFotoRef.current.get(dataUrl);
      if (tersimpan) { photoKeys.push(tersimpan); continue; }

      setUploadPct(Math.round((i / photoPreviews.length) * 90));
      let gagal: (Error & { status?: number }) | null = null;
      for (let coba = 0; coba < 2; coba++) {
        try {
          const key = await unggahSatuFoto(dataUrl, tiketFoto);
          keyFotoRef.current.set(dataUrl, key);
          photoKeys.push(key);
          gagal = null;
          break;
        } catch (err) {
          gagal = err as Error & { status?: number };
          // 403 = tiket basi/ditolak → minta tiket baru SEKALI lalu ulangi foto
          // ini. Dulu 403 berarti jalan buntu permanen sampai halaman dimuat
          // ulang — yang justru menghapus semua foto yang sudah dipilih.
          if (gagal.status === 403 && !tiketSudahDiperbarui) {
            tiketSudahDiperbarui = true;
            const baru = await mintaTiketFoto();
            if (baru) { tiketFoto = baru; coba--; continue; }
          }
          // Foto ini sendiri ditolak / batas sesi tercapai — mengulang percuma.
          if (gagal.status === 422 || gagal.status === 429) break;
        }
      }
      if (gagal) {
        setApiError(
          gagal.status === 422
            ? `Foto ke-${i + 1} ditolak: ${gagal.message}. Hapus foto itu lalu tekan "Kirim" lagi.`
            : gagal.status === 429 || gagal.status === 403
              ? `${gagal.status === 429 ? gagal.message : 'Sesi unggah foto belum bisa diperbarui.'} Tunggu sebentar lalu tekan "Kirim" lagi — isian dan foto Anda tetap aman.`
              : `Foto ke-${i + 1} gagal diunggah. Isian Anda TIDAK hilang — periksa koneksi lalu tekan "Kirim" lagi; foto yang sudah berhasil tidak akan diunggah ulang.`,
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
        // Dibaca dari ref SAAT INI (lihat turnstileTokenRef), bukan nilai saat
        // Kirim ditekan — unggah foto bisa lebih lama dari umur token.
        cf_turnstile_token: turnstileTokenRef.current || undefined,
        // Jalur cadangan saat widget Turnstile macet — server menerimanya
        // dengan kuota per-IP ketat, tanpa event Lead, dan menandainya untuk
        // ditinjau admin. Diabaikan server bila token di atas ada.
        tanpa_captcha:     (tanpaCaptchaRef.current && !turnstileTokenRef.current) || undefined,
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
          const { errs, sisa } = petakGalatServer(json.details);
          setErrors(errs);
          setApiError(sisa.length
            ? `Mohon periksa kembali isian form Anda: ${sisa.join(' · ')}`
            : 'Mohon periksa kembali isian form Anda.');
          fokuskanErrorPertama(errs);
          if (json.details.photos) {
            perbaruiToken();
            // Key foto ditolak server → buang cache-nya supaya foto diunggah ulang.
            keyFotoRef.current.clear();
          }
        } else if (res.status === 403) {
          // Token anti-bot ditolak (paling sering: kedaluwarsa karena form ini
          // panjang — masa berlaku token hanya ±5 menit). Terbitkan token baru
          // otomatis dan minta user menekan Kirim sekali lagi. JANGAN menyuruh
          // muat ulang halaman: isian memang kini terselamatkan autosave, tapi
          // foto tetap hilang dan itu pekerjaan berat di HP.
          perbaruiToken();
          setApiError('Verifikasi anti-bot kedaluwarsa. Kami sudah memperbaruinya — tunggu tanda ✓ hijau di bawah, lalu tekan Kirim sekali lagi. Isian Anda tetap aman.');
          fokuskanErrorPertama({ turnstile: 'x' });
        } else {
          if (res.status >= 500) perbaruiToken();
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
      perbaruiToken();
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
              {/* type=tel + inputMode: HP menampilkan papan angka, bukan keyboard huruf. */}
              <input value={noWa} onChange={e => { setNoWa(e.target.value); clearErr('no_wa'); }}
                type="tel" inputMode="numeric" autoComplete="tel-national"
                placeholder="81391278889" className={`${inputCls(errors.no_wa)} rounded-l-none`} />
            </div>
            <FieldErr msg={errors.no_wa} />
          </div>
          <div id="f-no_wa_2">
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 2 <span className="font-normal text-gray-400">(Opsional)</span></label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={noWa2} onChange={e => { setNoWa2(e.target.value); clearErr('no_wa_2'); }}
                type="tel" inputMode="numeric" autoComplete="off"
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
          <div id="f-luas">
          <div className="grid grid-cols-2 gap-3">
            {SHOW_LUAS_TANAH.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Tanah (m²)</label>
                <input type="number" value={lt} onChange={e => { setLt(tanpaMinus(e.target.value)); clearErr('harga'); clearErr('luas'); }} min="0" inputMode="decimal" placeholder="m²" className={inputCls()} />
              </div>
            )}
            {SHOW_LUAS_BANGUNAN.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Bangunan (m²)</label>
                <input type="number" value={lb} onChange={e => { setLb(tanpaMinus(e.target.value)); clearErr('luas'); }} min="0" inputMode="decimal" placeholder="m²" className={inputCls()} />
              </div>
            )}
            {SHOW_LEBAR_DEPAN.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Lebar Depan (m)</label>
                <input type="number" value={lebar_depan} onChange={e => { setLebarDepan(tanpaMinus(e.target.value)); clearErr('luas'); }} min="0" inputMode="decimal" placeholder="m" className={inputCls()} />
              </div>
            )}
            {SHOW_LANTAI.has(jenis) && (
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Jumlah Lantai</label>
                <input type="number" value={lantai} onChange={e => { setLantai(tanpaMinus(e.target.value)); clearErr('luas'); }} min="0" inputMode="numeric" placeholder="1" className={inputCls()} />
              </div>
            )}
            {SHOW_KT_KM.has(jenis) && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Kamar Tidur</label>
                  <input type="number" value={kt} onChange={e => { setKt(tanpaMinus(e.target.value)); clearErr('luas'); }} min="0" inputMode="numeric" placeholder="KT" className={inputCls()} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Kamar Mandi</label>
                  <input type="number" value={km} onChange={e => { setKm(tanpaMinus(e.target.value)); clearErr('luas'); }} min="0" inputMode="numeric" placeholder="KM" className={inputCls()} />
                </div>
              </>
            )}
          </div>
          <FieldErr msg={errors.luas} />
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
          ) : locGagal && provList.length === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800 flex-1">Daftar lokasi gagal dimuat — periksa koneksi Anda.</p>
              <button type="button" onClick={() => setLocPercobaan(n => n + 1)}
                className="text-xs font-semibold text-[#1565C0] hover:underline flex-shrink-0">
                Coba lagi
              </button>
            </div>
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
          <input type="number" value={lebar_jalan} onChange={e => setLebarJalan(tanpaMinus(e.target.value))} min="0" inputMode="decimal"
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
          {/* Teks "drag foto ke sini" sudah lama ada, tapi sampai 2026-09-26 zona
              ini tidak punya satu pun handler drop. preventDefault() di onDragOver
              WAJIB — tanpanya event drop tak pernah dipancarkan. Anak-anak diberi
              pointer-events-none agar dragleave tak berkedip saat melintasinya. */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDragOverFoto(false); void tambahFoto(e.dataTransfer.files); }}
            onDragOver={e => { e.preventDefault(); setDragOverFoto(true); }}
            onDragLeave={() => setDragOverFoto(false)}
            aria-disabled={loading}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${loading ? 'pointer-events-none opacity-60' : ''} ${
              errors.photos ? 'border-red-400 bg-red-50'
              : dragOverFoto ? 'border-[#1565C0] bg-blue-50'
              : 'border-gray-200 hover:border-[#1565C0]'}`}>
            <Upload size={28} className="mx-auto mb-2 text-gray-400 pointer-events-none" />
            <p className="text-sm text-[#64748B] pointer-events-none">Klik atau drag foto ke sini</p>
            <p className="text-xs text-gray-400 mt-1 pointer-events-none">JPG/PNG/WebP · Maks 20 foto · Maks 8MB/foto · Foto pertama jadi foto utama</p>
          </div>
          {/* Salin daftar file SEBELUM mengosongkan value: FileList milik input
              ikut kosong begitu value di-reset. */}
          <input ref={fileInputRef} type="file" accept="image/*"
            multiple className="hidden"
            onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void tambahFoto(files); }} />
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

          {photos.length > 1 && (
            <p className="text-xs text-[#64748B] mt-3">
              Tahan &amp; geser foto untuk mengatur urutan, atau ketuk ★ untuk menjadikannya foto utama.
            </p>
          )}
          {/* Dikunci selama unggah (sedangKirimRef menjaga handler; kelas ini
              memberi tahu mata): foto yang dihapus/diurutkan/ditambah di tengah
              unggahan dulu diabaikan diam-diam. */}
          <div aria-busy={loading} className={loading ? 'pointer-events-none opacity-60' : undefined}>
          {photos.length > 0 && (GridSortable ? (
            <GridSortable photos={photos} onUrutkan={urutan => { if (!sedangKirimRef.current) setPhotos(urutan); }} onHapus={removePhoto} onJadikanUtama={jadikanUtama} />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
              {photos.map((f, i) => (
                <KartuFoto key={f.id} src={f.preview} utama={i === 0}
                  onHapus={() => removePhoto(f.id)} onJadikanUtama={() => jadikanUtama(f.id)} />
              ))}
            </div>
          ))}
          </div>
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
            onVerify={t => { turnstileTokenRef.current = t; setTurnstileToken(t); clearErr('turnstile'); }}
            onExpire={() => { turnstileTokenRef.current = ''; setTurnstileToken(''); }}
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
          {bolehTanpaCaptcha && !turnstileToken && (
            // Jalur cadangan: widget yang tak kunjung selesai (terukur di produksi:
            // satu penjual mencoba ±1 jam, 22 Sep 2026) = lead paling bernilai
            // yang hilang. Kiriman ini hanya membuat DRAFT yang selalu ditinjau
            // admin, dibatasi kuota per-IP di server, dan tidak dilaporkan ke Meta.
            <div className="mt-2 p-3 rounded-xl border border-amber-200 bg-amber-50">
              <p className="text-xs text-amber-900">
                Verifikasi tidak kunjung selesai? Anda tetap bisa mengirim — data Anda akan
                diperiksa manual oleh tim kami sebelum ditayangkan.
              </p>
              <button type="button" disabled={loading}
                onClick={() => { tanpaCaptchaRef.current = true; clearErr('turnstile'); void handleSubmit(); }}
                className="mt-2 text-xs font-semibold text-[#1565C0] hover:underline disabled:opacity-50">
                Kirim tanpa verifikasi →
              </button>
            </div>
          )}
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
  const [linkLanjutBasi, setLinkLanjutBasi] = useState(false);
  const [sesiTahap2Basi, setSesiTahap2Basi] = useState<string | null>(null);

  // Prefetch chunk Tahap 2 saat peramban senggang, supaya perpindahan dari
  // Tahap 1 tetap instan walau komponennya dimuat malas. Gagal = diam: chunk
  // tetap dimuat saat benar-benar dibutuhkan (Suspense di bawah).
  useEffect(() => {
    const t = setTimeout(() => { import('./titipjual/StepDataDiri').catch(() => {}); }, 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    // Link lanjutan dari admin: /titip-jual?lanjut=<tiket_lanjut>. Diterbitkan
    // POST /api/admin/titip-jual/:id/link-lanjut untuk pemilik yang berhenti
    // setelah Tahap 1 — membuka form data diri LANGSUNG, tanpa mengisi ulang
    // properti (yang dulu melahirkan listing ganda). Parameter dibuang dari
    // address bar seketika; root loader memang tidak memuat Pixel/GA4 untuk URL
    // ini (tanpaPelacak() di root.tsx), jadi tiketnya tidak bocor ke pihak ketiga.
    const url = new URL(window.location.href);
    const lanjut = url.searchParams.get('lanjut');
    if (lanjut) {
      url.searchParams.delete('lanjut');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      const kode = bacaPayloadTiket(lanjut)?.kode_listing;
      if (kode && tiketMasihBerlaku(lanjut)) {
        simpanDraft({ tiketLanjut: lanjut, kodeListingTahap1: kode });
        setStage1({ kode_listing: kode, tiket_lanjut: lanjut });
        setLayar('datadiri');
        return;
      }
      setLinkLanjutBasi(true);
    }

    const d = bacaDraft();
    // Hanya bila ada ISIAN yang benar-benar dipulihkan. `!!d.s2` saja tidak
    // cukup: draft dari build sebelum 788caa1 menyimpan s2 berisi NILAI BAWAAN
    // saja (tujuan/hargaMode/kondisi/statusLeg), dan karena tiap kunjungan dulu
    // memperbarui `ts`, draft tercemar itu tak pernah kedaluwarsa — banner
    // "isian dipulihkan" palsu selamanya. Isinya kini diperiksa ulang dengan
    // aturan yang sama dengan autosave, dan draft tanpa isian nyata dihapus.
    const s2 = (d?.s2 ?? null) as Record<string, unknown> | null;
    const s1 = (d?.s1 ?? null) as Record<string, unknown> | null;
    const isiNyata = !!d && (
      (!!s2 && adaIsi({ ...s2, tujuan: '', hargaMode: '', kondisi: '', statusLeg: '' }))
      || (!!s1 && adaIsi({ ...s1, jenisIdentitas: '' }))
      || (d.jumlahFoto ?? 0) > 0
      || !!d.tiketLanjut
    );
    if (d && !isiNyata) hapusDraft();
    setAdaDraftPulih(isiNyata);

    // Pulihkan langsung ke Data Diri bila Tahap 1 sudah pernah sukses tapi
    // user reload/tutup-tab sebelum sempat menyelesaikan Tahap 2. Tanpa ini,
    // `layar` selalu mulai dari 'properti' — user mendarat lagi di form
    // properti, padahal `tiketLanjut` masih sah 7 hari. `hapusDraft()` selalu
    // dipanggil begitu Tahap 2 benar-benar tuntas (StepDataDiri.handleSubmit),
    // jadi draft yang masih memuat tiketLanjut di sini berarti Tahap 2 memang
    // belum diselesaikan.
    if (d?.tiketLanjut && d?.kodeListingTahap1 && !tiketMasihBerlaku(d.tiketLanjut)) {
      // Tiket Tahap 2 berumur 7 hari. Dulu tetap diarahkan ke form Data Diri:
      // pemilik mengetik KYC lengkap termasuk NIK, lalu SELALU mendapat "sesi
      // kedaluwarsa" — di setiap kunjungan. Kini dibuang dengan penjelasan.
      setSesiTahap2Basi(d.kodeListingTahap1);
      simpanDraft({ tiketLanjut: undefined, kodeListingTahap1: undefined });
    } else if (d?.tiketLanjut && d?.kodeListingTahap1) {
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
        {linkLanjutBasi && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#0F172A] flex-1">
              Link lanjutan ini sudah tidak berlaku (masa berlakunya 7 hari). Mohon hubungi admin SBP via
              WhatsApp <strong>0813-9127-8889</strong> untuk meminta link baru — data properti Anda tetap tersimpan,
              jadi tidak perlu mengisi ulang formulir di bawah.
            </p>
          </div>
        )}
        {sesiTahap2Basi && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#0F172A] flex-1">
              Sesi melengkapi data diri untuk properti <strong>{sesiTahap2Basi}</strong> sudah lewat 7 hari.
              Data properti Anda tetap tersimpan — tim SBP akan menghubungi Anda via WhatsApp, atau hubungi{' '}
              <strong>0813-9127-8889</strong> untuk meminta link lanjutan. Tidak perlu mengisi ulang formulir.
            </p>
          </div>
        )}
        {tampilkanStepper && adaDraftPulih && !sesiTahap2Basi && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-[#E3F2FD] border border-[#90CAF9] rounded-xl">
            <Check size={16} className="text-[#1565C0] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#0F172A] flex-1">
              {layar === 'datadiri' ? (
                // Tahap 1 sudah terkirim — fotonya SUDAH di server. Dulu banner
                // ini tetap menyuruh "foto perlu diisi ulang".
                <>Isian Anda sebelumnya sudah dipulihkan. Demi keamanan, <strong>nomor identitas</strong> tidak ikut tersimpan — mohon diisi ulang.</>
              ) : (
                <>Isian Anda sebelumnya sudah dipulihkan. Demi keamanan, <strong>nomor identitas</strong> dan{' '}
                <strong>foto</strong> tidak ikut tersimpan — keduanya perlu diisi ulang.</>
              )}
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
              <Suspense fallback={
                <div className="flex items-center justify-center py-16">
                  <div className="w-7 h-7 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
                </div>
              }>
              <StepDataDiri
                kodeListing={stage1?.kode_listing ?? ''}
                photosBelumLengkap={!!(stage1 && typeof stage1.photos_uploaded === 'number'
                  && typeof stage1.photos_total_sent === 'number'
                  && stage1.photos_uploaded < stage1.photos_total_sent)}
                onNanti={() => setLayar('ditunda')}
                onSuccess={handleStage2Success}
              />
              </Suspense>
            </div>
          )}
          {layar === 'selesai' && stage2 && <SelesaiPage stage2={stage2} />}
          {layar === 'ditunda' && stage1 && <DitundaPage kodeListing={stage1.kode_listing} />}
        </div>
      </div>
    </div>
  );
}
