// Tahap 2 Titip Jual — Data Diri Pemilik (KYC).
//
// ⚠️ DIMUAT MALAS (React.lazy di TitipJualPage.tsx). Sah karena komponen ini
// TIDAK PERNAH dirender saat SSR: ia baru dipasang setelah Tahap 1 sukses atau
// setelah efek pemulihan draft / link lanjutan berjalan di klien (lihat
// `dataDiriSudahDipasang`). Aturan CLAUDE.md: React.lazy hanya aman untuk
// komponen yang tak pernah dirender server — jangan pernah membuatnya tampil
// pada render pertama. Dipisah 2026-09-27 ketika chunk SSR utama melewati
// anggaran check:bundle; ~20 KB kode yang hanya dipakai setelah Tahap 1 kini
// tidak ikut dievaluasi setiap request SSR.
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, AlertCircle } from 'lucide-react';
import { bacaJson } from '../../../lib/api';
import { trackEvent } from '../../../lib/tracking';
import { IDENTITAS, normalisasiJenisIdentitas, validasiNomorIdentitas } from '../../../../functions/_lib/identitas.js';
import { bacaDraft, simpanDraft, hapusDraft } from '../../../lib/titipJualDraft';
import { laporKendalaForm } from '../../../lib/laporKendala';
import { adaIsi, inputCls, FieldErr, type Stage2Result } from './bersama';

interface DataDiriState {
  nama_ktp: string;
  /** Nomor identitas — NIK maupun No. SIM (lihat jenisIdentitas). Tetap bernama
   *  `nik` supaya pembuangan `nik` dari draft ikut melindungi nomor SIM. */
  nik: string;
  jenisIdentitas: 'ktp' | 'sim';
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

export default function StepDataDiri({ kodeListing, photosBelumLengkap, onNanti, onSuccess }: StepDataDiriProps) {
  const [form, setForm] = useState<DataDiriState>({
    nama_ktp: '', nik: '', jenisIdentitas: 'ktp', rt_rw: '',
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
    // jenisIdentitas dari localStorage = input TIDAK tepercaya (bisa dari build
    // mana pun / diubah tangan) — normalisasi, jangan spread mentah.
    if (d?.s1) setForm(p => ({
      ...p, ...(d.s1 as Partial<DataDiriState>), nik: '',
      jenisIdentitas: normalisasiJenisIdentitas((d.s1 as Record<string, unknown>).jenisIdentitas),
    }));
  }, []);

  // Autosave (debounce 800 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      const { nik: _nik, ...tanpaNik } = form;
      // jenisIdentitas SELALU terisi (default 'ktp'), jadi jangan ikut dihitung
      // "ada isian": kalau ikut, autosave jalan di kunjungan pertama dan pengunjung
      // baru melihat banner palsu "isian dipulihkan" setelah reload.
      const { jenisIdentitas: _jenis, ...isiNyata } = tanpaNik;
      if (adaIsi(isiNyata)) simpanDraft({ s1: tanpaNik });
    }, 800);
    return () => clearTimeout(t);
  }, [form]);

  const f = (k: keyof DataDiriState, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }));
  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nama_ktp) e.nama_ktp = `Nama sesuai ${IDENTITAS[form.jenisIdentitas].kartu} wajib diisi`;
    const galatNomor = validasiNomorIdentitas(form.jenisIdentitas, form.nik);
    if (galatNomor) e.nik = galatNomor;
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
        jenis_identitas: form.jenisIdentitas,
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

  // Label nama/nomor/alamat mengikuti kartu yang sedang disalin pemilik.
  const idPilih = IDENTITAS[form.jenisIdentitas];

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-1">Data Diri Pemilik</h2>
      <p className="text-sm text-[#64748B] mb-4">Isi sesuai {idPilih.kartu} yang masih berlaku.</p>

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
        {/* Jenis identitas — dipilih PALING AWAL karena label nama, nomor, dan
            alamat di bawah mengikuti kartu yang sedang disalin pemilik. KTP default.
            Aturan (16 digit NIK / 12-16 digit SIM) di functions/_lib/identitas.js. */}
        <div>
          <p className="block text-xs font-semibold text-[#64748B] mb-1">Identitas yang dipakai *</p>
          <div role="radiogroup" aria-label="Jenis identitas" className="grid grid-cols-2 gap-2">
            {(['ktp', 'sim'] as const).map(j => (
              <button
                key={j}
                type="button"
                role="radio"
                aria-checked={form.jenisIdentitas === j}
                onClick={() => { setForm(p => ({ ...p, jenisIdentitas: j })); clearErr('nik'); }}
                className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                  form.jenisIdentitas === j
                    ? 'border-[#1565C0] bg-blue-50 text-[#1565C0]'
                    : 'border-gray-200 text-[#64748B] hover:border-gray-300'}`}
              >
                {IDENTITAS[j].pilihan}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama Lengkap Sesuai {idPilih.kartu} *</label>
          <input value={form.nama_ktp} onChange={e => { f('nama_ktp', e.target.value); clearErr('nama_ktp'); }}
            placeholder={`Sesuai ${idPilih.kartu}`} className={inputCls(errors.nama_ktp)} />
          <FieldErr msg={errors.nama_ktp} />
        </div>

        {/* Nomor identitas — NIK atau No. SIM, keduanya disimpan di form.nik. */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">{idPilih.pilihan} *</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.nik}
            onChange={e => { f('nik', e.target.value.replace(/\D/g, '').slice(0, 16)); clearErr('nik'); }}
            placeholder={idPilih.placeholder}
            className={inputCls(errors.nik)}
          />
          <p className="text-xs text-gray-400 mt-0.5">Nomor identitas dienkripsi untuk keamanan data Anda.</p>
          <FieldErr msg={errors.nik} />
        </div>

        {/* Alamat Lengkap Sesuai KTP/SIM — label statis (input dihapus; detail alamat diisi via kolom lokasi di bawah) */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] mb-1">Alamat Lengkap Sesuai {idPilih.kartu}</label>
          <FieldErr msg={errors.alamat_ktp} />
        </div>

        {/* Provinsi + Kab./Kota KTP */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Provinsi ({idPilih.kartu}) *</label>
            <input value={form.prov_owner} onChange={e => { f('prov_owner', e.target.value); clearErr('prov_owner'); }}
              placeholder="Mis: Jawa Timur" className={inputCls(errors.prov_owner)} />
            <FieldErr msg={errors.prov_owner} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Kab./Kota ({idPilih.kartu}) *</label>
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
