// STASIUN 2 — MATERIAL. Satu lintasan visi, tiga keluaran per foto.
//
// Menggantikan langkah "Label Foto" yang dulu manual DAN jadi syarat masuk:
// hanya 75 dari 558 listing pernah dilabeli, jadi 87% katalog tidak pernah bisa
// masuk pipeline sama sekali. Pelabelan seharusnya stasiun di jalur, bukan
// gerbang di depan pintu.
//
// Tiga keluaran sekali jalan — karena panggilan visinya sudah dibayar:
//   · label_ruangan  : kosakata tetap (PHOTO_LABELS), bukan teks bebas
//   · vf_skor        : kelayakan sebagai bahan VIDEO 0-100
//   · vf_catatan     : satu kalimat "apa yang menjual dari foto ini"
//
// ⚠️ vf_skor SENGAJA menilai kelayakan VIDEO, bukan kelayakan listing. Foto
// cover yang bagus untuk katalog bisa buruk untuk gerak kamera (terlalu sempit,
// menghadap dinding, sudah ada teks tertempel). Selama ini backend memilih foto
// pakai is_cover + urutan — proksi popularitas, bukan kualitas sinematik.

import { PROVIDERS, getProviderKey, callChatCompletion } from './aiProviders.js';
import { PHOTO_LABELS } from './viralframe.js';
import { bacaFotoBatch, uraiJsonModel } from './visiFoto.js';

// Urutan coba. Hanya provider ber-`supportsVision` yang dipakai stasiun ini;
// sisanya dilewati karena lintasan ini MEMANG butuh melihat.
const URUTAN = ['gemini', 'groq', 'mistral', 'deepseek'];

/**
 * Berapa foto per panggilan.
 *
 * Diukur ke API dengan key produksi: 6 foto + 1 karakter = 2,3–3,8 detik,
 * payload ~1,1 MB. Aman di bawah wall-clock Worker 30 detik dengan margin lebar.
 * Menaikkannya WAJIB diukur ulang, bukan ditebak — latensi teks bukan proksi
 * latensi visi, dan kesalahan itu pernah membuat satu fitur gagal 3 dari 4 kali.
 */
export const FOTO_PER_LINTASAN = 6;

const SYSTEM = `Kamu penilai foto properti untuk produksi video pendek. Kamu MELIHAT foto-foto yang dilampirkan. Jawab HANYA JSON valid, tanpa markdown, tanpa kalimat pembuka.`;

function buatPrompt(jumlah) {
  return `Ada ${jumlah} foto properti terlampir, berurutan (foto ke-1 sampai ke-${jumlah}).

Untuk SETIAP foto, tentukan tiga hal berdasarkan apa yang BENAR-BENAR terlihat:

1. "label" — pilih SATU dari daftar ini, persis apa adanya:
${PHOTO_LABELS.map(l => `   - ${l}`).join('\n')}
   Pakai "Lainnya" hanya bila benar-benar tidak ada yang cocok.

2. "skor" — 0-100, kelayakan foto ini sebagai bahan VIDEO (bukan sebagai foto katalog).
   Tinggi bila: terang, ruang terbaca jelas, ada kedalaman untuk gerak kamera, rapi.
   Rendah bila: gelap, buram, sempit/mepet dinding, berantakan, ada watermark atau
   teks tertempel, atau objeknya tidak jelas.

3. "catatan" — SATU kalimat pendek: apa yang menjual dari foto ini. Sebut hal yang
   terlihat saja. Jangan mengarang fasilitas, ukuran, atau lokasi.

Format WAJIB (jumlah elemen "foto" HARUS ${jumlah}, urut sesuai lampiran):
{"foto":[{"label":"...","skor":0,"catatan":"..."}]}`;
}

/**
 * Jalankan satu lintasan pelabelan untuk sebuah listing.
 *
 * @returns {{ ok: boolean, dinilai: number, sisa: number, provider?: string, error?: string }}
 */
export async function jalankanMaterial(env, propertyId, { hanyaBelumBerlabel = true } = {}) {
  // Foto yang belum pernah dinilai stasiun ini. `vf_dinilai_at` NULL = belum.
  // Foto yang SUDAH punya label manual tetap ikut dinilai sekali (untuk skor &
  // catatan), tapi labelnya TIDAK ditimpa — lihat UPDATE di bawah.
  const belum = await env.DB.prepare(
    `SELECT id, url_webp, label_ruangan
       FROM property_images
      WHERE property_id = ? AND vf_dinilai_at IS NULL
      ORDER BY is_cover DESC, urutan ASC
      LIMIT 60`
  ).bind(propertyId).all();

  const rows = belum.results ?? [];
  if (rows.length === 0) return { ok: true, dinilai: 0, sisa: 0 };

  const batch = await bacaFotoBatch(env, rows, FOTO_PER_LINTASAN);
  if (batch.length === 0) {
    return { ok: false, dinilai: 0, sisa: rows.length, error: 'Tidak ada foto yang bisa dibaca dari penyimpanan.' };
  }

  const userPrompt = buatPrompt(batch.length);
  const imageUrls = batch.map(b => b.uri);

  let hasil = null, dipakai = null, errTerakhir = null;
  for (const prov of URUTAN) {
    if (!PROVIDERS[prov]?.supportsVision) continue;
    const key = await getProviderKey(env, prov);
    if (!key) continue;
    const r = await callChatCompletion({
      provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
      systemPrompt: SYSTEM, userPrompt, imageUrls,
      maxTokens: 1200, temperature: 0.2,
      reasoningEffort: prov === 'gemini' ? 'none' : undefined,
      timeoutMs: 20000,
    });
    if (r.ok) { hasil = r.content; dipakai = prov; break; }
    errTerakhir = r.error;
  }
  if (!hasil) {
    return {
      ok: false, dinilai: 0, sisa: rows.length,
      error: `Semua provider bervisi gagal — ${(errTerakhir || 'tanpa detail').slice(0, 200)}`,
    };
  }

  const parsed = uraiJsonModel(hasil);
  const daftar = Array.isArray(parsed?.foto) ? parsed.foto : null;
  if (!daftar || daftar.length === 0) {
    return { ok: false, dinilai: 0, sisa: rows.length, error: 'Balasan AI bukan JSON yang diharapkan.' };
  }

  const sah = new Set(PHOTO_LABELS);
  const tulis = [];
  for (let i = 0; i < batch.length && i < daftar.length; i++) {
    const d = daftar[i] ?? {};
    // Label di luar kosakata DITOLAK jadi 'Lainnya', bukan disimpan apa adanya:
    // kolom ini dipakai dropdown Detail Properti dan selector variasi, jadi nilai
    // liar akan muncul sebagai pilihan hantu yang tak bisa dipilih ulang.
    const label = sah.has(d.label) ? d.label : 'Lainnya';
    const skor = Number.isFinite(Number(d.skor)) ? Math.max(0, Math.min(100, Math.round(Number(d.skor)))) : null;
    const catatan = typeof d.catatan === 'string' ? d.catatan.trim().slice(0, 300) : null;
    tulis.push({ id: batch[i].row.id, adaLabel: !!(batch[i].row.label_ruangan ?? '').trim(), label, skor, catatan });
  }

  // Label manual TIDAK ditimpa — `COALESCE(NULLIF(TRIM(label_ruangan),''), ?)`
  // menjaga apa yang sudah diisi manusia. Skor & catatan selalu ditulis.
  const stmt = env.DB.prepare(
    `UPDATE property_images
        SET label_ruangan = COALESCE(NULLIF(TRIM(label_ruangan), ''), ?),
            vf_skor = ?, vf_catatan = ?, vf_dinilai_at = datetime('now')
      WHERE id = ?`
  );
  await env.DB.batch(tulis.map(t => stmt.bind(t.label, t.skor, t.catatan, t.id)));

  return { ok: true, dinilai: tulis.length, sisa: Math.max(0, rows.length - tulis.length), provider: dipakai };
}
