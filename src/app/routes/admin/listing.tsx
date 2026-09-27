// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// AdminListingPage menarik CsvImportModal dan grafnya yang besar.
import { clientOnly, MODUL_KOSONG } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/AdminListingPage'),
  AdminPageSkeleton,
);
