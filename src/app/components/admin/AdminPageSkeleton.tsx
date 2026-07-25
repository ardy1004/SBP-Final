/**
 * Placeholder yang dirender SERVER (dan pada render pertama klien) untuk setiap
 * route admin yang dibungkus src/app/lib/clientOnly.tsx.
 *
 * WAJIB SEPENUHNYA DETERMINISTIK. Tidak boleh ada Date.now(), Math.random(),
 * window, localStorage, atau format bergantung locale/timezone — server dan klien
 * harus menghasilkan markup yang persis sama, kalau tidak React akan melaporkan
 * hydration mismatch (#418/#421) dan menolak hasil render server.
 *
 * Hanya div statis + animate-pulse dari Tailwind (animasi CSS murni, tidak
 * memengaruhi markup).
 */
export default function AdminPageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Memuat halaman">
      {/* Judul + subjudul */}
      <div className="space-y-2">
        <div className="h-6 w-56 rounded-lg bg-gray-200" />
        <div className="h-3.5 w-72 rounded bg-gray-100" />
      </div>

      {/* Baris kartu ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 rounded-2xl bg-gray-100" />
        <div className="h-24 rounded-2xl bg-gray-100" />
        <div className="h-24 rounded-2xl bg-gray-100" />
        <div className="h-24 rounded-2xl bg-gray-100" />
      </div>

      {/* Blok konten utama */}
      <div className="h-72 rounded-2xl bg-gray-100" />
      <div className="h-40 rounded-2xl bg-gray-100" />
    </div>
  );
}
