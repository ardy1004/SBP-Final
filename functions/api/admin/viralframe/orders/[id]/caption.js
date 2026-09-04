// POST /api/admin/viralframe/orders/:id/caption — caption + hashtag dari storyboard.
//
// ─── Kenapa dari storyboard, bukan dari transkripsi video ────────────────────
// Gratis, instan, dan tersedia SEBELUM render — jadi caption sudah siap saat
// video diunggah, tanpa langkah tambahan. Yang lebih penting: ia otomatis ikut
// rotasi. Storyboard-nya lahir dari `variation_key` yang keunikannya sudah
// dijamin `UNIQUE(property_id, variation_key)` di database, jadi caption yang
// diturunkan darinya mustahil kembar dengan caption listing yang sama —
// tanpa perlu mekanisme anti-ulang kedua yang harus dijaga sendiri.
//
// ─── Hashtag: inti DIBANGUN KODE, tema diserahkan AI ─────────────────────────
// Merek dan geo adalah SUMBU INVARIAN — tidak ikut dirotasi, karena mengganti
// #propertijogja tiap video justru memecah sinyal yang sedang dibangun. Membuat
// AI menuliskannya berarti membiarkannya berubah diam-diam; membangunnya di kode
// membuat invarian itu benar SECARA KONSTRUKSI, bukan karena model patuh.
//
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { logServerError } from '../../../../../_lib/logError.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../../../_lib/aiProviders.js';
import { uraiJsonModel } from '../../../../../_lib/visiFoto.js';
import { entriSumbu } from '../../../../../_lib/viralframe.js';

const URUTAN = ['gemini', 'deepseek', 'mistral', 'groq'];

/** Slug hashtag: buang non-alfanumerik, rapatkan. "Bantul, DIY" → "bantul". */
function tag(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Hashtag inti — invarian, dibangun kode, tidak pernah dirotasi. */
function hashtagInti(prop) {
  const out = ['#salambumiproperty', '#propertijogja'];
  const jenis = tag(prop.jenis_properti);
  if (jenis) out.push(`#${jenis}jogja`, `#${jenis}dijual`);
  const kab = tag(prop.kabupaten);
  if (kab) out.push(`#${kab}`);
  const kec = tag(prop.kecamatan);
  if (kec && kec !== kab) out.push(`#${kec}`);
  return [...new Set(out)];
}

export async function onRequestPost({ env, params }) {
  const id = parseInt(params?.id ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id pesanan tidak valid', 400);

  let order;
  try {
    order = await env.DB.prepare(
      `SELECT o.id, o.property_id, o.hasil_json, o.variation_key,
              p.title, p.jenis_properti, p.tujuan, p.kecamatan, p.kabupaten
         FROM viralframe_orders o
         JOIN properties p ON p.id = o.property_id
        WHERE o.id = ?`
    ).bind(id).first();
  } catch (err) {
    console.error('[vf caption] baca pesanan', err.message);
    return jsonError('Gagal membaca pesanan', 500);
  }
  if (!order) return jsonError('Pesanan tidak ditemukan', 404);

  let hasil = null;
  try { hasil = order.hasil_json ? JSON.parse(order.hasil_json) : null; } catch { hasil = null; }
  const parts = Array.isArray(hasil?.parts) ? hasil.parts : [];
  if (parts.length === 0) {
    return jsonError('Pesanan ini belum punya storyboard. Buat storyboard dulu.', 422);
  }

  try {
    // Caption listing ini yang SUDAH pernah dipakai — dilarang diulang.
    // Difilter per properti: dengan 8 agent memposting bergantian, baris terbaru
    // secara global hampir pasti milik listing lain, jadi daftar tanpa filter
    // properti tidak pernah benar-benar mencegah pengulangan.
    const riwayat = await env.DB.prepare(
      `SELECT caption FROM viralframe_agent_videos
        WHERE property_id = ? AND caption IS NOT NULL AND TRIM(caption) != ''
        ORDER BY created_at DESC LIMIT 12`
    ).bind(order.property_id).all();
    const lama = (riwayat.results ?? []).map(r => String(r.caption).split('\n')[0].slice(0, 120));

    const inti = hashtagInti(order);
    const mekanisme = entriSumbu('mekanisme', hasil?.variasi?.mekanisme)?.label ?? '';
    const mood = entriSumbu('mood', hasil?.variasi?.mood)?.label ?? '';
    const dialog = parts.map((p, i) => `Part ${i + 1} (${p.peran}): ${p.dialog}`).join('\n');
    const fakta = (hasil?.dna?.fakta ?? []).map(f => `${f.label}: ${f.nilai}`).join(' · ');

    let raw = null, dipakai = null, errTerakhir = null;
    for (const prov of URUTAN) {
      const key = await getProviderKey(env, prov);
      if (!key) continue;
      const r = await callChatCompletion({
        provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
        systemPrompt: 'Kamu penulis caption media sosial properti Indonesia. Jawab HANYA JSON valid, tanpa markdown.',
        userPrompt: `Tulis caption untuk video pendek properti ini.

PROPERTI: ${order.title}
FAKTA: ${fakta || `${order.jenis_properti}, ${order.kecamatan}, ${order.kabupaten}`}
NASKAH VIDEO
${dialog}
GAYA: ${[mekanisme, mood].filter(Boolean).join(', ')}

ATURAN
- Baris pertama = kail, maksimal 12 kata, memuat satu detail konkret dari fakta di atas.
- Total 3-5 baris pendek. Boleh emoji secukupnya, maksimal 3.
- DILARANG menyebut nominal harga.
- Tutup dengan satu ajakan singkat.
${lama.length ? `- DILARANG KERAS memakai baris pembuka yang mirip dengan ini:\n${lama.map(x => `  · "${x}"`).join('\n')}` : ''}
- JANGAN menulis hashtag di dalam "caption" — hashtag diminta terpisah.

HASHTAG TEMA: 4-6 hashtag yang menggambarkan ISI video ini (gaya hidup, tipe
pembeli, suasana). JANGAN mengulang hashtag merek atau nama daerah — itu sudah
ditambahkan otomatis.

JSON: {"caption":"...","hashtag_tema":["#...","#..."]}`,
        maxTokens: 700, temperature: 0.9,
        reasoningEffort: prov === 'gemini' ? 'none' : undefined,
        timeoutMs: 20000,
      });
      if (r.ok) { raw = r.content; dipakai = prov; break; }
      errTerakhir = r.error;
    }
    if (!raw) return jsonError(`Semua provider gagal — ${String(errTerakhir || 'tanpa detail').slice(0, 180)}`, 502);

    const j = uraiJsonModel(raw);
    const caption = String(j?.caption ?? '').trim();
    if (!caption) return jsonError('AI tidak mengembalikan caption.', 502);

    const tema = (Array.isArray(j?.hashtag_tema) ? j.hashtag_tema : [])
      .map(x => String(x).trim().replace(/^#*/, '#').toLowerCase())
      .filter(x => /^#[a-z0-9]{2,30}$/.test(x));
    const hashtags = [...new Set([...inti, ...tema])].join(' ');

    // Disimpan ke pesanan supaya bertahan saat panel ditutup dan dibuka lagi.
    // hasil_json sudah ada (TEXT) — tidak perlu kolom maupun tabel baru.
    const baru = { ...hasil, caption: { teks: caption, hashtags, provider: dipakai } };
    await env.DB.prepare(
      `UPDATE viralframe_orders SET hasil_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(baru), id).run();

    return jsonOk({ caption, hashtags, provider: dipakai, dihindari: lama.length });
  } catch (err) {
    console.error('[vf caption]', err.message);
    await logServerError(env, {
      source: 'server',
      message: `[viralframe] caption gagal (pesanan ${id}) — ${err.message}`,
      stack: err.stack,
      url: `/api/admin/viralframe/orders/${id}/caption`,
      context: { order_id: id, property_id: order.property_id },
    });
    return jsonError('Gagal membuat caption', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
