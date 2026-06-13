// SSR-safe: komponen ini hanya dimuat client-side via React.lazy
import 'leaflet/dist/leaflet.css';
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getMapProperties, formatRupiah, type MapPinItem } from '../../lib/api';
import { cfImg } from '../../lib/img';
import { AlertCircle } from 'lucide-react';

// Fix bundler icon paths dengan CDN fallback
(L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function createPriceIcon(harga: number) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#1565C0;color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:2px solid #fff;cursor:pointer">${formatRupiah(harga)}</div>`,
    iconAnchor: [0, 0],
    popupAnchor: [60, 4],
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
    ? cfImg(`/api/media?key=${encodeURIComponent(pin.cover_url)}`, 280)
    : null;
  return (
    <div style={{ width: 200 }}>
      {imgSrc && (
        <img
          src={imgSrc}
          alt={pin.title}
          style={{ width: 'calc(100% + 24px)', height: 112, objectFit: 'cover', marginLeft: -12, marginTop: -12, marginBottom: 8, display: 'block' }}
          loading="lazy"
        />
      )}
      <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 2px', fontFamily: 'monospace' }}>{pin.jenis_properti}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 2px', lineHeight: 1.3 }} className="line-clamp-2">{pin.title}</p>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px' }}>{pin.kecamatan}, {pin.kabupaten}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#1565C0', margin: '0 0 8px' }}>{formatRupiah(pin.harga)}</p>
      <a
        href={`/properties/${pin.slug}`}
        style={{ display: 'block', textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#1565C0 0%,#29B6F6 100%)', textDecoration: 'none' }}
      >
        Lihat Detail
      </a>
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
        <Marker key={pin.id} position={[pin.latitude, pin.longitude]} icon={createPriceIcon(pin.harga)}>
          <Popup maxWidth={224} minWidth={200} className="sbp-map-popup">
            <MapPopup pin={pin} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
