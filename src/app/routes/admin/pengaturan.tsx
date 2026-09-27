// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// AdminSettingsPage mengimpor react-grid-layout (+2 berkas CSS) secara statis.
import { clientOnly, MODUL_KOSONG } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/AdminSettingsPage'),
  AdminPageSkeleton,
);
