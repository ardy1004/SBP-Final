// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// AdminListingPage menarik CsvImportModal dan grafnya yang besar.
import { clientOnly } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import('../../components/admin/AdminListingPage'),
  AdminPageSkeleton,
);
