// SSR-safe: komponen ini hanya dimuat client-side via React.lazy
import 'leaflet/dist/leaflet.css';
import './PropertyMap.css';
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Maximize2, BedDouble, Bath, MapPin, AlertCircle } from 'lucide-react';
import { getMapProperties, formatRupiah, type MapPinItem } from '../../lib/api';
import { cfImg } from '../../lib/img';

const JENIS_COLORS: Record<string, string> = {
  rumah: '#1565C0', kost: '#7C3AED', villa: '#10B981',
  tanah: '#F5A623', hotel: '#EF4444', apartment: '#0891B2',
  homestay: '#059669', gudang: '#78716C', komersial: '#DC2626',
};

const JENIS_LABELS: Record<string, string> = {
  rumah: 'Rumah', kost: 'Kost', villa: 'Villa', tanah: 'Tanah',
  hotel: 'Hotel', apartment: 'Apartment', homestay: 'Homestay',
  ruko: 'Ruko', gudang: 'Gudang', komersial: 'Komersial',
};

// Fix bundler icon paths dengan CDN fallback
(L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function createPriceIcon(harga: number, jenis: string) {
  const bg = JENIS_COLORS[jenis] ?? '#64748B';
  return L.divIcon({
    className: '',
    html: `<div class="sbp-pin-wrap"><div class="sbp-pin-pill" style="background:${bg}">${formatRupiah(harga)}</div><div class="sbp-pin-tail" style="border-top-color:${bg}"></div></div>`,
    iconAnchor: [40, 36],
    popupAnchor: [0, -38],
  });
}

function FitBounds({ pins }: { pins: MapPinItem[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map(p => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [pins, map]);
  return null;
}

function MapPopup({ pin }: { pin: MapPinItem }) {
  const imgSrc = pin.cover_url
    ? cfImg(`/api/media?key=${encodeURIComponent(pin.cover_url)}`, 520)
    : null;

  const kec  = pin.kecamatan.toLowerCase().replace(/\s+/g, '-');
  const prov = (pin.provinsi ?? 'di-yogyakarta').toLowerCase().replace(/\s+/g, '-');
  const kab  = pin.kabupaten.toLowerCase().replace(/\s+/g, '-');
  const detailPath = pin.tujuan === 'disewa'
    ? `/disewa/${pin.jenis_properti}/${prov}/${kab}/${kec}/${pin.slug}`
    : `/dijual/${pin.jenis_properti}/${prov}/${kab}/${kec}/${pin.slug}`;

  const jenisColor = JENIS_COLORS[pin.jenis_properti] ?? '#64748B';
  const jenisLabel = JENIS_LABELS[pin.jenis_properti] ?? pin.jenis_properti;
  const tujuanLabel = pin.tujuan === 'dijual_disewa' ? 'Dijual & Disewa'
    : pin.tujuan === 'disewa' ? 'Disewa' : 'Dijual';
  const tujuanBg = pin.tujuan === 'dijual' ? '#1565C0' : '#047857';

  const perM2 = pin.luas_tanah && pin.luas_tanah > 0
    ? Math.round(pin.harga / pin.luas_tanah) : null;

  const hasSpecs = pin.luas_tanah || pin.luas_bangunan || pin.jumlah_kamar_tidur || pin.jumlah_kamar_mandi;

  return (
    <div style={{ width: 260 }}>
      {/* Cover image + badge overlays */}
      <div style={{ position: 'relative', paddingTop: '56.25%', background: '#f3f4f6' }}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={pin.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🏠</div>
        )}
        {/* Jenis + tujuan badges — kiri atas, close button tidak tertimpa */}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4 }}>
          <span style={{ background: jenisColor, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, lineHeight: 1.6 }}>
            {jenisLabel}
          </span>
          <span style={{ background: tujuanBg, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, lineHeight: 1.6 }}>
            {tujuanLabel}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{
          margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {pin.title}
        </p>

        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
          <MapPin size={10} style={{ flexShrink: 0 }} />
          {pin.kecamatan}, {pin.kabupaten}
        </p>

        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1565C0', lineHeight: 1.2 }}>
          {formatRupiah(pin.harga)}
        </p>
        {perM2 !== null ? (
          <p style={{ margin: '1px 0 6px', fontSize: 10, color: '#9ca3af' }}>
            ~{formatRupiah(perM2)}/m²
          </p>
        ) : (
          <div style={{ marginBottom: 6 }} />
        )}

        {/* Specs */}
        {hasSpecs ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginBottom: 8, fontSize: 10, color: '#6b7280', alignItems: 'center' }}>
            {pin.luas_tanah ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Maximize2 size={11} /> LT {pin.luas_tanah}m²
              </span>
            ) : null}
            {pin.luas_bangunan ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Maximize2 size={11} /> LB {pin.luas_bangunan}m²
              </span>
            ) : null}
            {pin.jumlah_kamar_tidur ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <BedDouble size={11} /> {pin.jumlah_kamar_tidur}
              </span>
            ) : null}
            {pin.jumlah_kamar_mandi ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Bath size={11} /> {pin.jumlah_kamar_mandi}
              </span>
            ) : null}
          </div>
        ) : (
          <div style={{ marginBottom: 8 }} />
        )}

        <a
          href={detailPath}
          style={{ display: 'block', textAlign: 'center', padding: '7px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#fff', background: '#1565C0', textDecoration: 'none' }}
        >
          Lihat Detail →
        </a>
      </div>
    </div>
  );
}

interface Props {
  filters: { tujuan: string; jenis: string[]; kabupaten: string };
}

const DEFAULT_CENTER: [number, number] = [-7.797, 110.37];

export default function PropertyMap({ filters }: Props) {
  const [pins, setPins] = useState<MapPinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMapProperties({
      tujuan: filters.tujuan !== 'semua' ? filters.tujuan : undefined,
      jenis: filters.jenis.length > 0 ? filters.jenis.join(',') : undefined,
      kabupaten: filters.kabupaten || undefined,
    }).then(res => {
      if (res.success && res.data) setPins(res.data.items);
      else setError('Gagal memuat data peta');
    }).catch(() => setError('Gagal memuat data peta'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.tujuan, filters.jenis.join(','), filters.kabupaten]);

  if (loading) {
    return (
      <div className="h-[560px] rounded-2xl bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Memuat peta…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-[560px] rounded-2xl bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }
  if (pins.length === 0) {
    return (
      <div className="h-[560px] rounded-2xl bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-gray-500 text-sm">Tidak ada properti berkoordinat</p>
          <p className="text-gray-400 text-xs mt-1">Coba ubah filter atau tambah GPS ke listing</p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={10}
      style={{ height: 560, borderRadius: 16, zIndex: 0 }}
      className="w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds pins={pins} />
      {pins.map(pin => (
        <Marker key={pin.id} position={[pin.latitude, pin.longitude]} icon={createPriceIcon(pin.harga, pin.jenis_properti)}>
          <Popup maxWidth={260} minWidth={260} className="sbp-map-popup">
            <MapPopup pin={pin} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
