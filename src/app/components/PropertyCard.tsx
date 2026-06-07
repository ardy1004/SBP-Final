import { useState, useRef } from 'react';
import { Link } from 'react-router';
import { MapPin, Maximize2, BedDouble, Bath, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { type Property } from '../data/mockData';
import { formatRibuan } from '../../lib/format';

interface Props {
  property: Property;
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
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export default function PropertyCard({ property, className = '' }: Props) {
  const [slideIdx, setSlideIdx] = useState(0);
  const touchStartX = useRef(0);
  const imgs = property.images;
  const total = imgs.length;
  const isSold = property.status_sold || property.status_publish === 'sold';

  // Debug sementara (dev only) — verifikasi data spec sampai ke card
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('PropertyCard spec:', property.luas_tanah, property.kamar_tidur, property.legalitas);
  }

  const kec = (property.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const detailPath = property.tujuan === 'disewa'
    ? `/disewa/${property.jenis.toLowerCase()}/${property.provinsi.toLowerCase().replace(/\s+/g, '-')}/${property.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${kec}/${property.slug}`
    : `/dijual/${property.jenis.toLowerCase()}/${property.provinsi.toLowerCase().replace(/\s+/g, '-')}/${property.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${kec}/${property.slug}`;

  const hargaPerM2 = property.luas_tanah && property.harga
    ? Math.round(property.harga / property.luas_tanah)
    : null;

  function prevSlide(e: React.MouseEvent) {
    e.preventDefault();
    setSlideIdx(i => (i - 1 + total) % total);
  }
  function nextSlide(e: React.MouseEvent) {
    e.preventDefault();
    setSlideIdx(i => (i + 1) % total);
  }
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (total > 1 && Math.abs(dx) > 40) {
      setSlideIdx(i => dx < 0 ? (i + 1) % total : (i - 1 + total) % total);
    }
  }

  const dotsCount = Math.min(total, 5);

  return (
    <div className={`property-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm ${className}`}>
      {/* Slider */}
      <div
        className="relative group"
        style={{ paddingTop: '66.67%' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {total > 0 ? (
          <img
            src={imgs[slideIdx]!}
            alt={property.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
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
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {total > 1 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-1 z-20">
            {Array.from({ length: dotsCount }).map((_, i) => (
              <button
                key={i}
                onClick={e => { e.preventDefault(); setSlideIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === slideIdx % dotsCount ? 'bg-white scale-125' : 'bg-white/50'}`}
              />
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
            <span className="bg-[#10B981] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">Dijual</span>
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
            <span className="bg-[#10B981]/90 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
              ✅ Terverifikasi
            </span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4">
        <p className="text-[10px] text-gray-400 font-mono mb-1">{property.kode}</p>
        <h3 className="font-display font-bold text-[#0F172A] text-sm leading-tight mb-2 line-clamp-2 hover:text-[#1565C0] transition-colors">
          <Link to={detailPath}>{property.title}</Link>
        </h3>
        <div className="flex items-center gap-1 text-[#64748B] text-xs mb-3">
          <MapPin size={11} />
          <span>{property.kecamatan}, {property.kabupaten}</span>
        </div>

        {/* Price */}
        <div className="mb-3">
          {property.harga_lama && (
            <span className="text-gray-400 text-xs line-through mr-2">{formatHargaShort(property.harga_lama)}</span>
          )}
          <span className="font-bold text-[#1565C0] text-lg font-display" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatHargaShort(property.harga)}
          </span>
          {property.nego && <span className="ml-1 text-xs text-gray-500">(Nego)</span>}
          {hargaPerM2 && (
            <div className="text-xs text-gray-400 mt-0.5">
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

        <div className="text-[10px] text-gray-400 flex items-center justify-end mb-3">
          <span className="flex items-center gap-1"><Eye size={10} /> {formatRibuan(property.views_count)}</span>
        </div>

        {/* CTA */}
        <Link
          to={detailPath}
          className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${isSold
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#0B2447] text-white hover:bg-[#1565C0]'}`}
        >
          {isSold ? '🔒 Sudah Terjual' : 'Lihat Detail →'}
        </Link>
      </div>
    </div>
  );
}
