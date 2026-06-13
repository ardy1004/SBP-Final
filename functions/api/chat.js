import { jsonOk, jsonError, handleOptions } from './_shared/response.js';
import { searchProperties } from '../_lib/searchProperties.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Kamu adalah Asisten SBP (Salam Bumi Property), asisten AI yang membantu calon pembeli/penyewa mencari properti di Yogyakarta. Gunakan tool search_properties untuk mencari listing berdasarkan kriteria yang disebutkan user (lokasi, jenis properti, budget, jumlah kamar, dll). JANGAN mengarang informasi properti yang tidak ada di hasil tool — hanya rekomendasikan dari hasil pencarian. Jika hasil kosong, sampaikan dengan jujur dan tawarkan kriteria alternatif. Jawab singkat, ramah, dan natural dalam Bahasa Indonesia.`;

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
          harga_min:  { type: 'integer', description: 'Harga minimum dalam Rupiah.' },
          harga_max:  { type: 'integer', description: 'Harga maksimum dalam Rupiah.' },
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
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error(`[chat] Groq error ${res.status}:`, txt.slice(0, 200));
    throw new Error(`Groq ${res.status}`);
  }

  return res.json();
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
    const round1 = await callGroq(env.GROQ_API_KEY, messages, true);
    const assistantMsg = round1.choices?.[0]?.message;

    if (!assistantMsg) {
      return jsonError('Maaf, asisten sedang tidak tersedia', 503);
    }

    const toolCalls = assistantMsg.tool_calls;

    // ── Tidak ada function call → kembalikan langsung ────────────────────────
    if (!toolCalls || toolCalls.length === 0) {
      return jsonOk({ reply: assistantMsg.content ?? '', properties: [] });
    }

    // ── Ada tool_calls → eksekusi search, lalu putaran 2 ───────────────────
    let lastSearchResults = [];

    for (const tc of toolCalls) {
      if (tc.function?.name !== 'search_properties') continue;
      let args = {};
      try { args = JSON.parse(tc.function.arguments ?? '{}'); } catch { args = {}; }
      const results = await searchProperties(env, args);
      lastSearchResults = results;
    }

    // ── Putaran 2: inject hasil search ke system prompt, lalu Groq merespons
    const resultContext = lastSearchResults.length > 0
      ? `\n\nHASIL PENCARIAN PROPERTI (${lastSearchResults.length} listing ditemukan):\n${JSON.stringify(lastSearchResults)}\n\nGunakan data di atas untuk menjawab user. Sebutkan nama properti, harga, dan lokasi dari data yang tersedia.`
      : '\n\nHASIL PENCARIAN: Tidak ada properti yang sesuai kriteria user. Sampaikan dengan jujur dan tawarkan alternatif (lokasi/budget berbeda).';

    const messages2 = [
      { role: 'system', content: SYSTEM_PROMPT + resultContext },
      ...clientMessages,
    ];

    const round2 = await callGroq(env.GROQ_API_KEY, messages2, false);
    const finalMsg = round2.choices?.[0]?.message;

    return jsonOk({
      reply:      finalMsg?.content ?? '',
      properties: lastSearchResults,
    });

  } catch (err) {
    console.error('[chat] Error:', err.message);
    return jsonError('Maaf, asisten sedang tidak tersedia', 503);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
