// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// AdminOverviewPage mengimpor recharts secara statis; tanpa pembungkus ini
// recharts ikut dievaluasi di entry SSR setiap kali isolate Worker lahir.
import { clientOnly, MODUL_KOSONG } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/AdminOverviewPage'),
  AdminPageSkeleton,
);
