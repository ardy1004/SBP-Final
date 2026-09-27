import { useEffect, useState, type ComponentType } from 'react';

/**
 * Pengganti `import()` di build SERVER. Pola WAJIB untuk setiap impor dinamis yang
 * hanya pernah dimuat di browser (route admin, peta, grafik, dnd-kit, dst.):
 *
 *   () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/X')
 *
 * KENAPA. clientOnly() saja hanya menjauhkan modul dari jalur EAGER — `import()`
 * yang tertulis tetap dibaca build server, jadi halaman admin beserta recharts,
 * leaflet, lodash, react-grid-layout, dnd-kit, d3, papaparse tetap ikut
 * terbundel ke Worker walau tak pernah dijalankan di sana: ±2,9 MB dari 5,9 MB,
 * dan CPU startup lokal 143 ms → 105 ms setelah dibuang (terukur 2026-09-27).
 * Vite mengganti `import.meta.env.SSR` dengan literal `true` di build server,
 * sehingga Rollup membuang cabang `import()` BESERTA seluruh graf dependensinya.
 * Di klien nilainya `false` → build klien identik (terukur: 145 berkas, sama byte).
 * Dijaga Asersi E di scripts/check-bundle-budget.mjs.
 *
 * Resolve ke komponen KOSONG, bukan promise yang tak pernah selesai: bila komponen
 * lazy suatu saat tak sengaja dirender saat SSR, hasilnya kosong — bukan stream
 * respons yang menggantung. Bertipe `never` supaya tidak mengotori inferensi tipe
 * props di cabang klien (yang memang satu-satunya cabang yang pernah dipakai di
 * browser).
 */
// @__PURE__: di build klien konstanta ini tak pernah dipakai → ikut dibuang.
export const MODUL_KOSONG = /* @__PURE__ */ Promise.resolve({ default: () => null }) as Promise<never>;

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
