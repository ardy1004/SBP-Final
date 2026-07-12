import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import ChatWidget from "./components/ChatWidget";
import type { LoaderFunctionArgs } from "react-router";
import "../styles/index.css";

export interface TrackingConfig {
  pixels: Array<{ pixel_id: string; events_enabled: string[] }>;
  ga4_measurement_id: string | null;
  gtm_container_id: string | null;
  search_console_verification: string | null;
}

const TRACKING_FALLBACK: TrackingConfig = {
  pixels: [], ga4_measurement_id: null, gtm_container_id: null, search_console_verification: null,
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
      env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('ga4_measurement_id','gtm_container_id','search_console_verification')").all(),
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
  return <Outlet />;
}
