import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { cocokInApp } from "../../functions/_lib/inAppBrowser.js";

/**
 * Pantau error hidrasi React (#418/#421/#423/#425) secara otomatis.
 *
 * KENAPA DI SINI, BUKAN DI root.tsx
 * Error hidrasi terjadi SELAMA hydrateRoot() — yaitu sebelum useEffect mana pun
 * sempat berjalan. Memasang penyadap di dalam komponen sudah terlambat: peringatannya
 * keluar lebih dulu dan hilang begitu saja. Jadi harus dipasang sebelum baris
 * hydrateRoot() di bawah.
 *
 * KENAPA BUKAN window.onerror
 * Error hidrasi TIDAK melempar exception, sehingga handler 'error'/
 * 'unhandledrejection' di root.tsx tidak pernah melihatnya. Lagipula handler itu
 * dipasang di dalam useEffect — yang baru berjalan SESUDAH hidrasi selesai.
 *
 * KENAPA ADA DUA KANAL, DAN KENAPA onRecoverableError YANG DIUTAMAKAN
 * (2026-08-30, semuanya DIUKUR pada build produksi lokal — jangan diganti
 * dengan penalaran tanpa pengukuran, dua tebakan sudah gagal di sini):
 *
 *   1. `console.error` TETAP menyala. Diukur: React DOM memanggil penangan
 *      hidrasi milik React Router, dan React Router-lah yang menulis ke
 *      console.error — jadi kanal ini nyata, bukan warisan mati. (Tebakan
 *      bahwa `window.reportError` membuat console.error tak pernah terpanggil
 *      TIDAK BENAR: reportError memang tersedia, console.error tetap dipanggil.)
 *   2. `onRecoverableError` adalah kait RESMI React, satu-satunya yang membawa
 *      **componentStack** — nama komponen yang tidak cocok. Persis informasi
 *      yang bikin diagnosis #418 kemarin butuh berjam-jam menebak, padahal
 *      React sudah memegangnya sejak awal.
 *
 * Dalam praktiknya kanal 1 SELALU menyala lebih dulu, jadi `jalur` di laporan
 * biasanya "console.error" dan componentStack tidak ikut terbawa.
 *
 * ⚠️ JANGAN mencoba "memenangkan" onRecoverableError dengan menunda laporan
 * console.error — sudah dicoba 2026-08-30 dan HASILNYA LEBIH BURUK: dengan
 * setTimeout 0 ms console.error tetap menang, dan dengan 50 ms laporannya
 * hilang sama sekali (0 terkirim pada kasus yang tadinya 1). Menambah risiko
 * kehilangan laporan demi field diagnostik tambahan bukan pertukaran yang sehat.
 * Melaporkan langsung, siapa pun yang menang, adalah perilaku yang terbukti.
 *
 * ⚠️ Pemantau yang tidak pernah dibuktikan MENYALA sama saja dengan tidak ada
 * pemantau, dan diam-diam lebih berbahaya karena senyapnya terbaca sebagai
 * "tidak ada masalah". Perubahan apa pun di sini WAJIB diuji dengan build
 * PRODUKSI (mode dev memakai jalur peringatan yang berbeda).
 *
 * KENAPA PENTING UNTUK PROJECT INI
 * CLAUDE.md mencatat React.lazy di jalur SSR sebagai penyebab #421, dan ke-17
 * route admin memakai clientOnly() yang hanya aman selama fallback-nya
 * deterministik (dilarang Date.now(), Math.random(), window, format ber-locale).
 * Pelanggaran aturan itu TIDAK terlihat mata — halaman tetap tampil normal —
 * dan hanya muncul sebagai peringatan console. Sekarang peringatan itu masuk ke
 * Admin → Errors sehingga terlihat tanpa perlu ada yang ingat mengeceknya.
 */
const RE_HIDRASI =
  /Minified React error #(418|421|423|425)\b|Hydration failed|hydrated but some attributes|did not match|Text content does not match/i;

// Satu mismatch memicu banyak peringatan; cukup laporkan sekali per muat halaman.
let sudahDilaporkan = false;

/**
 * In-app browser Meta (Facebook/Instagram/Threads). Bukan sekadar label kosmetik:
 *
 * Browser dalam aplikasi Meta MENYUNTIKKAN JavaScript ke halaman yang dibukanya.
 * Suntikan itu memakai pola baku `getElementsByTagName('script')[0]` +
 * `insertBefore`, yang menaruh node asing tepat di depan node yang dikelola
 * React → pohon bergeser → #418. Terbukti diukur ke produksi 2026-08-31:
 * tanpa injeksi 0 error, dengan injeksi 10 error. Dari 35 baris #418 saat itu,
 * 29 berasal dari sini dan 33 datang dari klik iklan (`?fbclid=`).
 *
 * ⚠️ Ini DI LUAR KENDALI KITA dan tidak bisa "diperbaiki" — tidak ada cara
 * bersih membuat <head> yang dihydrate React kebal terhadap injeksi pihak
 * ketiga. Tandanya dipakai Admin → Errors untuk menyembunyikannya secara
 * bawaan, supaya error yang BISA kita perbaiki tidak tenggelam. Laporannya
 * tetap dikirim utuh — disembunyikan, bukan dibuang, supaya kalau suatu saat
 * polanya berubah atau menyebar ke browser lain kita masih bisa melihatnya.
 *
 * Daftar penandanya sengaja TIDAK ditulis di sini: ia dipakai juga oleh filter
 * SQL di functions/api/admin/errors/index.js, dan versi duplikatnya sudah
 * pernah menyimpang (Threads lolos selama berhari-hari, 2026-09-01). Satu
 * sumber di functions/_lib/inAppBrowser.js.
 */
function browserInApp(): boolean {
  try {
    return cocokInApp(navigator.userAgent);
  } catch {
    return false;
  }
}

/** Best-effort, sama seperti reportClientError di root.tsx. Kegagalan mengirim
 *  laporan TIDAK BOLEH melahirkan error baru. */
function laporkanHidrasi(teks: string, stack: string | undefined, jalur: string) {
  if (sudahDilaporkan) return;
  sudahDilaporkan = true;
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: teks.slice(0, 1000),
        // componentStack menyebut komponen yang tidak cocok. Tanpa ini diagnosis
        // hanya punya nomor error dan harus ditebak-tebak lewat mode dev.
        stack: stack?.slice(0, 4000),
        url: window.location.href,
        // `jalur` = kanal mana yang menang. Tanpa ini kita tidak akan pernah
        // tahu kanal mana yang sebenarnya bekerja di browser pengunjung.
        // `in_app` = dipicu injeksi in-app browser Meta, di luar kendali kita.
        context: { type: 'hydration', jalur, in_app: browserInApp() },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* pelaporan tidak boleh pernah menjatuhkan halaman */ }
}

// Jaring sekunder: menangkap peringatan yang React tulis lewat console.error
// (mode dev menyebut elemen persisnya) dan jalur apa pun yang tidak melewati
// onRecoverableError. Bukan lagi jaring utama — lihat catatan di atas.
function pantauConsoleError() {
  const asli = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const teks = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
      if (RE_HIDRASI.test(teks)) {
        const err = args.find(a => a instanceof Error) as Error | undefined;
        laporkanHidrasi(teks, err?.stack, 'console.error');
      }
    } catch { /* penyadap tidak boleh pernah menjatuhkan halaman */ }
    asli(...args);   // perilaku console asli WAJIB tetap utuh
  };
}

pantauConsoleError();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      // Kait RESMI React untuk error yang bisa dipulihkan — termasuk seluruh
      // ketidakcocokan hidrasi. Mengoper opsi ini menggantikan default
      // `reportError ?? console.error`, jadi laporannya tidak lagi bergantung
      // pada browser mana yang sedang dipakai pengunjung.
      onRecoverableError(error, errorInfo) {
        try {
          const teks = error instanceof Error ? error.message : String(error);
          if (RE_HIDRASI.test(teks)) {
            laporkanHidrasi(teks, errorInfo?.componentStack ?? (error as Error)?.stack, 'onRecoverableError');
          }
        } catch { /* jangan pernah menjatuhkan hidrasi gara-gara pelaporan */ }
        // Default React menampilkan error ini; karena kita menggantikannya,
        // kita WAJIB menampilkannya sendiri — kalau tidak, error jadi tak
        // terlihat di DevTools dan penjaga check:hydration ikut buta.
        console.error(error);
      },
    },
  );
});
