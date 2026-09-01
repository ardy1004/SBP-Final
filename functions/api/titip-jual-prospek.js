// POST /api/titip-jual-prospek — Publik, tanpa auth.
//
// Menangkap calon penjual segera setelah Step 1 Titip Jual selesai diisi,
// SEBELUM dia menyelesaikan Step 2.
//
// LATAR BELAKANG (audit 12 Agu 2026)
// Form Titip Jual tidak menyimpan apa pun sampai submit terakhir berhasil.
// Owner yang mengisi data diri lalu gagal di Step 2 (403 Turnstile, koneksi
// putus saat mengunggah 20 foto, tab tertutup) hilang tanpa jejak — nomor WA-nya
// pun tidak tersisa, jadi tidak ada cara menindaklanjuti. Endpoint ini membuat
// kegagalan di Step 2 tidak lagi berarti kehilangan prospek.
//
// Ditulis ke tabel `leads` yang sudah ada, BUKAN tabel baru: admin sudah bekerja
// di /admin/leads setiap hari, dan `tipe_pengirim='penjual'` memang sudah
// disediakan skema sejak awal (badge hijau "Penjual" ada di AdminLeadsPage).
//
// ⚠️ NIK TIDAK PERNAH DIKIRIM KE SINI DAN TIDAK PERNAH DISIMPAN. Tabel `leads`
// tidak terenkripsi; NIK hanya boleh masuk lewat /api/titip-jual yang melewati
// encryptNIK() ke kolom owners.nik_encrypted. Jangan menambahkannya "supaya
// lengkap" — itu membocorkan data yang selama ini sengaja dienkripsi.
//
// Tanpa Turnstile — justru intinya: endpoint ini harus tetap jalan pada
// pengunjung yang widget Turnstile-nya gagal dimuat, karena merekalah yang
// paling mungkin gagal di Step 2. Rem anti-flood memakai pola yang sudah
// terbukti di wa-click.js: hitung baris semenit terakhir, fail-open.

import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { normalizeWA, isValidWA } from '../_lib/waUtils.js';
import { sendCapiEvent, extractMetaIdentity } from '../_lib/metaCapi.js';

// Prospek titip jual volumenya rendah (produksi: < 5/bulan). Cap ini jauh di
// atas trafik wajar tapi menutup skenario flood ke tabel leads.
const MAX_PER_MINUTE = 20;

const SOURCE_PAGE = '/titip-jual';
const PESAN_BELUM_SELESAI = 'Prospek Titip Jual — Step 1 terisi, belum submit properti.';

function sanitize(val, maxLen = 100) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

async function prospekTerakhirSemenit(db) {
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM leads
                WHERE tipe_pengirim = 'penjual' AND source_page = ?
                  AND created_at > datetime('now', '-60 seconds')`)
      .bind(SOURCE_PAGE)
      .first();
    return row?.cnt ?? 0;
  } catch {
    return 0; // fail-open: lebih baik kehilangan rem daripada membuang prospek asli
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const nama     = sanitize(body.nama, 100);
  const no_wa_in = sanitize(body.no_wa, 20);
  if (!nama) return jsonError('nama wajib diisi', 422);
  if (!isValidWA(no_wa_in)) return jsonError('no_wa tidak valid', 422);
  const no_wa = normalizeWA(no_wa_in);

  // Asal daerah = alamat KTP yang sudah diisi user di Step 1. Membantu admin
  // menakar prospek sebelum menelepon.
  const kecamatan = sanitize(body.kecamatan, 100);
  const kabupaten = sanitize(body.kabupaten, 100);
  const asal_daerah = [kecamatan && `Kec. ${kecamatan}`, kabupaten].filter(Boolean).join(', ') || null;

  if (!env.DB) return jsonError('Database tidak tersedia', 503);

  // Klik "Lanjut" berulang (user bolak-balik Step 1 ↔ Step 2) harus memperbarui
  // baris yang sama, bukan menumpuk prospek duplikat di papan CRM.
  const leadIdLama = Number.isInteger(body.lead_id) && body.lead_id > 0 ? body.lead_id : null;
  if (leadIdLama) {
    try {
      const res = await env.DB.prepare(`
        UPDATE leads SET nama = ?, no_wa = ?, asal_daerah = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tipe_pengirim = 'penjual' AND source_page = ?
      `).bind(nama, no_wa, asal_daerah, leadIdLama, SOURCE_PAGE).run();
      // Klausa WHERE sengaja ketat: id dari klien tidak tepercaya dan tanpa
      // pagar ini seseorang bisa menimpa lead pembeli mana pun.
      if (res.meta?.changes > 0) return jsonOk({ lead_id: leadIdLama, updated: true });
    } catch (err) {
      console.error('[titip-jual-prospek] UPDATE gagal:', err.message);
    }
    // id tidak cocok / gagal → jatuh ke INSERT di bawah, jangan buang prospeknya
  }

  if ((await prospekTerakhirSemenit(env.DB)) >= MAX_PER_MINUTE) {
    // 200, bukan 429 — klien memanggil ini fire-and-forget dan tidak menampilkan
    // error apa pun; yang penting Step 2 tidak ikut terhambat.
    return jsonOk({ lead_id: null, throttled: true });
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO leads
        (property_id, nama, no_wa, asal_daerah, tipe_pengirim, pesan, source_page,
         status_pipeline, notes, created_at, updated_at)
      VALUES
        (NULL, ?, ?, ?, 'penjual', ?, ?,
         'baru', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(nama, no_wa, asal_daerah, PESAN_BELUM_SELESAI, SOURCE_PAGE).run();
    const leadId = result.meta?.last_row_id ?? null;

    // ─── Meta CAPI: Lead (prospek PENJUAL) ────────────────────────────────
    // Sampai 2026-09-02 jalur ini tidak melapor apa pun ke Meta, padahal
    // volumenya ~4× lebih padat daripada submit selesai (8 prospek dalam 2
    // minggu vs 10 submit dalam 7 minggu). Orang-orang ini SUDAH menyerahkan
    // nama + no WA, jadi mereka lead yang bisa ditelepon — bukan sekadar
    // pengunjung yang kabur.
    //
    // ⚠️ `Lead`, bukan `CompleteRegistration`. Ini mengikuti semantik Meta dan
    // memisahkan dua tahap corong yang berbeda:
    //   · Lead                 = kontak sudah diserahkan (prospek, form belum tuntas)
    //   · CompleteRegistration = registrasi tuntas (titip-jual.js)
    // Dibedakan dari lead PEMBELI lewat content_category. Tanpa `value`,
    // konsisten dengan CompleteRegistration: lead penjual tidak membawa
    // pendapatan, dan mengisinya dengan harga aset membuat ROAS menyesatkan.
    //
    // ⚠️ HANYA di jalur INSERT ini. Dua jalur keluar lain TIDAK boleh
    // menembakkan event: UPDATE (user bolak-balik Step 1↔2 — orang yang sama)
    // dan throttled (rem menyala). `event_id` pun hanya dikembalikan di sini,
    // sehingga browser ikut diam pada kedua jalur itu tanpa perlu mengandalkan
    // kode status.
    const prospekEventId = leadId ? `prospek_${leadId}_${Date.now()}` : null;
    if (prospekEventId) context.waitUntil((async () => {
      try {
        const pixelRes = await env.DB
          .prepare("SELECT pixel_id, capi_access_token, events_enabled FROM pixel_configs WHERE is_active = 1 AND capi_access_token IS NOT NULL AND capi_access_token != ''")
          .all();
        const capiPixels = (pixelRes.results ?? []).filter(px => {
          try { return JSON.parse(px.events_enabled ?? '[]').includes('Lead'); } catch { return false; }
        });
        if (capiPixels.length > 0) {
          await Promise.allSettled(capiPixels.map(px => sendCapiEvent(env, {
            pixelId:        px.pixel_id,
            accessToken:    px.capi_access_token,
            eventName:      'Lead',
            eventId:        prospekEventId,
            eventSourceUrl: `${env.APP_URL ?? 'https://salambumi.xyz'}${SOURCE_PAGE}`,
            userData:       { ph: no_wa },
            identity:       extractMetaIdentity(request),
            customData:     { content_category: 'titip_jual_prospek' },
          })));
        }
      } catch (err) {
        console.error('[titip-jual-prospek] CAPI dispatch error:', err?.message);
      }
    })());

    return jsonOk({ lead_id: leadId, event_id: prospekEventId });
  } catch (err) {
    console.error('[titip-jual-prospek] INSERT gagal:', err.message);
    return jsonError('Gagal mencatat prospek', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
