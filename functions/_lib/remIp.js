// Sidik jari IP untuk rem (rate limit) — TIDAK menyimpan IP mentah.
//
// SHA-256 dari IP + garam rahasia, dipotong 24 heksa. Cukup untuk membedakan
// pengirim dalam jendela beberapa menit, tidak bisa dibalik ke IP tanpa garam
// (brute force seluruh ruang IPv4 hanya ~4 miliar — karena itu garamnya WAJIB
// rahasia: JWT_SECRET, yang sudah ada di Production & Preview).
//
// ⚠️ Operator seluler Indonesia banyak memakai CGNAT: SATU IP publik dipakai
// banyak pelanggan sekaligus. Batas per-IP harus longgar untuk manusia dan
// hanya menahan pola mesin — jangan diperketat tanpa melihat data.

export async function hashIp(env, request) {
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? '';
  if (!ip) return null;
  const garam = env.JWT_SECRET ?? 'sbp-tanpa-garam';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${garam}|${ip.split(',')[0].trim()}`));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
