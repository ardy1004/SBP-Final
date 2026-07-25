// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// Modul terbesar di admin (3.364 baris); jszip & @ffmpeg sudah dinamis di dalamnya.
import { clientOnly } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import('../../components/admin/AdminViralFrameWorkspacePage'),
  AdminPageSkeleton,
);
