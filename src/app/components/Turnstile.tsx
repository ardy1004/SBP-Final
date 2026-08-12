import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// Site key Turnstile — nilai PUBLIK (aman di-commit), bukan secret.
// Site key produksi untuk salambumi.xyz (Dashboard → Turnstile).
// Pasangan secret-nya (TURNSTILE_SECRET) di-set di Pages via
// `wrangler pages secret put TURNSTILE_SECRET --project-name sbp-final`.
export const TURNSTILE_SITE_KEY = '0x4AAAAAADzWf7sppZk7H4QA';

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

/** 'memuat' = belum ada token (script/challenge berjalan) · 'siap' = token ada · 'gagal' = perlu dicoba ulang. */
export type TurnstileStatus = 'memuat' | 'siap' | 'gagal';

export interface TurnstileHandle {
  /** Jalankan ulang challenge dan terbitkan token baru. */
  reset: () => void;
}

interface TurnstileProps {
  /** Dipanggil dengan token saat verifikasi berhasil. */
  onVerify: (token: string) => void;
  /** Dipanggil saat token kedaluwarsa / error (token harus dikosongkan). */
  onExpire?: () => void;
  /**
   * Opsional. Tanpa ini pemanggil tidak punya cara mengetahui widget gagal
   * dimuat, sehingga user diam-diam dibiarkan menekan tombol kirim yang PASTI
   * ditolak 403 oleh backend — persis kegagalan yang ditemukan pada audit
   * 12 Agu 2026 di form Titip Jual.
   */
  onStatusChange?: (s: TurnstileStatus) => void;
  className?: string;
}

/**
 * Widget Cloudflare Turnstile. Render hanya di client (butuh window) —
 * mengikuti pola SSR-safe di CLAUDE.md (dynamic init dalam useEffect).
 *
 * ⚠️ BACKEND FAIL-CLOSED. Komentar lama di sini menyebut "gagal load: fail-open"
 * dan itu MENYESATKAN: begitu TURNSTILE_SECRET terpasang (dan di produksi ia
 * memang terpasang), `verifyTurnstile()` menolak setiap request tanpa token.
 * Jadi gagal memuat widget = 100% submit ditolak. Pemanggil WAJIB memakai
 * `onStatusChange` untuk memberi tahu user, bukan membiarkannya menebak.
 */
const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { onVerify, onExpire, onStatusChange, className }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Simpan callback terbaru tanpa memicu re-render widget
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onStatusRef = useRef(onStatusChange);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;
  onStatusRef.current = onStatusChange;

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (!widgetIdRef.current || !window.turnstile) { onStatusRef.current?.('gagal'); return; }
      try {
        onStatusRef.current?.('memuat');
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        onStatusRef.current?.('gagal');
      }
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    onStatusRef.current?.('memuat');
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => { onVerifyRef.current(token); onStatusRef.current?.('siap'); },
          // Kedaluwarsa bukan kegagalan: `refresh-expired` bawaan Turnstile
          // adalah 'auto', jadi widget menerbitkan token baru sendiri. Yang
          // benar adalah kembali ke 'memuat', bukan 'gagal'.
          'expired-callback': () => { onExpireRef.current?.(); onStatusRef.current?.('memuat'); },
          'error-callback':   () => { onExpireRef.current?.(); onStatusRef.current?.('gagal'); },
        });
      })
      .catch(() => { if (!cancelled) onStatusRef.current?.('gagal'); });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className={className} />;
});

export default Turnstile;
