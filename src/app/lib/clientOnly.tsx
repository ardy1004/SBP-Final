import { useEffect, useState, type ComponentType } from 'react';

/**
 * Bungkus komponen route agar HANYA dimuat di browser, tidak pernah masuk graf
 * evaluasi SSR.
 *
 * KENAPA INI ADA
 * `functions/[[catchall]].js` mengimpor `dist/server/index.js` secara STATIS,
 * sehingga semua paket yang diimpor statis oleh entry SSR ikut dievaluasi setiap
 * kali isolate Worker lahir. Itu membebani anggaran CPU startup Cloudflare —
 * penyebab produksi mati total dengan Error 1102 pada 2026-07-25.
 *
 * Halaman admin tidak butuh SSR sama sekali (tidak ada SEO, semua data diambil
 * client-side lewat /api/*, dan tidak satu pun modul route admin mengekspor
 * loader/action/meta). Membungkusnya di sini memindahkan seluruh grafnya —
 * termasuk recharts, react-grid-layout, dan puluhan ikon lucide yang hanya
 * dipakai admin — keluar dari jalur evaluasi startup.
 *
 * KENAPA AMAN DARI HYDRATION MISMATCH
 * Server merender <Fallback/>. Render PERTAMA di klien juga <Fallback/>, karena
 * state masih null dan effect belum jalan. Pohon identik ⇒ tidak ada mismatch.
 * Penukaran ke komponen asli terjadi di effect setelah hidrasi selesai.
 *
 * SATU-SATUNYA CARA MERUSAKNYA adalah Fallback yang non-deterministik. Karena itu
 * Fallback DILARANG memuat Date.now(), Math.random(), window, localStorage, atau
 * format yang bergantung locale/timezone. Lihat AdminPageSkeleton.
 *
 * SENGAJA BUKAN React.lazy + Suspense — CLAUDE.md mencatat pola itu memicu
 * hydration mismatch #421 pada komponen yang ikut dirender saat SSR. Pola di sini
 * (mounted-flag + await import) sama dengan KPRCalculatorClient di
 * src/app/components/PropertyDetailPage.tsx yang sudah terbukti aman.
 */
/**
 * Nilai kembalinya sengaja `FunctionComponent<P>`, BUKAN `ComponentType<P>`.
 * `ComponentType` ikut mencakup class component, sedangkan React Router menuntut
 * `module.default` sebuah route berupa fungsi yang bisa dipanggil. Memakai
 * ComponentType membuat typegen menolak ke-17 route admin dengan
 * "ComponentClass provides no match for the signature '(...args: any[]): unknown'".
 * Implementasi di bawah memang selalu mengembalikan function component.
 */
export function clientOnly<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  Fallback: ComponentType,
): React.FunctionComponent<P> {
  return function ClientOnlyRoute(props: P) {
    const [Comp, setComp] = useState<ComponentType<P> | null>(null);

    useEffect(() => {
      let alive = true;
      loader()
        .then(m => { if (alive) setComp(() => m.default); })
        .catch(err => { console.error('[clientOnly] gagal memuat modul route:', err); });
      return () => { alive = false; };
    }, []);

    if (!Comp) return <Fallback />;
    return <Comp {...props} />;
  };
}
