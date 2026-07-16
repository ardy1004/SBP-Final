import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Edit2, Check, X, AlertCircle, Copy, MessageCircle,
  FileText, ExternalLink, User, Home, Image as ImageIcon, CheckCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgreementDetail {
  id: number;
  kode_perjanjian: string;
  status: string;
  jenis_transaksi: 'jual' | 'sewa';
  jenis_listing: 'open' | 'exclusive' | null;
  durasi_kontrak: number | null;
  fee_persen: number | null;
  sign_token: string | null;
  token_expires_at: string | null;
  token_used: 0 | 1;
  signed_at: string | null;
  pdf_url: string | null;
  link_opened_count: number;
  created_at: string;
  owner: {
    id: number;
    nama_pemilik: string;
    nik: string | null;
    nama_ktp: string | null;
    alamat_ktp: string | null;
    rt_rw: string | null;
    kelurahan: string | null;
    kecamatan: string | null;
    bertindak_sebagai: string | null;
    no_wa_1: string;
    no_wa_2: string | null;
    data_ahli_waris: string | null;
  };
  properti: {
    id: number;
    kode_listing: string;
    title: string;
    slug: string;
    jenis_properti: string;
    tujuan: string;
    harga: number;
    nego: 0 | 1;
    nett: 0 | 1;
    provinsi: string;
    kabupaten: string;
    kecamatan: string;
    kelurahan: string;
    alamat: string | null;
    luas_tanah: number | null;
    luas_bangunan: number | null;
    lebar_depan: number | null;
    lantai: number | null;
    jumlah_kamar_tidur: number | null;
    jumlah_kamar_mandi: number | null;
    legalitas: string | null;
    status_legalitas: string | null;
    deskripsi: string | null;
    status_publish: string;
  };
  foto: Array<{ id: number; url_webp: string; alt_text: string | null; urutan: number; is_cover: 0 | 1 }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  draft:              { label: 'Draft',         bg: '#F1F5F9', text: '#475569' },
  opsi_dikonfigurasi: { label: 'Dikonfigurasi', bg: '#EDE9FE', text: '#5B21B6' },
  menunggu_ttd:       { label: 'Menunggu TTD',  bg: '#FEF9C3', text: '#854D0E' },
  signed:             { label: 'Signed',        bg: '#DCFCE7', text: '#166534' },
  expired:            { label: 'Expired',       bg: '#FEE2E2', text: '#991B1B' },
};

const BERTINDAK_LABELS: Record<string, string> = {
  pemilik_sertifikat: 'Pemilik Sah (sesuai sertifikat)',
  suami_istri:        'Pasangan (suami/istri)',
  ahli_waris:         'Ahli Waris',
  lainnya:            'Lainnya',
};

function propertyUrl(p: { jenis_properti: string; provinsi: string; kabupaten: string; kecamatan: string | null; tujuan: string | null; slug: string }): string {
  const jenis = p.jenis_properti.toLowerCase();
  const prov  = p.provinsi.toLowerCase().replace(/\s+/g, '-');
  const kab   = p.kabupaten.toLowerCase().replace(/\s+/g, '-');
  const kec   = (p.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const base  = p.tujuan === 'disewa' ? '/disewa' : '/dijual';
  return `${base}/${jenis}/${prov}/${kab}/${kec}/${p.slug}`;
}

const TRANSAKSI_LABELS: Record<string, string> = {
  jual: 'Jual/Beli',
  sewa: 'Sewa Menyewa',
};

function formatRupiah(n: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function photoUrl(key: string) {
  return `/api/admin/media?key=${encodeURIComponent(key)}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide sm:w-36 flex-shrink-0 mb-0.5 sm:mb-0 sm:pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-[#0F172A] font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function CardHeader({
  icon: Icon, title, color, onEdit, editLabel = 'Edit',
}: {
  icon: React.FC<{ size?: number; className?: string }>;
  title: string;
  color: string;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={15} className="" style={{ color } as React.CSSProperties} />
        </div>
        <h2 className="font-display font-semibold text-[#0F172A] text-sm">{title}</h2>
      </div>
      {onEdit && (
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#1565C0] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-lg transition-colors">
          <Edit2 size={12} />
          {editLabel}
        </button>
      )}
    </div>
  );
}

function InlineInput({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#64748B] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] focus:ring-1 focus:ring-[#1565C0]/20 transition-colors"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AgreementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Owner edit state
  const [editingOwner, setEditingOwner] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ nama_pemilik: '', nik: '', alamat_ktp: '', no_wa: '' });
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Property edit state
  const [editingProp, setEditingProp] = useState(false);
  const [propForm, setPropForm] = useState({
    jenis_properti: '', harga: '', nego: false, nett: false, kecamatan: '', kabupaten: '',
  });
  const [propSaving, setPropSaving] = useState(false);
  const [propError, setPropError] = useState<string | null>(null);

  // Configure state
  const [configForm, setConfigForm] = useState({
    jenis_listing: 'open', durasi_kontrak: '', fee_persen: '',
  });
  const [configuring, setConfiguring] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Link/WA state
  const [signToken, setSignToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Load detail ─────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/admin/agreements/${id}`, { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Gagal memuat data');
    const d: AgreementDetail = json.data;
    setData(d);
    // Pre-fill owner form
    setOwnerForm({
      nama_pemilik: d.owner.nama_pemilik ?? '',
      nik: d.owner.nik ?? '',
      alamat_ktp: d.owner.alamat_ktp ?? '',
      no_wa: d.owner.no_wa_1 ?? '',
    });
    // Pre-fill property form
    setPropForm({
      jenis_properti: d.properti.jenis_properti ?? '',
      harga: d.properti.harga ? String(d.properti.harga) : '',
      nego: !!d.properti.nego,
      nett: !!d.properti.nett,
      kecamatan: d.properti.kecamatan ?? '',
      kabupaten: d.properti.kabupaten ?? '',
    });
    // Pre-fill config form from existing data
    setConfigForm({
      jenis_listing: d.jenis_listing ?? 'open',
      durasi_kontrak: d.durasi_kontrak ? String(d.durasi_kontrak) : '',
      fee_persen: d.fee_persen ? String(d.fee_persen) : '',
    });
    // Show sign link if already menunggu_ttd
    if (d.sign_token && d.status === 'menunggu_ttd') {
      setSignToken(d.sign_token);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadDetail()
      .catch(err => setError(err.message ?? 'Gagal memuat data'))
      .finally(() => setLoading(false));
  }, [loadDetail]);

  const isEditable = data && ['draft', 'menunggu_ttd'].includes(data.status);

  // ─── Save owner ──────────────────────────────────────────────────
  const handleSaveOwner = async () => {
    setOwnerSaving(true);
    setOwnerError(null);
    try {
      const res = await fetch(`/api/admin/agreements/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_pemilik: ownerForm.nama_pemilik,
          nik: ownerForm.nik,
          alamat_ktp: ownerForm.alamat_ktp,
          no_wa: ownerForm.no_wa,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await loadDetail();
        setEditingOwner(false);
      } else {
        setOwnerError(json.error ?? 'Gagal menyimpan');
      }
    } catch {
      setOwnerError('Gagal menyimpan perubahan');
    } finally {
      setOwnerSaving(false);
    }
  };

  // ─── Save property ───────────────────────────────────────────────
  const handleSaveProp = async () => {
    setPropSaving(true);
    setPropError(null);
    try {
      const hargaNum = parseInt(propForm.harga, 10);
      const res = await fetch(`/api/admin/agreements/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jenis_properti: propForm.jenis_properti,
          harga: isNaN(hargaNum) ? undefined : hargaNum,
          nego: propForm.nego,
          nett: propForm.nett,
          kecamatan: propForm.kecamatan,
          kabupaten: propForm.kabupaten,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await loadDetail();
        setEditingProp(false);
      } else {
        setPropError(json.error ?? 'Gagal menyimpan');
      }
    } catch {
      setPropError('Gagal menyimpan perubahan');
    } finally {
      setPropSaving(false);
    }
  };

  // ─── Configure + Generate Link ───────────────────────────────────
  const handleConfigure = async () => {
    setConfiguring(true);
    setConfigError(null);
    const payload: Record<string, unknown> = {
      jenis_listing: configForm.jenis_listing,
      fee_persen: parseFloat(configForm.fee_persen),
    };
    if (configForm.jenis_listing === 'exclusive' && configForm.durasi_kontrak) {
      payload.durasi_kontrak = parseInt(configForm.durasi_kontrak, 10);
    }
    try {
      const res = await fetch(`/api/admin/agreements/${id}/configure`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSignToken(json.data.sign_token);
        await loadDetail();
      } else {
        const details = json.details
          ? Object.values(json.details).join('; ')
          : json.error ?? 'Gagal generate link';
        setConfigError(details);
      }
    } catch {
      setConfigError('Gagal menghubungi server');
    } finally {
      setConfiguring(false);
    }
  };

  // ─── Copy link ───────────────────────────────────────────────────
  const handleCopy = () => {
    if (!signToken) return;
    const url = `${window.location.origin}/sign/${signToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Loading / Error ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-7 h-7 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <AlertCircle size={28} className="text-[#EF4444] mb-3" />
        <p className="text-[#64748B] text-sm">{error ?? 'Data tidak ditemukan'}</p>
        <button onClick={() => navigate('/admin/agreements')}
          className="mt-4 text-sm text-[#1565C0] hover:underline">
          ← Kembali ke daftar
        </button>
      </div>
    );
  }

  const sc = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.draft;
  const signUrl = signToken ? `${window.location.origin}/sign/${signToken}` : null;
  const waUrl = signUrl && data.owner.no_wa_1
    ? `https://wa.me/${data.owner.no_wa_1}?text=${encodeURIComponent(
        `Halo ${data.owner.nama_pemilik}, berikut link perjanjian pemasaran properti Anda dengan Salam Bumi Property: ${signUrl} — mohon ditandatangani. Terima kasih.`
      )}`
    : null;

  const isSigned = data.status === 'signed';

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/admin/agreements')}
          className="p-2 rounded-xl text-[#64748B] hover:bg-white hover:text-[#0F172A] transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-lg font-bold text-[#0F172A]">{data.kode_perjanjian}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: sc.bg, color: sc.text }}>
              {sc.label}
            </span>
          </div>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Masuk: {formatDate(data.created_at)}
            {data.signed_at ? ` · Signed: ${formatDateTime(data.signed_at)}` : ''}
          </p>
        </div>
      </div>

      {/* ─── Owner Card ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <CardHeader
          icon={User} title="Data Pemilik / Owner" color="#1565C0"
          onEdit={isEditable && !editingOwner ? () => setEditingOwner(true) : undefined}
        />

        {editingOwner ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InlineInput label="Nama Pemilik" value={ownerForm.nama_pemilik}
                onChange={v => setOwnerForm(f => ({ ...f, nama_pemilik: v }))} />
              <InlineInput label="NIK (16 digit)" value={ownerForm.nik}
                onChange={v => setOwnerForm(f => ({ ...f, nik: v }))} placeholder="0000000000000000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Alamat KTP</label>
              <textarea
                value={ownerForm.alamat_ktp}
                onChange={e => setOwnerForm(f => ({ ...f, alamat_ktp: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] focus:ring-1 focus:ring-[#1565C0]/20 transition-colors resize-none"
              />
            </div>
            <InlineInput label="Nomor WhatsApp" value={ownerForm.no_wa}
              onChange={v => setOwnerForm(f => ({ ...f, no_wa: v }))} placeholder="08xxxxxxxxxx" />
            {ownerError && (
              <p className="text-xs text-[#EF4444] flex items-center gap-1">
                <AlertCircle size={12} /> {ownerError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSaveOwner} disabled={ownerSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] disabled:opacity-60 transition-colors">
                {ownerSaving
                  ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check size={13} />}
                Simpan Koreksi
              </button>
              <button onClick={() => { setEditingOwner(false); setOwnerError(null); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-colors">
                <X size={13} /> Batal
              </button>
            </div>
          </div>
        ) : (
          <dl className="space-y-2.5">
            <InfoRow label="Nama Pemilik" value={data.owner.nama_pemilik} />
            <InfoRow label="NIK" value={data.owner.nik
              ? <span className="font-mono tracking-widest">{data.owner.nik}</span>
              : <span className="text-[#94A3B8] italic text-xs">Tidak tersedia</span>} />
            <InfoRow label="Nama KTP" value={data.owner.nama_ktp} />
            <InfoRow label="Alamat KTP" value={data.owner.alamat_ktp} />
            {data.owner.rt_rw && <InfoRow label="RT/RW" value={data.owner.rt_rw} />}
            {(data.owner.kelurahan || data.owner.kecamatan) && (
              <InfoRow label="Kelurahan/Kec." value={[data.owner.kelurahan, data.owner.kecamatan].filter(Boolean).join(', ')} />
            )}
            <InfoRow label="Bertindak Sebagai" value={BERTINDAK_LABELS[data.owner.bertindak_sebagai ?? ''] ?? data.owner.bertindak_sebagai} />
            <InfoRow label="WhatsApp" value={
              <a href={`https://wa.me/${data.owner.no_wa_1}`} target="_blank" rel="noopener noreferrer"
                className="text-[#10B981] hover:underline">
                {data.owner.no_wa_1}
              </a>
            } />
            {data.owner.no_wa_2 && <InfoRow label="WA Kedua" value={data.owner.no_wa_2} />}
          </dl>
        )}
      </div>

      {/* ─── Property Card ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <CardHeader
          icon={Home} title="Data Properti" color="#10B981"
          onEdit={isEditable && !editingProp ? () => setEditingProp(true) : undefined}
        />

        {editingProp ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Jenis Properti</label>
                <select value={propForm.jenis_properti}
                  onChange={e => setPropForm(f => ({ ...f, jenis_properti: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white">
                  {['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'].map(j => (
                    <option key={j} value={j}>{j.charAt(0).toUpperCase() + j.slice(1)}</option>
                  ))}
                </select>
              </div>
              <InlineInput label="Harga (Rp)" value={propForm.harga} type="number"
                onChange={v => setPropForm(f => ({ ...f, harga: v }))} />
              <InlineInput label="Kecamatan" value={propForm.kecamatan}
                onChange={v => setPropForm(f => ({ ...f, kecamatan: v }))} />
              <InlineInput label="Kabupaten / Kota" value={propForm.kabupaten}
                onChange={v => setPropForm(f => ({ ...f, kabupaten: v }))} />
            </div>
            <div className="flex gap-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={propForm.nego}
                  onChange={e => setPropForm(f => ({ ...f, nego: e.target.checked }))}
                  className="accent-[#1565C0]" />
                Nego
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={propForm.nett}
                  onChange={e => setPropForm(f => ({ ...f, nett: e.target.checked }))}
                  className="accent-[#1565C0]" />
                Nett
              </label>
            </div>
            {propError && (
              <p className="text-xs text-[#EF4444] flex items-center gap-1">
                <AlertCircle size={12} /> {propError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSaveProp} disabled={propSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] disabled:opacity-60 transition-colors">
                {propSaving
                  ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check size={13} />}
                Simpan Koreksi
              </button>
              <button onClick={() => { setEditingProp(false); setPropError(null); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] bg-gray-100 hover:bg-gray-200 transition-colors">
                <X size={13} /> Batal
              </button>
            </div>
          </div>
        ) : (
          <dl className="space-y-2.5">
            <InfoRow label="Kode Listing" value={<span className="font-mono text-xs">{data.properti.kode_listing}</span>} />
            <InfoRow label="Judul" value={data.properti.title} />
            <InfoRow label="Jenis Properti" value={<span className="capitalize">{data.properti.jenis_properti}</span>} />
            <InfoRow label="Tujuan" value={<span className="capitalize">{data.properti.tujuan?.replace('_', ' ')}</span>} />
            <InfoRow label="Harga" value={
              <span className="font-semibold">
                {formatRupiah(data.properti.harga)}
                {data.properti.nego ? ' (Nego)' : data.properti.nett ? ' (Nett)' : ''}
              </span>
            } />
            <InfoRow label="Lokasi" value={
              [data.properti.kecamatan, data.properti.kabupaten, data.properti.provinsi].filter(Boolean).join(', ')
            } />
            {(data.properti.luas_tanah || data.properti.luas_bangunan) && (
              <InfoRow label="Luas" value={[
                data.properti.luas_tanah ? `LT ${data.properti.luas_tanah}m²` : null,
                data.properti.luas_bangunan ? `LB ${data.properti.luas_bangunan}m²` : null,
              ].filter(Boolean).join(' · ')} />
            )}
            {(data.properti.jumlah_kamar_tidur || data.properti.jumlah_kamar_mandi) && (
              <InfoRow label="Kamar" value={[
                data.properti.jumlah_kamar_tidur ? `${data.properti.jumlah_kamar_tidur} KT` : null,
                data.properti.jumlah_kamar_mandi ? `${data.properti.jumlah_kamar_mandi} KM` : null,
              ].filter(Boolean).join(' · ')} />
            )}
            {data.properti.legalitas && <InfoRow label="Legalitas" value={data.properti.legalitas} />}
            {data.properti.deskripsi && (
              <InfoRow label="Deskripsi" value={<span className="text-sm text-[#374151] line-clamp-3">{data.properti.deskripsi}</span>} />
            )}
            <InfoRow label="Status Publish" value={
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                data.properti.status_publish === 'published'
                  ? 'bg-[#DCFCE7] text-[#166534]'
                  : 'bg-[#F1F5F9] text-[#475569]'
              }`}>
                {data.properti.status_publish === 'published' ? 'Published' : 'Draft'}
              </span>
            } />
          </dl>
        )}
      </div>

      {/* ─── Photo Gallery ───────────────────────────────────────── */}
      {data.foto.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#F5A62320]">
              <ImageIcon size={15} className="text-[#F5A623]" />
            </div>
            <h2 className="font-display font-semibold text-[#0F172A] text-sm">
              Foto Properti ({data.foto.length})
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {data.foto.map(foto => (
              <div key={foto.id} className="relative aspect-square rounded-xl overflow-hidden bg-[#F1F5F9]">
                <img
                  src={photoUrl(foto.url_webp)}
                  alt={foto.alt_text ?? 'Foto properti'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                {foto.is_cover === 1 && (
                  <div className="absolute top-1 left-1 bg-[#1565C0] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                    Cover
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Configure Section (only if not signed) ─────────────── */}
      {!isSigned && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#7C3AED20]">
              <FileText size={15} className="text-[#7C3AED]" />
            </div>
            <h2 className="font-display font-semibold text-[#0F172A] text-sm">Konfigurasi Perjanjian</h2>
          </div>

          <div className="space-y-4">
            {/* Jenis Transaksi — read-only */}
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-1">
                Jenis Transaksi (otomatis)
              </label>
              <div className="px-3 py-2 bg-[#F8FAFC] border border-gray-200 rounded-xl text-sm text-[#475569] font-medium">
                {TRANSAKSI_LABELS[data.jenis_transaksi] ?? data.jenis_transaksi}
              </div>
            </div>

            {/* Jenis Listing — radio */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] uppercase tracking-wide mb-2">
                Jenis Listing <span className="text-[#EF4444]">*</span>
              </label>
              <div className="flex gap-4">
                {([['open', 'Open Listing'], ['exclusive', 'Exclusive Listing']] as const).map(([val, lbl]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="jenis_listing"
                      value={val}
                      checked={configForm.jenis_listing === val}
                      onChange={() => setConfigForm(f => ({
                        ...f, jenis_listing: val,
                        durasi_kontrak: val === 'open' ? '' : f.durasi_kontrak,
                      }))}
                      className="accent-[#1565C0] w-4 h-4"
                    />
                    <span className="text-sm text-[#374151] font-medium">{lbl}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Durasi — conditional */}
            {configForm.jenis_listing === 'exclusive' && (
              <div>
                <label className="block text-xs font-medium text-[#64748B] uppercase tracking-wide mb-2">
                  Durasi Kontrak <span className="text-[#EF4444]">*</span>
                </label>
                <div className="flex gap-3 flex-wrap">
                  {([3, 6, 12] as const).map(bulan => (
                    <label key={bulan} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="durasi_kontrak"
                        value={String(bulan)}
                        checked={configForm.durasi_kontrak === String(bulan)}
                        onChange={() => setConfigForm(f => ({ ...f, durasi_kontrak: String(bulan) }))}
                        className="accent-[#1565C0] w-4 h-4"
                      />
                      <span className="text-sm text-[#374151] font-medium">{bulan} Bulan</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Fee */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] uppercase tracking-wide mb-1">
                Fee Pemasaran (%) <span className="text-[#EF4444]">*</span>
              </label>
              <div className="flex items-center gap-2 max-w-48">
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  max="20"
                  value={configForm.fee_persen}
                  onChange={e => setConfigForm(f => ({ ...f, fee_persen: e.target.value }))}
                  placeholder="mis. 3 atau 2.5"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] focus:ring-1 focus:ring-[#1565C0]/20 transition-colors"
                />
                <span className="text-sm font-semibold text-[#64748B]">%</span>
              </div>
            </div>

            {configError && (
              <p className="text-xs text-[#EF4444] flex items-center gap-1">
                <AlertCircle size={12} /> {configError}
              </p>
            )}

            <button
              onClick={handleConfigure}
              disabled={configuring}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
              {configuring
                ? <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />
                : <FileText size={15} />}
              Konfirmasi &amp; Generate Link TTD
            </button>
          </div>
        </div>
      )}

      {/* ─── Link + WA Section ──────────────────────────────────── */}
      {signToken && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#10B98120]">
              <CheckCircle size={15} className="text-[#10B981]" />
            </div>
            <h2 className="font-display font-semibold text-[#0F172A] text-sm">Link Tanda Tangan</h2>
          </div>

          <div className="space-y-3">
            {data.token_expires_at && (
              <p className="text-xs text-[#94A3B8]">
                Berlaku hingga: <span className="font-medium text-[#64748B]">{formatDateTime(data.token_expires_at)}</span>
              </p>
            )}

            {/* Sign URL box */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 bg-[#F8FAFC] border border-gray-200 rounded-xl text-xs text-[#64748B] font-mono truncate">
                {signUrl}
              </div>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
                  copied
                    ? 'bg-[#DCFCE7] text-[#166534]'
                    : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                }`}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Tersalin!' : 'Salin'}
              </button>
              <a
                href={signUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-[#1565C0] bg-[#EFF6FF] hover:bg-[#DBEAFE] transition-colors flex-shrink-0">
                <ExternalLink size={12} />
                Buka
              </a>
            </div>

            {/* WA button */}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#25D366] hover:bg-[#1ebe57] transition-colors">
                <MessageCircle size={16} />
                Kirim via WhatsApp ke {data.owner.nama_pemilik.split(' ')[0]}
              </a>
            )}
          </div>
        </div>
      )}

      {/* ─── Signed Final Section ───────────────────────────────── */}
      {isSigned && (
        <div className="bg-[#F0FFF4] rounded-2xl p-5 border border-[#BBF7D0]">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} className="text-[#16A34A]" />
            <h2 className="font-display font-semibold text-[#166534] text-sm">
              Perjanjian Sudah Ditandatangani
            </h2>
          </div>
          <p className="text-sm text-[#166534] mb-4">
            Ditandatangani pada {formatDateTime(data.signed_at)}. Properti telah dipublikasikan.
          </p>
          <div className="flex gap-3 flex-wrap">
            {data.sign_token && data.pdf_url && (
              <a
                href={`/api/sign/${data.sign_token}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] transition-colors">
                <FileText size={14} />
                Lihat PDF Perjanjian
              </a>
            )}
            <a
              href={propertyUrl(data.properti)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-[#1565C0] bg-[#EFF6FF] hover:bg-[#DBEAFE] transition-colors">
              <ExternalLink size={14} />
              Lihat Listing Properti
            </a>
          </div>
        </div>
      )}

    </div>
  );
}
