import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { MapPin, Maximize2, BedDouble, Bath, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import type { NormalizedProperty } from '../../lib/api';
import { formatRibuan } from '../../lib/format';
import { cfImg, cfSrcSet } from '../../lib/img';

interface Props {
  property: NormalizedProperty;
  className?: string;
}

const JENIS_COLOR: Record<string, string> = {
  Rumah: '#1565C0',
  Kost: '#7B3F00',
  Villa: '#2E7D32',
  Tanah: '#5D4037',
  Hotel: '#4527A0',
  Homestay: '#00838F',
  Apartemen: '#1565C0',
  Komersial: '#E65100',
  Gudang: '#37474F',
};

function formatHargaShort(n: number): string {
  if (!n) return '–';
  if (n >= 1_000_000_000) {
    const s = (n / 1_000_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `Rp ${s}M`;
  }
  if (n >= 1_000_000) {
    const s = (n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `Rp ${s}Jt`;
  }
  // Locale-independent: titik sebagai pemisah ribuan (id-ID style, tanpa toLocaleString)
  return `Rp ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// Fire-and-forget: dari kota mana kartu properti ini diklik (lihat migrasi
// 0036_property_click_geo.sql + widget "Sebaran Lokasi Audiens" di Ringkasan
// admin). sendBeacon tidak menunda navigasi — tidak ada preventDefault.
function trackCardClick(slug: string) {
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(`/api/properties/${slug}/track-click`);
  }
}

export default function PropertyCard({ property, className = '' }: Props) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartX = useRef(0);
  const imgs = property.images;
  const total = imgs.length;
  const isSold = property.status_sold;

  const kec = (property.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const jenisSlug = (property.jenisRaw ?? property.jenis).toLowerCase();
  const detailPath = property.tujuan === 'disewa'
    ? `/disewa/${jenisSlug}/${property.provinsi.toLowerCase().replace(/\s+/g, '-')}/${property.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${kec}/${property.slug}`
    : `/dijual/${jenisSlug}/${property.provinsi.toLowerCase().replace(/\s+/g, '-')}/${property.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${kec}/${property.slug}`;

  // Harga per m² cuma relevan untuk Tanah — jenis lain dijual gelondongan.
  const isTanah = jenisSlug === 'tanah';
  const hargaPerM2 = isTanah && property.luas_tanah && property.harga
    ? Math.round(property.harga / property.luas_tanah)
    : null;

  // Tanah diiklankan per meter, bukan gelondongan — agen menulisnya begitu di
  // judul listing sendiri ("Turun Harga Jadi 4,9 Juta/m²!"). Saat harga_mode
  // 'per_m2', angka per-m² jadi headline dan totalnya turun jadi baris kedua.
  const utamakanPerM2 = property.harga_mode === 'per_m2' && hargaPerM2 != null;

  function prevSlide(e: React.MouseEvent) {
    e.preventDefault();
    setSlideIdx(i => (i - 1 + total) % total);
  }
  function nextSlide(e: React.MouseEvent) {
    e.preventDefault();
    setSlideIdx(i => (i + 1) % total);
  }
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setDragOffset(0);
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (total <= 1) return;
    setDragOffset(e.touches[0].clientX - touchStartX.current);
  }, [total]);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (total > 1 && Math.abs(dx) > 40) {
      setSlideIdx(i => dx < 0 ? (i + 1) % total : (i - 1 + total) % total);
    }
    setDragOffset(0);
  }, [total]);

  const dotsCount = Math.min(total, 5);

  return (
    <div className={`property-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm ${className}`}>
      {/* Slider */}
      <div
        className="relative group overflow-hidden"
        style={{ paddingTop: '66.67%' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {total > 0 ? (
          <div
            className="absolute inset-0 flex"
            style={{
              width: `${total * 100}%`,
              transform: `translateX(calc(-${slideIdx * (100 / total)}% + ${dragOffset}px))`,
              transition: dragOffset !== 0 ? 'none' : 'transform 0.3s ease',
            }}
          >
            {imgs.map((img, i) => (
              <img
                key={i}
                src={cfImg(img!, 640)}
                srcSet={cfSrcSet(img!, [400, 640])}
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 400px"
                alt={i === 0 ? property.title : `${property.title} foto ${i + 1}`}
                className="h-full object-cover flex-shrink-0"
                style={{ width: `${100 / total}%` }}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                suppressHydrationWarning
              />
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#E3F2FD] to-[#BBDEFB] flex items-center justify-center">
            <span className="text-4xl opacity-40">{property.jenisEmoji}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Hover arrows */}
        {total > 1 && (
          <>
            <button
              onClick={prevSlide}
              aria-label="Foto sebelumnya"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={nextSlide}
              aria-label="Foto berikutnya"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {total > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex z-20">
            {Array.from({ length: dotsCount }).map((_, i) => (
              <button
                key={i}
                onClick={e => { e.preventDefault(); setSlideIdx(i); }}
                aria-label={`Lihat foto ${i + 1}`}
                className="w-6 h-6 flex items-center justify-center"
              >
                <span className={`w-1.5 h-1.5 rounded-full transition-all ${i === slideIdx % dotsCount ? 'bg-white scale-125' : 'bg-white/50'}`} />
              </button>
            ))}
          </div>
        )}

        {/* Jenis badge */}
        <div
          className="absolute top-3 left-3 px-2 py-1 rounded-lg text-white text-xs font-bold z-10"
          style={{ background: JENIS_COLOR[property.jenis] || '#1565C0' }}
        >
          {property.jenisEmoji} {property.jenis}
        </div>

        {/* Premium / Hot / Featured */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end z-10">
          {property.badge_premium && (
            <span
              className="premium-pulse px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'linear-gradient(135deg, #F5A623 0%, #FFD54F 60%, #F5A623 100%)', color: '#461B00' }}
            >
              ⭐ PREMIUM
            </span>
          )}
          {property.badge_hot && !property.badge_premium && (
            <span className="bg-[#EF4444] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
              🔥 HOT
            </span>
          )}
          {property.badge_featured && !property.badge_premium && !property.badge_hot && (
            <span className="bg-[#1565C0] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
              💎 FEATURED
            </span>
          )}
        </div>

        {/* Tujuan badges */}
        <div className="absolute bottom-3 left-3 flex gap-1 z-10">
          {(property.tujuan === 'dijual' || property.tujuan === 'dijual_disewa') && (
            <span className="bg-[#047857] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">Dijual</span>
          )}
          {(property.tujuan === 'disewa' || property.tujuan === 'dijual_disewa') && (
            <span className="bg-[#29B6F6] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">Disewa</span>
          )}
        </div>

        {/* SOLD stamp */}
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="absolute inset-0 bg-red-600/20" />
            <div className="relative border-4 border-red-600 rounded-lg px-4 py-2 rotate-[-20deg] bg-red-600/10">
              <span className="font-black text-red-600 text-3xl tracking-[0.3em] select-none">SOLD</span>
            </div>
          </div>
        )}

        {property.verified && (
          <div className="absolute bottom-3 right-3 z-10">
            <span className="bg-[#047857] text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
              ✅ Terverifikasi
            </span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4">
        <p className="text-[10px] text-gray-500 font-mono mb-1">{property.kode}</p>
        <h3 className="font-display font-bold text-[#0F172A] text-sm leading-tight mb-2 line-clamp-2 hover:text-[#1565C0] transition-colors">
          <Link to={detailPath} onClick={() => trackCardClick(property.slug)}>{property.title}</Link>
        </h3>
        <div className="flex items-center gap-1 text-[#64748B] text-xs mb-3">
          <MapPin size={11} />
          <span>{property.kecamatan}, {property.kabupaten}</span>
        </div>

        {/* Price */}
        <div className="mb-3">
          {property.harga_lama && (
            <span className="text-gray-500 text-xs line-through mr-2">{formatHargaShort(property.harga_lama)}</span>
          )}
          <span className="font-bold text-[#1565C0] text-lg font-display" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {utamakanPerM2 ? <>{formatHargaShort(hargaPerM2!)}<span className="text-sm font-semibold">/m²</span></> : formatHargaShort(property.harga)}
          </span>
          {property.nego && <span className="ml-1 text-xs text-gray-500">(Nego)</span>}
          {utamakanPerM2 ? (
            <div className="text-xs text-gray-500 mt-0.5">
              Total {formatHargaShort(property.harga)}
            </div>
          ) : hargaPerM2 && (
            <div className="text-xs text-gray-500 mt-0.5">
              ~{formatHargaShort(hargaPerM2)}/m²
            </div>
          )}
        </div>

        {/* Specs */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-3">
          {property.luas_tanah != null && (
            <span className="flex items-center gap-1"><Maximize2 size={10} /> LT: {property.luas_tanah}m²</span>
          )}
          {property.luas_bangunan != null && (
            <span className="flex items-center gap-1"><Maximize2 size={10} /> LB: {property.luas_bangunan}m²</span>
          )}
          {property.kamar_tidur != null && property.kamar_tidur > 0 && (
            <span className="flex items-center gap-1"><BedDouble size={10} /> KT: {property.kamar_tidur}</span>
          )}
          {property.kamar_mandi != null && property.kamar_mandi > 0 && (
            <span className="flex items-center gap-1"><Bath size={10} /> KM: {property.kamar_mandi}</span>
          )}
          {property.lantai != null && property.lantai > 0 && (
            <span className="flex items-center gap-1">🏢 Lantai: {property.lantai}</span>
          )}
          {property.legalitas && (
            <span className="flex items-center gap-1">📋 {property.legalitas}</span>
          )}
          {property.status_legalitas && (
            <span className="flex items-center gap-1">
              📜 {property.status_legalitas === 'on_hand' ? 'Sertif Di Tangan' : 'Sertif Di Bank'}
            </span>
          )}
        </div>

        <div className="text-[10px] text-gray-500 flex items-center justify-end mb-3">
          <span className="flex items-center gap-1"><Eye size={10} /> {formatRibuan(property.views_count)}</span>
        </div>

        {/* CTA */}
        <Link
          to={detailPath}
          onClick={() => trackCardClick(property.slug)}
          className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${isSold
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : 'bg-[#0B2447] text-white hover:bg-[#1565C0]'}`}
        >
          {isSold ? '🔒 Sudah Terjual' : 'Lihat Detail →'}
        </Link>
      </div>
    </div>
  );
}
