import { useEffect } from "react";
import {
  Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData,
  useRouteError, isRouteErrorResponse,
} from "react-router";
import ChatWidget from "./components/ChatWidget";
import type { LoaderFunctionArgs } from "react-router";
import "../styles/index.css";

// Best-effort — kegagalan kirim laporan error TIDAK BOLEH melempar error baru
function reportClientError(message: string, stack?: string, context?: Record<string, unknown>) {
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(message).slice(0, 1000),
        stack: stack ? String(stack).slice(0, 4000) : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        context,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export interface TrackingConfig {
  pixels: Array<{ pixel_id: string; events_enabled: string[] }>;
  ga4_measurement_id: string | null;
  gtm_container_id: string | null;
  search_console_verification: string | null;
  facebook_domain_verification: string | null;
}

const TRACKING_FALLBACK: TrackingConfig = {
  pixels: [], ga4_measurement_id: null, gtm_container_id: null, search_console_verification: null,
  facebook_domain_verification: null,
};

// SSR loader — query DB langsung (tanpa HTTP round-trip ke /api/tracking-config)
// Graceful fallback: tabel belum ada (sebelum migration) atau env tidak tersedia → TRACKING_FALLBACK
export async function loader({ context }: LoaderFunctionArgs): Promise<TrackingConfig> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (context as any)?.cloudflare?.env;
    if (!env?.DB) return TRACKING_FALLBACK;

    const [pixelRes, settingRes] = await Promise.all([
      env.DB.prepare("SELECT pixel_id, events_enabled FROM pixel_configs WHERE is_active = 1 ORDER BY id").all(),
      env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('ga4_measurement_id','gtm_container_id','search_console_verification','facebook_domain_verification')").all(),
    ]);

    const pixels = (pixelRes.results ?? []).map((r: Record<string, string>) => ({
      pixel_id: r.pixel_id,
      events_enabled: (() => { try { return JSON.parse(r.events_enabled ?? '[]'); } catch { return []; } })(),
    }));

    const sm: Record<string, string | null> = Object.fromEntries(
      (settingRes.results ?? []).map((r: Record<string, string>) => [r.key, r.value ?? null])
    );

    return {
      pixels,
      ga4_measurement_id:          sm.ga4_measurement_id          ?? null,
      gtm_container_id:            sm.gtm_container_id            ?? null,
      search_console_verification: sm.search_console_verification ?? null,
      facebook_domain_verification: sm.facebook_domain_verification ?? null,
    };
  } catch {
    return TRACKING_FALLBACK;
  }
}


export function Layout({ children }: { children: React.ReactNode }) {
  // useRouteLoaderData('root') — ambil data dari root route loader (tersedia di Layout per RRv7 docs)
  const tracking = useRouteLoaderData('root') as TrackingConfig | undefined;

  const pageViewPixels = (tracking?.pixels ?? []).filter(p => p.events_enabled.includes('PageView'));
  const ga4Id   = tracking?.ga4_measurement_id   ?? null;
  const gtmId   = tracking?.gtm_container_id     ?? null;
  const scVerif = tracking?.search_console_verification ?? null;
  const fbVerif = tracking?.facebook_domain_verification ?? null;

  // Meta Pixel init + PageView untuk semua pixel aktif yang punya 'PageView'
  const pixelScript = pageViewPixels.length > 0 ? [
    `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`,
    `window._sbpTracking=${JSON.stringify({ pixels: tracking?.pixels ?? [], ga4_measurement_id: ga4Id })};`,
    ...pageViewPixels.map(p => `fbq('init','${p.pixel_id}');`),
    `fbq('track','PageView');`,
  ].join('\n') : null;

  // gtag stub langsung tersedia (event ter-queue di dataLayer), tapi script
  // gtag.js/gtm.js baru dimuat setelah interaksi pertama (atau fallback 4s).
  // Ini memangkas ~200KB JS pihak ketiga dari critical path (Lighthouse LCP/TBT).
  const gtagScript = ga4Id
    ? `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga4Id}');`
    : null;

  const gtmHeadScript = gtmId
    ? `window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});`
    : null;

  const deferredSrcs = [
    ...(ga4Id ? [`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`] : []),
    ...(gtmId ? [`https://www.googletagmanager.com/gtm.js?id=${gtmId}`] : []),
  ];
  const deferredLoaderScript = deferredSrcs.length > 0
    ? `(function(){var evs=['scroll','pointerdown','keydown','touchstart'],done=false;function load(){if(done)return;done=true;evs.forEach(function(e){removeEventListener(e,load)});${deferredSrcs.map(src => `var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(src)};document.head.appendChild(s);`).join('')}}evs.forEach(function(e){addEventListener(e,load,{once:true,passive:true})});setTimeout(load,4000);})();`
    : null;

  return (
    <html lang="id" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="preload" href="/fonts/plus-jakarta-sans-latin-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <Meta />
        <Links />
        {scVerif && <meta name="google-site-verification" content={scVerif} suppressHydrationWarning />}
        {/* Verifikasi domain Meta. WAJIB ada di <head> HTML MENTAH — Meta
            menolak tag yang disuntikkan JavaScript. Ditempatkan di sini (bukan
            lewat script) supaya ikut ter-render SSR dan terbaca crawler
            Facebook tanpa menjalankan JS sama sekali. */}
        {fbVerif && <meta name="facebook-domain-verification" content={fbVerif} suppressHydrationWarning />}
        {pixelScript && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: pixelScript }} />}
        {gtagScript && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: gtagScript }} />}
        {gtmHeadScript && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: gtmHeadScript }} />}
        {deferredLoaderScript && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: deferredLoaderScript }} />}
      </head>
      <body suppressHydrationWarning>
        {gtmId && (
          <noscript suppressHydrationWarning>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0" width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
        <ChatWidget />
      </body>
    </html>
  );
}

// Hero background — dipakai sebagai og:image fallback situs-wide (pages tanpa meta sendiri)
const SITE_OG_IMAGE = "https://images.salambumi.xyz/salambumi.xyz.png";

export function meta() {
  return [
    { title: "Salam Bumi Property | Portal Properti Terpercaya Yogyakarta" },
    { name: "description", content: "Portal properti berbasis kepercayaan & kecerdasan investasi untuk Yogyakarta. Listing dikurasi & diverifikasi langsung oleh tim SBP." },
    { name: "robots", content: "index, follow" },
    { property: "og:site_name", content: "Salam Bumi Property" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: SITE_OG_IMAGE },
    { property: "og:image:width", content: "2560" },
    { property: "og:image:height", content: "1440" },
    { property: "og:image:alt", content: "Properti pilihan di Yogyakarta — Salam Bumi Property" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: SITE_OG_IMAGE },
  ];
}

export default function Root() {
  // Tangkap error yang TIDAK melewati render/loader (event handler, async di
  // useEffect, promise lepas) — ErrorBoundary di bawah cuma menangkap error
  // render/loader/action, bukan ini.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError(e.message, e.error?.stack, { type: 'window.onerror', filename: e.filename, lineno: e.lineno });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      reportClientError(message, stack, { type: 'unhandledrejection' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return <Outlet />;
}

// Menangkap error render/loader/action di seluruh route tree (React Router v7
// framework mode) — pengganti layar putih kosong saat komponen crash.
// Layout export di atas tetap membungkus ini (html/head/body tetap utuh).
export function ErrorBoundary() {
  const error = useRouteError();

  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? (error.data?.message ?? error.statusText ?? 'Terjadi kesalahan')
    : error instanceof Error
      ? error.message
      : 'Terjadi kesalahan yang tidak diketahui';

  useEffect(() => {
    if (!isRouteErrorResponse(error)) {
      const stack = error instanceof Error ? error.stack : undefined;
      reportClientError(message, stack, { type: 'ErrorBoundary', status });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-bold text-[#0F172A] mb-2">
        {status === 404 ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan'}
      </h1>
      <p className="text-[#64748B] mb-6 max-w-md">
        {status === 404
          ? 'Halaman yang Anda cari tidak tersedia atau sudah dipindahkan.'
          : 'Mohon maaf, terjadi kesalahan teknis. Tim kami telah menerima laporan otomatis.'}
      </p>
      <a href="/" className="px-5 py-2.5 rounded-xl bg-[#1565C0] text-white text-sm font-medium hover:bg-[#0F4C9C] transition-colors">
        Kembali ke Beranda
      </a>
      {import.meta.env.DEV && (
        <pre className="mt-6 p-4 bg-gray-100 text-xs text-left rounded-lg max-w-2xl overflow-x-auto text-red-600">
          {message}
        </pre>
      )}
    </div>
  );
}
