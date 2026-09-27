import { useState, useEffect, useRef } from 'react';
import { Shield } from 'lucide-react';

const KUNCI = 'sbp_cookie_consent';

// ⚠️ localStorage WAJIB lewat try/catch — pola yang sama sudah dipakai
// src/lib/titipJualDraft.ts. Panggilan telanjang di dalam useEffect MELEMPAR di
// browser yang memblokir site data (in-app browser Meta, Safari private mode),
// dan lemparan itu menembus ErrorBoundary sehingga SELURUH halaman berubah jadi
// layar error 500. Terukur 3× pada 5 Sep 2026 di `/` dan `/hotel-dijual-jogja`:
// `Failed to read the 'localStorage' property` dengan context ErrorBoundary/500.
// Pengunjung tidak melihat properti sama sekali — di jalur iklan berbayar.
function bacaConsent(): { tersedia: boolean; nilai: string | null } {
  try {
    return { tersedia: true, nilai: localStorage.getItem(KUNCI) };
  } catch {
    return { tersedia: false, nilai: null };
  }
}

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Halaman tanda tangan: TIDAK memuat pelacak apa pun (tanpaPelacak() di
    // root.tsx), jadi tidak ada cookie yang perlu disetujui — dan banner fixed
    // ini justru menutupi kanvas tanda tangan di dasar layar (terverifikasi
    // Playwright 2026-09-27: elementFromPoint di kanvas = .cookie-banner).
    if (window.location.pathname.startsWith('/sign')) return;
    const { tersedia, nilai } = bacaConsent();
    // Storage tidak tersedia → JANGAN tampilkan. Kalau getItem melempar, setItem
    // juga akan melempar, jadi pilihan user tak pernah bisa disimpan dan banner
    // akan muncul lagi di SETIAP navigasi. Banner abadi lebih mengganggu daripada
    // tidak ada banner — dan halaman yang runtuh lebih buruk daripada keduanya.
    if (tersedia && !nilai) setShow(true);
  }, []);

  // Umumkan tinggi banner ke elemen `fixed` lain di dasar layar — saat ini FAB
  // kontak di ChatWidget, yang dirender di root.tsx DI LUAR Layout sehingga tidak
  // punya cara lain mengetahui banner ini ada. Tanpa ini keduanya berhimpit, dan
  // label FAB yang melebar menutupi tombol "Setuju"/"Tolak" di sini.
  //
  // Tingginya DIUKUR, bukan dihardcode: isi banner membungkus berbeda di tiap
  // lebar layar. ⚠️ Cleanup wajib — banner hilang setelah ditekan, dan var yang
  // tertinggal akan membuat FAB melayang di atas ruang kosong selamanya.
  useEffect(() => {
    const akar = document.documentElement;
    const el = bannerRef.current;
    if (!show || !el) {
      akar.style.removeProperty('--sbp-cookie-tinggi');
      return;
    }
    const ukur = () => akar.style.setProperty('--sbp-cookie-tinggi', `${el.offsetHeight}px`);
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => {
      ro.disconnect();
      akar.style.removeProperty('--sbp-cookie-tinggi');
    };
  }, [show]);

  // ⚠️ Pilihan WAJIB berefek. Dulu "Tolak" hanya menyembunyikan banner —
  // tidak disimpan (banner muncul lagi tiap halaman) dan Pixel/GA4 tetap
  // berjalan, padahal Kebijakan Privasi pasal 7 menjanjikan sebaliknya. Kini
  // pilihan disimpan dan langsung diterapkan; kunjungan berikutnya diterapkan
  // skrip inline di root.tsx SEBELUM Pixel/GA4 menyala.
  const pilih = (nilai: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(KUNCI, nilai);
    } catch {
      /* best-effort: banner tetap ditutup untuk sesi ini */
    }
    try {
      const w = window as unknown as { fbq?: (...a: unknown[]) => void; _sbpTracking?: { ga4_measurement_id?: string | null } } & Record<string, unknown>;
      w.fbq?.('consent', nilai === 'accepted' ? 'grant' : 'revoke');
      const ga = w._sbpTracking?.ga4_measurement_id;
      if (ga) w[`ga-disable-${ga}`] = nilai === 'rejected';
    } catch {
      /* pelacak belum/tidak dimuat — tidak ada yang perlu dimatikan */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    // paddingBottom safe-area: sejak root.tsx memakai `viewport-fit=cover`,
    // elemen ber-`fixed bottom-0` bisa tertimpa bar navigasi sistem di in-app
    // browser Meta. Tanpa baris ini tombol "Setuju" ikut tertutup — masalahnya
    // hanya berpindah dari sticky bar ke sini. Berfallback `, 0px`.
    //
    // ⚠️ TIDAK ada `bottom-0` di sini, dan itu disengaja: posisinya diatur
    // `.cookie-banner` di globals.css supaya banner bisa naik di atas sticky bar
    // halaman properti (var `--sbp-bottom-inset`). Menaruh `bottom-0` kembali
    // membuat dua aturan berspesifisitas sama saling menimpa menurut urutan CSS,
    // dan banner akan kembali menutupi satu-satunya tombol konversi mobile.
    <div
      ref={bannerRef}
      className="cookie-banner fixed left-0 right-0 z-50 px-4 pt-4"
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
            onClick={() => pilih('rejected')}
            className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white border border-white/20 transition-colors"
          >
            Tolak
          </button>
          <button
            onClick={() => pilih('accepted')}
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
