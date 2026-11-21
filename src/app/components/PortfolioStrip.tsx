import { Link } from 'react-router';
import { labelKategori, MIN_TAMPIL_BERANDA } from '../../../functions/_lib/portfolio.js';
import { urlFotoPortfolio, type PortfolioPublik } from '../../lib/api';

// Strip "Bukti Kerja" di beranda (2026-11-21, migrasi 0062): kotak foto kecil
// (AJB, survey lokasi, serah terima kunci) yang bergulir otomatis ke samping.
//
// ⚠️ Animasi MURNI CSS (.portofolio-geser di globals.css), tanpa JS/timer:
// render server & klien identik → tidak ada risiko hydration mismatch, dan
// tidak menambah kerja JS di halaman paling ramai. Daftar ditulis DUA kali
// lalu digeser −50% supaya putarannya mulus tanpa sambungan; salinan kedua
// aria-hidden & tidak bisa difokus. Jarak antar kotak memakai padding per
// item (bukan `gap`) supaya titik −50% tepat jatuh di awal salinan kedua.
// Berhenti saat kursor/sentuhan/fokus berada di jalur; prefers-reduced-motion
// → tanpa animasi, gulir manual, salinan disembunyikan.
//
// Gulir ke SAMPING, bukan ke atas: gulir vertikal otomatis di HP bertabrakan
// dengan gestur menggulir halaman.
// Satu "setengah putaran" harus LEBIH LEBAR dari layar terlebar (±1920 px ÷
// ±140 px per kotak ≈ 14 kotak). Kalau lebih sempit — mis. baru 4 foto —
// sisi kanan kosong selama geseran dan putarannya patah. Daftar karenanya
// diulang sampai cukup; semua ulangan aria-hidden.
const KOTAK_MIN_SETENGAH = 14;

export default function PortfolioStrip({ items }: { items: PortfolioPublik[] }) {
  if (items.length < MIN_TAMPIL_BERANDA) return null;
  const ulang = Math.max(1, Math.ceil(KOTAK_MIN_SETENGAH / items.length));
  const setengah = Array.from({ length: ulang }, (_, k) => items.map(it => ({ it, k }))).flat();
  // ±5 detik per kotak: cukup lambat untuk sempat membaca keterangan.
  const durasi = Math.max(24, setengah.length * 5);

  const kotak = (it: PortfolioPublik, salinan: boolean, kunci: string) => (
    <li key={`${kunci}-${it.id}`} className={`shrink-0 w-28 md:w-32 pr-3 ${salinan ? 'portofolio-salinan' : ''}`}
      aria-hidden={salinan || undefined}>
      <Link to={`/portfolio#p-${it.id}`} tabIndex={salinan ? -1 : undefined} className="block group">
        <div className="relative aspect-square rounded-xl overflow-hidden bg-[#E2E8F0]">
          <img src={urlFotoPortfolio(it.thumb_key)} alt={salinan ? '' : `${labelKategori(it.kategori)}${it.keterangan ? ` — ${it.keterangan}` : ''}`}
            width={128} height={128} loading="lazy" decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-white/90 text-[10px] font-semibold text-[#0F172A]">
            {labelKategori(it.kategori)}
          </span>
        </div>
        {it.keterangan && <p className="mt-1.5 text-[11px] leading-snug text-[#475569] line-clamp-2">{it.keterangan}</p>}
      </Link>
    </li>
  );

  return (
    <section aria-labelledby="judul-portofolio" className="py-10 md:py-14 bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1565C0]">Bukti Kerja</p>
          <h2 id="judul-portofolio" className="text-xl md:text-2xl font-bold text-[#0F172A]">Transaksi &amp; survey yang kami dampingi</h2>
        </div>
        <Link to="/portfolio" className="text-sm font-semibold text-[#1565C0] whitespace-nowrap hover:underline">Lihat semua →</Link>
      </div>
      <div className="portofolio-jalur pl-4 sm:pl-6 lg:pl-8">
        <ul className="portofolio-geser flex w-max" style={{ animationDuration: `${durasi}s` }}>
          {setengah.map(({ it, k }) => kotak(it, k > 0, `a${k}`))}
          {setengah.map(({ it, k }) => kotak(it, true, `b${k}`))}
        </ul>
      </div>
    </section>
  );
}
