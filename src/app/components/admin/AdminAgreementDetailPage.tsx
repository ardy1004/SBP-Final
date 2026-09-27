import { bacaJson } from '../../../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { IDENTITAS, normalisasiJenisIdentitas } from '../../../../functions/_lib/identitas.js';
import { labelBertindak, jenisTransaksi, teksHargaPenawaran, LABEL_BERTINDAK, BERTINDAK_VALID } from '../../../../functions/_lib/isiPerjanjian.js';
import {
  ArrowLeft, Edit2, Check, X, AlertCircle, Copy, MessageCircle,
  FileText, ExternalLink, User, Home, Image as ImageIcon, CheckCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  /** Versi perbaikan (migrasi 0053) — lihat functions/api/admin/agreements/[id]/versi-perbaikan.js */
  digantikan_oleh: number | null;
  digantikan_kode: string | null;
  menggantikan_id: number | null;
  menggantikan_kode: string | null;
  perlu_versi_perbaikan: boolean;
  /** menunggu_ttd tapi link tanda tangannya sudah lewat masa berlaku (72 jam). */
  link_kedaluwarsa: boolean;
  /** 5 akses nomor identitas SEBELUMNYA (migrasi 0056) — akses saat ini dicatat sesudah respons. */
  akses_terakhir?: Array<{ aksi: 'lihat' | 'ubah'; created_at: string; oleh: string }>;
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
    /** 'ktp' | 'sim' — nomornya ada di `nik` untuk keduanya. */
    jenis_identitas?: string;
  };
  properti: {
    id: number;
    kode_listing: string;
    title: string;
    slug: string;
    jenis_properti: string;
    tujuan: string;
    harga: number;
    harga_sewa_tahun: number | null;
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
    /** Masuk lewat jalur cadangan tanpa Turnstile (migrasi 0055). */
    tanpa_captcha?: boolean;
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

function propertyUrl(p: { jenis_properti: string; provinsi: string; kabupaten: string; kecamatan: string | null; tujuan: string | null; slug: string }): string {
  const jenis = p.jenis_properti.toLowerCase();
  const prov  = p.provinsi.toLowerCase().replace(/\s+/g, '-');
  const kab   = p.kabupaten.toLowerCase().replace(/\s+/g, '-');
  const kec   = (p.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const base  = p.tujuan === 'disewa' ? '/disewa' : '/dijual';
  return `${base}/${jenis}/${prov}/${kab}/${kec}/${p.slug}`;
}

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
  // LucideIcon, BUKAN React.FC: ikon lucide adalah ForwardRefExoticComponent dan
  // menerima seluruh SVGProps (termasuk `style` yang dipakai di bawah).
  icon: LucideIcon;
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

/**
 * Data ahli waris yang diisi pemilik di Tahap 2 — dulu dikumpulkan tapi TIDAK
 * PERNAH ditampilkan ke admin, sehingga jawaban "semua ahli waris sepakat?
 * Tidak" tidak terlihat sebelum kontrak dikirim. Bentuknya JSON dari form
 * ({jumlah_ahli_waris, semua_sepakat, kuasa_notaris, turun_waris}) atau teks
 * bebas dari alur lama — keduanya input tak tepercaya, jadi diurai hati-hati.
 */
function DataAhliWaris({ raw }: { raw: string | null }) {
  if (!raw) return null;
  let d: Record<string, unknown> | null = null;
  try { const v = JSON.parse(raw); if (v && typeof v === 'object') d = v as Record<string, unknown>; } catch { /* teks lama */ }
  const yaTidak = (v: unknown, bahaya = false) => v === true
    ? <span className="font-semibold text-[#166534]">Ya</span>
    : v === false
      ? <span className={`font-semibold ${bahaya ? 'text-[#B91C1C]' : 'text-[#475569]'}`}>Tidak</span>
      : <span className="text-[#94A3B8]">—</span>;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs font-semibold text-amber-900 mb-2">Data Ahli Waris</p>
      {d ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[#374151]">
          <dt className="text-[#64748B]">Jumlah ahli waris</dt><dd>{typeof d.jumlah_ahli_waris === 'number' && d.jumlah_ahli_waris > 0 ? d.jumlah_ahli_waris : '—'}</dd>
          <dt className="text-[#64748B]">Semua sepakat dijual/disewakan</dt><dd>{yaTidak(d.semua_sepakat, true)}</dd>
          <dt className="text-[#64748B]">Sudah dikuasakan via notaris</dt><dd>{yaTidak(d.kuasa_notaris)}</dd>
          <dt className="text-[#64748B]">Turun waris sudah diurus</dt><dd>{yaTidak(d.turun_waris)}</dd>
        </dl>
      ) : (
        <p className="text-xs text-[#374151] whitespace-pre-wrap">{raw}</p>
      )}
      {d?.semua_sepakat === false && (
        <p className="mt-2 text-xs font-semibold text-[#B91C1C]">
          ⚠ Pemilik menyatakan TIDAK semua ahli waris sepakat — pastikan sebelum mengirim link tanda tangan.
        </p>
      )}
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
  // nama_ktp, rt_rw, kelurahan/kecamatan, dan bertindak_sebagai TERCETAK di
  // kontrak — dulu tidak bisa dikoreksi sama sekali (hanya nama_pemilik, yang
  // tidak pernah tercetak).
  const [ownerForm, setOwnerForm] = useState({
    nama_pemilik: '', nama_ktp: '', nik: '', alamat_ktp: '', rt_rw: '', kelurahan: '', kecamatan: '',
    bertindak_sebagai: '', no_wa: '', jenis_identitas: 'ktp' as 'ktp' | 'sim',
  });
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

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
    const json = await bacaJson(res);
    if (!json.success) throw new Error(json.error ?? 'Gagal memuat data');
    const d: AgreementDetail = json.data;
    setData(d);
    // Pre-fill owner form
    setOwnerForm({
      nama_pemilik: d.owner.nama_pemilik ?? '',
      nama_ktp: d.owner.nama_ktp ?? '',
      nik: d.owner.nik ?? '',
      alamat_ktp: d.owner.alamat_ktp ?? '',
      rt_rw: d.owner.rt_rw ?? '',
      kelurahan: d.owner.kelurahan ?? '',
      kecamatan: d.owner.kecamatan ?? '',
      bertindak_sebagai: d.owner.bertindak_sebagai ?? '',
      no_wa: d.owner.no_wa_1 ?? '',
      jenis_identitas: normalisasiJenisIdentitas(d.owner.jenis_identitas),
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
        // Kolom kosong TIDAK dikirim: data lama (mis. dari alur sebelum Tahap 2)
        // bisa belum punya RT/RW atau kelurahan, dan server menolak nilai kosong
        // — tanpa penyaring ini koreksi WA saja pun gagal.
        body: JSON.stringify(Object.fromEntries(Object.entries({
          nama_pemilik: ownerForm.nama_pemilik,
          nama_ktp: ownerForm.nama_ktp,
          nik: ownerForm.nik,
          alamat_ktp: ownerForm.alamat_ktp,
          rt_rw: ownerForm.rt_rw,
          kelurahan_owner: ownerForm.kelurahan,
          kecamatan_owner: ownerForm.kecamatan,
          bertindak_sebagai: ownerForm.bertindak_sebagai,
          no_wa: ownerForm.no_wa,
          // Server memvalidasi nomor dengan jenis ini — tanpanya pemilik ber-SIM
          // 12/14 digit gagal disimpan walau yang diubah cuma nomor WA.
          jenis_identitas: ownerForm.jenis_identitas,
        }).filter(([, v]) => v !== ''))),
      });
      const json = await bacaJson(res);
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
      const json = await bacaJson(res);
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

  // ─── Versi perbaikan (dokumen signed yang tercetak keliru) ───────
  const [membuatVersi, setMembuatVersi] = useState(false);
  const [versiError, setVersiError] = useState<string | null>(null);
  const handleVersiPerbaikan = async () => {
    if (!window.confirm('Buat perjanjian pengganti? Perjanjian ini TETAP sah sebagai arsip; pemilik perlu menandatangani versi baru.')) return;
    setMembuatVersi(true);
    setVersiError(null);
    try {
      const res = await fetch(`/api/admin/agreements/${id}/versi-perbaikan`, { method: 'POST', credentials: 'include' });
      const json = await bacaJson<{ agreement_id: number }>(res);
      // 409 "sudah punya versi perbaikan" membawa id penggantinya di details —
      // langsung buka yang itu, bukan menampilkan galat.
      const tujuan = json.data?.agreement_id ?? (Number(json.details?.agreement_id) || undefined);
      if (tujuan) navigate(`/admin/agreements/${tujuan}`);
      else setVersiError(json.error ?? 'Gagal membuat versi perbaikan');
    } catch {
      setVersiError('Gagal menghubungi server');
    } finally {
      setMembuatVersi(false);
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

      {/* ─── Versi perbaikan ─────────────────────────────────────── */}
      {data.perlu_versi_perbaikan && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">Isi dokumen ini tercetak keliru</p>
          <p className="text-xs text-amber-900/80 leading-relaxed">
            Perjanjian ini ditandatangani sebelum perbaikan 27 Sep 2026. PDF-nya mencetak kewenangan
            pemilik sebagai "Pemilik Langsung" dan/atau salah menulis harga & fee untuk listing sewa.
            Dokumen yang sudah ditandatangani tidak diubah — buat versi perbaikan, lalu kirim link
            tanda tangan barunya ke pemilik. Perjanjian ini tetap tersimpan sebagai arsip sah.
          </p>
          {versiError && <p className="text-xs text-red-700">{versiError}</p>}
          <button onClick={handleVersiPerbaikan} disabled={membuatVersi}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
            {membuatVersi ? 'Membuat…' : 'Buat versi perbaikan'}
          </button>
        </div>
      )}
      {data.digantikan_oleh && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-[#475569]">
          Perjanjian ini sudah <strong>digantikan</strong> oleh{' '}
          <button onClick={() => navigate(`/admin/agreements/${data.digantikan_oleh}`)} className="font-semibold text-[#1565C0] hover:underline">
            {data.digantikan_kode ?? `#${data.digantikan_oleh}`}
          </button>. Dokumen ini tetap tersimpan sebagai arsip.
        </div>
      )}
      {data.menggantikan_id && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-[#1E3A8A]">
          Versi perbaikan dari{' '}
          <button onClick={() => navigate(`/admin/agreements/${data.menggantikan_id}`)} className="font-semibold text-[#1565C0] hover:underline">
            {data.menggantikan_kode ?? `#${data.menggantikan_id}`}
          </button>.
        </div>
      )}

      {/* ─── Owner Card ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <CardHeader
          icon={User} title="Data Pemilik / Owner" color="#1565C0"
          onEdit={isEditable && !editingOwner ? () => setEditingOwner(true) : undefined}
        />

        {editingOwner ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InlineInput label="Nama Pemilik (sapaan)" value={ownerForm.nama_pemilik}
                onChange={v => setOwnerForm(f => ({ ...f, nama_pemilik: v }))} />
              <InlineInput label={`Nama sesuai ${IDENTITAS[ownerForm.jenis_identitas].kartu} (tercetak di kontrak)`} value={ownerForm.nama_ktp}
                onChange={v => setOwnerForm(f => ({ ...f, nama_ktp: v }))} />
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Nomor Identitas</label>
                <div className="flex gap-2">
                  <select
                    value={ownerForm.jenis_identitas}
                    onChange={e => setOwnerForm(f => ({ ...f, jenis_identitas: normalisasiJenisIdentitas(e.target.value) }))}
                    className="px-2 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white"
                    aria-label="Jenis identitas"
                  >
                    {(['ktp', 'sim'] as const).map(j => <option key={j} value={j}>{IDENTITAS[j].pilihan}</option>)}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={ownerForm.nik}
                    onChange={e => setOwnerForm(f => ({ ...f, nik: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
                    placeholder={IDENTITAS[ownerForm.jenis_identitas].placeholder}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] focus:ring-1 focus:ring-[#1565C0]/20 transition-colors"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Alamat {IDENTITAS[ownerForm.jenis_identitas].kartu}</label>
              <textarea
                value={ownerForm.alamat_ktp}
                onChange={e => setOwnerForm(f => ({ ...f, alamat_ktp: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] focus:ring-1 focus:ring-[#1565C0]/20 transition-colors resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InlineInput label="RT/RW" value={ownerForm.rt_rw} placeholder="001/002"
                onChange={v => setOwnerForm(f => ({ ...f, rt_rw: v }))} />
              <InlineInput label="Kelurahan" value={ownerForm.kelurahan}
                onChange={v => setOwnerForm(f => ({ ...f, kelurahan: v }))} />
              <InlineInput label="Kecamatan" value={ownerForm.kecamatan}
                onChange={v => setOwnerForm(f => ({ ...f, kecamatan: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Bertindak sebagai (tercetak di kontrak)</label>
              <select value={ownerForm.bertindak_sebagai}
                onChange={e => setOwnerForm(f => ({ ...f, bertindak_sebagai: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white">
                {!ownerForm.bertindak_sebagai && <option value="">— pilih —</option>}
                {BERTINDAK_VALID.map(k => (
                  <option key={k} value={k}>{LABEL_BERTINDAK[k as keyof typeof LABEL_BERTINDAK]}</option>
                ))}
              </select>
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
            <InfoRow label={IDENTITAS[normalisasiJenisIdentitas(data.owner.jenis_identitas)].label} value={data.owner.nik
              ? <span className="font-mono tracking-widest">{data.owner.nik}</span>
              : <span className="text-[#94A3B8] italic text-xs">Tidak tersedia</span>} />
            <InfoRow label={`Nama ${IDENTITAS[normalisasiJenisIdentitas(data.owner.jenis_identitas)].kartu}`} value={data.owner.nama_ktp} />
            <InfoRow label={`Alamat ${IDENTITAS[normalisasiJenisIdentitas(data.owner.jenis_identitas)].kartu}`} value={data.owner.alamat_ktp} />
            {data.owner.rt_rw && <InfoRow label="RT/RW" value={data.owner.rt_rw} />}
            {(data.owner.kelurahan || data.owner.kecamatan) && (
              <InfoRow label="Kelurahan/Kec." value={[data.owner.kelurahan, data.owner.kecamatan].filter(Boolean).join(', ')} />
            )}
            <InfoRow label="Bertindak Sebagai" value={labelBertindak(data.owner.bertindak_sebagai)} />
            <InfoRow label="WhatsApp" value={
              <a href={`https://wa.me/${data.owner.no_wa_1}`} target="_blank" rel="noopener noreferrer"
                className="text-[#10B981] hover:underline">
                {data.owner.no_wa_1}
              </a>
            } />
            {data.owner.no_wa_2 && <InfoRow label="WA Kedua" value={data.owner.no_wa_2} />}
          </dl>
        )}
        {!editingOwner && <DataAhliWaris raw={data.owner.data_ahli_waris} />}
        {!editingOwner && data.owner.nik && (
          // Kebijakan Privasi pasal 4: akses nomor identitas tercatat. Setiap
          // pembukaan halaman ini (yang menampilkan nomor) ikut tercatat.
          <div className="mt-4 text-[11px] text-[#94A3B8]">
            <span className="font-semibold text-[#64748B]">Akses nomor identitas sebelumnya: </span>
            {data.akses_terakhir?.length
              ? data.akses_terakhir.map((x, i) => (
                  // created_at SQLite = UTC tanpa zona ("YYYY-MM-DD HH:MM:SS") —
                  // tanpa 'Z' peramban membacanya sebagai waktu lokal (meleset 7 jam).
                  <span key={i}>{i > 0 ? ' · ' : ''}{x.aksi === 'ubah' ? 'diubah' : 'dilihat'} {x.oleh}, {formatDateTime(`${x.created_at.replace(' ', 'T')}Z`)}</span>
                ))
              : 'belum ada (pencatatan dimulai 27 Sep 2026)'}
          </div>
        )}
      </div>

      {/* ─── Property Card ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <CardHeader icon={Home} title="Data Properti" color="#10B981" />
        {data.properti.tanpa_captcha && (
          <p className="mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            Pengajuan ini masuk lewat jalur cadangan TANPA verifikasi anti-bot (widget Turnstile pemilik macet).
            Pastikan pengirimnya nyata — hubungi via WA — sebelum mengirim link tanda tangan.
          </p>
        )}

        {/* Data properti diedit di SATU tempat — halaman Properti — yang sudah
            menangani harga per-m² tanah (normalisasiHarga) dan meta SEO. Edit
            dari sini dulu menulis `harga` mentah sehingga harga_per_m2 &
            meta_title basi. */}
        {(
          <dl className="space-y-2.5">
            <InfoRow label="Kode Listing" value={<span className="font-mono text-xs">{data.properti.kode_listing}</span>} />
            <InfoRow label="Judul" value={data.properti.title} />
            <InfoRow label="Jenis Properti" value={<span className="capitalize">{data.properti.jenis_properti}</span>} />
            <InfoRow label="Tujuan" value={<span className="capitalize">{data.properti.tujuan?.replace('_', ' ')}</span>} />
            <InfoRow label="Harga" value={
              // Kalimat yang SAMA dengan Pasal 1 kontrak — `harga` saja bernilai
              // 0 pada listing sewa (harga sewa ada di harga_sewa_tahun).
              <span className="font-semibold">{teksHargaPenawaran(data.properti)}</span>
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
        <button onClick={() => navigate(`/admin/listing/${data.properti.id}`)}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1565C0] bg-[#EFF6FF] hover:bg-[#DBEAFE] transition-colors">
          <ExternalLink size={12} /> Edit di halaman Properti
        </button>
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
                {/* Dari tujuan properti — sama dengan yang tercetak di kontrak
                    (kolom jenis_transaksi mencatat 'jual' untuk dijual_disewa). */}
                {jenisTransaksi(data.properti.tujuan).label}
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
              {data.status === 'menunggu_ttd' ? 'Simpan & Buat Link TTD Baru' : 'Konfirmasi & Generate Link TTD'}
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
            {data.link_kedaluwarsa ? (
              <p className="text-xs font-semibold text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                Link ini sudah kedaluwarsa ({formatDateTime(data.token_expires_at)}) — pemilik tidak bisa lagi
                menandatanganinya. Tekan "Simpan &amp; Buat Link TTD Baru" di atas, lalu kirim link barunya.
              </p>
            ) : data.token_expires_at && (
              <p className="text-xs text-[#94A3B8]">
                Berlaku hingga: <span className="font-medium text-[#64748B]">{formatDateTime(data.token_expires_at)}</span>
                {' · '}Dibuka pemilik: <span className="font-medium text-[#64748B]">{data.link_opened_count}×</span>
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

            {/* WA button — disembunyikan bila link kedaluwarsa, supaya admin tidak
                mengirim link mati ke pemilik. */}
            {waUrl && !data.link_kedaluwarsa && (
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
            Ditandatangani pada {formatDateTime(data.signed_at)}.{' '}
            {data.properti.status_publish === 'published' ? 'Properti sudah tayang.' : 'Properti belum tayang — publikasikan dari halaman Properti.'}
          </p>
          <div className="flex gap-3 flex-wrap">
            {data.pdf_url && (
              <a
                // Lewat sesi admin, BUKAN link publik /api/sign/<token>/pdf —
                // link publik itu sengaja kedaluwarsa 7 hari setelah tanda tangan
                // (PDF memuat NIK). Admin tetap harus bisa membuka arsip kapan saja.
                href={`/api/admin/media?key=${encodeURIComponent(data.pdf_url)}`}
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
