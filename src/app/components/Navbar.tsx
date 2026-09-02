import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';
import { cfImg } from '../../lib/img';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Properties', href: '/properties' },
  // { label: 'Portofolio', href: '/portfolio' }, // disembunyikan sampai konten nyata — TODO aktifkan kembali
  { label: 'About Us', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isTransparentPage = location.pathname === '/';

  const navBg = isTransparentPage
    ? scrolled
      ? 'bg-[#0B2447] shadow-lg'
      : 'bg-transparent'
    : 'bg-[#0B2447] shadow-lg';

  return (
    <>
      {/* paddingTop safe-area: `viewport-fit=cover` di root.tsx membuat halaman
          membentang sampai ke balik poni/status bar. Tanpa ini logo dan tombol
          menu bisa tertimpa di iPhone berponi. Berfallback `, 0px` sehingga
          browser tanpa inset tidak berubah sama sekali. */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${navBg}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <img
                src={cfImg('https://images.salambumi.xyz/materai/fav.webp', 80)}
                alt="Salam Bumi Property"
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                suppressHydrationWarning
              />
              <div className="font-display">
                <div className="text-white font-bold text-sm leading-tight">Salam Bumi</div>
                <div className="text-[#29B6F6] text-xs font-semibold leading-tight">Property</div>
              </div>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = location.pathname === link.href ||
                  (link.href !== '/' && location.pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`px-3 py-2 text-sm font-medium transition-all duration-200 relative group
                      ${isActive ? 'text-[#29B6F6]' : 'text-white/90 hover:text-[#29B6F6]'}`}
                  >
                    {link.label}
                    <span className={`absolute bottom-0 left-3 right-3 h-0.5 bg-[#29B6F6] transition-transform duration-200
                      ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} />
                  </Link>
                );
              })}
            </div>

            {/* CTA + Mobile Menu */}
            <div className="flex items-center gap-3">
              <Link
                to="/titip-jual"
                className="hidden sm:block px-4 py-2 rounded-[10px] text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
              >
                Titip Jual
              </Link>
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 text-white rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${mobileOpen ? 'visible' : 'invisible'}`}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileOpen(false)}
        />
        <div className={`absolute top-0 right-0 h-full w-72 bg-[#0B2447] transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* Offset ADITIF, bukan pengganti: navbar kini 4rem + inset atas, jadi
              `pt-20` (5rem) statis tidak lagi menjamin tautan pertama bebas dari
              navbar di perangkat berponi. Bawahnya juga diberi jarak karena panel
              ini `h-full` sehingga menyentuh bar navigasi sistem.
              ⚠️ Sengaja inline, BUKAN kelas .pt-nav/.pb-safe — keduanya MENIMPA
              nilai dasar, sedangkan di sini 5rem dan 1.5rem harus dipertahankan. */}
          <div
            className="px-6 flex flex-col gap-1"
            style={{
              paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))',
              paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isActive ? 'bg-[#1565C0] text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-4 pt-4 border-t border-white/10">
              <Link
                to="/titip-jual"
                className="block text-center px-4 py-3 rounded-[10px] text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
              >
                Titip Jual Properti
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
