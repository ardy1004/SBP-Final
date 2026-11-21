import { useEffect, useRef, useState } from 'react';
import { X, Check, Undo2, Loader2 } from 'lucide-react';
import { gambarDenganPenutup, muatGambar, ovalDari, type KotakSensor } from './penutup';

export type { KotakSensor } from './penutup';

// Alat sensor portofolio (2026-11-21). Foto AJB memuat nama, NIK, alamat,
// nomor sertifikat, dan tanda tangan, dan foto ini tampil PUBLIK di beranda.
// Admin menarik kotak di atas bagian sensitif → bagian itu ditutup oval
// "blur aman" (penutup.ts) dan ditanam permanen di foto yang diunggah.
//
// Sejak 2026-11-22 penutupnya bukan lagi kotak warna padat. Isi oval dibangun
// HANYA dari warna di sekelilingnya, sehingga sama amannya dengan kotak padat
// tapi tampil sebagai noda kabur lembut. Alasan lengkap & larangan memakai
// blur/piksel dari isi asli: komentar kepala penutup.ts.
//
// Juga dipakai untuk foto yang SUDAH tersimpan/tampil (2026-11-22): `url` =
// foto 1280 px yang tersimpan, `awal` = [] karena penutup lama sudah menyatu
// di piksel. Versi asli tidak pernah disimpan, jadi penutup hanya bisa
// DITAMBAH, tidak dibuka. `catatan` menjelaskan itu ke admin. Kotak hitam
// gaya lama bisa diganti noda blur dengan menarik oval yang menutupinya.

/**
 * Pratinjau = hasil akhir: memakai gambarDenganPenutup yang sama dengan
 * olahFoto (unggahan), pada resolusi yang sama (sisiMaks 1280 di alat sensor).
 */
export function KanvasPenutup({ url, kotak, sisiMaks = 1280, className }: {
  url: string;
  kotak: KotakSensor[];
  sisiMaks?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [galat, setGalat] = useState(false);
  useEffect(() => {
    let hidup = true;
    setImg(null); setGalat(false);
    muatGambar(url).then(i => { if (hidup) setImg(i); }).catch(() => { if (hidup) setGalat(true); });
    return () => { hidup = false; };
  }, [url]);
  useEffect(() => {
    if (!img || !ref.current) return;
    gambarDenganPenutup(ref.current, img, kotak, sisiMaks);
  }, [img, kotak, sisiMaks]);
  if (galat) return <div className={`${className ?? ''} flex items-center justify-center text-xs text-red-600`}>Gagal memuat foto</div>;
  return (
    <>
      {!img && <div className={`${className ?? ''} flex items-center justify-center text-[#94A3B8] min-h-24`}><Loader2 size={18} className="animate-spin" /></div>}
      <canvas ref={ref} className={`${className ?? ''} ${img ? '' : 'hidden'}`} data-uji="kanvas-penutup" />
    </>
  );
}

export default function SensorFoto({ url, awal, onSelesai, onBatal, catatan, labelSelesai = 'Selesai' }: {
  url: string;
  awal: KotakSensor[];
  onSelesai: (kotak: KotakSensor[]) => void;
  onBatal: () => void;
  catatan?: React.ReactNode;
  labelSelesai?: string;
}) {
  const [kotak, setKotak] = useState<KotakSensor[]>(awal);
  const [tarik, setTarik] = useState<KotakSensor | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const mulai = useRef<{ x: number; y: number } | null>(null);

  const posisi = (e: React.PointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const keKotak = (a: { x: number; y: number }, b: { x: number; y: number }): KotakSensor => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  });
  // Oval yang akan dipakai, dalam pecahan — ditampilkan SELAMA menarik supaya
  // admin melihat persis jangkauan penutupnya sebelum melepas.
  const ovalTarik = tarik ? ovalDari(tarik, 1, 1) : null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Tutup bagian sensitif foto">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-full overflow-auto p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-[#0F172A]">Tutup bagian sensitif</div>
            <p className="text-xs text-[#64748B]">
              Tarik di atas nama, NIK, alamat, nomor sertifikat, tanda tangan, atau wajah yang tidak ingin ditampilkan.
              Bagian itu ditutup lingkaran blur lembut yang permanen. Isi aslinya tidak ikut terbawa sama sekali, jadi tidak bisa dibaca ulang.
            </p>
            {catatan && <p className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{catatan}</p>}
          </div>
          <button type="button" onClick={onBatal} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div ref={area} className="relative w-full select-none touch-none cursor-crosshair rounded-lg overflow-hidden bg-gray-100"
          onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); mulai.current = posisi(e); setTarik(keKotak(mulai.current, mulai.current)); }}
          onPointerMove={e => { if (mulai.current) setTarik(keKotak(mulai.current, posisi(e))); }}
          onPointerUp={e => {
            if (!mulai.current) return;
            const k = keKotak(mulai.current, posisi(e));
            mulai.current = null;
            setTarik(null);
            if (k.w > 0.01 && k.h > 0.01) setKotak(prev => [...prev, k]);
          }}>
          <KanvasPenutup url={url} kotak={kotak} className="block w-full h-auto pointer-events-none" />
          {tarik && ovalTarik && (
            <>
              <div className="absolute border border-dashed border-white/80 pointer-events-none"
                style={{ left: `${tarik.x * 100}%`, top: `${tarik.y * 100}%`, width: `${tarik.w * 100}%`, height: `${tarik.h * 100}%` }} />
              <div className="absolute rounded-[50%] border-2 border-white bg-white/35 backdrop-blur-sm shadow-[0_0_0_1px_rgba(15,23,42,0.6)] pointer-events-none"
                style={{
                  left: `${(ovalTarik.cx - ovalTarik.rx) * 100}%`, top: `${(ovalTarik.cy - ovalTarik.ry) * 100}%`,
                  width: `${ovalTarik.rx * 200}%`, height: `${ovalTarik.ry * 200}%`,
                }} />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[#64748B]">{kotak.length} penutup</span>
          <div className="flex gap-2">
            <button type="button" disabled={kotak.length === 0} onClick={() => setKotak(prev => prev.slice(0, -1))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40">
              <Undo2 size={14} /> Urungkan
            </button>
            <button type="button" onClick={() => onSelesai(kotak)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-sm font-semibold">
              <Check size={14} /> {labelSelesai}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
