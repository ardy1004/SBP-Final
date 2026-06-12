import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "../styles/index.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head suppressHydrationWarning>
        {/* Google Analytics 4 — manual install (CF Google Tag Gateway dimatikan) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-M4YC1Z6VNC" />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-M4YC1Z6VNC');` }} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Font self-hosted — preload agar tersedia sebelum CSS selesai parse */}
        <link rel="preload" href="/fonts/plus-jakarta-sans-latin-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function meta() {
  return [
    { title: "Salam Bumi Property | Portal Properti Terpercaya Yogyakarta" },
    { name: "description", content: "Portal properti berbasis kepercayaan & kecerdasan investasi untuk Yogyakarta. Listing dikurasi & diverifikasi langsung oleh tim SBP." },
    { name: "robots", content: "index, follow" },
    { property: "og:site_name", content: "Salam Bumi Property" },
    { property: "og:type", content: "website" },
  ];
}

export default function Root() {
  return <Outlet />;
}
