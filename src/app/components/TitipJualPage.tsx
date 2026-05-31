import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import { Check, ChevronRight, Upload, X, Eye, EyeOff } from 'lucide-react';

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

function Step1({ onNext }: { onNext: (data: Record<string, string>) => void }) {
  const [form, setForm] = useState({ nama: '', nik: '', alamat: '', rt: '', rw: '', kelurahan: '', kecamatan: '', bertindak: '', wa1: '', wa2: '' });
  const [showNIK, setShowNIK] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nama) e.nama = 'Nama wajib diisi';
    if (!form.nik || form.nik.length !== 16) e.nik = 'NIK harus 16 digit';
    if (!form.alamat) e.alamat = 'Alamat wajib diisi';
    if (!form.bertindak) e.bertindak = 'Wajib dipilih';
    if (!form.wa1) e.wa1 = 'Nomor WA wajib diisi';
    if (!consent) e.consent = 'Wajib menyetujui kebijakan privasi';
    return e;
  };

  const handleNext = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onNext(form);
  };

  const f = (k: string, v: string) => { setForm(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const inputClass = (k: string) => `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] transition-all ${errors[k] ? 'border-red-400 bg-red-50' : 'border-gray-200'}`;

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Data Diri Pemilik</h2>
      <p className="text-sm text-[#64748B] mb-6">Isi sesuai KTP yang masih berlaku.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama Lengkap (KTP) *</label>
          <input value={form.nama} onChange={e => f('nama', e.target.value)} placeholder="Sesuai KTP" className={inputClass('nama')} />
          {errors.nama && <p className="text-red-500 text-xs mt-1">{errors.nama}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">NIK (KTP) *</label>
          <div className="relative">
            <input
              type={showNIK ? 'text' : 'password'}
              value={form.nik}
              onChange={e => f('nik', e.target.value.replace(/\D/g, '').slice(0, 16))}
              placeholder="16 digit NIK"
              className={inputClass('nik')}
            />
            <button type="button" onClick={() => setShowNIK(!showNIK)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showNIK ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.nik && <p className="text-red-500 text-xs mt-1">{errors.nik}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alamat Lengkap (KTP) *</label>
          <textarea value={form.alamat} onChange={e => f('alamat', e.target.value)} rows={3} placeholder="Alamat sesuai KTP" className={`${inputClass('alamat')} resize-none`} />
          {errors.alamat && <p className="text-red-500 text-xs mt-1">{errors.alamat}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">RT *</label>
            <input value={form.rt} onChange={e => f('rt', e.target.value)} placeholder="001" className={inputClass('rt')} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">RW *</label>
            <input value={form.rw} onChange={e => f('rw', e.target.value)} placeholder="002" className={inputClass('rw')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Kelurahan/Desa *</label>
            <input value={form.kelurahan} onChange={e => f('kelurahan', e.target.value)} placeholder="Kelurahan" className={inputClass('kelurahan')} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Kecamatan *</label>
            <input value={form.kecamatan} onChange={e => f('kecamatan', e.target.value)} placeholder="Kecamatan" className={inputClass('kecamatan')} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Bertindak Sebagai *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {['Owner Sah (Pemilik Langsung)', 'Pasangan (Suami/Istri)', 'Ahli Waris', 'Lainnya (Broker/Perantara)'].map(o => (
              <label key={o} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${form.bertindak === o ? 'border-[#1565C0] bg-[#E3F2FD]' : 'border-gray-200 hover:border-[#1565C0]'}`}>
                <input type="radio" name="bertindak" value={o} checked={form.bertindak === o} onChange={e => f('bertindak', e.target.value)} className="accent-[#1565C0]" />
                <span className="text-sm">{o}</span>
              </label>
            ))}
          </div>
          {errors.bertindak && <p className="text-red-500 text-xs mt-1">{errors.bertindak}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 1 *</label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={form.wa1} onChange={e => f('wa1', e.target.value)} placeholder="81391278889" className={`${inputClass('wa1')} rounded-l-none`} />
            </div>
            {errors.wa1 && <p className="text-red-500 text-xs mt-1">{errors.wa1}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WA Aktif 2 <span className="font-normal text-gray-400">(Opsional)</span></label>
            <div className="flex">
              <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500">+62</span>
              <input value={form.wa2} onChange={e => f('wa2', e.target.value)} placeholder="Opsional" className="w-full border border-gray-200 rounded-r-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
            </div>
          </div>
        </div>

        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer ${errors.consent ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-[#1565C0]'} transition-all`}>
          <input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); setErrors(prev => ({ ...prev, consent: '' })); }} className="mt-0.5 w-4 h-4 accent-[#1565C0] flex-shrink-0" />
          <span className="text-xs text-[#64748B] leading-relaxed">
            Saya menyetujui <Link to="/privacy" className="text-[#1565C0] hover:underline">Kebijakan Privasi</Link> SBP dan mengizinkan penggunaan data pribadi saya untuk keperluan pemasaran properti. (UU PDP)
          </span>
        </label>
        {errors.consent && <p className="text-red-500 text-xs -mt-2">{errors.consent}</p>}
      </div>

      <button onClick={handleNext} className="w-full mt-6 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all"
        style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
        Lanjut ke Info Properti <ChevronRight size={18} />
      </button>
    </div>
  );
}

function Step2({ kode, onBack, onSubmit }: { kode: string; onBack: () => void; onSubmit: () => void }) {
  const [tujuan, setTujuan] = useState('Dijual');
  const [harga, setHarga] = useState('');
  const [kondisi, setKondisi] = useState('Nego');
  const [alamat, setAlamat] = useState('');
  const [gmaps, setGmaps] = useState('');
  const [jenis, setJenis] = useState('');
  const [legalitas, setLegalitas] = useState('');
  const [statusLegal, setStatusLegal] = useState('On Hand');
  const [lingkungan, setLingkungan] = useState('');
  const [infoTambahan, setInfoTambahan] = useState('');
  const [alasanJual, setAlasanJual] = useState('');
  const [lt, setLt] = useState('');
  const [lb, setLb] = useState('');
  const [kt, setKt] = useState('');
  const [km, setKm] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!tujuan || !harga || !jenis || !legalitas || !statusLegal || !lingkungan || !alamat) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onSubmit(); }, 1500);
  };

  const isValid = tujuan && harga && jenis && legalitas && statusLegal && lingkungan && alamat;

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Informasi Properti</h2>
      <p className="text-sm text-[#64748B] mb-2">Lengkapi data properti yang ingin Anda pasarkan.</p>

      <div className="flex items-center gap-2 mb-6 px-4 py-2 bg-[#F0F4F8] rounded-xl">
        <span className="text-xs text-[#64748B]">Kode Listing:</span>
        <span className="font-mono font-bold text-[#1565C0] text-sm">{kode}</span>
      </div>

      <div className="space-y-4">
        {/* Tujuan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Tujuan *</label>
          <div className="flex gap-2">
            {['Dijual', 'Disewakan', 'Dijual & Disewakan'].map(t => (
              <button key={t} onClick={() => setTujuan(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${tujuan === t ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Harga */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Harga Penawaran (Rp) *</label>
          <input value={harga} onChange={e => setHarga(e.target.value)} type="number" placeholder="Contoh: 850000000"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
        </div>

        {/* Kondisi */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Kondisi Harga *</label>
          <div className="flex gap-2">
            {['Nego', 'Nett'].map(k => (
              <button key={k} onClick={() => setKondisi(k)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${kondisi === k ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* Alamat */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alamat Lengkap Properti *</label>
          <textarea value={alamat} onChange={e => setAlamat(e.target.value)} rows={2} placeholder="Alamat properti"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] resize-none" />
        </div>

        {/* Google Maps */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Link Google Maps *</label>
          <input value={gmaps} onChange={e => setGmaps(e.target.value)} placeholder="https://maps.google.com/..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
        </div>

        {/* Jenis Properti */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Jenis Properti *</label>
          <select value={jenis} onChange={e => setJenis(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] appearance-none">
            <option value="">-- Pilih Jenis --</option>
            {['Rumah', 'Kost', 'Tanah', 'Hotel', 'Homestay', 'Villa', 'Apartemen', 'Gudang', 'Komersial Lainnya'].map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>

        {/* Conditional fields */}
        {jenis && jenis !== 'Tanah' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Tanah (m²)</label>
              <input type="number" value={lt} onChange={e => setLt(e.target.value)} placeholder="m²"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] mb-1">Luas Bangunan (m²)</label>
              <input type="number" value={lb} onChange={e => setLb(e.target.value)} placeholder="m²"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
            </div>
            {jenis !== 'Apartemen' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Jumlah KT</label>
                  <input type="number" value={kt} onChange={e => setKt(e.target.value)} placeholder="Kamar Tidur"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Jumlah KM</label>
                  <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="Kamar Mandi"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
                </div>
              </>
            )}
          </div>
        )}

        {/* Legalitas */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Legalitas *</label>
          <select value={legalitas} onChange={e => setLegalitas(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] appearance-none">
            <option value="">-- Pilih Legalitas --</option>
            {['SHM & IMB/PBG Lengkap', 'SHGB & IMB/PBG Lengkap', 'SHM Pekarangan Saja Tanpa IMB/PBG', 'SHM Sawah/Tegalan', 'SHGB Saja Tanpa IMB/PBG', 'Girik/Letter C/PPJB/dll', 'Izin Usaha'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Status Legalitas */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Status Legalitas *</label>
          <div className="flex gap-2">
            {['On Hand', 'On Bank'].map(s => (
              <button key={s} onClick={() => setStatusLegal(s)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${statusLegal === s ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Lingkungan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Lingkungan *</label>
          <select value={lingkungan} onChange={e => setLingkungan(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] appearance-none">
            <option value="">-- Pilih --</option>
            <option value="Jauh dari Semuanya">Jauh dari Semuanya</option>
            <option value="Dekat Sungai">Dekat Sungai</option>
            <option value="Dekat Makam">Dekat Makam</option>
            <option value="Dekat Sutet">Dekat Sutet</option>
          </select>
        </div>

        {/* Upload Foto */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-2">Upload Foto Properti *</label>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-[#1565C0] transition-colors cursor-pointer">
            <Upload size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-[#64748B]">Drag & drop foto di sini, atau klik untuk memilih</p>
            <p className="text-xs text-gray-400 mt-1">JPG/PNG/WEBP, maks 20 foto, maks 8MB/foto. Foto pertama jadi cover.</p>
          </div>
        </div>

        {/* Info Tambahan */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Informasi Tambahan & Fasilitas</label>
          <textarea value={infoTambahan} onChange={e => setInfoTambahan(e.target.value)} rows={3} placeholder="Fasilitas, kondisi, informasi lain"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] resize-none" />
        </div>

        {/* Alasan Dijual */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alasan Dijual</label>
          <textarea value={alasanJual} onChange={e => setAlasanJual(e.target.value)} rows={2} placeholder="Opsional"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] resize-none" />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="px-6 py-3 rounded-xl font-semibold border border-gray-200 text-gray-600 hover:border-[#1565C0] transition-colors">
          ← Kembali
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
            isValid && !loading ? 'hover:brightness-110' : 'opacity-60 cursor-not-allowed'
          }`}
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Memproses...
            </>
          ) : '📄 Kirim Properti →'}
        </button>
      </div>
    </div>
  );
}

function SuccessPage({ kode }: { kode: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">✅</div>
      <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Properti Berhasil Terkirim! 🎉</h2>
      <p className="text-[#64748B] leading-relaxed mb-2">
        Terima kasih! Tim Salam Bumi Property telah menerima data properti Anda dengan Kode Listing:
      </p>
      <div className="inline-block px-6 py-3 bg-[#E3F2FD] rounded-xl mb-4">
        <span className="font-mono font-bold text-[#1565C0] text-lg">{kode}</span>
      </div>
      <p className="text-[#64748B] text-sm mb-8">
        Kami akan menghubungi Anda via WhatsApp dalam <strong>1×24 jam</strong> untuk proses selanjutnya.
      </p>
      <p className="text-xs text-gray-400 mb-8 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
        📋 Belum ada yang tampil di website — properti baru tayang setelah Anda menandatangani perjanjian via link dari admin.
      </p>
      <Link to="/" className="inline-block px-6 py-3 rounded-xl font-semibold border border-[#1565C0] text-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
        ← Kembali ke Beranda
      </Link>
    </div>
  );
}

export default function TitipJualPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Record<string, string>>({});
  const [kode] = useState(() => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    return `SBP-${dateStr}-${rand}`;
  });

  const path = location.pathname;
  const isSukses = path.includes('sukses');

  const handleStep1 = (data: Record<string, string>) => {
    setStep1Data(data);
    setStep(2);
    navigate('/titip-jual/info-properti');
  };

  const handleSubmit = () => {
    navigate('/titip-jual/sukses');
  };

  return (
    <div className="pt-16 min-h-screen" style={{ background: '#F0F4F8' }}>
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        {!isSukses && (
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">Titip Jual Properti</h1>
            <p className="text-[#64748B] text-sm mt-1">Pasarkan properti Anda bersama tim SBP</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          {isSukses ? (
            <SuccessPage kode={kode} />
          ) : (
            <>
              <Stepper step={step} />
              {step === 1 ? (
                <Step1 onNext={handleStep1} />
              ) : (
                <Step2 kode={kode} onBack={() => { setStep(1); navigate('/titip-jual/data-diri'); }} onSubmit={handleSubmit} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
