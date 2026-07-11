// POST /api/admin/viralframe/youtube-long — generate storyboard YouTube 16:9 lengkap
// 1-klik dari data properti (tanpa parameter kompleks). Struktur diturunkan otomatis
// dari properti (kamar → chapter, kolam/investasi → scene khusus).
// Body: { property_id, provider? }
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];

function fmtRupiah(n) {
  if (n == null || n <= 0) return 'hubungi kami';
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')} Miliar`;
  if (n >= 1e6) return `Rp ${Math.round(n / 1e6)} Juta`;
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

// Turunkan garis besar chapter dari data properti (tanpa parameter user).
function deriveOutline(p, details) {
  const ch = ['Intro / Hook (sapaan + teaser properti)', 'Eksterior & fasad'];
  const kt = p.jumlah_kamar_tidur || 0;
  if (kt >= 1) ch.push(`Ruang utama & ${kt} kamar tidur`);
  else ch.push('Ruang utama');
  if (p.jumlah_kamar_mandi) ch.push('Kamar mandi & area basah');
  ch.push('Dapur & ruang keluarga');
  if (details && /kolam|pool/i.test(JSON.stringify(details))) ch.push('Kolam renang / area outdoor');
  ch.push('Halaman / lingkungan sekitar & akses');
  if (p.income_per_bulan || p.harga) ch.push('Analisis nilai & potensi investasi');
  ch.push('Penutup + CTA (WA/subscribe)');
  return ch;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';

  let p;
  try {
    p = await env.DB.prepare(`SELECT title, jenis_properti, tujuan, harga, kecamatan, kabupaten, provinsi,
                                     jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan,
                                     legalitas, kode_listing, deskripsi, income_per_bulan, details
                              FROM properties WHERE id = ?`).bind(propertyId).first();
  } catch (err) { console.error('[yt-long] property', err.message); return jsonError('Gagal ambil properti', 500); }
  if (!p) return jsonError('Properti tidak ditemukan', 404);

  let details = null;
  try { details = p.details ? JSON.parse(p.details) : null; } catch { /* ignore */ }
  const outline = deriveOutline(p, details);

  const system = `Kamu sutradara & copywriter konten properti YouTube profesional Indonesia. Output HANYA JSON valid, mulai { akhiri }, tanpa markdown/komentar.`;
  const user = `Buat STORYBOARD lengkap video tur properti untuk YouTube (16:9, long-form, durasi total ~3-6 menit). Setiap scene berdurasi ~10 detik. Sasaran: penonton yang mempertimbangkan membeli/menyewa.

DATA PROPERTI (JANGAN mengarang fitur yang tak disebut):
- Judul: ${p.title}
- Jenis: ${p.jenis_properti} (${p.tujuan})
- Harga: ${fmtRupiah(p.harga)}
- Lokasi: ${p.kecamatan}, ${p.kabupaten}, ${p.provinsi}
- Spesifikasi: ${p.jumlah_kamar_tidur ?? '-'} KT / ${p.jumlah_kamar_mandi ?? '-'} KM, LT ${p.luas_tanah ?? '-'}m², LB ${p.luas_bangunan ?? '-'}m²
- Legalitas: ${p.legalitas ?? '-'}
- Kode: ${p.kode_listing}
${p.deskripsi ? `- Deskripsi: ${String(p.deskripsi).slice(0, 300)}` : ''}

GARIS BESAR CHAPTER (ikuti urutan ini, boleh sesuaikan seperlunya):
${outline.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Buat 8-12 scene total. Setiap scene punya prompt video SIAP-PAKAI (English, sinematik, gerakan kamera jelas, cocok untuk AI video generator seperti Veo/Kling) + narasi voiceover Bahasa Indonesia. RINGKAS tiap ai_ready_prompt (maks ~60 kata) agar output tidak terlalu panjang.

FORMAT JSON WAJIB:
{
  "titles": ["3 judul video SEO menarik (Bahasa Indonesia)"],
  "description": "deskripsi YouTube 3-5 kalimat + ajakan subscribe/WA",
  "chapters_timestamp": ["00:00 Intro", "00:20 Eksterior", "..."],
  "thumbnail_prompt": "prompt JSON/teks untuk generate thumbnail YouTube yang clickable (16:9, teks besar, ekspresi wow)",
  "scenes": [
    {"scene": 1, "chapter": "Intro", "duration_sec": 10, "ai_ready_prompt": "cinematic English prompt siap generate video", "narration_id": "narasi voiceover Bahasa Indonesia", "on_screen_text": "teks overlay singkat"}
  ],
  "caption": "caption untuk community post / share",
  "hashtag_sets": ["5 string, tiap string 5-8 hashtag campur lokasi+jenis+brand #salambumiproperty"]
}
hashtag_sets berisi TEPAT 5 string. scenes berisi 8-12 item. PENTING: keluarkan HANYA objek JSON, tanpa penjelasan atau proses berpikir apa pun sebelum/sesudahnya.`;

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];
  const deadline = Date.now() + 26000;
  let raw = null, used = null, lastErr = null;
  for (const prov of tryOrder) {
    if (Date.now() > deadline - 6000) break;
    const key = await getProviderKey(env, prov);
    if (!key) continue;
    const r = await callChatCompletion({
      provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
      systemPrompt: system, userPrompt: user, maxTokens: 8000, temperature: 0.6,
      timeoutMs: deadline - Date.now() - 1500,
    });
    if (r.ok) { raw = r.content; used = prov; break; }
    lastErr = r.error;
    console.error(`[yt-long] ${prov} gagal:`, r.error?.slice(0, 160));
  }
  if (!raw) return jsonError(`Gagal generate storyboard: ${(lastErr || 'semua provider gagal/kehabisan kuota').slice(0, 200)}. Pastikan API key AI diatur di Pengaturan.`, 502);

  // Ekstraksi JSON tahan-banting: ambil dari '{' pertama sampai '}' terakhir
  // (membuang preamble/penutup atau markdown yang kadang disisipkan model).
  let parsed;
  try {
    let txt = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const first = txt.indexOf('{'), last = txt.lastIndexOf('}');
    if (first > 0 || last < txt.length - 1) txt = txt.slice(first, last + 1);
    parsed = JSON.parse(txt);
  } catch {
    return jsonError(`Respons AI tidak valid (kemungkinan terpotong). Coba lagi atau ganti provider di Pengaturan. Cuplikan: ${String(raw).slice(0, 150)}`, 502);
  }

  // Simpan ke riwayat generations (params_json menandai mode youtube_long)
  try {
    await env.DB.prepare(`INSERT INTO viralframe_generations (property_id, params_json, master_prompt, result_json)
                          VALUES (?,?,?,?)`)
      .bind(propertyId, JSON.stringify({ mode: 'youtube_long' }), null, JSON.stringify(parsed)).run();
  } catch { /* non-fatal */ }

  return jsonOk({ ...parsed, outline, provider_used: used, kode_listing: p.kode_listing });
}

export async function onRequestOptions() { return handleOptions(); }
