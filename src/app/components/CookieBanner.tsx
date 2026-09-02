import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('sbp_cookie_consent');
    if (!consent) setShow(true);
  }, []);

  const accept = () => {
    localStorage.setItem('sbp_cookie_consent', 'accepted');
    setShow(false);
  };

  if (!show) return null;

  return (
    // paddingBottom safe-area: sejak root.tsx memakai `viewport-fit=cover`,
    // elemen ber-`fixed bottom-0` bisa tertimpa bar navigasi sistem di in-app
    // browser Meta. Tanpa baris ini tombol "Setuju" ikut tertutup — masalahnya
    // hanya berpindah dari sticky bar ke sini. Berfallback `, 0px`.
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-4"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-4xl mx-auto bg-[#0B2447] text-white rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Shield size={20} className="text-[#29B6F6] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-white/80">
            Situs ini menggunakan cookie untuk analitik & pengalaman terbaik.{' '}
            <a href="/privacy" className="text-[#29B6F6] hover:underline">Kebijakan Privasi</a>
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white border border-white/20 transition-colors"
          >
            Tolak
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}
          >
            Setuju
          </button>
        </div>
      </div>
    </div>
  );
}
