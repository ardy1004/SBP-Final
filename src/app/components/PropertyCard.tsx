import { useState } from 'react';
import { Link } from 'react-router';
import { MapPin, Maximize2, BedDouble, Bath, Star, Eye } from 'lucide-react';
import { type Property, formatRupiah } from '../data/mockData';
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

export default function PropertyCard({ property, className = '' }: Props) {
  const [imgError, setImgError] = useState(false);
  const kec = (property.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const detailPath = property.tujuan === 'disewa'
    ? `/disewa/${property.jenis.toLowerCase()}/${property.provinsi.toLowerCase().replace(/\s+/g, '-')}/${property.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${kec}/${property.slug}`
    : `/dijual/${property.jenis.toLowerCase()}/${property.provinsi.toLowerCase().replace(/\s+/g, '-')}/${property.kabupaten.toLowerCase().replace(/\s+/g, '-')}/${kec}/${property.slug}`;

  const hargaPerM2 = property.luas_tanah && property.harga
    ? Math.round(property.harga / property.luas_tanah)
    : null;

  return (
    <div className={`property-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm ${className}`}>
      {/* Photo */}
      <div className="relative" style={{ paddingTop: '66.67%' }}>
        {!imgError ? (
          <img
            src={property.images[0]}
            alt={property.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#E3F2FD] to-[#BBDEFB] flex items-center justify-center">
            <span className="text-4xl opacity-40">{property.jenisEmoji}</span>
          </div>
        )}

        {/* Gradient overlay bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Top-left badge: Jenis */}
        <div
          className="absolute top-3 left-3 px-2 py-1 rounded-lg text-white text-xs font-bold"
          style={{ background: JENIS_COLOR[property.jenis] || '#1565C0' }}
        >
          {property.jenisEmoji} {property.jenis}
        </div>

        {/* Top-right badge: PREMIUM / HOT / FEATURED */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
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

        {/* Bottom-left: Tujuan */}
        <div className="absolute bottom-3 left-3 flex gap-1">
          {(property.tujuan === 'dijual' || property.tujuan === 'dijual_disewa') && (
            <span className="bg-[#10B981] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">Dijual</span>
          )}
          {(property.tujuan === 'disewa' || property.tujuan === 'dijual_disewa') && (
            <span className="bg-[#29B6F6] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">Disewa</span>
          )}
        </div>

        {/* SOLD overlay */}
        {property.status_sold && <div className="sold-overlay" />}
        {property.verified && (
          <div className="absolute bottom-3 right-3">
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
            <span className="text-gray-400 text-xs line-through mr-2">{formatRupiah(property.harga_lama)}</span>
          )}
          <span className="font-bold text-[#1565C0] text-lg font-display" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatRupiah(property.harga)}
          </span>
          {property.nego && <span className="ml-1 text-xs text-gray-500">(Nego)</span>}
          {hargaPerM2 && (
            <div className="text-xs text-gray-400 mt-0.5">
              ~{formatRupiah(hargaPerM2)}/m²
            </div>
          )}
        </div>

        {/* Specs */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-4">
          {property.luas_tanah && (
            <span className="flex items-center gap-1"><Maximize2 size={10} /> LT: {property.luas_tanah}m²</span>
          )}
          {property.luas_bangunan && (
            <span className="flex items-center gap-1"><Maximize2 size={10} /> LB: {property.luas_bangunan}m²</span>
          )}
          {property.kamar_tidur !== undefined && property.kamar_tidur > 0 && (
            <span className="flex items-center gap-1"><BedDouble size={10} /> KT: {property.kamar_tidur}</span>
          )}
          {property.kamar_mandi !== undefined && property.kamar_mandi > 0 && (
            <span className="flex items-center gap-1"><Bath size={10} /> KM: {property.kamar_mandi}</span>
          )}
          {property.lantai && (
            <span className="flex items-center gap-1">🏢 Lantai: {property.lantai}</span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 flex items-center justify-between mb-3">
          <span>📋 {property.legalitas}</span>
          <span className="flex items-center gap-1"><Eye size={10} /> {formatRibuan(property.views_count)}</span>
        </div>

        {/* CTA */}
        <Link
          to={detailPath}
          className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${property.status_sold
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#0B2447] text-white hover:bg-[#1565C0]'}`}
        >
          {property.status_sold ? '🔒 Sudah Terjual' : 'Lihat Detail →'}
        </Link>
      </div>
    </div>
  );
}
