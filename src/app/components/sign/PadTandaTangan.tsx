// Popup layar penuh untuk menggambar tanda tangan pemilik (/sign/:token).
//
// Dimuat MALAS dari SignPage dan hanya dirender setelah pemilik mengetuk slot
// TTD — tidak pernah dirender saat SSR, jadi React.lazy aman di sini (lihat
// CLAUDE.md). SignPage ada di chunk SSR utama yang anggarannya ketat; seluruh
// logika gambar sengaja tinggal di berkas ini.
//
// Goresan direkam sebagai TITIK (px CSS), bukan sebagai piksel kanvas. PNG yang
// dikirim ke server dirender ULANG dari titik-titik itu di ukuran akhirnya
// (functions/_lib/tataLetakTtd.js) dengan tebal tetap — jadi tebal di PDF tidak
// bergantung pada ukuran layar maupun besar-kecil pemilik menggambar, dan
// proporsinya sama persis dengan yang digambar.
//
// ⚠️ Elemen `fixed` — terdaftar di CLAUDE.md (daftar safe-area in-app browser).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw, X, Check } from 'lucide-react';
import { TEBAL_PT, PX_PER_PT, TTD_MAKS_W, TTD_MAKS_H } from '../../../../functions/_lib/tataLetakTtd.js';

export interface HasilTtd {
  dataUrl: string;
  /** Dimensi PNG (px) — dipakai pratinjau untuk menghitung posisi yang sama dengan PDF. */
  w: number;
  h: number;
}

type Titik = { x: number; y: number };

const WARNA = '#0F172A';
const TEBAL_LAYAR = 3;      // px CSS di popup
const MIN_PANJANG = 60;     // px CSS total panjang jalur
const MIN_SISI = 30;        // px CSS sisi terpanjang bbox tinta
const LEBAR_MAKS = 640;

function gambarGoresan(ctx: CanvasRenderingContext2D, g: Titik[], tebal: number, peta: (t: Titik) => Titik) {
  if (g.length === 0) return;
  const p = g.map(peta);
  ctx.strokeStyle = WARNA;
  ctx.fillStyle = WARNA;
  ctx.lineWidth = tebal;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0].x, p[0].y, tebal / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Kurva kuadratik lewat titik tengah antar-sampel → goresan halus, bukan patah-patah.
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length - 1; i++) {
    ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
  }
  ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  ctx.stroke();
}

function ukurTinta(goresan: Titik[][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, panjang = 0;
  for (const g of goresan) {
    g.forEach((t, i) => {
      minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
      if (i > 0) panjang += Math.hypot(t.x - g[i - 1].x, t.y - g[i - 1].y);
    });
  }
  return { minX, minY, bw: maxX - minX, bh: maxY - minY, panjang };
}

/**
 * Ukuran PNG keluaran untuk bbox tinta (px CSS). Bbox di-fit ke kotak maks
 * dikurangi padding, sehingga di PDF (letakTtd) satu sisi PNG PERSIS kotak maks
 * → 1 px = 1/PX_PER_PT pt dan tebal goresan tepat TEBAL_PT.
 */
function ukuranKeluaran(bboxW: number, bboxH: number) {
  const pad = TEBAL_PT + 1;
  const skala = Math.min((TTD_MAKS_W - 2 * pad) / Math.max(bboxW, 1e-6), (TTD_MAKS_H - 2 * pad) / Math.max(bboxH, 1e-6));
  return {
    skala, pad,
    pngW: Math.round((bboxW * skala + 2 * pad) * PX_PER_PT),
    pngH: Math.round((bboxH * skala + 2 * pad) * PX_PER_PT),
  };
}

/** Render ulang titik-titik ke PNG ukuran akhir (lihat ukuranKeluaran). */
function renderPng(goresan: Titik[][]): HasilTtd | null {
  const { minX, minY, bw, bh } = ukurTinta(goresan);
  const { skala, pad, pngW, pngH } = ukuranKeluaran(bw, bh);
  const c = document.createElement('canvas');
  c.width = pngW;
  c.height = pngH;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const peta = (t: Titik) => ({
    x: ((t.x - minX) * skala + pad) * PX_PER_PT,
    y: ((t.y - minY) * skala + pad) * PX_PER_PT,
  });
  for (const g of goresan) gambarGoresan(ctx, g, TEBAL_PT * PX_PER_PT, peta);
  return { dataUrl: c.toDataURL('image/png'), w: pngW, h: pngH };
}

interface Props {
  nama: string;
  onSimpan: (hasil: HasilTtd) => void;
  onTutup: () => void;
}

export default function PadTandaTangan({ nama, onSimpan, onTutup }: Props) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const goresanRef = useRef<Titik[][]>([]);
  const pointerRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef(0);
  const lebarLayarRef = useRef(0);
  const [ukuran, setUkuran] = useState<{ w: number; h: number } | null>(null);
  const [adaGoresan, setAdaGoresan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  // Ukuran area gambar DITETAPKAN dalam px, bukan mengikuti flex: bar alamat iOS
  // yang menciut/memanjang mengubah tinggi viewport berkali-kali, dan kanvas yang
  // ikut berubah ukuran = goresan terhapus di tengah menandatangani.
  const ukurArea = useCallback(() => {
    const el = wadahRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(200, Math.min(LEBAR_MAKS, Math.floor(r.width - 32)));
    const h = Math.max(160, Math.min(Math.floor(r.height - 24), Math.round(w * 0.8)));
    lebarLayarRef.current = window.innerWidth;
    setUkuran({ w, h });
  }, []);

  useLayoutEffect(() => { ukurArea(); }, [ukurArea]);

  const gambarUlang = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const g of goresanRef.current) gambarGoresan(ctx, g, TEBAL_LAYAR, t => t);
  }, []);

  // Buffer kanvas = ukuran CSS × devicePixelRatio → goresan tajam & rata ke segala arah.
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || !ukuran) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(ukuran.w * dpr);
    c.height = Math.round(ukuran.h * dpr);
    gambarUlang();
  }, [ukuran, gambarUlang]);

  // Tahan touchmove bawaan browser di area gambar (listener NON-pasif — onTouchMove
  // React selalu pasif). `touch-action: none` saja tidak cukup: gores jari yang
  // cepat tetap dibaca Chrome sebagai fling, lalu ketukan berikutnya (tombol
  // Simpan!) ditelan sebagai "hentikan fling" tanpa klik — terukur 4/8 gagal di
  // halaman uji polos, 0/8 setelah ini. Sekaligus mencegah scroll/tarik-refresh
  // di browser yang dukungan touch-action-nya lemah (Safari iOS lama).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const tahan = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    c.addEventListener('touchmove', tahan, { passive: false });
    return () => c.removeEventListener('touchmove', tahan);
  }, [ukuran]);

  const jadwalGambar = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; gambarUlang(); });
  }, [gambarUlang]);

  const kosongkan = useCallback(() => {
    goresanRef.current = [];
    pointerRef.current = null;
    setAdaGoresan(false);
    gambarUlang();
  }, [gambarUlang]);

  // Layar DIPUTAR (lebar berubah) → ukur ulang & minta gambar ulang. Perubahan
  // tinggi saja (bar alamat) diabaikan — lihat ukurArea.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth === lebarLayarRef.current) return;
      const tadiAda = goresanRef.current.length > 0;
      goresanRef.current = [];
      pointerRef.current = null;
      setAdaGoresan(false);
      setPesan(tadiAda ? 'Layar diputar — silakan gambar ulang tanda tangan Anda.' : null);
      ukurArea();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ukurArea]);

  // Kunci scroll halaman selama popup terbuka; Esc menutup (desktop).
  useEffect(() => {
    const body = document.body;
    const lama = body.style.overflow;
    body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup(); };
    window.addEventListener('keydown', onKey);
    return () => {
      body.style.overflow = lama;
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafRef.current);
    };
  }, [onTutup]);

  const posisi = (e: { clientX: number; clientY: number }): Titik => {
    const r = rectRef.current!;
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Hanya satu jari/pena: jari kedua (mis. telapak tangan) diabaikan.
    if (pointerRef.current !== null || !e.isPrimary) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerRef.current = e.pointerId;
    rectRef.current = e.currentTarget.getBoundingClientRect();
    goresanRef.current.push([posisi(e)]);
    setAdaGoresan(true);
    setPesan(null);
    jadwalGambar();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerRef.current) return;
    const g = goresanRef.current[goresanRef.current.length - 1];
    const n = e.nativeEvent;
    const sampel = typeof n.getCoalescedEvents === 'function' ? n.getCoalescedEvents() : [];
    for (const ev of sampel.length ? sampel : [n]) {
      const t = posisi(ev);
      const akhir = g[g.length - 1];
      if (!akhir || akhir.x !== t.x || akhir.y !== t.y) g.push(t);
    }
    jadwalGambar();
  };

  const selesaiGores = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId === pointerRef.current) pointerRef.current = null;
  };

  const simpan = () => {
    const g = goresanRef.current;
    const { bw, bh, panjang } = ukurTinta(g);
    if (!g.length || panjang < MIN_PANJANG || Math.max(bw, bh) < MIN_SISI) {
      setPesan('Tanda tangan terlalu pendek — gambar tanda tangan lengkap Anda.');
      return;
    }
    const hasil = renderPng(g);
    if (!hasil) { setPesan('Gagal menyimpan tanda tangan. Silakan coba lagi.'); return; }
    onSimpan(hasil);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-pad-ttd"
      className="fixed inset-0 z-[100] bg-white flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        overscrollBehavior: 'contain',
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p id="judul-pad-ttd" className="font-semibold text-[#0F172A] text-sm">Tanda Tangan Pihak Kedua</p>
          <p className="text-xs text-[#64748B] truncate">{nama}</p>
        </div>
        <button type="button" onClick={onTutup} aria-label="Tutup" className="p-2 -mr-2 text-[#64748B] hover:text-[#0F172A]">
          <X size={20} />
        </button>
      </div>

      <p className="px-4 pt-3 text-xs text-[#64748B] text-center">
        Gambar tanda tangan Anda di area bertitik di bawah ini, lalu tekan <strong>Simpan</strong>.
      </p>

      <div ref={wadahRef} className="flex-1 min-h-0 flex items-center justify-center px-4 py-3">
        {ukuran && (
          <div
            className="relative rounded-xl bg-white"
            style={{ width: ukuran.w, height: ukuran.h, outline: '2px dashed #CBD5E1', outlineOffset: -2 }}
          >
            <div className="absolute left-5 right-5 border-b border-[#CBD5E1] pointer-events-none" style={{ top: '72%' }} />
            <span className="absolute left-5 text-lg leading-none text-[#94A3B8] pointer-events-none" style={{ top: 'calc(72% - 1.4rem)' }}>×</span>
            {!adaGoresan && (
              <p className="absolute inset-x-0 top-[30%] text-center text-sm text-[#CBD5E1] pointer-events-none select-none">
                Tanda tangan di sini
              </p>
            )}
            <canvas
              ref={canvasRef}
              aria-label="Area tanda tangan"
              className="absolute inset-0 cursor-crosshair"
              style={{ width: ukuran.w, height: ukuran.h, touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={selesaiGores}
              onPointerCancel={selesaiGores}
              onLostPointerCapture={selesaiGores}
            />
          </div>
        )}
      </div>

      {pesan && <p role="alert" className="px-4 pb-1 text-center text-xs text-[#DC2626]">{pesan}</p>}

      <div className="flex gap-3 px-4 py-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => { kosongkan(); setPesan(null); }}
          disabled={!adaGoresan}
          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-[#475569] disabled:opacity-40"
        >
          <RotateCcw size={15} /> Ulangi
        </button>
        <button
          type="button"
          onClick={simpan}
          disabled={!adaGoresan}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1976D2] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={17} /> Simpan tanda tangan
        </button>
      </div>
    </div>
  );
}
