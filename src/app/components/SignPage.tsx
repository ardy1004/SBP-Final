import { bacaJson } from '../../lib/api';
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router';
import { IDENTITAS, normalisasiJenisIdentitas } from '../../../functions/_lib/identitas.js';
import { SLOT_W, SLOT_H, letakMeterai, letakTtd } from '../../../functions/_lib/tataLetakTtd.js';
import type { HasilTtd } from './sign/PadTandaTangan';
import {
  CheckCircle, AlertTriangle, Clock, RotateCcw,
  FileText, Shield, ExternalLink, Loader2, PenLine,
} from 'lucide-react';

// Popup gambar TTD dimuat MALAS dan hanya dirender setelah pemilik mengetuk slot
// (tidak pernah saat SSR). Chunk gagal dimuat — mis. tab lama setelah deploy
// baru — tidak boleh menjatuhkan halaman: tampilkan ajakan muat ulang.
function GagalMuatPad() {
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-[#374151]">Kotak tanda tangan gagal dimuat. Periksa koneksi, lalu muat ulang halaman.</p>
      <button type="button" onClick={() => window.location.reload()} className="px-6 py-3 rounded-xl font-semibold text-white bg-[#1565C0]">
        Muat ulang
      </button>
    </div>
  );
}
const muatPad = () => import('./sign/PadTandaTangan');
const PadTandaTangan = lazy(() => muatPad().catch(() => ({ default: GagalMuatPad })));

const TTD_ARDY_URL  = 'https://images.salambumi.xyz/materai/gsd-removebg-preview%20-%20Copy.png';
const MATERAI_URL   = 'https://images.salambumi.xyz/materai/hg.png';
const WA_ADMIN      = 'https://wa.me/6281391278889';

// Jalur bantuan di tampilan tanda tangan & sukses — tautan biasa, BUKAN FAB
// (ChatWidget sengaja disembunyikan di /sign karena menutupi dokumen). Tanpa
// trackWaClick: pemilik bukan lead pembeli. Pesan hanya memuat kode perjanjian,
// tidak pernah token/NIK.
function BantuanWa({ kode, teks }: { kode: string; teks: string }) {
  return (
    <a
      href={`${WA_ADMIN}?text=${encodeURIComponent(`Halo SBP, saya ada pertanyaan tentang perjanjian ${kode}`)}`}
      target="_blank" rel="noopener noreferrer"
      className="block text-center text-sm font-medium text-[#1565C0] hover:underline"
    >
      {teks}
    </a>
  );
}

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────
interface Pasal {
  pasal: number;
  judul: string;
  isi: string;
}

interface AgreementData {
  status: 'valid';
  kode_perjanjian: string;
  token_expires_at: string | null;
  owner: {
    nama_pemilik: string;
    nama_ktp: string;
    nik: string | null;
    alamat_ktp: string;
    rt_rw: string | null;
    kelurahan: string | null;
    kecamatan: string | null;
    bertindak_sebagai: string;
    /** 'ktp' | 'sim' — tak ada pada respons server lama → dianggap 'ktp'. */
    jenis_identitas?: string;
    /** Teks jadi dari server — SAMA dengan yang tercetak di PDF (functions/_lib/isiPerjanjian.js). */
    bertindak_label: string;
    alamat_lengkap: string;
  };
  properti: {
    title: string;
    slug: string;
    jenis_properti: string;
    tujuan: string;
    harga: number | null;
    /** Kalimat harga Pasal 1 (jual / sewa per tahun / keduanya + nego/nett). */
    harga_penawaran: string;
    provinsi: string | null;
    kabupaten: string | null;
    kecamatan: string | null;
    kelurahan: string | null;
    legalitas: string | null;
  };
  jenis_transaksi: string;
  jenis_transaksi_label: string;
  jenis_listing: string;
  durasi_kontrak: number | null;
  fee_persen: number;
  pasal: Pasal[];
  /** SHA-256 isi dokumen yang ditampilkan — dikirim balik saat menandatangani. */
  versi_dokumen: string;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'kedaluwarsa' }
  | { kind: 'belum_dikonfigurasi' }
  | { kind: 'sudah_ditandatangani'; slug_properti: string | null; kode_perjanjian: string }
  | { kind: 'valid'; data: AgreementData }
  | { kind: 'success'; property_url: string; kode_perjanjian: string; token: string; pdf_tersedia: boolean; properti_tayang: boolean };

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function formatTanggalId(date: Date = new Date()): string {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildPropertyUrl(pd: AgreementData['properti']): string {
  const prefix = pd.tujuan === 'disewa' ? 'disewa' : 'dijual';
  const parts = [pd.jenis_properti, pd.provinsi ?? '', pd.kabupaten ?? '', pd.kecamatan ?? '']
    .map(s => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  return `/${prefix}/${parts.join('/')}/${pd.slug}`;
}

function labelListingDurasi(jenis: string, durasi: number | null): string {
  if (jenis === 'exclusive') return `Exclusive${durasi ? ` — ${durasi} Bulan` : ''}`;
  return 'Open (Tidak Terbatas)';
}

// ──────────────────────────────────────────────────────────────
// Sub-views (early returns)
// ──────────────────────────────────────────────────────────────
function LoadingView() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F4F8' }}>
      <div className="text-center">
        <Loader2 size={40} className="text-[#1565C0] mx-auto mb-4 animate-spin" />
        <p className="text-[#64748B]">Memuat dokumen perjanjian…</p>
      </div>
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-nav" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <AlertTriangle size={48} className="text-[#EF4444] mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Link Tidak Valid</h1>
        <p className="text-[#64748B] mb-6">
          Link perjanjian ini sudah tidak berlaku. Silakan hubungi tim SBP untuk link baru.
        </p>
        <a
          href={`${WA_ADMIN}?text=Halo+SBP,+link+perjanjian+saya+tidak+valid`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors"
        >
          Hubungi SBP via WhatsApp
        </a>
      </div>
    </div>
  );
}

function ExpiredView() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-nav" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <Clock size={48} className="text-[#F5A623] mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Link Sudah Tidak Berlaku</h1>
        <p className="text-[#64748B] mb-6">
          Link perjanjian ini sudah kedaluwarsa atau belum dikonfigurasi admin.
          Silakan hubungi tim SBP untuk mendapatkan link baru.
        </p>
        <a
          href={`${WA_ADMIN}?text=Halo+SBP,+link+perjanjian+saya+sudah+expired`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors"
        >
          Hubungi SBP via WhatsApp
        </a>
      </div>
    </div>
  );
}

function AlreadySignedView({ data }: { data: Extract<PageState, { kind: 'sudah_ditandatangani' }> }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-nav" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-[#10B981] flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-white" />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Perjanjian Sudah Ditandatangani</h1>
        <p className="text-[#64748B] mb-6">
          Perjanjian kode <strong>{data.kode_perjanjian}</strong> sudah pernah ditandatangani sebelumnya.
          Hubungi tim SBP jika ada pertanyaan.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {data.slug_properti && (
            <Link
              to={`/properties`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#1565C0] hover:bg-[#1976D2] transition-colors"
            >
              <ExternalLink size={16} /> Lihat Properti
            </Link>
          )}
          <a
            href={WA_ADMIN}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#1565C0] border border-[#1565C0] hover:bg-[#E3F2FD] transition-colors"
          >
            Hubungi SBP
          </a>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ data }: { data: Extract<PageState, { kind: 'success' }> }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-nav" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🚀</div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">
          {data.properti_tayang ? 'Selamat, properti Anda telah tayang!' : 'Terima kasih, perjanjian telah ditandatangani!'}
        </h1>
        <p className="text-[#64748B] mb-2">
          Tanda tangan elektronik Anda telah berhasil direkam.
        </p>
        <p className="text-[#64748B] mb-6 text-sm">
          Kode perjanjian: <span className="font-semibold text-[#1565C0]">{data.kode_perjanjian}</span>.
        </p>
        <div className="bg-[#F0FFF4] border border-[#10B981]/30 rounded-xl p-4 text-sm text-[#10B981] mb-6">
          <Shield size={16} className="inline mr-2" />
          Data Anda dilindungi sesuai UU PDP RI
        </div>
        <div className="flex flex-col gap-3">
          {/* Tautan listing hanya bila memang tayang — dulu selalu tampil walau listingnya diarsipkan. */}
          {data.properti_tayang && <Link
            to={data.property_url}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#1565C0] hover:bg-[#1976D2] transition-colors"
          >
            Lihat Properti Saya <ExternalLink size={16} />
          </Link>}
          {data.pdf_tersedia && (
            <a
              href={`/api/sign/${data.token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#1565C0] border border-[#1565C0] hover:bg-[#E3F2FD] transition-colors"
            >
              <FileText size={16} /> Download PDF Perjanjian
            </a>
          )}
          <BantuanWa kode={data.kode_perjanjian} teks="Ada pertanyaan? Hubungi admin via WhatsApp" />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Stepper (dekoratif)
// ──────────────────────────────────────────────────────────────
function Stepper() {
  return (
    <div className="flex items-center justify-center gap-2 mb-6 text-sm">
      {(['Data Diri', 'Info Properti'] as const).map(label => (
        <span key={label} className="flex items-center gap-1 text-[#10B981] font-medium">
          <CheckCircle size={14} /> {label}
          <span className="mx-2 text-[#CBD5E1]">›</span>
        </span>
      ))}
      <span className="flex items-center gap-1 text-[#1565C0] font-semibold">
        <span className="w-5 h-5 rounded-full bg-[#1565C0] text-white text-xs flex items-center justify-center">3</span>
        Tanda Tangan
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Document renderer
// ──────────────────────────────────────────────────────────────
// Slot TTD Pihak Kedua — rasio & posisi meterai/TTD dari functions/_lib/tataLetakTtd.js,
// rumus yang SAMA dengan pdf.js, jadi yang dilihat pemilik = yang tercetak.
const persen = (v: number, total: number) => `${(v / total) * 100}%`;
const METERAI = letakMeterai();

function SlotTtdPemilik({ ttd, onBuka }: { ttd: HasilTtd | null; onBuka: () => void }) {
  const t = ttd ? letakTtd(ttd.w, ttd.h) : null;
  return (
    <button
      type="button"
      onClick={onBuka}
      aria-label={ttd ? 'Ganti tanda tangan' : 'Tanda tangan di sini'}
      className="relative block w-full"
      style={{ aspectRatio: `${SLOT_W} / ${SLOT_H}` }}
    >
      <img
        src={MATERAI_URL}
        alt="Materai"
        className="absolute top-0 h-full w-auto pointer-events-none select-none"
        style={{ left: persen(METERAI.x, SLOT_W), opacity: 0.9 }}
        suppressHydrationWarning
      />
      {ttd && t ? (
        <img
          src={ttd.dataUrl}
          alt="Tanda tangan Anda"
          className="absolute pointer-events-none select-none"
          style={{
            left: persen(t.x, SLOT_W), top: persen(SLOT_H - t.y - t.h, SLOT_H),
            width: persen(t.w, SLOT_W), height: persen(t.h, SLOT_H),
          }}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1565C0] text-white text-sm font-sans font-semibold shadow-md">
            <PenLine size={16} /> Tanda tangan di sini
          </span>
        </span>
      )}
    </button>
  );
}

interface PerjanjianDocumentProps {
  data: AgreementData;
  today: string;
  ttd: HasilTtd | null;
  onBukaPad: () => void;
}

function PerjanjianDocument({ data, today, ttd, onBukaPad }: PerjanjianDocumentProps) {
  const { owner, properti, pasal } = data;

  // Label kewenangan, alamat, jenis transaksi, dan harga datang JADI dari server
  // (functions/_lib/isiPerjanjian.js) supaya halaman ini identik dengan PDF.
  // Dulu keduanya menyusun sendiri-sendiri, dan 'suami_istri'/'lainnya'
  // tertulis "Pemilik Langsung" di kedua tempat.
  const alamatOwner = owner.alamat_lengkap;

  return (
    <div className="font-serif text-sm text-[#1a1a1a] leading-relaxed space-y-4">
      {/* ── Header ── */}
      <div className="text-center space-y-1 pb-4 border-b border-gray-300">
        <p className="font-bold text-base uppercase tracking-wide">
          Perjanjian Jasa Pemasaran — Salam Bumi Property
        </p>
        <p className="text-xs text-[#64748B]">
          Jenis: {labelListingDurasi(data.jenis_listing, data.durasi_kontrak)}&nbsp;·&nbsp;
          Jenis Perjanjian: {data.jenis_transaksi_label}&nbsp;·&nbsp;
          Nomor: {data.kode_perjanjian}
        </p>
        <p className="text-xs text-[#64748B]" suppressHydrationWarning>Tanggal: {today}</p>
      </div>

      {/* ── Para Pihak ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="font-bold text-xs uppercase text-[#64748B] tracking-wider">Pihak Pertama — Agen</p>
          <p className="font-semibold">CV Salam Bumi Property</p>
          <p className="text-xs text-[#374151]">Jl. Pajajaran, Catur Tunggal, Depok, Sleman, DI Yogyakarta (Virtual Office)</p>
          <p className="text-xs text-[#374151]">WA: 0813-9127-8889</p>
          <p className="text-xs text-[#374151]">Email: salambumiproperty@gmail.com</p>
          <p className="text-xs text-[#374151]">Website: salambumi.xyz</p>
        </div>
        <div className="space-y-1">
          <p className="font-bold text-xs uppercase text-[#64748B] tracking-wider">Pihak Kedua — Pemilik</p>
          <p className="font-semibold">{owner.nama_ktp}</p>
          <p className="text-xs text-[#374151]">{IDENTITAS[normalisasiJenisIdentitas(owner.jenis_identitas)].label}: {owner.nik ?? 'Tidak tersedia'}</p>
          <p className="text-xs text-[#374151]">Alamat {IDENTITAS[normalisasiJenisIdentitas(owner.jenis_identitas)].kartu}: {alamatOwner || '-'}</p>
          <p className="text-xs text-[#374151]">
            Bertindak sebagai: {owner.bertindak_label}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200" />

      {/* ── Pasal-pasal ── */}
      {pasal.map(p => (
        <div key={p.pasal} className="space-y-1">
          <p className="font-bold">Pasal {p.pasal} — {p.judul}</p>
          <p className="text-[#374151]">{p.isi}</p>
        </div>
      ))}

      <div className="border-t border-gray-200" />

      {/* ── Area TTD bawah dokumen ── */}

      {/* MOBILE ONLY: Pihak Pertama block lengkap — disembunyikan di md+ */}
      <div className="md:hidden text-center pt-2">
        <p className="text-xs text-[#64748B]">Pihak Pertama,</p>
        <p className="text-xs text-[#64748B]">CV Salam Bumi Property</p>
        <div className="flex items-center justify-center py-4">
          <img
            src={TTD_ARDY_URL}
            alt="TTD Ardy Salam"
            className="max-h-24 max-w-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            suppressHydrationWarning
          />
        </div>
        <div className="border-t border-gray-400 pt-1">
          <p className="text-xs font-semibold">Ardy Salam</p>
          <p className="text-xs text-[#64748B]">Agent Properti</p>
        </div>
      </div>

      {/* Baris 1: Label pihak + tombol Ulangi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Pihak Pertama label — desktop only */}
        <div className="hidden md:block text-center">
          <p className="text-xs text-[#64748B]">Pihak Pertama,</p>
          <p className="text-xs text-[#64748B]">CV Salam Bumi Property</p>
        </div>
        {/* Pihak Kedua label + Ganti — tombol hanya bila TTD sudah ada */}
        <div className="relative text-center">
          <p className="text-xs text-[#64748B]">Pihak Kedua,</p>
          {ttd && (
            <button
              onClick={onBukaPad}
              type="button"
              className="absolute right-0 top-0 flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#1565C0] transition-colors"
            >
              <RotateCcw size={10} /> Ganti
            </button>
          )}
        </div>
      </div>

      {/* Baris 2: Slot TTD — rasio 232,5:90 = slot PDF. Pemilik menggambar di popup,
          bukan di sini (dulu kanvas 1400×440 → goresan 0,47 pt & gepeng di HP). */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TTD Ardy — desktop only */}
        <div className="hidden md:flex items-center justify-center" style={{ aspectRatio: `${SLOT_W} / ${SLOT_H}` }}>
          <img
            src={TTD_ARDY_URL}
            alt="TTD Ardy Salam"
            className="max-h-full max-w-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            suppressHydrationWarning
          />
        </div>
        <SlotTtdPemilik ttd={ttd} onBuka={onBukaPad} />
      </div>

      {/* Baris 3: Garis + nama + jabatan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pihak Pertama nama — desktop only */}
        <div className="hidden md:block text-center border-t border-gray-400 pt-1">
          <p className="text-xs font-semibold">Ardy Salam</p>
          <p className="text-xs text-[#64748B]">Agent Properti</p>
        </div>
        {/* Pihak Kedua nama — selalu tampil */}
        <div className="text-center border-t border-gray-400 pt-1">
          <p className="text-xs font-semibold">{owner.nama_ktp}</p>
          <p className="text-xs text-[#64748B]">Pemilik Properti</p>
        </div>
      </div>

      {/* Status TTD — rata tengah di bawah */}
      <p className={`text-center text-xs mt-2 transition-colors ${ttd ? 'text-[#10B981]' : 'text-[#94A3B8]'}`}>
        {ttd ? '✓ TTD direkam' : 'Ketuk kotak Pihak Kedua untuk menandatangani'}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [ttd, setTtd] = useState<HasilTtd | null>(null);
  const [padTerbuka, setPadTerbuka] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const today = formatTanggalId();
  const hasSigned = ttd !== null;

  const bukaPad = useCallback(() => setPadTerbuka(true), []);
  const tutupPad = useCallback(() => setPadTerbuka(false), []);
  const simpanTtd = useCallback((h: HasilTtd) => { setTtd(h); setPadTerbuka(false); }, []);

  // Prefetch chunk popup setelah dokumen tampil, supaya ketukan pertama instan.
  // Gagal = diam: chunk dimuat lagi saat benar-benar dibuka.
  useEffect(() => {
    if (state.kind !== 'valid') return;
    const t = setTimeout(() => { muatPad().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [state.kind]);

  // Fetch agreement on mount
  useEffect(() => {
    if (!token) { setState({ kind: 'not_found' }); return; }

    fetch(`/api/sign/${token}`)
      .then(r => bacaJson(r))
      .then((json: any) => {
        if (!json.success) { setState({ kind: 'not_found' }); return; }
        const d = json.data;
        switch (d.status) {
          case 'valid':
            setState({ kind: 'valid', data: d });
            break;
          case 'sudah_ditandatangani':
            setState({ kind: 'sudah_ditandatangani', slug_properti: d.slug_properti ?? null, kode_perjanjian: d.kode_perjanjian });
            break;
          case 'kedaluwarsa':
          case 'belum_dikonfigurasi':
            setState({ kind: 'kedaluwarsa' });
            break;
          default:
            setState({ kind: 'not_found' });
        }
      })
      .catch(() => setState({ kind: 'not_found' }));
  }, [token]);

  const handleSubmit = useCallback(async () => {
    if (state.kind !== 'valid') return;
    if (!ttd || !agreed) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // PNG sudah dirender di popup pada ukuran akhirnya (tataLetakTtd.js).
      const dataUrl = ttd.dataUrl;
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // versi_dokumen = sidik jari isi yang sedang dibaca. Server menolak (409)
        // bila admin mengubah data sejak halaman ini dimuat.
        body: JSON.stringify({ signature: dataUrl, persetujuan: true, versi_dokumen: state.data.versi_dokumen }),
      });
      const json = await bacaJson(res);
      if (!json.success && json.details?.kode === 'dokumen_berubah') {
        // Tanda tangan di kanvas ikut hilang saat dimuat ulang — memang harus:
        // pemilik wajib membaca versi terbaru sebelum menandatangani lagi.
        setSubmitError(json.error ?? 'Isi perjanjian diperbarui. Memuat ulang…');
        setTimeout(() => window.location.reload(), 2500);
        return;
      }
      if (!json.success) throw new Error(json.error || 'Gagal mengirim tanda tangan');
      const d = json.data;
      const propertyUrl = buildPropertyUrl(state.data.properti);
      setState({
        kind: 'success',
        property_url: propertyUrl,
        kode_perjanjian: d.kode_perjanjian,
        token: token!,
        pdf_tersedia: d.pdf_tersedia === true,
        // Server lama tidak mengirim field ini → anggap tayang (perilaku lama).
        properti_tayang: d.properti_tayang !== false,
      });
    } catch (err: any) {
      setSubmitError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [state, token, ttd, agreed]);

  // ── State routing ─────────────────────────────────────────
  if (state.kind === 'loading')               return <LoadingView />;
  if (state.kind === 'not_found')             return <NotFoundView />;
  if (state.kind === 'kedaluwarsa')           return <ExpiredView />;
  if (state.kind === 'belum_dikonfigurasi')   return <ExpiredView />;
  if (state.kind === 'sudah_ditandatangani')  return <AlreadySignedView data={state} />;
  if (state.kind === 'success')               return <SuccessView data={state} />;

  const { data } = state;
  const canSubmit = hasSigned && agreed && !submitting;

  return (
    <div className="min-h-screen pt-nav pb-16" style={{ background: '#F0F4F8' }}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Page header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-[#E3F2FD] text-[#1565C0] px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <FileText size={14} /> Tanda Tangan Digital — Salam Bumi Property
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-2">Perjanjian Pemasaran Properti</h1>
          <p className="text-[#64748B] text-sm">
            Halo <strong>{data.owner.nama_ktp}</strong>, silakan baca dokumen perjanjian berikut dan berikan tanda tangan Anda.
          </p>
        </div>

        {/* Stepper */}
        <Stepper />

        {/* Info bar UU ITE */}
        <div className="bg-[#FFF9E6] border border-[#F5A623]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#F5A623] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[#92400E]">
            Tanda tangan elektronik ini memiliki kekuatan hukum yang sah sesuai <strong>UU ITE No. 11 Tahun 2008</strong> dan
            perubahannya. Pastikan Anda membaca seluruh isi perjanjian sebelum menandatangani.
          </p>
        </div>

        {/* Document card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 p-5 border-b border-gray-100">
            <FileText size={20} className="text-[#1565C0]" />
            <div>
              <div className="font-semibold text-[#0F172A] text-sm">Dokumen Perjanjian (Read-Only)</div>
              <div className="text-xs text-[#64748B]">Nomor: {data.kode_perjanjian} · Fee: {data.fee_persen}% · {data.properti.harga_penawaran}</div>
            </div>
          </div>
          {/* Scrollable document area */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            <PerjanjianDocument
              data={data}
              today={today}
              ttd={ttd}
              onBukaPad={bukaPad}
            />
          </div>
        </div>

        {/* Consent checkbox */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 flex-shrink-0 w-4 h-4 accent-[#1565C0]"
            />
            <span className="text-sm text-[#374151] leading-relaxed">
              Saya setuju dengan syarat dan ketentuan yang berlaku. Dengan mencentang ini, saya menyatakan semua
              informasi benar dan menyetujui perjanjian pemasaran dengan Salam Bumi Property.
            </span>
          </label>
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="bg-[#FEF2F2] border border-[#EF4444]/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#DC2626]">{submitError}</p>
          </div>
        )}

        {/* Disabled hints */}
        {!hasSigned && (
          <p className="text-center text-xs text-[#94A3B8]">
            Tanda tangani dokumen di kotak Pihak Kedua untuk mengaktifkan tombol kirim
          </p>
        )}
        {hasSigned && !agreed && (
          <p className="text-center text-xs text-[#94A3B8]">
            ↑ Centang persetujuan di atas untuk mengaktifkan tombol kirim
          </p>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          type="button"
          className="w-full py-4 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: canSubmit
              ? 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)'
              : '#94A3B8',
          }}
        >
          {submitting ? (
            <><Loader2 size={18} className="animate-spin" /> Mengirim…</>
          ) : (
            <><CheckCircle size={18} /> Kirim Perjanjian yang Ditandatangani</>
          )}
        </button>

        <BantuanWa kode={data.kode_perjanjian} teks="Ada yang kurang jelas? Tanyakan admin via WhatsApp" />

        <p className="text-center text-xs text-[#94A3B8]">
          <Shield size={12} className="inline mr-1" />
          Data Anda dilindungi sesuai UU PDP RI · Tanda tangan dienkripsi dan disimpan dengan aman
        </p>
      </div>

      {padTerbuka && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
            <Loader2 size={32} className="text-[#1565C0] animate-spin" />
          </div>
        }>
          <PadTandaTangan nama={data.owner.nama_ktp} onSimpan={simpanTtd} onTutup={tutupPad} />
        </Suspense>
      )}
    </div>
  );
}
