// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
import { clientOnly, MODUL_KOSONG } from '../../lib/clientOnly';
import AdminLoginSkeleton from '../../components/admin/AdminLoginSkeleton';

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/AdminLoginPage'),
  AdminLoginSkeleton,
);
