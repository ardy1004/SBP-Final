/**
 * Placeholder yang dirender SERVER (dan pada render pertama klien) untuk route
 * admin/login yang dibungkus src/app/lib/clientOnly.tsx.
 *
 * WAJIB SEPENUHNYA DETERMINISTIK — lihat AdminPageSkeleton.tsx untuk alasannya.
 * Tidak boleh ada Date.now(), Math.random(), window, localStorage, atau format
 * bergantung locale/timezone.
 */
export default function AdminLoginSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-4 animate-pulse" aria-busy="true" aria-label="Memuat halaman login">
        <div className="h-8 w-40 mx-auto rounded-lg bg-gray-200" />
        <div className="h-11 rounded-xl bg-gray-100" />
        <div className="h-11 rounded-xl bg-gray-100" />
        <div className="h-11 rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}
