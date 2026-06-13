import { Link } from 'react-router';
import { cfImg } from '../../lib/img';
import { formatRupiah } from '../../lib/api';

export interface ChatPropItem {
  id: number;
  slug: string;
  title: string;
  jenis_properti: string;
  tujuan: string;
  harga: number;
  provinsi?: string;
  kecamatan: string;
  kabupaten: string;
  cover_url: string | null;
}

export default function ChatPropertyCard({ prop }: { prop: ChatPropItem }) {
  const prov = (prop.provinsi ?? 'di-yogyakarta').toLowerCase().replace(/\s+/g, '-');
  const kab  = prop.kabupaten.toLowerCase().replace(/\s+/g, '-');
  const kec  = (prop.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const href = prop.tujuan === 'disewa'
    ? `/disewa/${prop.jenis_properti}/${prov}/${kab}/${kec}/${prop.slug}`
    : `/dijual/${prop.jenis_properti}/${prov}/${kab}/${kec}/${prop.slug}`;

  const imgSrc = prop.cover_url
    ? cfImg(`/api/media?key=${encodeURIComponent(prop.cover_url)}`, 320)
    : null;

  return (
    <Link
      to={href}
      className="block flex-shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow"
      style={{ width: 160 }}
    >
      {/* Cover image 4:3 */}
      <div style={{ position: 'relative', paddingTop: '75%', background: '#f3f4f6' }}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={prop.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
            🏠
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-1.5">
        <p className="text-[11px] font-medium text-gray-800 leading-snug line-clamp-2 mb-0.5">
          {prop.title}
        </p>
        <p className="text-[10px] text-gray-400 truncate mb-0.5">
          {prop.kecamatan}{prop.kabupaten ? `, ${prop.kabupaten.replace(/^(Kabupaten|Kota)\s+/i, '')}` : ''}
        </p>
        <p className="text-[12px] font-bold" style={{ color: '#1565C0' }}>
          {formatRupiah(prop.harga)}
        </p>
      </div>
    </Link>
  );
}
