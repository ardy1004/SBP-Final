// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
import { clientOnly } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import('../../components/admin/AdminLayout'),
  AdminPageSkeleton,
);
