import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSignature, ArrowUp, ArrowDown, Trash2, Plus, Eye, Pencil, RotateCcw, Save, Lock, Loader2, AlertTriangle } from 'lucide-react';
import { getPasalPerjanjian, simpanPasalPerjanjian, type PasalPerjanjian, type BlokPasal } from '../../../../lib/api';
import { renderPasal, placeholderAsing, karakterHilangDiPdf, MAKS_JUDUL, MAKS_ISI, MAKS_BLOK } from '../../../../../functions/_lib/teksPerjanjian.js';

// Editor "Isi Perjanjian" per perjanjian (Tahap C2, 2026-11-21).
// Pratinjau memakai renderPasal() yang SAMA dengan /api/sign — yang terlihat
// di sini persis yang dibaca & ditandatangani pemilik. Angka (fee, durasi,
// harga, alamat) disisipkan sebagai placeholder lewat tombol, bukan diketik,
// supaya teks tidak pernah bertentangan dengan data perjanjian.

const LABEL_SUMBER: Record<PasalPerjanjian['sumber'], string> = {
  template: 'Mengikuti template',
  salinan: 'Salinan template (terkunci saat link dibuat)',
  kustom: 'Disesuaikan manual',
  arsip_pdf: 'Tersimpan di PDF arsip',
};

const labelVarian = (v: PasalPerjanjian['varian']) =>
  `${v.listing === 'exclusive' ? 'Exclusive' : 'Open'} Listing · ${v.tx.label}`;

export default function EditorPasal({ agreementId }: { agreementId: number | string }) {
  const [data, setData] = useState<PasalPerjanjian | null>(null);
  const [blok, setBlok] = useState<BlokPasal[]>([]);
  const [mode, setMode] = useState<'edit' | 'pratinjau'>('edit');
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'galat'; teks: string } | null>(null);
  const isiRef = useRef<(HTMLTextAreaElement | null)[]>([]);

  const terima = (d: PasalPerjanjian) => { setData(d); setBlok(d.blok.map(b => ({ ...b }))); };
  useEffect(() => {
    getPasalPerjanjian(agreementId).then(r => {
      if (r.success && r.data && Array.isArray(r.data.blok)) terima(r.data);
      else setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal memuat isi pasal' });
    }).catch(() => setPesan({ jenis: 'galat', teks: 'Koneksi bermasalah' }));
  }, [agreementId]);

  const berubah = data ? JSON.stringify(blok) !== JSON.stringify(data.blok) : false;
  const galatBlok = useMemo(() => blok.map(b => {
    const asing = [...placeholderAsing(b.judul), ...placeholderAsing(b.isi)];
    if (!b.judul.trim()) return 'Judul wajib diisi';
    if (!b.isi.trim()) return 'Isi wajib diisi';
    if (asing.length) return `Placeholder tidak dikenal: {${asing[0]}}`;
    return null;
  }), [blok]);
  const adaGalat = galatBlok.some(Boolean);

  const pratinjau = useMemo(() => {
    if (!data) return [];
    try { return renderPasal({ varian: data.varian, blok }, data.data_render); } catch { return []; }
  }, [data, blok]);

  const ubah = (i: number, p: Partial<BlokPasal>) => setBlok(prev => prev.map((b, j) => (j === i ? { ...b, ...p } : b)));
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
    const baru = `${teks.slice(0, awal)}{${kunci}}${teks.slice(akhir)}`;
    ubah(i, { isi: baru });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = awal + kunci.length + 2;
      el.setSelectionRange(pos, pos);
    });
  };

  const simpan = async (body: { blok: BlokPasal[] } | { reset: true }) => {
    setSibuk(true); setPesan(null);
    const r = await simpanPasalPerjanjian(agreementId, body);
    setSibuk(false);
    if (r.success && r.data) {
      terima(r.data);
      setPesan({ jenis: 'ok', teks: 'reset' in body ? 'Isi pasal dikembalikan ke template.' : 'Isi pasal tersimpan.' });
    } else setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal menyimpan' });
  };

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-[#94A3B8] flex items-center gap-2">
        {pesan ? <span className="text-red-600">{pesan.teks}</span> : <><Loader2 size={14} className="animate-spin" /> Memuat isi pasal…</>}
      </div>
    );
  }

  const varianBeda = data.varian.listing !== data.varian_sekarang.listing || data.varian.tx.kode !== data.varian_sekarang.tx.kode;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3" data-uji="editor-pasal">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-[#0F172A] flex items-center gap-2"><FileSignature size={16} className="text-[#1565C0]" /> Isi Perjanjian (Pasal)</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">
            {LABEL_SUMBER[data.sumber]} · {labelVarian(data.varian)} · template v{data.template_versi}
            {data.diubah_oleh && <> · terakhir diubah {data.diubah_oleh}{data.diubah_at ? ` (${data.diubah_at})` : ''}</>}
          </div>
        </div>
        {!data.terkunci && (
          <div className="flex bg-gray-100 rounded-full p-0.5">
            {(['edit', 'pratinjau'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${mode === m ? 'bg-white text-[#1565C0] shadow-sm' : 'text-[#64748B]'}`}>
                {m === 'edit' ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> Pratinjau</>}
              </button>
            ))}
          </div>
        )}
      </div>

      {data.terkunci && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-[#475569]">
          <Lock size={14} className="flex-shrink-0 mt-0.5" />
          <div>Perjanjian sudah ditandatangani — isi pasal terkunci. Perubahan dibuat lewat <strong>Versi perbaikan</strong>.
            {data.sumber === 'arsip_pdf' && ' Teks yang ditandatangani tersimpan di PDF arsip.'}</div>
        </div>
      )}
      {data.salinan_rusak && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
          Salinan pasal tersimpan rusak — halaman tanda tangan pemilik tidak bisa dibuka. Tekan <strong>Kembalikan ke template</strong> untuk memulihkan.
        </div>
      )}
      {varianBeda && !data.terkunci && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>Isi pasal ini disusun untuk <strong>{labelVarian(data.varian)}</strong>, tapi konfigurasi sekarang <strong>{labelVarian(data.varian_sekarang)}</strong>. Tinjau ulang atau kembalikan ke template.</div>
        </div>
      )}
      {data.status === 'menunggu_ttd' && !data.terkunci && (
        <p className="text-[11px] text-[#64748B]">Link TTD sudah terkirim. Menyimpan perubahan membuat pemilik yang sedang membuka link diminta memuat ulang dan membaca isi terbaru.</p>
      )}

      {(mode === 'pratinjau' || data.terkunci) ? (
        <ol className="space-y-3" data-uji="pratinjau-pasal">
          {pratinjau.map(p => (
            <li key={p.pasal} className="text-sm text-[#0F172A]">
              <div className="font-bold">Pasal {p.pasal} — {p.judul}</div>
              <p className="text-[#334155] leading-relaxed whitespace-pre-line">{p.isi}</p>
            </li>
          ))}
          {pratinjau.length === 0 && <li className="text-xs text-[#94A3B8]">Tidak ada pasal untuk ditampilkan.</li>}
        </ol>
      ) : (
        <div className="space-y-3">
          {blok.map((b, i) => {
            const hilang = karakterHilangDiPdf(`${b.judul}${b.isi}`);
            return (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2" data-uji="blok-pasal">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1565C0] w-16 flex-shrink-0">Pasal {i + 1}</span>
                  <input value={b.judul} maxLength={MAKS_JUDUL} onChange={e => ubah(i, { judul: e.target.value })}
                    aria-label={`Judul pasal ${i + 1}`} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold" />
                  <button type="button" onClick={() => geser(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={`Naikkan pasal ${i + 1}`}><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => geser(i, 1)} disabled={i === blok.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={`Turunkan pasal ${i + 1}`}><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => { if (window.confirm(`Hapus Pasal ${i + 1}?`)) setBlok(prev => prev.filter((_, j) => j !== i)); }}
                    disabled={blok.length <= 1} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30" aria-label={`Hapus pasal ${i + 1}`}><Trash2 size={14} /></button>
                </div>
                <textarea ref={el => { isiRef.current[i] = el; }} value={b.isi} maxLength={MAKS_ISI} rows={Math.min(10, Math.max(3, Math.ceil(b.isi.length / 110)))}
                  onChange={e => ubah(i, { isi: e.target.value })} aria-label={`Isi pasal ${i + 1}`}
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
          <button type="button" disabled={blok.length >= MAKS_BLOK}
            onClick={() => setBlok(prev => [...prev, { judul: 'JUDUL PASAL BARU', isi: '' }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-[#334155] hover:border-[#1565C0] disabled:opacity-40">
            <Plus size={14} /> Tambah pasal
          </button>
        </div>
      )}

      {pesan && (
        <div className={`rounded-xl px-3 py-2 text-xs ${pesan.jenis === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{pesan.teks}</div>
      )}

      {!data.terkunci && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button type="button" disabled={sibuk || (data.sumber !== 'kustom' && !data.salinan_rusak && !berubah)}
            onClick={() => { if (window.confirm('Kembalikan seluruh isi pasal ke template? Perubahan manual akan hilang.')) void simpan({ reset: true }); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-[#475569] disabled:opacity-40">
            <RotateCcw size={13} /> Kembalikan ke template
          </button>
          <div className="flex items-center gap-2">
            {berubah && <span className="text-[11px] text-amber-700">Belum disimpan</span>}
            <button type="button" disabled={sibuk || !berubah || adaGalat} onClick={() => void simpan({ blok })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-xs font-semibold disabled:opacity-50">
              {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan isi pasal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
