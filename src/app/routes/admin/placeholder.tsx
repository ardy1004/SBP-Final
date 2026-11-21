// Route admin — client-only. Lihat src/app/lib/clientOnly.tsx untuk alasannya.
// Dipakai route Media (masih placeholder). Portfolio punya halaman sendiri sejak 2026-11-21.
import { clientOnly, MODUL_KOSONG } from '../../lib/clientOnly';
import AdminPageSkeleton from '../../components/admin/AdminPageSkeleton';

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../../components/admin/AdminPlaceholderPage'),
  AdminPageSkeleton,
);
