// POST /api/admin/viralframe/orders/:id/hook-battle — 3 hook alternatif + juri berpasangan.
//
// ─── Kenapa berpasangan, bukan skor ──────────────────────────────────────────
// Riset LLM-as-judge 2026: skor ABSOLUT tidak terkalibrasi — "7 dari 10" berarti
// beda antar hari bahkan untuk model yang sama — sementara PERBANDINGAN antar
// kandidat jauh lebih sejalan dengan penilaian manusia. Skor viral gaya Opus Clip
// membuktikannya di lapangan: klip berskor 40 rutin mengalahkan yang berskor 85.
//
// ─── Kenapa dua arah ─────────────────────────────────────────────────────────
// Judge produksi terukur punya bias posisi >0.10: kandidat yang disebut duluan
// menang lebih sering, terlepas dari isinya. Jadi juri dipanggil DUA KALI dengan
// urutan kandidat dibalik. Menang di kedua arah = pemenang; beda = SERI, dan
// serinya dilaporkan apa adanya alih-alih dipaksakan jadi juara.
//
// ─── Kenapa juri beda provider dari penulisnya ───────────────────────────────
// Model cenderung menyukai keluarannya sendiri (self-preference bias). Penulis
// dan juri karena itu diambil dari provider berbeda bila tersedia.
//
// Kenapa hook, bukan seluruh naskah: 63% video ber-CTR tertinggi mengunci penonton
// di 3 detik pertama, dan 65% yang lewat 3 detik bertahan sampai 10 detik. Satu
// panggilan AI ekstra di titik itu memberi pengembalian terbesar.
//
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { logServerError } from '../../../../../_lib/logError.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../../../_lib/aiProviders.js';
import { uraiJsonModel } from '../../../../../_lib/visiFoto.js';
import { anggaranKata, entriSumbu } from '../../../../../_lib/viralframe.js';

const URUTAN = ['gemini', 'deepseek', 'mistral', 'groq'];

// Wall-clock Worker 30 detik untuk TIGA panggilan (1 penulis + 2 juri).
// Anggarannya MENCADANGKAN, bukan sekadar mengecek: panggilan baru hanya dimulai
// kalau masih muat sampai selesai. Tanpa itu satu panggilan lambat bisa dimulai
// di detik ke-23 lalu berjalan 8 detik → Worker dibunuh sebelum respons ditulis.
const ANGGARAN_MS = 24000;
const TIMEOUT_CALL_MS = 8000;

async function panggil(env, prov, { systemPrompt, userPrompt, maxTokens, temperature }) {
  const key = await getProviderKey(env, prov);
  if (!key) return { ok: false, error: 'tanpa API key' };
  return callChatCompletion({
    provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
    systemPrompt, userPrompt, maxTokens, temperature,
    reasoningEffort: prov === 'gemini' ? 'none' : undefined,
    timeoutMs: TIMEOUT_CALL_MS,
  });
}

/** Provider pertama yang punya key; `kecuali` dilewati agar juri ≠ penulis. */
async function pilihProvider(env, kecuali = null) {
  for (const p of URUTAN) {
    if (p === kecuali) continue;
    if (await getProviderKey(env, p)) return p;
  }
  return null;
}

export async function onRequestPost({ env, params }) {
  const id = parseInt(params?.id ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id pesanan tidak valid', 400);
  const mulai = Date.now();
  const sisaWaktu = () => ANGGARAN_MS - (Date.now() - mulai);

  let order;
  try {
    order = await env.DB.prepare(
      `SELECT o.id, o.variation_key, o.hasil_json, p.title, p.jenis_properti, p.kecamatan
         FROM viralframe_orders o
         JOIN properties p ON p.id = o.property_id
        WHERE o.id = ?`
    ).bind(id).first();
  } catch (err) {
    console.error('[vf hook-battle] baca pesanan', err.message);
    return jsonError('Gagal membaca pesanan', 500);
  }
  if (!order) return jsonError('Pesanan tidak ditemukan', 404);

  let hasil = null;
  try { hasil = order.hasil_json ? JSON.parse(order.hasil_json) : null; } catch { hasil = null; }
  const part1 = hasil?.parts?.[0];
  if (!part1?.dialog) {
    return jsonError('Pesanan ini belum punya storyboard. Buat storyboard dulu.', 422);
  }

  const p = hasil.params ?? {};
  const maksKata = anggaranKata(p.voDetikPerPart ?? 8);
  const hookLabel = entriSumbu('hook', hasil?.variasi?.hook)?.label
    ?? order.variation_key?.match(/hook:([^|]+)/)?.[1] ?? '';
  const fakta = (hasil?.dna?.fakta ?? []).map(f => `${f.label}: ${f.nilai}`).join(' · ');

  try {
    // ── 1. Penulis: 3 kandidat hook ────────────────────────────────────────
    const penulis = await pilihProvider(env);
    if (!penulis) return jsonError('Tidak ada provider AI yang punya API key.', 503);

    const rTulis = await panggil(env, penulis, {
      systemPrompt: 'Kamu penulis hook video pendek properti Indonesia. Jawab HANYA JSON valid, tanpa markdown.',
      userPrompt: `Tulis 3 HOOK ALTERNATIF untuk 3 detik pertama video properti ini.

PROPERTI: ${order.title} (${order.jenis_properti}, ${order.kecamatan})
FAKTA: ${fakta || 'lihat judul'}
KATEGORI PEMBUKA: ${hookLabel}
HOOK YANG SUDAH ADA (jangan diulang): "${part1.dialog}"

ATURAN
- Maksimal ${maksKata} kata per hook, tulis 90-100% dari itu.
- WAJIB memuat minimal satu hal konkret: angka, ukuran, jumlah kamar, atau nama tempat.
  Pembuka tanpa detail bisa dipasang di listing mana pun — penonton langsung scroll.
- DILARANG menyebut nominal harga.
- DILARANG membuka dengan sapaan atau perkenalan diri.
- Ketiganya harus BERBEDA PENDEKATAN, bukan tiga parafrase kalimat yang sama.

JSON: {"kandidat":[{"dialog":"...","teks_layar":"teks overlay singkat"}]}
Tepat 3 kandidat.`,
      maxTokens: 700, temperature: 0.95,
    });
    if (!rTulis.ok) return jsonError(`Gagal menulis kandidat — ${String(rTulis.error).slice(0, 160)}`, 502);

    const kandidat = (uraiJsonModel(rTulis.content)?.kandidat ?? [])
      .filter(k => k && typeof k.dialog === 'string' && k.dialog.trim())
      .slice(0, 3)
      .map(k => ({ dialog: k.dialog.trim(), teks_layar: String(k.teks_layar ?? '').trim().slice(0, 120) }));
    if (kandidat.length < 2) {
      return jsonError('AI hanya mengembalikan kurang dari 2 kandidat yang sah.', 502);
    }

    // ── 2. Juri, dua arah ──────────────────────────────────────────────────
    const juri = (await pilihProvider(env, penulis)) ?? penulis;
    const sistemJuri = 'Kamu juri retensi video pendek. Jawab HANYA JSON valid, tanpa markdown.';
    const buatSoal = (urutan) => `Pilih SATU hook yang paling mungkin menahan penonton melewati 3 detik pertama.

KRITERIA, berurut kepentingannya:
1. Detail konkret di kata-kata pertama (angka/ukuran/tempat) — bukan klaim umum.
2. Membuka celah informasi yang membuat orang ingin tahu kelanjutannya.
3. Terdengar wajar diucapkan orang, bukan bahasa iklan.

KANDIDAT
${urutan.map((k, i) => `${String.fromCharCode(65 + i)}. "${k.dialog}"`).join('\n')}

JSON: {"menang":"A","alasan":"1 kalimat, sebut kriteria mana yang menentukan"}`;

    const maju = [...kandidat];
    const mundur = [...kandidat].reverse();

    // Cadangkan waktu untuk panggilan kedua; kalau tidak muat, satu arah saja —
    // dan itu DILAPORKAN, bukan disembunyikan sebagai kemenangan penuh.
    const rMaju = sisaWaktu() > TIMEOUT_CALL_MS * 2
      ? await panggil(env, juri, { systemPrompt: sistemJuri, userPrompt: buatSoal(maju), maxTokens: 200, temperature: 0.2 })
      : { ok: false, error: 'anggaran waktu habis' };
    const rMundur = (rMaju.ok && sisaWaktu() > TIMEOUT_CALL_MS)
      ? await panggil(env, juri, { systemPrompt: sistemJuri, userPrompt: buatSoal(mundur), maxTokens: 200, temperature: 0.2 })
      : { ok: false, error: 'anggaran waktu habis' };

    const bacaVerdik = (r, urutan) => {
      if (!r.ok) return null;
      const j = uraiJsonModel(r.content);
      const huruf = String(j?.menang ?? '').trim().toUpperCase().charAt(0);
      const idx = huruf.charCodeAt(0) - 65;
      if (!Number.isInteger(idx) || idx < 0 || idx >= urutan.length) return null;
      // Petakan kembali ke indeks kandidat ASLI — tanpa ini, verdik arah mundur
      // menunjuk kandidat yang salah dan seluruh kontrol bias jadi omong kosong.
      return { indeks: kandidat.indexOf(urutan[idx]), alasan: String(j?.alasan ?? '').slice(0, 300) };
    };

    const vMaju = bacaVerdik(rMaju, maju);
    const vMundur = bacaVerdik(rMundur, mundur);

    const sepakat = vMaju && vMundur && vMaju.indeks === vMundur.indeks;
    return jsonOk({
      kandidat,
      pemenang: sepakat ? vMaju.indeks : null,
      alasan: vMaju?.alasan ?? vMundur?.alasan ?? '',
      dua_arah: Boolean(vMaju && vMundur),
      verdik: { maju: vMaju?.indeks ?? null, mundur: vMundur?.indeks ?? null },
      penulis, juri,
      pesan: sepakat
        ? 'Pemenang konsisten di kedua urutan penilaian.'
        : (vMaju && vMundur)
          ? 'Juri berubah pikiran saat urutan dibalik — tidak ada pemenang jelas, pilih sendiri.'
          : 'Penilaian hanya sempat satu arah, jadi bias posisi belum ternetralkan. Perlakukan sebagai saran, bukan verdik.',
    });
  } catch (err) {
    console.error('[vf hook-battle]', err.message);
    await logServerError(env, {
      source: 'server',
      message: `[viralframe] adu hook gagal (pesanan ${id}) — ${err.message}`,
      stack: err.stack,
      url: `/api/admin/viralframe/orders/${id}/hook-battle`,
      context: { order_id: id },
    });
    return jsonError('Gagal menjalankan adu hook', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
