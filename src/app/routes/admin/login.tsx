// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
import { clientOnly } from '../../lib/clientOnly';
import AdminLoginSkeleton from '../../components/admin/AdminLoginSkeleton';

export default clientOnly(
  () => import('../../components/admin/AdminLoginPage'),
  AdminLoginSkeleton,
);
