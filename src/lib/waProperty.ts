// Jalur cepat "Chat WA Sekarang" untuk halaman detail properti.
//
// SATU pemanggil untuk TIGA titik masuk: tombol di sticky bar, tombol di kartu CTA
// inline, dan pintasan "Langsung WA" di header ContactAdminSheet. Sengaja satu
// fungsi: dua titik masuk yang menyimpang diam-diam adalah pola kegagalan berulang
// di repo ini — `check:turnstile` lahir persis karena `postLead()` dan
// `fetch('/api/leads')` mentah menyimpang tanpa satu pun gate memerah.
//
// Backend-nya (`functions/api/properties/[slug]/wa-click.js`) sudah lengkap dan
// TIDAK diubah: ia menaikkan `property_view_daily.wa_clicks`, menulis lead
// `quick_wa` (dengan rem 30/menit), mencatat geo, dan mengirim CAPI `Contact`.

import { bacaJson } from './api';
import { trackEvent } from './tracking';

const NOMOR_ADMIN = '6281391278889';

// Jalur ini sekarang jalur konversi utama mobile, jadi keandalannya menang atas
// kelengkapan pesan: kalau server belum menjawab dalam 1,2 detik kita tetap buka
// WhatsApp memakai URL cadangan. Requestnya TIDAK dibatalkan (lihat `keepalive`
// di bawah), jadi wa_clicks & CAPI tetap tercatat walau kita sudah pindah halaman.
const BATAS_TUNGGU_MS = 1200;

export interface PropertiWa {
  slug: string;
  title: string;
  kode: string;
  harga: number;
}

/**
 * Catat klik lalu buka WhatsApp. Selalu berujung navigasi — kegagalan jaringan,
 * timeout, atau pemblokir iklan tidak boleh menahan pengunjung.
 */
export async function bukaWaProperti(p: PropertiWa): Promise<void> {
  const cadangan =
    `https://wa.me/${NOMOR_ADMIN}?text=` +
    encodeURIComponent(`Halo, saya tertarik dengan properti: ${p.title}`);

  let waUrl = cadangan;
  let eventId: string | undefined;

  try {
    // `keepalive` WAJIB: begitu kita menyetel location.href, browser membatalkan
    // request yang masih berjalan. Tanpa ini setiap klik yang melewati batas
    // tunggu akan hilang dari statistik — alasan yang sama sudah ditulis di
    // waTrack.ts untuk tombol WA non-properti.
    const permintaan = fetch(`/api/properties/${p.slug}/wa-click`, {
      method: 'POST',
      keepalive: true,
    });
    const jeda = new Promise<null>((r) => setTimeout(() => r(null), BATAS_TUNGGU_MS));

    const res = await Promise.race([permintaan, jeda]);
    if (res) {
      const d = await bacaJson<{ wa_url?: string; event_id?: string }>(res);
      waUrl = d?.data?.wa_url ?? cadangan;
      eventId = d?.data?.event_id;
    }
  } catch {
    /* jaringan gagal / diblokir — pakai URL cadangan, jangan tahan pengunjung */
  }

  // ⚠️ Event browser hanya dikirim bila `event_id` dari server sudah di tangan.
  // Tanpa id yang sama, Meta tidak bisa mendeduplikasi terhadap CAPI `Contact`
  // yang PASTI dikirim server, sehingga satu klik terhitung dua konversi. Itu
  // persis "membanjiri Meta dengan konversi palsu" yang sudah diperingatkan di
  // wa-click.js — kehilangan satu sinyal lebih murah daripada merusak pencocokan.
  if (eventId) {
    try {
      trackEvent('Contact', {
        content_name: p.title,
        content_ids: [p.kode],
        value: p.harga,
        currency: 'IDR',
      }, { eventID: eventId });
    } catch {
      /* pelacakan tidak boleh menggagalkan klik */
    }
  }

  // `window.location.href`, BUKAN `window.open()` — in-app browser Meta memblokir
  // window.open yang dipanggil setelah await (tercatat di CLAUDE.md).
  window.location.href = waUrl;
}

// Satu catatan per properti per sesi. Dua titik masuk merender tombol yang sama
// (kartu CTA + sticky bar) dan pengunjung lazim membuka-tutup sheet, jadi tanpa
// rem ini satu orang bisa terhitung belasan "niat" dan corongnya jadi bohong.
const sudahDicatat = new Set<string>();

/**
 * Telemetri corong: pengunjung menekan "Isi Form Dulu" dan sheet terbuka.
 * Best-effort dan sepenuhnya senyap — membuka form tidak boleh menunggu jaringan.
 */
export function catatBukaForm(slug: string): void {
  if (typeof window === 'undefined' || sudahDicatat.has(slug)) return;
  sudahDicatat.add(slug);

  const url = `/api/properties/${slug}/sheet-open`;
  try {
    // sendBeacon dengan alasan yang sama seperti waTrack.ts: terkirim walau
    // halaman langsung ditinggalkan, dan tidak pernah menahan interaksi.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url);
      return;
    }
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => { /* noop */ });
  } catch {
    /* noop */
  }
}
