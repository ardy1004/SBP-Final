// Worker cron terpisah — cuma pemicu jadwal harian, TIDAK ada binding D1/Cloudinary
// sama sekali. Logic hapus permanen sebenarnya tetap satu-satunya di Pages Functions
// (functions/api/internal/viralframe/purge-trash.js), supaya tidak ada duplikasi kode.
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch('https://salambumi.xyz/api/internal/viralframe/purge-trash', {
      method: 'POST',
      headers: { 'X-Purge-Secret': env.VIRALFRAME_PURGE_SECRET },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error('[viralframe-purge-cron] purge gagal', res.status, body);
    } else {
      console.log('[viralframe-purge-cron] purge sukses', body);
    }
  },
};
