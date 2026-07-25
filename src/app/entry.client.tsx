import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

/**
 * Pantau error hidrasi React (#418/#421/#423/#425) secara otomatis.
 *
 * KENAPA DI SINI, BUKAN DI root.tsx
 * Error hidrasi terjadi SELAMA hydrateRoot() — yaitu sebelum useEffect mana pun
 * sempat berjalan. Memasang penyadap di dalam komponen sudah terlambat: peringatannya
 * keluar lebih dulu dan hilang begitu saja. Jadi harus dipasang sebelum baris
 * hydrateRoot() di bawah.
 *
 * KENAPA console.error, BUKAN window.onerror
 * React melaporkan ketidakcocokan hidrasi lewat console.error dan TIDAK melempar
 * exception, sehingga handler 'error'/'unhandledrejection' di root.tsx tidak
 * pernah melihatnya. Selama ini satu-satunya cara mengetahuinya adalah membuka
 * DevTools secara manual — artinya praktis tidak pernah terpantau.
 *
 * KENAPA PENTING UNTUK PROJECT INI
 * CLAUDE.md mencatat React.lazy di jalur SSR sebagai penyebab #421, dan ke-17
 * route admin memakai clientOnly() yang hanya aman selama fallback-nya
 * deterministik (dilarang Date.now(), Math.random(), window, format ber-locale).
 * Pelanggaran aturan itu TIDAK terlihat mata — halaman tetap tampil normal —
 * dan hanya muncul sebagai peringatan console. Sekarang peringatan itu masuk ke
 * Admin → Errors sehingga terlihat tanpa perlu ada yang ingat mengeceknya.
 */
function pantauErrorHidrasi() {
  const asli = console.error;
  let sudahDilaporkan = false;   // satu mismatch memicu banyak peringatan; cukup laporkan sekali per muat halaman

  console.error = (...args: unknown[]) => {
    try {
      const teks = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
      const hidrasi =
        /Minified React error #(418|421|423|425)\b/.test(teks) ||
        /Hydration failed|hydrated but some attributes|did not match|Text content does not match/i.test(teks);

      if (hidrasi && !sudahDilaporkan) {
        sudahDilaporkan = true;
        // Best-effort, sama seperti reportClientError di root.tsx. Kegagalan
        // mengirim laporan TIDAK BOLEH melahirkan error baru.
        fetch('/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: teks.slice(0, 1000),
            url: window.location.href,
            context: { type: 'hydration' },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch { /* penyadap tidak boleh pernah menjatuhkan halaman */ }

    asli(...args);   // perilaku console asli WAJIB tetap utuh
  };
}

pantauErrorHidrasi();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});
