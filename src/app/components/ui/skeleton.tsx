// Sengaja TANPA cn() (tailwind-merge + clsx). Skeleton dirender saat SSR, dan
// cn() di sini satu-satunya alasan kedua paket itu dievaluasi eager di SETIAP
// startup Worker (Asersi A check-bundle, 2026-09-27). Satu-satunya bentrok yang
// pernah terjadi: pemanggil mengirim rounded-* untuk menggantikan rounded-md
// bawaan — ditangani di bawah, hasilnya setara twMerge. Pemanggil tidak pernah
// mengirim bg-* atau animate-*; kalau suatu saat perlu, tangani di sini juga,
// JANGAN kembalikan cn().
function Skeleton({ className = "", ...props }: React.ComponentProps<"div">) {
  const bawaan = /(^|\s)rounded(\s|-|$)/.test(className)
    ? "bg-accent animate-pulse"
    : "bg-accent animate-pulse rounded-md";
  return (
    <div
      data-slot="skeleton"
      className={className ? `${bawaan} ${className}` : bawaan}
      {...props}
    />
  );
}

export { Skeleton };
