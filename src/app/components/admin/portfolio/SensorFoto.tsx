import { useRef, useState } from 'react';
import { X, Check, Undo2 } from 'lucide-react';

/** Kotak penutup dalam PECAHAN (0–1) terhadap lebar/tinggi foto — tak bergantung ukuran layar. */
export interface KotakSensor { x: number; y: number; w: number; h: number }

// Alat sensor portofolio (2026-11-21). Foto AJB memuat nama, NIK, alamat,
// nomor sertifikat, dan tanda tangan; foto ini akan tampil PUBLIK di beranda.
// Admin menarik kotak di atas bagian sensitif → saat diunggah, kotak itu diisi
// warna PADAT di <canvas> (lihat olahFoto di AdminPortfolioPage). Sengaja
// warna padat, bukan blur/piksel: blur dan piksel kasar pada teks kadang masih
// bisa ditebak, warna padat tidak bisa dibalikkan sama sekali.
export default function SensorFoto({ url, awal, onSelesai, onBatal }: {
  url: string;
  awal: KotakSensor[];
  onSelesai: (kotak: KotakSensor[]) => void;
  onBatal: () => void;
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

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Tutup bagian sensitif foto">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-full overflow-auto p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-[#0F172A]">Tutup bagian sensitif</div>
            <p className="text-xs text-[#64748B]">
              Tarik kotak di atas nama, NIK, alamat, nomor sertifikat, tanda tangan, atau wajah yang tidak ingin ditampilkan.
              Kotak akan menjadi warna padat permanen di foto yang diunggah.
            </p>
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
          <img src={url} alt="Foto yang akan disensor" className="block w-full h-auto pointer-events-none" draggable={false} />
          {[...kotak, ...(tarik ? [tarik] : [])].map((k, i) => (
            <div key={i} className={`absolute ${i < kotak.length ? 'bg-[#1E293B]' : 'bg-[#1E293B]/60 border-2 border-white'}`}
              style={{ left: `${k.x * 100}%`, top: `${k.y * 100}%`, width: `${k.w * 100}%`, height: `${k.h * 100}%` }} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[#64748B]">{kotak.length} kotak penutup</span>
          <div className="flex gap-2">
            <button type="button" disabled={kotak.length === 0} onClick={() => setKotak(prev => prev.slice(0, -1))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40">
              <Undo2 size={14} /> Urungkan
            </button>
            <button type="button" onClick={() => onSelesai(kotak)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1565C0] text-white text-sm font-semibold">
              <Check size={14} /> Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
