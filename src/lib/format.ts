export function formatRibuan(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// formatRupiah & formatRupiahFull pindah dari src/app/data/mockData.ts (2026-09-27)
// — dulu diekspor ulang dari sana lewat src/lib/api.ts, sehingga 13,8 KB data
// tiruan ikut ke chunk SSR dan ke setiap halaman browser.

// Locale-independent thousands separator (titik = id-ID style).
// Sengaja tidak pakai toLocaleString('id-ID') — CF Workers ICU tidak dijamin
// sama dengan browser client → mismatch React hydration error #418.
const _ribuan = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const formatRupiah = (amount: number): string => {
  if (amount >= 1_000_000_000) {
    const s = (amount / 1_000_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `Rp ${s}M`;
  }
  if (amount >= 1_000_000) {
    const s = (amount / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `Rp ${s}Jt`;
  }
  return `Rp ${_ribuan(amount)}`;
};

export const formatRupiahFull = (amount: number): string => {
  return `Rp ${_ribuan(amount)}`;
};
