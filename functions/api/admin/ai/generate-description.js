// POST /api/admin/ai/generate-description
// Auth via functions/api/admin/_middleware.js (cookie session)
//
// RESPONS: NDJSON streaming (application/x-ndjson), BUKAN JSON biasa.
// Dulu endpoint ini memanggil DeepSeek langsung tanpa timeout dan menunggu
// respons utuh sebelum membalas apa pun. deepseek-chat butuh 20-60 detik untuk
// menghasilkan 4 paragraf, sehingga Worker sering melewati batas 30 detik
// wall-clock Cloudflare → Cloudflare membalas halaman HTML-nya sendiri →
// frontend gagal dengan `Unexpected token '<', "<!DOCTYPE "...`.
// Heartbeat tiap 2 detik membuat respons mengalir sejak awal sehingga batas
// wall-clock tidak berlaku. Pola ini sama persis dengan viralframe/ai-generate.js.
//
// Key dibaca lewat getProviderKey() (settings D1 → fallback Cloudflare Secret),
// bukan env.DEEPSEEK_API_KEY langsung — sebelumnya key yang diisi lewat
// Admin → Pengaturan → AI Providers tidak pernah terbaca di sini.

import { getProviderKey, callChatCompletion, PROVIDERS } from '../../../_lib/aiProviders.js';
import { handleOptions } from '../../_shared/response.js';

// DeepSeek didahulukan agar gaya tulisan tetap sama seperti sebelumnya; sisanya
// hanya dipakai bila DeepSeek gagal/lambat/kehabisan kuota.
const PROVIDER_ORDER = ['deepseek', 'gemini', 'groq', 'openrouter'];

// Per provider. Longgar karena streaming sudah melindungi dari wall-clock,
// tapi tetap berbatas supaya rantai fallback tidak menggantung tanpa akhir.
const PER_PROVIDER_TIMEOUT_MS = 40000;

function formatHarga(harga) {
  if (!harga || harga <= 0) return null;
  if (harga >= 1_000_000_000) {
    const miliar = harga / 1_000_000_000;
    return `Rp ${miliar % 1 === 0 ? miliar : miliar.toFixed(1).replace('.', ',')} Miliar`;
  }
  if (harga >= 1_000_000) {
    const juta = harga / 1_000_000;
    return `Rp ${juta % 1 === 0 ? juta : juta.toFixed(0)} Juta`;
  }
  return `Rp ${harga.toLocaleString('id-ID')}`;
}

function truncateAtWord(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  const cut = str.lastIndexOf(' ', maxLen);
  return cut > 0 ? str.slice(0, cut) : str.slice(0, maxLen);
}

// Menghasilkan deskripsi kamar yang tepat per jenis properti agar AI tidak salah sebut.
function buildKamarDesc(jenis_properti, kamar_tidur, kamar_mandi) {
  const kt = kamar_tidur ? Number(kamar_tidur) : null;
  const km = kamar_mandi ? Number(kamar_mandi) : null;
  const jenis = (jenis_properti ?? '').toLowerCase();

  // Jenis yang tidak relevan dengan kamar — skip
  if (['tanah', 'ruko', 'gudang', 'komersial'].includes(jenis)) return null;

  if (!kt && !km) return null;

  if (jenis === 'kost') {
    if (kt && km && kt === km) {
      return `${kt} kamar tidur masing-masing dengan kamar mandi dalam (en-suite)`;
    }
    const parts = [];
    if (kt) parts.push(`${kt} kamar tidur`);
    if (km) parts.push(`${km} kamar mandi`);
    return parts.join(', ');
  }

  if (jenis === 'hotel') {
    const parts = [];
    if (kt) parts.push(`${kt} unit kamar`);
    if (km) parts.push(`${km} kamar mandi`);
    return parts.join(', ');
  }

  // rumah, villa, homestay, apartment
  const parts = [];
  if (kt) parts.push(`${kt} kamar tidur (KT)`);
  if (km) parts.push(`${km} kamar mandi (KM)`);
  return parts.join(', ');
}

// Parse + validasi output model. Dipakai sebagai gerbang kualitas: output yang
// tidak lolos diperlakukan sebagai KEGAGALAN PROVIDER sehingga rantai fallback
// mencoba provider berikutnya, bukan menyerahkan hasil rusak ke admin.
function parseKontenJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'respons kosong' };

  // Model kadang membungkus JSON dalam ```json ... ``` meski diminta tidak.
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Atau menambah kalimat pengantar/penutup — ambil objek JSON terluar saja.
  if (!cleaned.startsWith('{')) {
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) cleaned = cleaned.slice(a, b + 1);
  }

  let obj;
  try { obj = JSON.parse(cleaned); }
  catch { return { ok: false, error: 'bukan JSON valid' }; }
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'JSON bukan objek' };

  // deskripsi adalah satu-satunya field yang benar-benar wajib — tanpa itu
  // tombolnya tidak ada gunanya. Field SEO boleh kosong (ada tombol auto-fill
  // terpisah yang bisa mengisinya dari data properti).
  const deskripsi = typeof obj.deskripsi === 'string' ? obj.deskripsi.trim() : '';
  if (deskripsi.length < 80) {
    return { ok: false, error: `deskripsi terlalu pendek (${deskripsi.length} karakter)` };
  }

  return { ok: true, data: obj };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    jenis_properti, tujuan, harga, kecamatan, kabupaten, provinsi,
    luas_tanah, luas_bangunan, kamar_tidur, kamar_mandi,
    legalitas, nego, furnished,
  } = body;

  if (!kecamatan || !kabupaten) {
    return Response.json(
      { error: 'Lengkapi data lokasi terlebih dahulu' },
      { status: 422 }
    );
  }

  const hargaReadable = formatHarga(harga) ?? 'Harga tidak tersedia';
  const kamarDesc = buildKamarDesc(jenis_properti, kamar_tidur, kamar_mandi);
  const lokasiStr = [kecamatan, kabupaten, provinsi].filter(Boolean).join(', ');

  const isKostEnSuite = jenis_properti?.toLowerCase() === 'kost'
    && kamar_tidur && kamar_mandi
    && Number(kamar_tidur) === Number(kamar_mandi);
  const kamarLine = kamarDesc
    ? (isKostEnSuite
        ? `- ⚠️ KAMAR (WAJIB IKUTI PERSIS): ${kamarDesc} — DILARANG menyebut jumlah kamar mandi sebagai unit properti`
        : `- Kamar: ${kamarDesc}`)
    : null;

  const userPrompt = [
    'Data properti:',
    `- Jenis: ${jenis_properti ?? '-'}`,
    `- Tujuan: ${tujuan ?? '-'}`,
    `- Harga: ${hargaReadable}${nego ? ' (bisa nego)' : ' (harga tetap)'}`,
    `- Lokasi: ${lokasiStr}`,
    `- Luas Tanah: ${luas_tanah ? luas_tanah + ' m²' : 'tidak tersedia'}`,
    `- Luas Bangunan: ${luas_bangunan ? luas_bangunan + ' m²' : 'tidak tersedia'}`,
    kamarLine ?? '- Kamar: tidak tersedia',
    `- Legalitas: ${legalitas ?? 'tidak tersedia'}`,
    `- Furnished: ${furnished ? String(furnished) : 'tidak disebutkan'}`,
    '',
    'Generate konten sesuai aturan system prompt.',
  ].join('\n');

  const systemPrompt = `Kamu adalah copywriter properti profesional Indonesia yang ahli SEO lokal. Tugas: hasilkan konten listing properti berkualitas tinggi dari data yang diberikan.

ATURAN JUDUL (field: judul):
- Max 60 karakter STRICT — hitung karakter sebelum output
- Wajib mengandung: jenis properti + tujuan + lokasi (kecamatan/kabupaten)
- Jika ada angka unit/kamar yang signifikan, WAJIB disebut (contoh: 23 Kamar, 5 Unit)
- Jika ada keunggulan unik dari data (Fully Furnished, SHM, dekat landmark), MASUKKAN jika muat
- DILARANG: tanda seru, ALL CAPS, kata murah/terbaik/nomor1/eksklusif/premium/mewah
- Contoh BAIK: Kost 23 Kamar Furnished Dijual Depok Sleman
- Contoh BURUK: KOST EKSKLUSIF MEWAH TERBAIK DI SLEMAN!

ATURAN META_TITLE (field: meta_title):
- Max 60 karakter STRICT
- Format: [Judul dipersingkat] | Salam Bumi Property
- Potong judul dari kanan jika melebihi, JANGAN potong suffix brand
- Contoh: Kost 23 Kamar Furnished Depok | Salam Bumi Property

ATURAN DESKRIPSI (field: deskripsi):
- 150-350 kata total
- WAJIB 4 paragraf terpisah dengan baris kosong antar paragraf:
  P1 — Opening (2-3 kalimat): sebut jenis properti + tujuan + lokasi lengkap (kecamatan, kabupaten) + harga jika tersedia. Masukkan keyword lokasi di kalimat pertama.
  P2 — Spesifikasi (3-4 kalimat): sebut luas tanah/bangunan (jika ada), detail kamar SESUAI JENIS PROPERTI (gunakan deskripsi kamar dari input persis seperti yang diberikan), legalitas, kondisi furnished/unfurnished jika ada.
  P3 — Keunggulan Lokasi (2-3 kalimat): akses ke landmark/fasilitas terdekat, kemudahan transportasi, potensi investasi jika properti komersial/kost/hotel.
  P4 — CTA Soft (1-2 kalimat): ajak kontak untuk survei. DILARANG: kata tidak boleh dilewatkan, segera, terbatas, investasi terbaik.
- Kalimat aktif (bukan pasif). Keyword lokasi max 3x. Bahasa Indonesia formal namun tidak kaku.
- KHUSUS PER JENIS:
  Kost/Hotel/Homestay/Villa: P3 wajib sebut potensi pendapatan sewa atau yield investasi
  Tanah: P2 tidak perlu sebut kamar, fokus luas + peruntukan + kontur
  Ruko/Gudang/Komersial: P2 fokus luas + akses kendaraan + zonasi
  Rumah/Apartment: P2 sebut KT dan KM terpisah, sebut furnished status

ATURAN META_DESCRIPTION (field: meta_description):
- Max 155 karakter STRICT — hitung karakter, potong di batas kata bukan tengah kata
- Wajib mengandung: jenis properti + lokasi + 1 spesifikasi utama + 1 CTA singkat
- JANGAN ulangi kesalahan: pastikan sebutan kamar sesuai jenis (kamar tidur bukan kamar mandi untuk kost)
- Contoh BAIK (128 karakter): Kost dijual di Depok, Sleman. 23 kamar tidur en-suite, SHM, luas 800 m². Strategis dekat kampus. Hubungi untuk survei.
- Contoh BURUK: Kost dijual di Depok Sleman, luas 800 m², 23 kamar mandi, legalitas SHM.

FORMAT RESPONSE:
Respond HANYA dengan JSON valid, tanpa markdown, tanpa komentar, tanpa penjelasan apapun di luar JSON:
{"judul": "...", "deskripsi": "...", "meta_title": "...", "meta_description": "..."}`;

  // ── Panggil AI dengan fallback berantai, respons streaming NDJSON ──────────
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n')).catch(() => {});

  const work = (async () => {
    const heartbeat = setInterval(() => send({ status: 'progress' }), 2000);
    try {
      let parsed = null;
      let usedProvider = null;
      const attempts = [];

      for (const provider of PROVIDER_ORDER) {
        const key = await getProviderKey(env, provider);
        if (!key) { attempts.push({ provider, skipped: 'no_key' }); continue; }

        send({ status: 'progress', provider });

        const result = await callChatCompletion({
          provider,
          apiKey: key,
          model: PROVIDERS[provider].defaultModel,
          systemPrompt,
          userPrompt,
          maxTokens: 1200,
          temperature: 0.3,
          timeoutMs: PER_PROVIDER_TIMEOUT_MS,
          // Gemini model thinking: tanpa 'none', token reasoning tersembunyi bikin lambat.
          reasoningEffort: provider === 'gemini' ? 'none' : undefined,
        });

        if (!result.ok) {
          attempts.push({ provider, error: result.error?.slice(0, 140) });
          console.error(`[generate-description] ${provider} gagal:`, result.error?.slice(0, 160));
          continue;
        }

        // Output tidak valid = kegagalan provider juga → coba provider berikutnya,
        // jangan langsung menyerah ke user (pola sama dengan viralframe/ai-generate.js).
        const cand = parseKontenJson(result.content);
        if (!cand.ok) {
          attempts.push({ provider, error: cand.error });
          console.error(`[generate-description] ${provider} output tidak valid:`, cand.error);
          continue;
        }

        parsed = cand.data;
        usedProvider = provider;
        break;
      }

      if (!parsed) {
        const allNoKey = attempts.length > 0 && attempts.every(a => a.skipped === 'no_key');
        send({
          done: true,
          error: allNoKey
            ? 'Belum ada API key AI yang diatur. Buka Pengaturan → AI Providers dan simpan minimal satu API key.'
            : `Semua provider AI gagal. ${attempts.map(a => `${a.provider}: ${a.error || a.skipped || 'gagal'}`).join(' | ')}`.slice(0, 480),
        });
        return;
      }

      // Safety net: untuk kost en-suite, koreksi penyebutan kamar mandi yang salah di deskripsi
      if (isKostEnSuite) {
        const wrongPattern = new RegExp(`${Number(kamar_tidur)}\\s*kamar\\s*mandi`, 'gi');
        const correctText = `${Number(kamar_tidur)} kamar tidur`;
        if (parsed.deskripsi) parsed.deskripsi = parsed.deskripsi.replace(wrongPattern, correctText);
        if (parsed.meta_description) parsed.meta_description = parsed.meta_description.replace(wrongPattern, correctText);
      }

      send({
        done: true,
        data: {
          judul:            truncateAtWord(String(parsed.judul ?? ''), 60),
          deskripsi:        String(parsed.deskripsi ?? ''),
          meta_title:       truncateAtWord(String(parsed.meta_title ?? ''), 60),
          meta_description: truncateAtWord(String(parsed.meta_description ?? ''), 155),
          provider_used:    usedProvider,
          fell_back:        usedProvider !== PROVIDER_ORDER[0],
        },
      });
    } catch (err) {
      console.error('[generate-description] stream', err.message);
      send({ done: true, error: 'Terjadi kesalahan internal saat generate. Coba lagi.' });
    } finally {
      clearInterval(heartbeat);
      await writer.close().catch(() => {});
    }
  })();

  context.waitUntil?.(work);

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
