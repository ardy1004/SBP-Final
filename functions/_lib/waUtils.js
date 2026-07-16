// Normalisasi & validasi nomor WhatsApp Indonesia — SATU SUMBER KEBENARAN.
// Sebelumnya duplikat identik di titip-jual.js dan createLead.js.

export function normalizeWA(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('62')) return d;
  if (d.startsWith('0'))  return '62' + d.slice(1);
  if (d.startsWith('8'))  return '62' + d;
  return d;
}

export function isValidWA(raw) {
  return /^628[0-9]{8,12}$/.test(normalizeWA(raw));
}
