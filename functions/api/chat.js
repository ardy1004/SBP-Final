import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { searchProperties } from '../_lib/searchProperties.js';
import { createLead } from '../_lib/createLead.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { signJWT, verifyJWT } from './_shared/jwt.js';
import { getProviderKey } from '../_lib/aiProviders.js';
import { LANDMARKS } from '../_lib/geoLandmarks.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Kamu adalah Asisten SBP (Salam Bumi Property), asisten AI yang membantu calon pembeli/penyewa mencari properti di Yogyakarta. Gunakan tool search_properties untuk mencari listing berdasarkan kriteria yang disebutkan user (lokasi, jenis properti, budget, jumlah kamar, dll). JANGAN mengarang informasi properti yang tidak ada di hasil tool — hanya rekomendasikan dari hasil pencarian. Jika hasil kosong, sampaikan dengan jujur dan tawarkan kriteria alternatif. Jawab singkat, ramah, dan natural dalam Bahasa Indonesia.

PENTING - Konversi notasi harga Indonesia ke angka Rupiah penuh sebelum memanggil search_properties:
- 'M' atau 'Milyar' atau 'Miliar' setelah angka = dikali 1.000.000.000. Contoh: '5M' atau '5 Milyar' = 5000000000
- 'Jt' atau 'jt' atau 'juta' = dikali 1.000.000. Contoh: '500jt' atau '500 Juta' = 500000000
- 'rb' atau 'ribu' = dikali 1.000. Contoh: '500rb' = 500000
- Kalau user sebut angka tanpa satuan dalam konteks properti (misal 'budget 800'), asumsikan dalam Milyar jika < 100, atau Juta jika antara 100-999, sesuai kewajaran harga properti.
- SELALU kirim harga_min/harga_max sebagai angka Rupiah penuh (integer), BUKAN dalam notasi singkat.

PENTING - KOST DI SBP ADALAH ASET INVESTASI YANG DIJUAL, BUKAN KAMAR SEWAAN:
- Seluruh listing kost di SBP dijual utuh sebagai properti investasi untuk investor (harga ratusan juta sampai puluhan miliar), BUKAN disewakan per kamar per bulan.
- Karena itu untuk kost SELALU pakai tujuan='dijual'. JANGAN PERNAH mengirim tujuan='disewa' untuk kost — hasilnya dijamin kosong dan user akan dikira tidak ada stok padahal ada banyak.
- Kalau user menyebut budget kecil untuk kost (misal 'kost 800rb' atau 'budget 1jt per bulan'), dia kemungkinan besar mencari kamar kost untuk ditinggali — itu BUKAN yang SBP jual. Jelaskan baik-baik bahwa SBP menjual bangunan kost utuh untuk investasi, lalu tanyakan apakah dia tertarik dari sisi investasi. JANGAN memaksakan pencarian dengan harga_max kecil.
- Saat merekomendasikan kost, bingkai sebagai investasi: sebutkan harga, lokasi, jumlah kamar, dan potensi sewanya bila tersedia.

PENTING - Harga sewa di database adalah PER TAHUN (berlaku untuk jenis selain kost):
- Jika user mencari properti DISEWA dan menyebut budget PER BULAN, KALIKAN 12 dulu sebelum mengirim harga_max. Contoh: 'sewa rumah 5jt/bulan' → tujuan='disewa', harga_max=60000000.
- Jika budget sewa disebut per tahun, kirim apa adanya.
- Saat menyebutkan harga sewa ke user, sampaikan juga hitungan per bulannya agar mudah dipahami.

PENTING - Landmark/kampus terkenal dicari lewat koordinat asli, BUKAN tebakan kecamatan:
- Kalau user menyebut nama kampus/RS/mall terkenal (${LANDMARKS.map(l => l.label).join(', ')}), WAJIB isi parameter dekat_landmark dengan slug yang sesuai saat memanggil search_properties. JANGAN menebak kecamatan sendiri dari pengetahuan umum — nama kecamatan di database tidak selalu sama dengan intuisi geografis (contoh nyata: UGM ada di Kecamatan Depok, BUKAN Kecamatan Sleman, meski kabupatennya memang Sleman — kecamatan ibu kota kabupaten sering punya nama sama dengan kabupatennya, jangan tertukar).
- Kalau dekat_landmark dipakai, JANGAN isi kabupaten/kecamatan sekaligus — cukup landmark saja, radiusnya sudah presisi.
- Hasil pencarian lewat landmark punya field jarak_km — SEBUTKAN jaraknya ke user (mis. "≈1.2 km dari UGM") supaya jawaban terasa konkret. Kalau lokasi_approx=true, itu perkiraan (dari titik pusat kecamatan, properti tidak punya koordinat sendiri) — jangan disebut sebagai jarak pasti, cukup bilang "sekitar" atau "kurang lebih".

Jika user menunjukkan minat tinggi pada sebuah properti (misal bertanya cara membeli, ingin survei lokasi, ingin nego, atau bilang 'saya minat'/'serius'), TANYAKAN nama dan nomor WhatsApp mereka secara sopan jika belum disebutkan. SETELAH user memberikan nama DAN nomor WhatsApp, panggil tool submit_lead dengan data tersebut. JANGAN panggil submit_lead sebelum kedua data (nama dan nomor WA) tersedia di percakapan. Setelah submit_lead berhasil, beri konfirmasi ramah bahwa tim akan segera menghubungi via WhatsApp.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description: 'Cari listing properti di database SBP berdasarkan filter yang diberikan.',
      parameters: {
        type: 'object',
        properties: {
          tujuan: {
            type: 'string',
            enum: ['dijual', 'disewa', 'dijual_disewa'],
            description: 'Tujuan transaksi. Opsional.',
          },
          jenis: {
            type: 'string',
            enum: ['rumah', 'tanah', 'kost', 'hotel', 'homestay', 'villa', 'apartment', 'ruko', 'gudang', 'komersial'],
            description: 'Jenis properti (satu nilai). Opsional.',
          },
          kabupaten: { type: 'string', description: 'Nama kabupaten/kota. Contoh: Sleman, Bantul, Gunung Kidul. JANGAN isi bersamaan dengan dekat_landmark.' },
          kecamatan: { type: 'string', description: 'Nama kecamatan. JANGAN isi bersamaan dengan dekat_landmark.' },
          dekat_landmark: {
            type: 'string',
            enum: LANDMARKS.map(l => l.slug),
            description: 'Slug landmark/kampus terkenal jika user menyebutnya (radius asli dari koordinat, lebih akurat daripada menebak kecamatan). WAJIB dipakai alih-alih kabupaten/kecamatan saat user sebut nama landmark spesifik.',
          },
          harga_min:  { type: 'integer', description: 'Harga minimum dalam Rupiah penuh (integer), BUKAN notasi singkat. Misal budget "500jt" = 500000000, "1M" = 1000000000.' },
          harga_max:  { type: 'integer', description: 'Harga maksimum dalam Rupiah penuh (integer), BUKAN notasi singkat. Misal budget "5M" (5 Milyar) = 5000000000, "800jt" = 800000000.' },
          kt: { type: 'integer', description: 'Jumlah kamar tidur minimum.' },
          km: { type: 'integer', description: 'Jumlah kamar mandi minimum.' },
          lt: { type: 'integer', description: 'Luas tanah minimum (m²).' },
          lb: { type: 'integer', description: 'Luas bangunan minimum (m²).' },
          q:  { type: 'string',  description: 'Keyword pencarian bebas.' },
          sort: {
            type: 'string',
            enum: ['terbaru', 'termurah', 'termahal', 'luas'],
            description: 'Urutan hasil. Default terbaru.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_lead',
      description: 'Simpan data kontak user (calon pembeli/penyewa) ke database SBP untuk ditindaklanjuti oleh tim.',
      parameters: {
        type: 'object',
        properties: {
          nama:        { type: 'string',  description: 'Nama lengkap calon pembeli/penyewa, dari yang disebutkan user.' },
          no_wa:       { type: 'string',  description: 'Nomor WhatsApp user, format bebas (08xx atau 628xx), akan dinormalisasi otomatis.' },
          property_id: { type: 'integer', nullable: true, description: 'ID properti yang dibahas (dari hasil search_properties sebelumnya), jika relevan.' },
          budget:      { type: 'string',  nullable: true, description: 'Budget yang disebutkan user, dalam format aslinya (misal "800jt", "1,5M").' },
          pesan:       { type: 'string',  nullable: true, description: 'Ringkasan singkat kebutuhan/pertanyaan user untuk konteks admin.' },
        },
        required: ['nama', 'no_wa'],
      },
    },
  },
];

// ── Groq API call ──────────────────────────────────────────────────────────────
// useTools: true = auto, 'none' = tools dikirим tapi tidak boleh dipanggil, false = tanpa tools
async function callGroq(apiKey, messages, useTools) {
  const body = {
    model: MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 600,
  };
  if (useTools === true) {
    body.tools       = TOOLS;
    body.tool_choice = 'auto';
  } else if (useTools === 'none') {
    body.tools       = TOOLS;
    body.tool_choice = 'none';
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error(`[chat] Groq error ${res.status}:`, txt.slice(0, 200));
    throw new Error(`Groq ${res.status}`);
  }

  return res.json();
}

// Retry 1x untuk network/timeout errors — tidak retry untuk 4xx (request errors)
async function callGroqWithRetry(apiKey, messages, useTools) {
  try {
    return await callGroq(apiKey, messages, useTools);
  } catch (err) {
    if (/^Groq 4\d\d/.test(err.message)) throw err;
    await new Promise(r => setTimeout(r, 300));
    return callGroq(apiKey, messages, useTools);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  // Key dari D1 settings (Admin → Pengaturan → AI Providers) dengan fallback
  // ke Secret lama GROQ_API_KEY — konsisten dengan ViralFrame.
  const groqKey = await getProviderKey(env, 'groq');
  if (!groqKey) {
    return jsonError('Maaf, asisten sedang tidak tersedia', 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Body JSON tidak valid', 400);
  }

  // Validasi messages
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError('messages wajib berupa array tidak kosong', 400);
  }

  // Sanitasi messages: hanya izinkan role user/assistant, content string
  const clientMessages = body.messages
    .filter(m => ['user', 'assistant'].includes(m?.role) && typeof m?.content === 'string')
    .slice(-20)  // batasi history: max 20 giliran
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (clientMessages.length === 0 || clientMessages.at(-1)?.role !== 'user') {
    return jsonError('Pesan terakhir harus dari role user', 400);
  }

  // ── Anti-bot: CAPTCHA sekali, lalu tiket bertanda tangan server ────────────
  // User cukup menyelesaikan CAPTCHA satu kali per percakapan — memaksanya tiap
  // giliran akan merusak pengalaman chat. Tapi "giliran keberapa" TIDAK BOLEH
  // ditentukan oleh jumlah pesan yang dikirim klien: riwayat itu milik klien,
  // jadi bot cukup mengarang dua giliran untuk melewati CAPTCHA sepenuhnya.
  // (Terbukti di produksi 2026-07-26: 1 giliran tanpa token -> 403, sedangkan
  // 3 pesan karangan tanpa token -> 200 + jawaban LLM lengkap.)
  //
  // Karena itu buktinya dipindah ke tiket ber-HMAC yang hanya bisa diterbitkan
  // server setelah CAPTCHA lolos. Klien boleh mengarang riwayat sesuka hati —
  // tanpa tiket yang sah, tetap ditolak.
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? null;
  let chatPassBaru = null;

  if (!env.JWT_SECRET) {
    // Tanpa secret, tiket tidak bisa ditandatangani maupun diverifikasi. Ikuti
    // pola turnstile.js: fail-open agar dev lokal tetap jalan, tapi biarkan
    // verifikasi Turnstile di bawah yang tetap menjaga host non-kanonik.
    const captcha = await verifyTurnstile(body.cf_turnstile_token, env.TURNSTILE_SECRET, ip, new URL(request.url).hostname);
    if (!captcha.ok) {
      return jsonError('Verifikasi anti-bot gagal. Silakan muat ulang halaman dan coba lagi.', 403);
    }
  } else {
    const tiket = await verifyJWT(body.chat_pass, env.JWT_SECRET);
    const tiketSah = tiket?.scope === 'chat';

    if (!tiketSah) {
      // Belum punya tiket → wajib CAPTCHA, apa pun isi riwayat yang dikirim.
      const captcha = await verifyTurnstile(body.cf_turnstile_token, env.TURNSTILE_SECRET, ip, new URL(request.url).hostname);
      if (!captcha.ok) {
        return jsonError('Verifikasi anti-bot gagal. Silakan muat ulang halaman dan coba lagi.', 403);
      }
      // 2 jam: cukup panjang untuk satu sesi percakapan, cukup pendek agar
      // tiket yang bocor tidak jadi kunci permanen ke kuota LLM.
      chatPassBaru = await signJWT(
        { scope: 'chat', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7200 },
        env.JWT_SECRET,
      );
    }
  }

  // ── Konteks properti dari giliran sebelumnya ────────────────────────────────
  // Model stateless antar giliran (history hanya role+content), jadi hasil
  // pencarian terakhir (id + judul) dikirim balik oleh client agar submit_lead
  // bisa mengisi property_id yang BENAR, bukan mengarang.
  let propContext = '';
  if (Array.isArray(body.context_properties) && body.context_properties.length > 0) {
    const ctxProps = body.context_properties
      .filter(p => p && Number.isInteger(Number(p.id)) && typeof p.title === 'string')
      .slice(0, 10)
      .map(p => ({ id: Number(p.id), title: String(p.title).slice(0, 120) }));
    if (ctxProps.length > 0) {
      propContext = `\n\nPROPERTI YANG SEDANG DIBAHAS (hasil pencarian giliran sebelumnya — id valid dari database):\n${
        ctxProps.map(p => `- id ${p.id}: ${p.title}`).join('\n')
      }\nJika user menunjukkan minat pada salah satu properti ini, gunakan id tersebut sebagai property_id saat memanggil submit_lead. JANGAN mengarang id lain.`;
    }
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + propContext },
    ...clientMessages,
  ];

  try {
    // ── Putaran 1: kemungkinan ada tool_calls ────────────────────────────────
    const round1 = await callGroqWithRetry(groqKey, messages, true);
    const assistantMsg = round1.choices?.[0]?.message;

    if (!assistantMsg) {
      return jsonError('Maaf, asisten sedang tidak tersedia', 503);
    }

    const toolCalls = assistantMsg.tool_calls;

    // ── Tidak ada function call → kembalikan langsung ────────────────────────
    if (!toolCalls || toolCalls.length === 0) {
      return jsonOk({ reply: assistantMsg.content ?? '', properties: [], leadSubmitted: false, waUrl: null, chat_pass: chatPassBaru });
    }

    // ── Ada tool_calls → eksekusi tools, lalu putaran 2 ───────────────────
    let lastSearchResults = [];
    let leadResult = null;

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { args = {}; }

      if (tc.function?.name === 'search_properties') {
        // Akumulasi (bukan timpa) — model bisa memanggil search lebih dari sekali
        // dalam satu giliran (mis. "rumah di Sleman dan tanah di Bantul").
        const found = await searchProperties(env, args);
        const seen = new Set(lastSearchResults.map(p => p.id));
        lastSearchResults = [...lastSearchResults, ...found.filter(p => !seen.has(p.id))].slice(0, 10);
      } else if (tc.function?.name === 'submit_lead') {
        leadResult = await createLead(env, context, { ...args, source_page: 'chat' });
      }
    }

    // ── Putaran 2: inject hasil tools ke system prompt, lalu Groq merespons
    const contextParts = [];

    if (toolCalls.some(tc => tc.function?.name === 'search_properties')) {
      contextParts.push(lastSearchResults.length > 0
        ? `HASIL PENCARIAN PROPERTI (${lastSearchResults.length} listing ditemukan):\n${JSON.stringify(lastSearchResults)}\n\nGunakan data di atas untuk menjawab user. Sebutkan nama properti, harga, dan lokasi dari data yang tersedia. Kalau ada field jarak_km, sebutkan jaraknya (pakai "≈"/"sekitar" bila lokasi_approx=true — itu perkiraan, bukan jarak pasti).`
        : 'HASIL PENCARIAN: Tidak ada properti yang sesuai kriteria user. Sampaikan dengan jujur dan tawarkan alternatif (lokasi/budget berbeda).');
    }

    if (toolCalls.some(tc => tc.function?.name === 'submit_lead')) {
      if (leadResult?.error === 'no_wa_invalid') {
        contextParts.push('SUBMIT LEAD: Nomor WhatsApp yang diberikan tidak valid. Minta user memberikan nomor yang benar (format 08xx atau 628xx).');
      } else if (leadResult?.success) {
        contextParts.push('SUBMIT LEAD: Data lead berhasil disimpan. Beri konfirmasi ramah ke user bahwa tim SBP akan segera menghubungi mereka via WhatsApp.');
      } else {
        contextParts.push('SUBMIT LEAD: Terjadi kesalahan teknis saat menyimpan data. Sampaikan permintaan maaf dan minta user coba lagi.');
      }
    }

    const resultContext = contextParts.length > 0 ? '\n\n' + contextParts.join('\n\n') : '';

    const messages2 = [
      { role: 'system', content: SYSTEM_PROMPT + propContext + resultContext },
      ...clientMessages,
    ];

    const round2 = await callGroqWithRetry(groqKey, messages2, false);
    const finalMsg = round2.choices?.[0]?.message;

    return jsonOk({
      reply:         finalMsg?.content ?? '',
      properties:    lastSearchResults,
      leadSubmitted: leadResult?.success === true,
      waUrl:         leadResult?.wa_url ?? null,
      // Diterbitkan hanya pada giliran yang lolos CAPTCHA; null di giliran
      // berikutnya. Klien menyimpannya dan mengirim balik tiap request.
      chat_pass:     chatPassBaru,
    });

  } catch (err) {
    console.error('[chat] Error:', err.message);
    return jsonError('Maaf, asisten sedang tidak tersedia', 503);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
