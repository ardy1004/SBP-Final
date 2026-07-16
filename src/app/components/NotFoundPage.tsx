import { Link, data } from 'react-router';
import { Home, Search } from 'lucide-react';

// URL tak dikenal WAJIB balas HTTP 404 asli (bukan status 200 "soft-404") —
// data(null, {status:404}) tetap merender komponen normal tapi set status response.
export function loader() {
  return data(null, { status: 404 });
}

export function meta() {
  return [
    { title: "Halaman Tidak Ditemukan | Salam Bumi Property" },
    { name: "robots", content: "noindex" },
  ];
}

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F0F4F8' }}>
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold font-display text-[#E2E8F0] mb-2">404</div>
        <div className="text-5xl mb-4">🏚️</div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A] mb-3">Halaman Tidak Ditemukan</h1>
        <p className="text-[#64748B] mb-8 leading-relaxed">
          Sepertinya properti yang Anda cari tidak tersedia atau URL sudah berubah. Jangan khawatir — kami punya banyak pilihan lain!
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            <Home size={16} /> Ke Beranda
          </Link>
          <Link to="/properties" className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#1565C0] border border-[#1565C0] hover:bg-[#E3F2FD] transition-colors">
            <Search size={16} /> Lihat Properti
          </Link>
        </div>
      </div>
    </div>
  );
}
