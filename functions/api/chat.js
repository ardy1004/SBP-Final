import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { searchProperties } from '../_lib/searchProperties.js';
import { createLead } from '../_lib/createLead.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Kamu adalah Asisten SBP (Salam Bumi Property), asisten AI yang membantu calon pembeli/penyewa mencari properti di Yogyakarta. Gunakan tool search_properties untuk mencari listing berdasarkan kriteria yang disebutkan user (lokasi, jenis properti, budget, jumlah kamar, dll). JANGAN mengarang informasi properti yang tidak ada di hasil tool — hanya rekomendasikan dari hasil pencarian. Jika hasil kosong, sampaikan dengan jujur dan tawarkan kriteria alternatif. Jawab singkat, ramah, dan natural dalam Bahasa Indonesia.

PENTING - Konversi notasi harga Indonesia ke angka Rupiah penuh sebelum memanggil search_properties:
- 'M' atau 'Milyar' atau 'Miliar' setelah angka = dikali 1.000.000.000. Contoh: '5M' atau '5 Milyar' = 5000000000
- 'Jt' atau 'jt' atau 'juta' = dikali 1.000.000. Contoh: '500jt' atau '500 Juta' = 500000000
- 'rb' atau 'ribu' = dikali 1.000. Contoh: '500rb' = 500000
- Kalau user sebut angka tanpa satuan dalam konteks properti (misal 'budget 800'), asumsikan dalam Milyar jika < 100, atau Juta jika antara 100-999, sesuai kewajaran harga properti.
- SELALU kirim harga_min/harga_max sebagai angka Rupiah penuh (integer), BUKAN dalam notasi singkat.

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
          kabupaten: { type: 'string', description: 'Nama kabupaten/kota. Contoh: Sleman, Bantul, Gunung Kidul.' },
          kecamatan: { type: 'string', description: 'Nama kecamatan.' },
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

  if (!env.GROQ_API_KEY) {
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

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...clientMessages,
  ];

  try {
    // ── Putaran 1: kemungkinan ada tool_calls ────────────────────────────────
    const round1 = await callGroqWithRetry(env.GROQ_API_KEY, messages, true);
    const assistantMsg = round1.choices?.[0]?.message;

    if (!assistantMsg) {
      return jsonError('Maaf, asisten sedang tidak tersedia', 503);
    }

    const toolCalls = assistantMsg.tool_calls;

    // ── Tidak ada function call → kembalikan langsung ────────────────────────
    if (!toolCalls || toolCalls.length === 0) {
      return jsonOk({ reply: assistantMsg.content ?? '', properties: [], leadSubmitted: false, waUrl: null });
    }

    // ── Ada tool_calls → eksekusi tools, lalu putaran 2 ───────────────────
    let lastSearchResults = [];
    let leadResult = null;

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { args = {}; }

      if (tc.function?.name === 'search_properties') {
        lastSearchResults = await searchProperties(env, args);
      } else if (tc.function?.name === 'submit_lead') {
        leadResult = await createLead(env, context, { ...args, source_page: 'chat' });
      }
    }

    // ── Putaran 2: inject hasil tools ke system prompt, lalu Groq merespons
    const contextParts = [];

    if (toolCalls.some(tc => tc.function?.name === 'search_properties')) {
      contextParts.push(lastSearchResults.length > 0
        ? `HASIL PENCARIAN PROPERTI (${lastSearchResults.length} listing ditemukan):\n${JSON.stringify(lastSearchResults)}\n\nGunakan data di atas untuk menjawab user. Sebutkan nama properti, harga, dan lokasi dari data yang tersedia.`
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
      { role: 'system', content: SYSTEM_PROMPT + resultContext },
      ...clientMessages,
    ];

    const round2 = await callGroqWithRetry(env.GROQ_API_KEY, messages2, false);
    const finalMsg = round2.choices?.[0]?.message;

    return jsonOk({
      reply:         finalMsg?.content ?? '',
      properties:    lastSearchResults,
      leadSubmitted: leadResult?.success === true,
      waUrl:         leadResult?.wa_url ?? null,
    });

  } catch (err) {
    console.error('[chat] Error:', err.message);
    return jsonError('Maaf, asisten sedang tidak tersedia', 503);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
