import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ArrowUp, ArrowDown, Trash2, Plus, Eye, Pencil, Save, Loader2, History, Copy, AlertTriangle } from 'lucide-react';
import {
  getTemplatePerjanjian, getVersiTemplatePerjanjian, simpanTemplatePerjanjian,
  type TemplatePerjanjian, type BlokTemplate, type ListingTemplate, type TujuanTemplate,
} from '../../../../lib/api';
import {
  renderPasal, pilihBlok, varianDariKode, dataContohVarian, placeholderAsing, karakterHilangDiPdf,
  MAKS_JUDUL, MAKS_ISI, MAKS_BLOK_TEMPLATE,
} from '../../../../../functions/_lib/teksPerjanjian.js';

// Template isi Perjanjian Jasa Pemasaran berversi (Tahap C3, 2026-11-21).
// Satu template memuat SEMUA varian: tiap blok punya "berlaku untuk"
// (Open/Exclusive × Jual/Sewa/Jual+Sewa). Saat admin membuat link TTD,
// configure.js membekukan blok yang cocok dari versi TERBARU ke perjanjian itu.
// Menyimpan = versi baru; perjanjian yang sudah punya salinan tidak berubah.
// Pratinjau memakai renderPasal() yang sama dengan /api/sign.

const LISTING: { k: ListingTemplate; label: string }[] = [
  { k: 'open', label: 'Open' },
  { k: 'exclusive', label: 'Exclusive' },
];
const TUJUAN: { k: TujuanTemplate; label: string }[] = [
  { k: 'jual', label: 'Jual' },
  { k: 'sewa', label: 'Sewa' },
  { k: 'jual_sewa', label: 'Jual+Sewa' },
];
const VARIAN = LISTING.flatMap(l => TUJUAN.map(t => ({ l: l.k, t: t.k, label: `${l.label} · ${t.label}` })));

const salinBlok = (b: BlokTemplate[]) => b.map(x => ({ ...x, berlaku: { listing: [...x.berlaku.listing], tujuan: [...x.berlaku.tujuan] } }));
const tglPendek = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '');

export default function EditorTemplatePerjanjian() {
  const [data, setData] = useState<TemplatePerjanjian | null>(null);
  const [blok, setBlok] = useState<BlokTemplate[]>([]);
  // Versi yang sedang dimuat di editor (bisa versi lama dari riwayat).
  const [asalVersi, setAsalVersi] = useState<number | null>(null);
  const [catatan, setCatatan] = useState('');
  const [mode, setMode] = useState<'edit' | 'pratinjau'>('edit');
  const [varianPratinjau, setVarianPratinjau] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'galat'; teks: string } | null>(null);
  const isiRef = useRef<(HTMLTextAreaElement | null)[]>([]);

  const terima = (d: TemplatePerjanjian) => {
    setData(d);
    setBlok(salinBlok(d.aktif.blok));
    setAsalVersi(d.aktif.versi);
  };
  useEffect(() => {
    getTemplatePerjanjian().then(r => {
      if (r.success && r.data && Array.isArray(r.data.aktif?.blok) && Array.isArray(r.data.riwayat)) terima(r.data);
      else setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal memuat template perjanjian' });
    }).catch(() => setPesan({ jenis: 'galat', teks: 'Koneksi bermasalah' }));
  }, []);

  const berubah = data ? JSON.stringify(blok) !== JSON.stringify(data.aktif.blok) : false;

  const galatBlok = useMemo(() => blok.map(b => {
    if (!b.judul.trim()) return 'Judul wajib diisi';
    if (!b.isi.trim()) return 'Isi wajib diisi';
    const asing = [...placeholderAsing(b.judul), ...placeholderAsing(b.isi)];
    if (asing.length) return `Placeholder tidak dikenal: {${asing[0]}}`;
    if (!b.berlaku.listing.length || !b.berlaku.tujuan.length) return 'Pilih minimal satu jenis listing dan satu jenis transaksi';
    return null;
  }), [blok]);

  // Jumlah pasal per varian — varian tanpa pasal = perjanjian kosong (server menolak).
  const jumlahPerVarian = useMemo(() => VARIAN.map(v =>
    blok.filter(b => b.berlaku.listing.includes(v.l) && b.berlaku.tujuan.includes(v.t)).length), [blok]);
  const varianKosong = VARIAN.filter((_, i) => jumlahPerVarian[i] === 0);
  const adaGalat = galatBlok.some(Boolean) || varianKosong.length > 0;

  const pratinjau = useMemo(() => {
    if (!data) return [];
    const v = VARIAN[varianPratinjau];
    const varian = varianDariKode(v.l, v.t);
    try {
      return renderPasal({ varian, blok: pilihBlok({ blok }, varian) }, dataContohVarian(v.l, v.t));
    } catch { return []; }
  }, [data, blok, varianPratinjau]);

  const ubah = (i: number, p: Partial<BlokTemplate>) => setBlok(prev => prev.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const alihBerlaku = <K extends 'listing' | 'tujuan'>(i: number, sumbu: K, nilai: BlokTemplate['berlaku'][K][number]) =>
    setBlok(prev => prev.map((b, j) => {
      if (j !== i) return b;
      const daftar = b.berlaku[sumbu] as string[];
      const baru = daftar.includes(nilai) ? daftar.filter(x => x !== nilai) : [...daftar, nilai];
      // Urutan kanonik supaya JSON stabil (deteksi "belum disimpan" & diff).
      const urut = (sumbu === 'listing' ? LISTING : TUJUAN).map(x => x.k).filter(k => baru.includes(k));
      return { ...b, berlaku: { ...b.berlaku, [sumbu]: urut } };
    }));
  const geser = (i: number, arah: -1 | 1) => setBlok(prev => {
    const j = i + arah;
    if (j < 0 || j >= prev.length) return prev;
    const salin = [...prev];
    [salin[i], salin[j]] = [salin[j], salin[i]];
    return salin;
  });
  const sisip = (i: number, kunci: string) => {
    const el = isiRef.current[i];
    const teks = blok[i].isi;
    const awal = el?.selectionStart ?? teks.length;
    const akhir = el?.selectionEnd ?? teks.length;
    ubah(i, { isi: `${teks.slice(0, awal)}{${kunci}}${teks.slice(akhir)}` });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = awal + kunci.length + 2;
      el.setSelectionRange(pos, pos);
    });
  };

  const muatVersi = async (versi: number) => {
    if (berubah && !window.confirm('Perubahan yang belum disimpan akan hilang. Muat versi ini ke editor?')) return;
    setSibuk(true); setPesan(null);
    const r = await getVersiTemplatePerjanjian(versi);
    setSibuk(false);
    if (r.success && r.data && Array.isArray(r.data.blok)) {
      setBlok(salinBlok(r.data.blok));
      setAsalVersi(r.data.versi);
      setMode('edit');
      setPesan({ jenis: 'ok', teks: `Versi ${r.data.versi} dimuat ke editor. Simpan untuk menjadikannya versi baru.` });
    } else setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal memuat versi' });
  };

  const simpan = async () => {
    if (!window.confirm('Simpan sebagai versi template baru? Link TTD yang dibuat sesudah ini memakai isi baru; perjanjian yang sudah dikirim tidak berubah.')) return;
    setSibuk(true); setPesan(null);
    const r = await simpanTemplatePerjanjian({ blok, catatan: catatan.trim() || undefined });
    setSibuk(false);
    if (r.success && r.data && Array.isArray(r.data.aktif?.blok)) {
      terima(r.data);
      setCatatan('');
      setPesan({ jenis: 'ok', teks: `Tersimpan sebagai versi ${r.data.aktif.versi}.` });
    } else setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal menyimpan template' });
  };

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-[#94A3B8] flex items-center gap-2">
        {pesan ? <span className="text-red-600">{pesan.teks}</span> : <><Loader2 size={14} className="animate-spin" /> Memuat template perjanjian…</>}
      </div>
    );
  }

  const dariVersiLama = asalVersi !== null && asalVersi !== data.aktif.versi;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4" data-uji="editor-template">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-[#0F172A] flex items-center gap-2"><BookOpen size={16} className="text-[#1565C0]" /> Template Perjanjian Jasa Pemasaran</div>
          <p className="text-[11px] text-[#64748B] mt-0.5 max-w-3xl">
            Aktif: <strong>versi {data.aktif.versi}</strong>. Isi ini dibekukan ke perjanjian saat link TTD dibuat. Menyimpan membuat versi baru —
            perjanjian yang sudah dikirim atau ditandatangani tidak ikut berubah. Untuk mengubah satu perjanjian saja, pakai editor di detail Titip Jual.
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-full p-0.5">
          {(['edit', 'pratinjau'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${mode === m ? 'bg-white text-[#1565C0] shadow-sm' : 'text-[#64748B]'}`}>
              {m === 'edit' ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> Pratinjau</>}
            </button>
          ))}
        </div>
      </div>

      {/* Ringkasan per varian — klik untuk pratinjau varian itu. */}
      <div className="flex flex-wrap gap-1.5" data-uji="ringkasan-varian">
        {VARIAN.map((v, i) => (
          <button key={v.label} type="button" onClick={() => { setVarianPratinjau(i); setMode('pratinjau'); }}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${jumlahPerVarian[i] === 0
              ? 'bg-red-50 border-red-200 text-red-700'
              : mode === 'pratinjau' && varianPratinjau === i ? 'bg-[#1565C0] border-[#1565C0] text-white' : 'bg-gray-50 border-gray-200 text-[#334155] hover:border-[#1565C0]'}`}>
            {v.label}: {jumlahPerVarian[i]} pasal
          </button>
        ))}
      </div>

      {dariVersiLama && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>Editor berisi <strong>versi {asalVersi}</strong> (bukan versi aktif). Simpan untuk menjadikannya versi {data.aktif.versi + 1}.</div>
        </div>
      )}
      <p className="text-[11px] text-[#64748B]">
        Nomor pasal dihitung otomatis per varian. Bila isi pasal merujuk nomor pasal lain (mis. "sesuai Pasal 6"), periksa rujukannya di pratinjau setelah mengubah urutan.
      </p>

      {mode === 'pratinjau' ? (
        <div className="space-y-2">
          <div className="text-xs text-[#64748B]">
            Pratinjau <strong>{VARIAN[varianPratinjau].label}</strong> dengan data contoh (bukan data pemilik mana pun).
          </div>
          <ol className="space-y-3" data-uji="pratinjau-template">
            {pratinjau.map(p => (
              <li key={p.pasal} className="text-sm text-[#0F172A]">
                <div className="font-bold">Pasal {p.pasal} — {p.judul}</div>
                <p className="text-[#334155] leading-relaxed whitespace-pre-line">{p.isi}</p>
              </li>
            ))}
            {pratinjau.length === 0 && <li className="text-xs text-red-600">Varian ini tidak mendapat satu pasal pun.</li>}
          </ol>
        </div>
      ) : (
        <div className="space-y-3">
          {blok.map((b, i) => {
            const hilang = karakterHilangDiPdf(`${b.judul}${b.isi}`);
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2" data-uji="blok-template">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1565C0] w-14 flex-shrink-0">Blok {i + 1}</span>
                  <input value={b.judul} maxLength={MAKS_JUDUL} onChange={e => ubah(i, { judul: e.target.value })}
                    aria-label={`Judul blok ${i + 1}`} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold" />
                  <button type="button" onClick={() => geser(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={`Naikkan blok ${i + 1}`}><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => geser(i, 1)} disabled={i === blok.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={`Turunkan blok ${i + 1}`}><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => setBlok(prev => [...prev.slice(0, i + 1), ...salinBlok([prev[i]]), ...prev.slice(i + 1)])}
                    disabled={blok.length >= MAKS_BLOK_TEMPLATE} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={`Gandakan blok ${i + 1}`} title="Gandakan (untuk membuat varian kalimat)"><Copy size={14} /></button>
                  <button type="button" onClick={() => { if (window.confirm(`Hapus Blok ${i + 1}?`)) setBlok(prev => prev.filter((_, j) => j !== i)); }}
                    disabled={blok.length <= 1} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30" aria-label={`Hapus blok ${i + 1}`}><Trash2 size={14} /></button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#334155]">
                  <span className="text-[#94A3B8]">Berlaku untuk:</span>
                  <span className="flex items-center gap-2">
                    {LISTING.map(l => (
                      <label key={l.k} className="inline-flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={b.berlaku.listing.includes(l.k)} onChange={() => alihBerlaku(i, 'listing', l.k)}
                          aria-label={`Blok ${i + 1} berlaku ${l.label}`} /> {l.label}
                      </label>
                    ))}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="flex items-center gap-2">
                    {TUJUAN.map(t => (
                      <label key={t.k} className="inline-flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={b.berlaku.tujuan.includes(t.k)} onChange={() => alihBerlaku(i, 'tujuan', t.k)}
                          aria-label={`Blok ${i + 1} berlaku ${t.label}`} /> {t.label}
                      </label>
                    ))}
                  </span>
                </div>
                <textarea ref={el => { isiRef.current[i] = el; }} value={b.isi} maxLength={MAKS_ISI} rows={Math.min(10, Math.max(3, Math.ceil(b.isi.length / 110)))}
                  onChange={e => ubah(i, { isi: e.target.value })} aria-label={`Isi blok ${i + 1}`}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm leading-relaxed" />
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-[#94A3B8] mr-1">Sisip data:</span>
                  {Object.entries(data.placeholder).map(([k, ket]) => (
                    <button key={k} type="button" onClick={() => sisip(i, k)} title={ket}
                      className="px-1.5 py-0.5 rounded-md bg-[#F0F7FF] text-[#1565C0] text-[10px] font-mono hover:bg-[#DBEAFE]">{`{${k}}`}</button>
                  ))}
                </div>
                {galatBlok[i] && <div className="text-[11px] text-red-600">{galatBlok[i]}</div>}
                {hilang.length > 0 && (
                  <div className="text-[11px] text-amber-700">Karakter {hilang.map(c => `"${c}"`).join(' ')} tidak bisa dicetak di PDF dan akan menjadi "?".</div>
                )}
              </div>
            );
          })}
          <button type="button" disabled={blok.length >= MAKS_BLOK_TEMPLATE}
            onClick={() => setBlok(prev => [...prev, { judul: 'JUDUL PASAL BARU', isi: '', berlaku: { listing: ['open', 'exclusive'], tujuan: ['jual', 'sewa', 'jual_sewa'] } }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-[#334155] hover:border-[#1565C0] disabled:opacity-40">
            <Plus size={14} /> Tambah blok pasal
          </button>
        </div>
      )}

      {varianKosong.length > 0 && (
        <div className="text-[11px] text-red-600">Varian tanpa pasal: {varianKosong.map(v => v.label).join(', ')}. Centang "Berlaku untuk" di minimal satu blok.</div>
      )}
      {pesan && (
        <div className={`rounded-xl px-3 py-2 text-xs ${pesan.jenis === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{pesan.teks}</div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 pt-1 border-t border-gray-100">
        <label className="flex-1 min-w-[220px] text-[11px] text-[#64748B] pt-3">
          Catatan perubahan (opsional)
          <input value={catatan} onChange={e => setCatatan(e.target.value)} maxLength={300} placeholder="mis. Pasal 6: masa pemberitahuan 14 → 30 hari"
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-[#0F172A]" />
        </label>
        <div className="flex items-center gap-2">
          {(berubah || dariVersiLama) && <span className="text-[11px] text-amber-700">Belum disimpan</span>}
          <button type="button" disabled={sibuk || !(berubah || dariVersiLama) || adaGalat} onClick={() => void simpan()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold disabled:opacity-50">
            {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan sebagai versi baru
          </button>
        </div>
      </div>

      <div className="space-y-1.5" data-uji="riwayat-template">
        <div className="text-xs font-semibold text-[#334155] flex items-center gap-1.5"><History size={13} /> Riwayat versi</div>
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {data.riwayat.map(r => (
            <li key={r.versi} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-[#0F172A]">v{r.versi}</span>
                {r.versi === data.aktif.versi && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-semibold">aktif</span>}
                <span className="text-[#64748B]"> · {r.catatan || 'tanpa catatan'}</span>
                {(r.dibuat_oleh || r.dibuat_at) && <span className="text-[#94A3B8]"> · {[r.dibuat_oleh, tglPendek(r.dibuat_at)].filter(Boolean).join(', ')}</span>}
              </div>
              <button type="button" disabled={sibuk || r.versi === asalVersi} onClick={() => void muatVersi(r.versi)}
                className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-semibold text-[#475569] hover:border-[#1565C0] disabled:opacity-40">
                {r.versi === asalVersi ? 'Di editor' : 'Muat ke editor'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
