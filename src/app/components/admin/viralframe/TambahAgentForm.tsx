// Form "Tambah agent" Konten Agent (2026-11-28).
//
// Dulu agent dibuat di meja kerja Viral Frame (langkah "Pilih Karakter"). Meja
// kerja itu dihapus 2026-11-21 dan form-nya ikut hilang, padahal endpoint
// POST /api/admin/viralframe/characters tetap ada. Form ini mengembalikannya ke
// tempat yang memang dipakai: kartu Akun Agent. Setelah agent dibuat, kartu itu
// langsung membuka form akunnya (Gmail, spesialis, API key Zernio/Buffer,
// channel) — tahap kedua yang sejak awal sudah ada di sana.
//
// Foto dikonversi ke WebP di browser (endpoint hanya menerima WebP ≤ ~2 MB),
// diperkecil ke sisi terpanjang 1024 px — foto agent hanya untuk dikenali.

import { useState, useEffect } from 'react';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { tambahAgent } from '../../../../lib/api';

const SISI_MAKS = 1024;
const JENIS_DITERIMA = ['image/jpeg', 'image/png', 'image/webp'];
const INPUT_CLS = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30';
const LABEL_CLS = 'block text-xs font-semibold text-[#334155] mb-1';

async function keWebp(berkas: File): Promise<string> {
  const bmp = await createImageBitmap(berkas);
  const skala = Math.min(1, SISI_MAKS / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * skala));
  c.height = Math.max(1, Math.round(bmp.height * skala));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const url = c.toDataURL('image/webp', 0.85);
  c.width = 0; c.height = 0;
  // Safari tanpa encoder WebP diam-diam memberi PNG — endpoint menolaknya.
  if (!url.startsWith('data:image/webp')) throw new Error('Browser ini tidak bisa membuat WebP — pakai Chrome/Edge terbaru');
  return url;
}

export default function TambahAgentForm({ onDibuat, onBatal }: {
  onDibuat: (karakter: { id: number; nama: string }) => void;
  onBatal: () => void;
}) {
  const [nama, setNama] = useState('');
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [gender, setGender] = useState('');
  const [usia, setUsia] = useState('');
  const [etnik, setEtnik] = useState('');
  const [style, setStyle] = useState('');
  const [ciri, setCiri] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    if (!berkas) { setPratinjau(null); return; }
    const url = URL.createObjectURL(berkas);
    setPratinjau(url);
    return () => URL.revokeObjectURL(url);
  }, [berkas]);

  const pilihBerkas = (f: File | undefined) => {
    setGalat('');
    if (!f) return;
    if (!JENIS_DITERIMA.includes(f.type)) { setGalat('Foto harus JPEG, PNG, atau WebP'); return; }
    setBerkas(f);
  };

  const simpan = async () => {
    setGalat('');
    if (!nama.trim()) { setGalat('Nama agent wajib diisi'); return; }
    if (!berkas) { setGalat('Foto wajah agent wajib dipilih'); return; }
    setMenyimpan(true);
    try {
      const foto = await keWebp(berkas);
      const usiaAngka = usia.trim() ? parseInt(usia, 10) : null;
      const r = await tambahAgent({
        nama: nama.trim(), foto,
        gender: gender || undefined,
        usia: Number.isInteger(usiaAngka) ? usiaAngka : null,
        etnik: etnik.trim() || undefined,
        style: style.trim() || undefined,
        ciri_fisik: ciri.trim() || undefined,
      });
      if (!r.success || !r.data?.karakter) throw new Error(r.error ?? 'Gagal menambah agent');
      onDibuat({ id: r.data.karakter.id, nama: r.data.karakter.nama });
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal menambah agent');
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-[#1565C0]/30 rounded-xl p-3 bg-[#F8FAFF]" data-uji="form-tambah-agent">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
          <UserPlus size={15} className="text-[#1565C0]" /> Agent baru
        </div>
        <button type="button" onClick={onBatal} disabled={menyimpan} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Batal">
          <X size={16} />
        </button>
      </div>
      <p className="text-[11px] text-[#64748B] mb-3">
        Langkah 1 dari 2: identitas agent. Setelah disimpan, form akunnya langsung terbuka untuk
        mengisi Gmail, spesialis, API key Zernio/Buffer, dan channel medsos.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
        <label className="block cursor-pointer">
          <div className="w-[120px] h-[120px] rounded-xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center text-[11px] text-[#94A3B8] text-center p-1">
            {pratinjau ? <img src={pratinjau} alt="Pratinjau foto agent" className="w-full h-full object-cover" /> : 'Klik untuk pilih foto wajah'}
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => pilihBerkas(e.target.files?.[0])} data-uji="foto-agent" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={LABEL_CLS}>Nama agent *</label>
            <input className={INPUT_CLS} value={nama} onChange={e => setNama(e.target.value)} maxLength={120} placeholder="mis. Rina" data-uji="nama-agent" />
          </div>
          <div>
            <label className={LABEL_CLS}>Gender</label>
            <select className={INPUT_CLS} value={gender} onChange={e => setGender(e.target.value)}>
              <option value="">—</option>
              <option value="Wanita">Wanita</option>
              <option value="Pria">Pria</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Usia</label>
            <input className={INPUT_CLS} inputMode="numeric" value={usia} onChange={e => setUsia(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="mis. 27" />
          </div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="text-[11px] font-semibold text-[#64748B] cursor-pointer select-none">Data tambahan (opsional)</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div>
            <label className={LABEL_CLS}>Etnik</label>
            <input className={INPUT_CLS} value={etnik} onChange={e => setEtnik(e.target.value)} maxLength={60} placeholder="mis. Javanese" />
          </div>
          <div>
            <label className={LABEL_CLS}>Gaya berpakaian</label>
            <input className={INPUT_CLS} value={style} onChange={e => setStyle(e.target.value)} maxLength={120} placeholder="mis. blazer krem" />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLS}>Ciri fisik</label>
            <textarea className={INPUT_CLS} rows={2} value={ciri} onChange={e => setCiri(e.target.value)} maxLength={500} placeholder="mis. rambut panjang, berkacamata" />
          </div>
        </div>
      </details>

      {galat && <div className="mt-3 text-xs text-red-600" data-uji="galat-agent">{galat}</div>}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onBatal} disabled={menyimpan}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-50">Batal</button>
        <button type="button" onClick={simpan} disabled={menyimpan}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-sm font-semibold disabled:opacity-50" data-uji="simpan-agent">
          {menyimpan ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          {menyimpan ? 'Menyimpan…' : 'Simpan & lanjut isi akun'}
        </button>
      </div>
    </div>
  );
}
