// Pelacakan klik tombol WhatsApp yang tidak terikat properti (Footer, FAQ,
// Notaris, ChatWidget, halaman Kontak).
//
// Kenapa sendBeacon dan bukan fetch+await:
//   1. Navigasi ke wa.me terjadi SEGERA lewat <a href> aslinya. Kalau kita await
//      dulu, in-app browser Meta (IG/FB) memblokir pembukaan link setelah await —
//      gotcha yang sudah tercatat di CLAUDE.md.
//   2. Beacon tetap terkirim walau halaman langsung ditinggalkan, yang justru
//      kasus normal di sini.
// Konsekuensinya link WA TIDAK PERNAH bergantung pada endpoint ini: kalau
// /api/wa-click gagal atau diblokir adblock, tombolnya tetap berfungsi penuh.

import { trackEvent } from './tracking';

export type WaSource =
  | 'footer'
  | 'faq'
  | 'notaris'
  | 'chat_widget'
  | 'contact_page'
  | 'about_agent'
  | 'navbar';

export function trackWaClick(source: WaSource): void {
  if (typeof window === 'undefined') return;

  // Meta Pixel sisi browser (dedup dengan CAPI sisi server ditangani eventID
  // di endpoint; di sini cukup sinyal Contact biasa).
  try {
    trackEvent('Contact', { content_category: source });
  } catch {
    /* pelacakan tidak boleh menggagalkan klik */
  }

  try {
    const payload = JSON.stringify({ source_page: source });
    const blob = new Blob([payload], { type: 'application/json' });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/wa-click', blob);
      return;
    }

    // Fallback browser lama: keepalive agar request selamat saat halaman ditinggalkan.
    void fetch('/api/wa-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => { /* noop */ });
  } catch {
    /* noop */
  }
}
