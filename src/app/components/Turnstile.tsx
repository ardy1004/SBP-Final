import { useEffect, useRef } from 'react';

// Site key Turnstile — nilai PUBLIK (aman di-commit), bukan secret.
// Default = test key Cloudflare yang SELALU LULUS, supaya widget bisa dites tanpa
// konfigurasi. GANTI dengan site key produksi dari Dashboard → Turnstile.
// Secret (TURNSTILE_SECRET) di-set di Worker via `wrangler secret put`.
export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, any>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('turnstile-load-failed')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileProps {
  /** Dipanggil dengan token saat verifikasi berhasil. */
  onVerify: (token: string) => void;
  /** Dipanggil saat token kedaluwarsa / error (token harus dikosongkan). */
  onExpire?: () => void;
  className?: string;
}

/**
 * Widget Cloudflare Turnstile. Render hanya di client (butuh window) —
 * mengikuti pola SSR-safe di CLAUDE.md (dynamic init dalam useEffect).
 */
export default function Turnstile({ onVerify, onExpire, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Simpan callback terbaru tanpa memicu re-render widget
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => onExpireRef.current?.(),
        });
      })
      .catch(() => { /* gagal load: fail-open, backend tetap punya rate-limit WAF */ });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
