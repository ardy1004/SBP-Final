// Worker cron terpisah — cuma pemicu jadwal, TIDAK ada binding D1/Cloudinary
// sama sekali. Seluruh logic tetap satu-satunya di Pages Functions, supaya tidak
// ada duplikasi kode.
//
//   "0 20 * * *"        -> purge sampah (03:00 WIB)
//   "0,30 18-21 * * *"  -> auto-jadwal (01:00-04:30 WIB, tiap 30 menit)
//
// Keduanya sama-sama menyala pada 20:00 UTC; event.cron yang membedakan.
const BASIS = 'https://salambumi.xyz/api/internal/viralframe/';

async function panggil(jalur, secret, label) {
  const res = await fetch(BASIS + jalur, { method: 'POST', headers: { 'X-Purge-Secret': secret } });
  const body = await res.text();
  if (!res.ok) console.error(`[cron] ${label} gagal`, res.status, body);
  else console.log(`[cron] ${label} sukses`, body.slice(0, 500));
}

export default {
  async scheduled(event, env) {
    if (event.cron === '0 20 * * *') {
      await panggil('purge-trash', env.VIRALFRAME_PURGE_SECRET, 'purge-trash');
      return;
    }
    await panggil('auto-schedule', env.VIRALFRAME_PURGE_SECRET, 'auto-schedule');
  },
};
