import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router';
import { CheckCircle, AlertTriangle, Clock, Pen, RotateCcw, FileText, Shield } from 'lucide-react';

const MOCK_AGREEMENTS: Record<string, { status: 'valid' | 'expired' | 'used'; nama: string; nik: string; properti: string; kode: string; tanggal: string }> = {
  'sbp-token-abc123': { status: 'valid', nama: 'Budi Santoso', nik: '3471012345678901', properti: 'Rumah 2 Lantai di Condongcatur, Sleman', kode: 'SBP-2024-001', tanggal: '31 Mei 2026' },
  'sbp-token-expired': { status: 'expired', nama: 'Siti Rahayu', nik: '3471098765432100', properti: 'Kost Exclusive di Mlati', kode: 'SBP-2024-002', tanggal: '01 Januari 2024' },
  'sbp-token-used': { status: 'used', nama: 'Ahmad Fauzi', nik: '3471011122334455', properti: 'Villa di Ngemplak', kode: 'SBP-2024-003', tanggal: '15 Maret 2024' },
};

const PERJANJIAN_TEXT = `PERJANJIAN KERJASAMA PEMASARAN PROPERTI

Yang bertanda tangan di bawah ini:

Pihak Pertama (Agen):
Nama          : CV Salam Bumi Property
Alamat        : Jl. Pajajaran, Catur Tunggal, Depok, Sleman, DI Yogyakarta
Telepon/WA    : 0813-9127-8889

Pihak Kedua (Pemilik):
Nama          : {NAMA}
No. KTP (NIK) : {NIK}

Bersepakat untuk mengadakan Perjanjian Kerjasama Pemasaran Properti dengan ketentuan sebagai berikut:

PASAL 1 — OBYEK PERJANJIAN

Pihak Kedua mempercayakan pemasaran properti miliknya kepada Pihak Pertama, dengan detail:
- Jenis Properti  : {PROPERTI}
- Kode Listing    : {KODE}

PASAL 2 — RUANG LINGKUP KERJASAMA

Pihak Pertama bersedia melakukan:
a. Pemasaran properti secara digital melalui website resmi SBP, media sosial, dan platform properti nasional;
b. Pemotretan/dokumentasi profesional properti (sesuai kesepakatan);
c. Pendampingan proses negoisasi antara pemilik dan calon pembeli/penyewa;
d. Koordinasi proses legalitas (AJB, balik nama, dsb.) bersama notaris/PPAT rekanan;
e. Pelaporan perkembangan pemasaran secara berkala.

PASAL 3 — FEE / KOMISI AGEN

Pihak Kedua setuju membayar komisi kepada Pihak Pertama sebesar yang telah disepakati bersama secara lisan/tertulis sebelum penandatanganan perjanjian ini, atas keberhasilan transaksi jual beli atau sewa properti yang dimaksud.

PASAL 4 — KEWAJIBAN PIHAK KEDUA

Pihak Kedua berkewajiban untuk:
a. Memberikan informasi dan dokumen properti yang benar dan lengkap;
b. Tidak memasarkan properti secara paralel melalui agen lain tanpa sepengetahuan Pihak Pertama selama masa perjanjian ini berlaku;
c. Memberikan akses kepada Pihak Pertama untuk melakukan survei dan pemotretan properti;
d. Segera menginformasikan kepada Pihak Pertama apabila terdapat perubahan kondisi atau status properti.

PASAL 5 — MASA BERLAKU

Perjanjian ini berlaku selama 3 (tiga) bulan sejak tanggal ditandatangani dan dapat diperpanjang atas kesepakatan kedua belah pihak.

PASAL 6 — KERAHASIAAN DATA

Pihak Pertama berkomitmen menjaga kerahasiaan data pribadi Pihak Kedua sesuai dengan Undang-Undang Pelindungan Data Pribadi (UU PDP) Republik Indonesia. Data NIK/KTP dienkripsi dan hanya digunakan untuk keperluan perjanjian ini.

PASAL 7 — PENYELESAIAN SENGKETA

Apabila terdapat perselisihan, kedua belah pihak sepakat untuk menyelesaikannya secara musyawarah mufakat. Apabila tidak tercapai, penyelesaian dilakukan melalui Pengadilan Negeri Sleman.

PASAL 8 — TANDA TANGAN ELEKTRONIK

Tanda tangan pada perjanjian ini dilakukan secara elektronik dan memiliki kekuatan hukum yang sama dengan tanda tangan konvensional sesuai UU ITE No. 11 Tahun 2008 dan perubahannya.

Demikian perjanjian ini dibuat dengan penuh kesadaran dan tanpa paksaan dari pihak mana pun.

Yogyakarta, {TANGGAL}

Pihak Pertama,                    Pihak Kedua,
CV Salam Bumi Property             {NAMA}

Monica Dewi Rahayu                 ___________________
Direktur`;

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const data = token ? MOCK_AGREEMENTS[token] : null;

  const perjanjianFilled = data
    ? PERJANJIAN_TEXT
        .replace(/{NAMA}/g, data.nama)
        .replace(/{NIK}/g, data.nik.replace(/(\d{8})(\d+)/, '$1****'))
        .replace(/{PROPERTI}/g, data.properti)
        .replace(/{KODE}/g, data.kode)
        .replace(/{TANGGAL}/g, data.tanggal)
    : '';

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSigned(true);
  };

  const endDraw = () => { setIsDrawing(false); lastPos.current = null; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleSubmit = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setSubmitted(true); }, 2000);
  };

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
        <div className="text-center max-w-md">
          <AlertTriangle size={48} className="text-[#EF4444] mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Link Tidak Valid</h1>
          <p className="text-[#64748B] mb-6">Link tanda tangan ini tidak ditemukan atau sudah tidak berlaku.</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#1565C0]">Ke Beranda</Link>
        </div>
      </div>
    );
  }

  if (data.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
        <div className="text-center max-w-md">
          <Clock size={48} className="text-[#F5A623] mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Link Sudah Kadaluarsa</h1>
          <p className="text-[#64748B] mb-6">Link tanda tangan ini sudah melewati batas waktu. Silakan hubungi tim SBP untuk mendapatkan link baru.</p>
          <a href="https://wa.me/6281391278889?text=Halo SBP, link tanda tangan saya sudah expired" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#10B981]">
            Hubungi SBP via WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (data.status === 'used') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
        <div className="text-center max-w-md">
          <CheckCircle size={48} className="text-[#10B981] mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Perjanjian Sudah Ditandatangani</h1>
          <p className="text-[#64748B] mb-6">Perjanjian untuk listing <strong>{data.kode}</strong> sudah pernah ditandatangani sebelumnya. Hubungi tim SBP jika ada pertanyaan.</p>
          <a href="https://wa.me/6281391278889" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#1565C0]">
            Hubungi SBP
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 pt-16" style={{ background: '#F0F4F8' }}>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-[#10B981] flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Perjanjian Berhasil Ditandatangani!</h1>
          <p className="text-[#64748B] mb-2">
            Terima kasih, <strong>{data.nama}</strong>. Tanda tangan elektronik Anda telah berhasil direkam.
          </p>
          <p className="text-[#64748B] mb-6 text-sm">
            Kode listing: <span className="font-semibold text-[#1565C0]">{data.kode}</span>. Salinan perjanjian akan dikirimkan via WhatsApp dalam 1×24 jam.
          </p>
          <div className="bg-[#F0FFF4] border border-[#10B981]/30 rounded-xl p-4 text-sm text-[#10B981] mb-6">
            <Shield size={16} className="inline mr-2" />
            Data Anda dilindungi sesuai UU PDP RI
          </div>
          <a href="https://wa.me/6281391278889" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors">
            Hubungi Tim SBP
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 pb-12" style={{ background: '#F0F4F8' }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#E3F2FD] text-[#1565C0] px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <FileText size={14} /> Perjanjian Kerjasama Pemasaran Properti
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-2">Tanda Tangan Elektronik</h1>
          <p className="text-[#64748B] text-sm">Halo <strong>{data.nama}</strong>, silakan baca perjanjian berikut dan berikan tanda tangan Anda.</p>
        </div>

        {/* Info bar */}
        <div className="bg-[#FFF9E6] border border-[#F5A623]/30 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertTriangle size={18} className="text-[#F5A623] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[#92400E]">
            Tanda tangan elektronik ini memiliki kekuatan hukum yang sah sesuai <strong>UU ITE No. 11 Tahun 2008</strong>. Pastikan Anda membaca seluruh isi perjanjian sebelum menandatangani.
          </p>
        </div>

        {/* Perjanjian Document */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-3 p-5 border-b border-gray-100">
            <FileText size={20} className="text-[#1565C0]" />
            <div>
              <div className="font-semibold text-[#0F172A] text-sm">Perjanjian Kerjasama Pemasaran</div>
              <div className="text-xs text-[#64748B]">Kode: {data.kode} · Tanggal: {data.tanggal}</div>
            </div>
          </div>
          <div className="p-5 max-h-80 overflow-y-auto">
            <pre className="whitespace-pre-wrap font-sans text-xs text-[#374151] leading-relaxed">{perjanjianFilled}</pre>
          </div>
        </div>

        {/* Signature Canvas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Pen size={18} className="text-[#1565C0]" />
              <span className="font-semibold text-[#0F172A]">Tanda Tangan Anda</span>
            </div>
            <button onClick={clearCanvas} className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#EF4444] transition-colors">
              <RotateCcw size={14} /> Ulangi
            </button>
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden" style={{ background: '#FAFAFA' }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={180}
              className="w-full touch-none cursor-crosshair"
              style={{ display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          {!hasSigned && (
            <p className="text-center text-xs text-[#94A3B8] mt-3">Gambar tanda tangan Anda di area abu-abu di atas</p>
          )}
          {hasSigned && (
            <p className="text-center text-xs text-[#10B981] mt-3">✓ Tanda tangan berhasil direkam</p>
          )}
        </div>

        {/* Consent */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 flex-shrink-0 w-4 h-4 accent-[#1565C0]"
            />
            <span className="text-sm text-[#374151] leading-relaxed">
              Saya, <strong>{data.nama}</strong>, menyatakan bahwa saya telah membaca, memahami, dan menyetujui seluruh isi perjanjian kerjasama pemasaran properti ini. Saya memberikan tanda tangan ini secara sadar dan tanpa paksaan dari pihak mana pun.
            </span>
          </label>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!hasSigned || !agreed || loading}
          className="w-full py-4 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: hasSigned && agreed ? 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' : '#94A3B8' }}>
          {loading ? (
            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Mengirim...</>
          ) : (
            <><CheckCircle size={18} /> Kirim Perjanjian yang Ditandatangani</>
          )}
        </button>

        <p className="text-center text-xs text-[#94A3B8] mt-4">
          <Shield size={12} className="inline mr-1" />
          Data Anda dilindungi sesuai UU PDP RI · Tanda tangan dienkripsi dan disimpan dengan aman
        </p>
      </div>
    </div>
  );
}
