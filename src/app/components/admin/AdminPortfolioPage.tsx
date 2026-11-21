import { useEffect, useRef, useState } from 'react';
import { Briefcase, Upload, Trash2, GripVertical, ShieldAlert, Loader2, Square, X, Eye, EyeOff } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getPortfolioAdmin, unggahFotoPortfolio, buatPortfolio, ubahPortfolio, hapusPortfolio, urutPortfolio,
  urlFotoPortfolio, type PortfolioItem, type KategoriPortfolio, type IsianPortfolio,
} from '../../../lib/api';
import { KATEGORI_PORTFOLIO, MAKS_KETERANGAN, MIN_TAMPIL_BERANDA, periksaKeterangan } from '../../../../functions/_lib/portfolio.js';
import SensorFoto, { type KotakSensor } from './portfolio/SensorFoto';

// Admin → Portfolio (2026-11-21, migrasi 0062): foto bukti kerja (AJB, survey
// lokasi, serah terima kunci) untuk strip beranda & /portfolio.
//
// Alur: seret banyak foto ke kotak → tiap foto jadi DRAF (pratinjau lokal,
// belum terunggah) → admin memilih kategori, menulis keterangan, dan menutup
// bagian sensitif (SensorFoto) → "Simpan" memproses di <canvas>:
//   · kotak sensor diisi warna padat permanen,
//   · di-encode ulang ke WebP → EXIF/GPS TERBUANG (foto survey dari HP
//     menyimpan koordinat rumah),
//   · dua ukuran: 1280 px (lihat penuh) & 480 px (kotak beranda).
// Item tersimpan baru tampil publik setelah dicentang "sudah aman" + Tampil
// (dijaga juga di server — siapkanIsian di functions/_lib/portfolio.js).

const JENIS_DITERIMA = ['image/jpeg', 'image/png', 'image/webp'];
const WARNA_SENSOR = '#1E293B';

interface Draf {
  kunci: string;
  file: File;
  url: string;
  kotak: KotakSensor[];
  kategori: KategoriPortfolio;
  keterangan: string;
  status: 'siap' | 'mengunggah';
  galat?: string;
}

function muatGambar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar'));
    img.src = url;
  });
}

function keWebp(sumber: HTMLCanvasElement, sisiMaks: number, mutu: number): string {
  const skala = Math.min(1, sisiMaks / Math.max(sumber.width, sumber.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sumber.width * skala));
  c.height = Math.max(1, Math.round(sumber.height * skala));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sumber, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', mutu);
}

/** Terapkan sensor + encode ulang (EXIF terbuang) → dua ukuran WebP base64. */
async function olahFoto(url: string, kotak: KotakSensor[]): Promise<{ foto: string; thumb: string }> {
  const img = await muatGambar(url); // <img> menghormati orientasi EXIF sebelum EXIF-nya dibuang
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = WARNA_SENSOR;
  for (const k of kotak) ctx.fillRect(k.x * c.width, k.y * c.height, k.w * c.width, k.h * c.height);
  let foto = keWebp(c, 1280, 0.82);
  if (foto.length > 2.6e6) foto = keWebp(c, 1280, 0.65); // ±2 MB biner setelah base64
  const thumb = keWebp(c, 480, 0.78);
  if (!foto.startsWith('data:image/webp')) throw new Error('Browser ini tidak bisa membuat WebP — pakai Chrome/Edge terbaru');
  return { foto, thumb };
}

function ItemSortable({ id, children }: {
  id: number;
  children: (a: { setNodeRef: (el: HTMLElement | null) => void; style: React.CSSProperties; pegangan: React.HTMLAttributes<HTMLButtonElement>; seret: boolean }) => React.ReactElement;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition: transition ?? undefined },
    pegangan: { ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>,
    seret: isDragging,
  });
}

export default function AdminPortfolioPage() {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [draf, setDraf] = useState<Draf[]>([]);
  const [sensorKunci, setSensorKunci] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'galat'; teks: string } | null>(null);
  const [diatas, setDiatas] = useState(false);
  const inputFile = useRef<HTMLInputElement>(null);
  const urlDraf = useRef<string[]>([]);

  useEffect(() => {
    getPortfolioAdmin().then(r => {
      if (r.success && Array.isArray(r.data?.items)) setItems(r.data.items);
      else { setItems([]); setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal memuat portofolio' }); }
    }).catch(() => { setItems([]); setPesan({ jenis: 'galat', teks: 'Koneksi bermasalah' }); });
    return () => { urlDraf.current.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  const tambahBerkas = (files: FileList | File[]) => {
    const baru: Draf[] = [];
    for (const f of Array.from(files)) {
      if (!JENIS_DITERIMA.includes(f.type)) continue;
      const url = URL.createObjectURL(f);
      urlDraf.current.push(url);
      baru.push({ kunci: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f, url, kotak: [], kategori: 'survey', keterangan: '', status: 'siap' });
    }
    if (baru.length === 0) { setPesan({ jenis: 'galat', teks: 'Hanya foto JPG, PNG, atau WebP yang diterima' }); return; }
    setDraf(prev => [...prev, ...baru]);
    setPesan(null);
  };

  const ubahDraf = (kunci: string, p: Partial<Draf>) => setDraf(prev => prev.map(d => (d.kunci === kunci ? { ...d, ...p } : d)));
  const buangDraf = (kunci: string) => setDraf(prev => {
    const d = prev.find(x => x.kunci === kunci);
    if (d) URL.revokeObjectURL(d.url);
    return prev.filter(x => x.kunci !== kunci);
  });

  const simpanDraf = async (d: Draf) => {
    const g = periksaKeterangan(d.keterangan);
    if (g) { ubahDraf(d.kunci, { galat: g }); return false; }
    ubahDraf(d.kunci, { status: 'mengunggah', galat: undefined });
    try {
      const { foto, thumb } = await olahFoto(d.url, d.kotak);
      const up = await unggahFotoPortfolio(foto, thumb);
      if (!up.success || !up.data) throw new Error(up.error ?? 'Gagal mengunggah foto');
      const r = await buatPortfolio({ ...up.data, kategori: d.kategori, keterangan: d.keterangan.trim() });
      if (!r.success || !r.data?.item) throw new Error(r.error ?? 'Gagal menyimpan item');
      setItems(prev => [r.data!.item, ...(prev ?? [])]);
      buangDraf(d.kunci);
      return true;
    } catch (err) {
      ubahDraf(d.kunci, { status: 'siap', galat: (err as Error).message });
      return false;
    }
  };

  const simpanSemua = async () => {
    let ok = 0;
    for (const d of draf.filter(x => x.status === 'siap')) if (await simpanDraf(d)) ok++;
    setPesan({ jenis: 'ok', teks: `${ok} foto tersimpan. Centang "sudah aman" lalu nyalakan Tampil agar muncul di website.` });
  };

  // Optimistis untuk field pilihan (centang, kategori, tanggal): kotak centang
  // terkendali yang baru berubah setelah server membalas terasa "macet".
  // Server tetap hakim terakhir — balasannya menimpa, penolakan mengembalikan.
  const ubahItem = async (id: number, body: IsianPortfolio) => {
    const lama = items?.find(x => x.id === id);
    const opt: Partial<PortfolioItem> = {};
    if (body.aman_dikonfirmasi !== undefined) { opt.aman_dikonfirmasi = body.aman_dikonfirmasi ? 1 : 0; if (!body.aman_dikonfirmasi) opt.tampil = 0; }
    if (body.tampil !== undefined) opt.tampil = body.tampil ? 1 : 0;
    if (body.kategori !== undefined) opt.kategori = body.kategori;
    if (body.tanggal !== undefined) opt.tanggal = body.tanggal || null;
    if (Object.keys(opt).length) setItems(prev => (prev ?? []).map(x => (x.id === id ? { ...x, ...opt } : x)));
    const r = await ubahPortfolio(id, body);
    if (r.success && r.data?.item) {
      setItems(prev => (prev ?? []).map(x => (x.id === id ? r.data!.item : x)));
      return null;
    }
    if (lama) setItems(prev => (prev ?? []).map(x => (x.id === id ? lama : x)));
    setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal menyimpan perubahan' });
    return r.error ?? 'Gagal';
  };

  const hapusItem = async (id: number) => {
    if (!window.confirm('Hapus foto ini dari portofolio? Foto juga dihapus dari penyimpanan.')) return;
    const r = await hapusPortfolio(id);
    if (r.success) setItems(prev => (prev ?? []).filter(x => x.id !== id));
    else setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal menghapus' });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const selesaiSeret = async (e: DragEndEvent) => {
    if (!items || !e.over || e.active.id === e.over.id) return;
    const lama = items;
    const baru = arrayMove(items, items.findIndex(x => x.id === e.active.id), items.findIndex(x => x.id === e.over!.id));
    setItems(baru);
    const r = await urutPortfolio(baru.map(x => x.id));
    if (!r.success) { setItems(lama); setPesan({ jenis: 'galat', teks: r.error ?? 'Gagal menyimpan urutan' }); }
  };

  const jumlahTampil = (items ?? []).filter(x => x.tampil === 1).length;
  const drafSensor = draf.find(d => d.kunci === sensorKunci);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2"><Briefcase size={20} className="text-[#1565C0]" /> Portfolio — Bukti Kerja</h1>
        <p className="text-sm text-[#64748B]">
          Foto AJB, survey lokasi, dan serah terima kunci untuk strip &quot;Bukti Kerja&quot; di beranda dan halaman /portfolio.
          {' '}Tampil sekarang: <strong>{jumlahTampil}</strong> foto
          {jumlahTampil < MIN_TAMPIL_BERANDA ? ` — strip beranda baru muncul pada ${MIN_TAMPIL_BERANDA} foto.` : '.'}
        </p>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900">
        <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Foto AJB memuat data pribadi</strong> (nama, NIK, alamat, nomor sertifikat, tanda tangan). Tutup bagian itu dengan
          {' '}<strong>Tutup bagian sensitif</strong> sebelum menyimpan — penutupnya permanen. Data lokasi GPS di foto dibuang otomatis.
          {' '}Foto momen (jabat tangan di notaris, serah terima kunci) biasanya lebih meyakinkan daripada foto dokumen dari dekat.
        </div>
      </div>

      {pesan && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${pesan.jenis === 'ok' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {pesan.teks}
        </div>
      )}

      {/* Kotak seret-lepas */}
      <div
        onDragOver={e => { e.preventDefault(); setDiatas(true); }}
        onDragLeave={() => setDiatas(false)}
        onDrop={e => { e.preventDefault(); setDiatas(false); if (e.dataTransfer.files?.length) tambahBerkas(e.dataTransfer.files); }}
        onClick={() => inputFile.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputFile.current?.click(); }}
        data-uji="kotak-unggah"
        className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${diatas ? 'border-[#1565C0] bg-[#F0F7FF]' : 'border-gray-200 bg-white hover:border-[#1565C0]'}`}>
        <Upload size={28} className="mx-auto text-[#1565C0] mb-2" />
        <div className="font-semibold text-[#0F172A]">Seret foto ke sini, atau klik untuk memilih</div>
        <div className="text-xs text-[#64748B] mt-1">Bisa banyak sekaligus · JPG, PNG, WebP</div>
        <input ref={inputFile} type="file" accept={JENIS_DITERIMA.join(',')} multiple className="hidden"
          onChange={e => { if (e.target.files?.length) tambahBerkas(e.target.files); e.target.value = ''; }} />
      </div>

      {/* Draf — belum terunggah */}
      {draf.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[#0F172A]">Siapkan {draf.length} foto</div>
            <button type="button" onClick={simpanSemua} disabled={draf.every(d => d.status !== 'siap')}
              className="px-4 py-2 rounded-xl bg-[#1565C0] text-white text-sm font-semibold disabled:opacity-50">Simpan semua</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {draf.map(d => {
              const g = periksaKeterangan(d.keterangan);
              return (
                <div key={d.kunci} className="border border-gray-100 rounded-xl p-3 space-y-2" data-uji="draf">
                  <div className="relative rounded-lg overflow-hidden bg-gray-100">
                    <img src={d.url} alt="" className="w-full h-40 object-cover" />
                    {d.kotak.map((k, i) => (
                      <div key={i} className="absolute" style={{ left: `${k.x * 100}%`, top: `${k.y * 100}%`, width: `${k.w * 100}%`, height: `${k.h * 100}%`, background: WARNA_SENSOR }} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select value={d.kategori} onChange={e => ubahDraf(d.kunci, { kategori: e.target.value as KategoriPortfolio })}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white">
                      {KATEGORI_PORTFOLIO.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                    <button type="button" onClick={() => setSensorKunci(d.kunci)}
                      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border ${d.kategori === 'ajb' && d.kotak.length === 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 text-[#334155]'}`}>
                      <Square size={12} /> Tutup bagian sensitif{d.kotak.length ? ` (${d.kotak.length})` : ''}
                    </button>
                  </div>
                  <div>
                    <textarea value={d.keterangan} maxLength={MAKS_KETERANGAN} rows={2} placeholder="Keterangan singkat, mis. AJB rumah 2 lantai di Ngaglik"
                      onChange={e => ubahDraf(d.kunci, { keterangan: e.target.value, galat: undefined })}
                      className={`w-full px-2 py-1.5 rounded-lg border text-xs ${g ? 'border-red-300' : 'border-gray-200'}`} />
                    <div className="flex justify-between text-[10px] text-[#94A3B8]">
                      <span className="text-red-600">{g ?? d.galat ?? ''}</span>
                      <span>{d.keterangan.length}/{MAKS_KETERANGAN}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => simpanDraf(d)} disabled={d.status !== 'siap' || !!g}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1565C0] text-white text-xs font-semibold disabled:opacity-50">
                      {d.status === 'mengunggah' ? <><Loader2 size={12} className="animate-spin" /> Mengunggah…</> : 'Simpan'}
                    </button>
                    <button type="button" onClick={() => buangDraf(d.kunci)} disabled={d.status !== 'siap'}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-[#64748B]" aria-label="Buang draf"><X size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Item tersimpan */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="text-sm font-semibold text-[#0F172A] mb-1">Foto tersimpan {items ? `(${items.length})` : ''}</div>
        <p className="text-[11px] text-[#64748B] mb-3">Seret pegangan <GripVertical size={11} className="inline" /> untuk mengatur urutan tampil — paling kiri-atas tampil pertama.</p>
        {items === null ? (
          <div className="text-sm text-[#94A3B8] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Memuat…</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">Belum ada foto. Seret foto ke kotak di atas.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={selesaiSeret}>
            <SortableContext items={items.map(x => x.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {items.map(it => (
                  <ItemSortable key={it.id} id={it.id}>
                    {({ setNodeRef, style, pegangan, seret }) => (
                      <div ref={setNodeRef} style={style} className={`border rounded-xl p-2.5 bg-white space-y-2 ${seret ? 'shadow-lg border-[#1565C0] z-10' : 'border-gray-100'}`} data-uji="item">
                        <KartuItem item={it} pegangan={pegangan} onUbah={ubahItem} onHapus={hapusItem} />
                      </div>
                    )}
                  </ItemSortable>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {drafSensor && (
        <SensorFoto url={drafSensor.url} awal={drafSensor.kotak}
          onBatal={() => setSensorKunci(null)}
          onSelesai={k => { ubahDraf(drafSensor.kunci, { kotak: k }); setSensorKunci(null); }} />
      )}
    </div>
  );
}

function KartuItem({ item, pegangan, onUbah, onHapus }: {
  item: PortfolioItem;
  pegangan: React.HTMLAttributes<HTMLButtonElement>;
  onUbah: (id: number, body: IsianPortfolio) => Promise<string | null>;
  onHapus: (id: number) => void;
}) {
  const [ket, setKet] = useState(item.keterangan);
  const [lokasi, setLokasi] = useState(item.lokasi ?? '');
  const [kode, setKode] = useState(item.kode_listing ?? '');
  const g = periksaKeterangan(ket);
  const simpanTeks = (field: 'keterangan' | 'lokasi' | 'kode_listing', nilai: string, lama: string) => {
    if (nilai.trim() === lama.trim() || (field === 'keterangan' && g)) return;
    void onUbah(item.id, { [field]: nilai.trim() });
  };

  return (
    <>
      <div className="relative rounded-lg overflow-hidden bg-gray-100 aspect-[4/3]">
        <img src={urlFotoPortfolio(item.thumb_key)} alt="" className="w-full h-full object-cover" loading="lazy" />
        <button type="button" {...pegangan} aria-label="Seret untuk mengurutkan"
          className="absolute top-1.5 left-1.5 p-1 rounded-md bg-white/90 text-[#334155] cursor-grab active:cursor-grabbing touch-none">
          <GripVertical size={14} />
        </button>
        <span className={`absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${item.tampil ? 'bg-emerald-600 text-white' : 'bg-white/90 text-[#64748B]'}`}>
          {item.tampil ? <><Eye size={10} /> Tampil</> : <><EyeOff size={10} /> Tersembunyi</>}
        </span>
      </div>
      <select value={item.kategori} onChange={e => void onUbah(item.id, { kategori: e.target.value as KategoriPortfolio })}
        className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white">
        {KATEGORI_PORTFOLIO.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      <div>
        <textarea value={ket} rows={2} maxLength={MAKS_KETERANGAN} onChange={e => setKet(e.target.value)}
          onBlur={() => simpanTeks('keterangan', ket, item.keterangan)} placeholder="Keterangan"
          className={`w-full px-2 py-1 rounded-lg border text-xs ${g ? 'border-red-300' : 'border-gray-200'}`} />
        {g && <div className="text-[10px] text-red-600">{g}</div>}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <input value={lokasi} onChange={e => setLokasi(e.target.value)} onBlur={() => simpanTeks('lokasi', lokasi, item.lokasi ?? '')}
          placeholder="Lokasi (opsional)" className="px-2 py-1 rounded-lg border border-gray-200 text-xs" />
        <input type="date" value={item.tanggal ?? ''} onChange={e => void onUbah(item.id, { tanggal: e.target.value })}
          className="px-2 py-1 rounded-lg border border-gray-200 text-xs" aria-label="Tanggal" />
      </div>
      <input value={kode} onChange={e => setKode(e.target.value)} onBlur={async () => {
        if (kode.trim() === (item.kode_listing ?? '')) return;
        const galat = await onUbah(item.id, { kode_listing: kode.trim() });
        if (galat) setKode(item.kode_listing ?? '');
      }} placeholder="Kode listing terkait (opsional)" className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs" />
      <label className="flex items-start gap-1.5 text-[11px] text-[#334155]">
        <input type="checkbox" checked={item.aman_dikonfirmasi === 1} className="mt-0.5"
          onChange={e => void onUbah(item.id, { aman_dikonfirmasi: e.target.checked })} />
        Sudah aman ditampilkan (data pribadi tertutup)
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className={`flex items-center gap-1.5 text-xs font-semibold ${item.aman_dikonfirmasi ? 'text-[#0F172A]' : 'text-[#CBD5E1]'}`}>
          <input type="checkbox" checked={item.tampil === 1} disabled={item.aman_dikonfirmasi !== 1}
            onChange={e => void onUbah(item.id, { tampil: e.target.checked })} />
          Tampil di website
        </label>
        <button type="button" onClick={() => onHapus(item.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50" aria-label="Hapus foto">
          <Trash2 size={14} />
        </button>
      </div>
    </>
  );
}
