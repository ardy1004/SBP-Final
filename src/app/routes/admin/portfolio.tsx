// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// Loader WAJIB berbentuk `import.meta.env.SSR ? MODUL_KOSONG : import(…)` supaya
// halaman admin (dan dnd-kit) tidak ikut terbundel ke Worker (Asersi E check:bundle).
import { clientOnly, MODUL_KOSONG } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/AdminPortfolioPage'),
  AdminPageSkeleton,
);
