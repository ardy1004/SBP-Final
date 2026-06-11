import { Link } from 'react-router';
import { Phone, Mail, MapPin, Instagram, Facebook, Youtube } from 'lucide-react';

export default function Footer() {
  return (
    <footer style={{ background: '#061B35' }} className="text-white/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Col 1: Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img
                src="https://images.salambumi.xyz/materai/fav.webp"
                alt="SBP"
                className="h-10 w-10 rounded-lg object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="font-display">
                <div className="text-white font-bold">Salam Bumi Property</div>
                <div className="text-[#29B6F6] text-xs">salambumi.xyz</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed mb-4">
              Portal properti berbasis kepercayaan & kecerdasan investasi untuk Yogyakarta. Tanpa sistem agen — setiap listing dikurasi langsung oleh tim kami.
            </p>
            <div className="space-y-2 text-sm">
              <a href="https://wa.me/6281391278889" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-[#29B6F6] transition-colors">
                <Phone size={14} /> 0813-9127-8889
              </a>
              <a href="mailto:salambumiproperty@gmail.com"
                className="flex items-center gap-2 hover:text-[#29B6F6] transition-colors">
                <Mail size={14} /> salambumiproperty@gmail.com
              </a>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                <span>Jl. Pajajaran, Catur Tunggal, Depok, Sleman, DIY</span>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <a href="#" className="p-2 rounded-lg bg-white/10 hover:bg-[#1565C0] transition-colors">
                <Instagram size={16} />
              </a>
              <a href="#" className="p-2 rounded-lg bg-white/10 hover:bg-[#1565C0] transition-colors">
                <Facebook size={16} />
              </a>
              <a href="#" className="p-2 rounded-lg bg-white/10 hover:bg-[#1565C0] transition-colors">
                <Youtube size={16} />
              </a>
            </div>
          </div>

          {/* Col 2: Properti Dijual */}
          <div>
            <h3 className="text-white font-semibold font-display mb-4 text-sm uppercase tracking-wide">Properti Dijual</h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: 'Rumah Dijual Jogja', href: '/properties?jenis=rumah&tujuan=dijual' },
                { label: 'Kost Dijual Jogja', href: '/properties?jenis=kost&tujuan=dijual' },
                { label: 'Tanah Dijual Bantul', href: '/properties?jenis=tanah&kabupaten=bantul' },
                { label: 'Villa Dijual Sleman', href: '/properties?jenis=villa&kabupaten=sleman' },
                { label: 'Hotel Dijual Jogja', href: '/properties?jenis=hotel&tujuan=dijual' },
                { label: 'Rumah Dijual Sleman', href: '/properties?jenis=rumah&kabupaten=sleman' },
                { label: 'Kost Dekat UGM', href: '/properties?jenis=kost&kecamatan=depok' },
                { label: 'Apartemen Dijual Jogja', href: '/properties?jenis=apartemen&tujuan=dijual' },
              ].map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="hover:text-[#29B6F6] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Investasi & Sewa */}
          <div>
            <h3 className="text-white font-semibold font-display mb-4 text-sm uppercase tracking-wide">Investasi & Sewa</h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: 'Villa Disewa Kaliurang', href: '/properties?jenis=villa&tujuan=disewa&kecamatan=pakem' },
                { label: 'Homestay Disewa Jogja', href: '/properties?jenis=homestay&tujuan=disewa' },
                { label: 'Kost Investasi Terbaik', href: '/properties?jenis=kost&badge=premium' },
                { label: 'Hotel Investasi Jogja', href: '/properties?jenis=hotel' },
                { label: 'Ruko Disewa Sleman', href: '/properties?jenis=komersial&tujuan=disewa' },
                { label: 'Properti Yield Tinggi', href: '/properties?sort=yield' },
                { label: 'Investasi Properti Jogja', href: '/properties?badge=premium' },
              ].map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="hover:text-[#29B6F6] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Info & Hyperlokal */}
          <div>
            <h3 className="text-white font-semibold font-display mb-4 text-sm uppercase tracking-wide">Informasi</h3>
            <ul className="space-y-2 text-sm mb-6">
              {[
                { label: 'About Us', href: '/about' },
                { label: 'Blog & Tips Properti', href: '/blog' },
                { label: 'FAQ', href: '/faq' },
                { label: 'Layanan Notaris', href: '/notaris' },
                { label: 'Titip Jual', href: '/titip-jual' },
                // { label: 'Portofolio', href: '/portfolio' }, // disembunyikan sampai konten nyata — TODO aktifkan kembali
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Contact', href: '/contact' },
              ].map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="hover:text-[#29B6F6] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="text-white font-semibold mb-2 text-sm">Area Layanan</h4>
            <div className="text-xs space-y-1">
              <div>🏙️ Kota Yogyakarta</div>
              <div>🌆 Sleman</div>
              <div>🌳 Bantul</div>
              <div>⛰️ Gunung Kidul</div>
              <div>🌊 Kulon Progo</div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>© 2024 CV Salam Bumi Property. Semua hak dilindungi.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-[#29B6F6] transition-colors">Privacy Policy</Link>
            <Link to="/notaris" className="hover:text-[#29B6F6] transition-colors">Layanan Notaris</Link>
            <Link to="/faq" className="hover:text-[#29B6F6] transition-colors">FAQ</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
