// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// Dipakai route Portfolio dan Media (keduanya masih placeholder).
import { clientOnly } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import('../../components/admin/AdminPlaceholderPage'),
  AdminPageSkeleton,
);
