// Simpan error ke D1 (tabel error_logs) — pendamping console.error, bukan
// pengganti. console.error tetap dipertahankan untuk wrangler tail real-time;
// insert D1 memberi riwayat permanen yang bisa dilihat kapan saja lewat Admin.
//
// Sengaja best-effort (tidak pernah throw) — kegagalan logging TIDAK BOLEH
// menggagalkan request asli yang sedang diproses.

const MAX_LEN = 4000;

function clip(s) {
  return typeof s === 'string' ? s.slice(0, MAX_LEN) : null;
}

/**
 * @param {object} env - Cloudflare env (butuh env.DB)
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.stack]
 * @param {string} [opts.url]
 * @param {string} [opts.userAgent]
 * @param {Record<string, unknown>} [opts.context]
 * @param {'server'|'client'} [opts.source]
 */
export async function logServerError(env, { message, stack, url, userAgent, context, source = 'server' }) {
  try {
    if (!env?.DB) return;
    let contextJson = null;
    if (context) { try { contextJson = JSON.stringify(context).slice(0, MAX_LEN); } catch { /* ignore */ } }
    await env.DB.prepare(`
      INSERT INTO error_logs (source, message, stack, url, user_agent, context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(source, clip(message) ?? 'Unknown error', clip(stack), clip(url), clip(userAgent), contextJson).run();
  } catch (err) {
    // Jangan sampai gagal-catat error justru membuang error asli
    console.error('[logServerError] gagal insert:', err?.message);
  }
}
