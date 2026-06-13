// Client-side tracking helper — digunakan Fase P2/P3 untuk fire event spesifik.
// Fase P1: setup window._sbpTracking + trackEvent stub.
// PageView dihandle otomatis via script injection di root.tsx (server-side).

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    _sbpTracking?: {
      pixels: Array<{ pixel_id: string; events_enabled: string[] }>;
      ga4_measurement_id: string | null;
    };
  }
}

/**
 * Fire a tracking event to all active pixels + GA4.
 * Untuk Meta Pixel: hanya fire ke pixel yang punya eventName di events_enabled.
 * Untuk GA4: fire ke semua jika ga4_measurement_id ada.
 *
 * Gunakan event names standar Meta: 'ViewContent', 'Search', 'Contact', 'Lead', 'PageView'.
 */
export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  // Meta Pixel — fire per-pixel (hanya yang events_enabled include eventName)
  if (window.fbq && window._sbpTracking?.pixels?.length) {
    for (const px of window._sbpTracking.pixels) {
      if (px.events_enabled.includes(eventName)) {
        // trackSingle agar hanya satu pixel yang menerima event ini (multi-pixel safe)
        window.fbq('trackSingle', px.pixel_id, eventName, params ?? {});
      }
    }
  }

  // GA4
  if (window.gtag && window._sbpTracking?.ga4_measurement_id) {
    window.gtag('event', eventName, params ?? {});
  }
}
