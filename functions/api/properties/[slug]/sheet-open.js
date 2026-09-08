// POST /api/properties/:slug/sheet-open
// Publik — tanpa auth, tanpa CAPTCHA.
//
// KENAPA ADA: sebelum ini kita hanya tahu UJUNG corong (tampilan halaman) dan
// hasilnya (nol), tanpa apa pun di tengah. Saat 360 tampilan menghasilkan 0 klik
// WA pada 5–7 Sep 2026, mustahil dibedakan "tidak ada yang berniat menghubungi"
// dari "banyak yang berniat lalu tersangkut di dalam form". Endpoint ini mencatat
// niat itu: pengunjung menekan "Isi Form Dulu" dan sheet terbuka.
//
// Bedanya dari wa-click.js: TIDAK menulis `leads` dan TIDAK mengirim CAPI.
// Membuka form bukan konversi — melaporkannya ke Meta sebagai `Contact` akan
// menggelembungkan konversi dan menurunkan kualitas pencocokan, persis yang
// sudah diperingatkan di wa-click.js.
//
// ⚠️ `SQL_TANGGAL_WIB` WAJIB, jangan tulis ekspresi tanggal sendiri: `DATE('now')`
// di D1 adalah UTC (runtime Cloudflare selalu UTC, modifier 'localtime' tidak
// melakukan apa-apa), sehingga bucket hariannya akan meleset 7 jam dari `views`
// dan `wa_clicks` di baris yang sama.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { SQL_TANGGAL_WIB } from '../../../_lib/waktu.js';
import { logServerError } from '../../../_lib/logError.js';

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const slug = params.slug;
  if (!slug || typeof slug !== 'string') return jsonError('Slug tidak valid', 400);

  try {
    const row = await env.DB
      .prepare("SELECT id FROM properties WHERE slug = ? AND status_publish = 'published' LIMIT 1")
      .bind(slug)
      .first();
    if (!row) return jsonError('Properti tidak ditemukan', 404);

    await env.DB.prepare(`
      INSERT INTO property_view_daily (property_id, tanggal, sheet_opens)
      VALUES (?, ${SQL_TANGGAL_WIB}, 1)
      ON CONFLICT(property_id, tanggal) DO UPDATE SET sheet_opens = sheet_opens + 1
    `).bind(row.id).run();

    return jsonOk({ dicatat: true });
  } catch (err) {
    // ⚠️ WAJIB dicatat, bukan cuma console.error. Pemanggilnya `sendBeacon` yang
    // MENGABAIKAN respons, jadi kegagalan di sini tidak terlihat oleh siapa pun —
    // gejalanya cuma "sheet_opens selalu 0", yang justru akan salah dibaca sebagai
    // temuan ("tidak ada yang membuka form") alih-alih sebagai kerusakan.
    // Volumenya aman: klien membatasi satu kiriman per properti per sesi.
    console.error('[sheet-open]', err.message);
    context.waitUntil(logServerError(env, {
      message: `[sheet-open] gagal mencatat: ${err.message}`,
      url: request.url,
      userAgent: request.headers.get('User-Agent') ?? undefined,
    }));
    return jsonError('Gagal mencatat', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
