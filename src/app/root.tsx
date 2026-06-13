import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation, useRouteLoaderData } from "react-router";
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

function WhatsAppFAB() {
  const { pathname } = useLocation();
  if (/^\/(dijual|disewa)\/[^/]+\//.test(pathname)) return null;
  return (
    <a
      href="https://wa.me/6281391278889?text=Halo%2C%20saya%20tertarik%20dengan%20properti%20di%20Salam%20Bumi%20Property"
      target="_blank"
      rel="noopener noreferrer"
      style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: '#25D366', boxShadow: '0 4px 16px rgba(37,211,102,0.4)', transition: 'background 0.2s' }}
      aria-label="Chat via WhatsApp"
      onMouseEnter={e => (e.currentTarget.style.background = '#1EB858')}
      onMouseLeave={e => (e.currentTarget.style.background = '#25D366')}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
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

  const gtagScript = ga4Id
    ? `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`
    : null;

  const gtmHeadScript = gtmId
    ? `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`
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
        {ga4Id && <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} />}
        {gtagScript && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: gtagScript }} />}
        {gtmHeadScript && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: gtmHeadScript }} />}
      </head>
      <body>
        {gtmId && (
          <noscript>
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
        <WhatsAppFAB />
      </body>
    </html>
  );
}

// Hero background — dipakai sebagai og:image fallback situs-wide (pages tanpa meta sendiri)
const SITE_OG_IMAGE = "https://images.salambumi.xyz/kost%20dijual%20jogja.webp";

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
