import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import {
  CheckCircle, AlertTriangle, Clock, Pen, RotateCcw,
  FileText, Shield, ExternalLink, Loader2,
} from 'lucide-react';

const TTD_ARDY_URL  = 'https://images.salambumi.xyz/materai/gsd-removebg-preview%20-%20Copy.png';
const MATERAI_URL   = 'https://images.salambumi.xyz/materai/hg.png';
const WA_ADMIN      = 'https://wa.me/6281391278889';

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
  };
  properti: {
    title: string;
    slug: string;
    jenis_properti: string;
    tujuan: string;
    harga: number | null;
    provinsi: string | null;
    kabupaten: string | null;
    kecamatan: string | null;
    kelurahan: string | null;
    legalitas: string | null;
  };
  jenis_transaksi: string;
  jenis_listing: string;
  durasi_kontrak: number | null;
  fee_persen: number;
  pasal: Pasal[];
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'kedaluwarsa' }
  | { kind: 'belum_dikonfigurasi' }
  | { kind: 'sudah_ditandatangani'; slug_properti: string | null; kode_perjanjian: string }
  | { kind: 'valid'; data: AgreementData }
  | { kind: 'success'; property_url: string; kode_perjanjian: string; token: string; pdf_tersedia: boolean };

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function formatRupiah(n: number | null | undefined): string {
  if (!n) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(n);
}

function formatTanggalId(date: Date = new Date()): string {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildPropertyUrl(pd: AgreementData['properti']): string {
  const prefix = pd.tujuan === 'disewa' ? 'disewa' : 'dijual';
  const parts = [pd.jenis_properti, pd.provinsi ?? '', pd.kabupaten ?? '', pd.kecamatan ?? '']
    .map(s => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  return `/${prefix}/${parts.join('/')}/${pd.slug}`;
}

function labelBertindak(b: string): string {
  if (b === 'ahli_waris') return 'Ahli Waris';
  if (b === 'kuasa') return 'Pemegang Kuasa';
  return 'Pemilik Langsung';
}

function labelListingDurasi(jenis: string, durasi: number | null): string {
  if (jenis === 'exclusive') return `Exclusive${durasi ? ` — ${durasi} Bulan` : ''}`;
  return 'Open (Tidak Terbatas)';
}

function labelJenisTransaksi(jt: string): string {
  if (jt === 'sewa') return 'Sewa Menyewa';
  return 'Jual Beli';
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
    <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
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
    <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
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
    <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
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
    <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🚀</div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">
          Selamat, properti Anda telah tayang!
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
          <Link
            to={data.property_url}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#1565C0] hover:bg-[#1976D2] transition-colors"
          >
            Lihat Properti Saya <ExternalLink size={16} />
          </Link>
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
function PerjanjianDocument({ data, today }: { data: AgreementData; today: string }) {
  const { owner, properti, pasal } = data;

  const alamatOwner = [
    owner.alamat_ktp,
    owner.rt_rw ? `RT/RW ${owner.rt_rw}` : null,
    owner.kelurahan,
    owner.kecamatan,
  ].filter(Boolean).join(', ');

  return (
    <div className="font-serif text-sm text-[#1a1a1a] leading-relaxed space-y-4">
      {/* ── Header ── */}
      <div className="text-center space-y-1 pb-4 border-b border-gray-300">
        <p className="font-bold text-base uppercase tracking-wide">
          Perjanjian Jasa Pemasaran — Salam Bumi Property
        </p>
        <p className="text-xs text-[#64748B]">
          Jenis: {labelListingDurasi(data.jenis_listing, data.durasi_kontrak)}&nbsp;·&nbsp;
          Jenis Perjanjian: {labelJenisTransaksi(data.jenis_transaksi)}&nbsp;·&nbsp;
          Nomor: {data.kode_perjanjian}
        </p>
        <p className="text-xs text-[#64748B]">Tanggal: {today}</p>
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
          <p className="text-xs text-[#374151]">NIK: {owner.nik ?? 'Tidak tersedia'}</p>
          <p className="text-xs text-[#374151]">Alamat KTP: {alamatOwner || '-'}</p>
          <p className="text-xs text-[#374151]">
            Bertindak sebagai: {labelBertindak(owner.bertindak_sebagai)}
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
      <div className="grid grid-cols-2 gap-6 pt-2">
        {/* Pihak Pertama */}
        <div className="text-center space-y-2">
          <p className="text-xs text-[#64748B]">Pihak Pertama,</p>
          <p className="text-xs text-[#64748B]">CV Salam Bumi Property</p>
          <div className="h-20 flex items-center justify-center">
            <img
              src={TTD_ARDY_URL}
              alt="TTD Ardy Salam"
              className="max-h-16 max-w-full object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="border-t border-gray-400 pt-1">
            <p className="text-xs font-semibold">Ardy Salam</p>
            <p className="text-xs text-[#64748B]">Direktur</p>
          </div>
        </div>

        {/* Pihak Kedua — placeholder materai + label "TTD di bawah" */}
        <div className="text-center space-y-2">
          <p className="text-xs text-[#64748B]">Pihak Kedua,</p>
          <p className="text-xs text-[#64748B]">{owner.nama_ktp}</p>
          <div className="h-20 flex items-center justify-center">
            <img
              src={MATERAI_URL}
              alt="Materai"
              className="h-16 w-16 object-contain opacity-40"
            />
          </div>
          <div className="border-t border-gray-400 pt-1">
            <p className="text-xs text-[#94A3B8] italic">( tanda tangan di bawah )</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Signature pad area (materai layer + canvas on top)
// ──────────────────────────────────────────────────────────────
interface SigPadProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  hasSigned: boolean;
  onStart: (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onMove:  (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => void;
  onEnd:   () => void;
  onClear: () => void;
}

function SignaturePad({ canvasRef, hasSigned, onStart, onMove, onEnd, onClear }: SigPadProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pen size={18} className="text-[#1565C0]" />
          <span className="font-semibold text-[#0F172A]">Tanda Tangan Pihak Kedua</span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#EF4444] transition-colors"
          type="button"
        >
          <RotateCcw size={14} /> Hapus
        </button>
      </div>

      <p className="text-xs text-[#94A3B8] mb-3">
        Gambar tanda tangan Anda di area abu-abu. Materai tampil sebagai latar — tanda tangan akan menimpa materai secara visual.
      </p>

      {/* Canvas area: materai layer bawah, canvas transparan di atas */}
      <div
        className="relative rounded-xl overflow-hidden border-2 border-dashed border-gray-200"
        style={{ height: 220, background: '#FAFAFA' }}
      >
        {/* Materai — layer bawah, centered */}
        <img
          src={MATERAI_URL}
          alt="Materai"
          className="absolute pointer-events-none select-none"
          style={{
            width: 120, height: 120,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.55,
          }}
        />

        {/* Canvas — transparent, di atas materai */}
        <canvas
          ref={canvasRef}
          width={800}
          height={220}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          style={{ zIndex: 1 }}
          onMouseDown={onStart}
          onMouseMove={onMove}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
        />
      </div>

      <p className={`text-center text-xs mt-2 transition-colors ${hasSigned ? 'text-[#10B981]' : 'text-[#94A3B8]'}`}>
        {hasSigned ? '✓ Tanda tangan berhasil direkam' : 'Area tanda tangan di atas'}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const isDrawingRef = useRef(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const today = formatTanggalId();

  // Fetch agreement on mount
  useEffect(() => {
    if (!token) { setState({ kind: 'not_found' }); return; }

    fetch(`/api/sign/${token}`)
      .then(r => r.json())
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

  // Canvas helpers — must scale mouse coords to canvas buffer size
  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawingRef.current = true;
    lastPos.current = getPos(e);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSigned(true);
  }, [getPos]);

  const endDraw = useCallback(() => { isDrawingRef.current = false; lastPos.current = null; }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (state.kind !== 'valid') return;
    const canvas = canvasRef.current;
    if (!canvas || !hasSigned || !agreed) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: dataUrl, persetujuan: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal mengirim tanda tangan');
      const d = json.data;
      const propertyUrl = buildPropertyUrl(state.data.properti);
      setState({
        kind: 'success',
        property_url: propertyUrl,
        kode_perjanjian: d.kode_perjanjian,
        token: token!,
        pdf_tersedia: d.pdf_tersedia === true,
      });
    } catch (err: any) {
      setSubmitError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [state, token, hasSigned, agreed]);

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
    <div className="min-h-screen pt-16 pb-16" style={{ background: '#F0F4F8' }}>
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
              <div className="text-xs text-[#64748B]">Nomor: {data.kode_perjanjian} · Fee: {data.fee_persen}% · Harga: {formatRupiah(data.properti.harga)}</div>
            </div>
          </div>
          {/* Scrollable document area */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            <PerjanjianDocument data={data} today={today} />
          </div>
        </div>

        {/* Signature pad */}
        <SignaturePad
          canvasRef={canvasRef}
          hasSigned={hasSigned}
          onStart={startDraw}
          onMove={draw}
          onEnd={endDraw}
          onClear={clearCanvas}
        />

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
            ↑ Gambar tanda tangan Anda di area di atas untuk mengaktifkan tombol kirim
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

        <p className="text-center text-xs text-[#94A3B8]">
          <Shield size={12} className="inline mr-1" />
          Data Anda dilindungi sesuai UU PDP RI · Tanda tangan dienkripsi dan disimpan dengan aman
        </p>
      </div>
    </div>
  );
}
