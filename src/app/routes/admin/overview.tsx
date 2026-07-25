// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// AdminOverviewPage mengimpor recharts secara statis; tanpa pembungkus ini
// recharts ikut dievaluasi di entry SSR setiap kali isolate Worker lahir.
import { clientOnly } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import('../../components/admin/AdminOverviewPage'),
  AdminPageSkeleton,
);
