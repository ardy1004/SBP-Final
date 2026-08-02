// Abstraksi multi-provider AI (OpenAI-compatible) untuk ViralFrame.
// Keempat provider (Gemini, Groq, OpenRouter, DeepSeek) mengekspos endpoint
// chat/completions bergaya OpenAI, jadi satu jalur panggilan cukup.
//
// Key dibaca dari tabel settings D1 (key: <provider>_api_key). DeepSeek/Groq
// punya fallback ke Cloudflare Secret lama bila belum diisi via UI.

// `supportsVision`: model DEFAULT provider ini menerima content multimodal
// (array [{type:'text'},{type:'image_url'}]) lewat endpoint chat/completions
// OpenAI-compatible-nya. HANYA Gemini yang `true` (model default
// `gemini-3.5-flash-lite` multimodal) — Groq/OpenRouter/DeepSeek model DEFAULT-nya
// teks saja (provider itu mungkin PUNYA model lain yang bervisi, tapi model
// default yang dipakai ViralFrame bukan itu; jangan overengineer per-model).
// Dipakai oleh suggest-storyboard.js untuk memilih provider yang dicoba duluan
// saat mengirim `imageUrls`, dengan degradasi ke teks-saja bila tak ada yang
// bervisi/punya key (lihat callChatCompletion di bawah).
export const PROVIDERS = {
  gemini: {
    label: 'Gemini',
    settingKey: 'gemini_api_key',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    // ⚠️ JANGAN pakai model ber-suffix `-preview` sebagai default.
    //
    // Sampai 2026-08-02 default-nya `gemini-3-flash-preview` dengan komentar
    // "kuota harian besar ~1.500 req/hari" — angka itu diambil dari artikel pihak
    // ketiga dan TERBUKTI SALAH. Diukur langsung ke API key produksi, respons 429
    // Google menyebut apa adanya:
    //   quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
    //   model: gemini-3-flash, limit: 20
    // Dua puluh permintaan per hari — habis dalam satu sesi kerja, dan itulah yang
    // membuat "AI Rancang Storyboard" gagal.
    //
    // Kuotanya **per model** (baca lagi quotaId-nya: PerProjectPerModel), jadi
    // pindah model = ember baru, bukan berbagi ember yang sama.
    //
    // Diukur 2026-08-02 dengan key produksi (satu request kecil per model):
    //   gemini-3-flash-preview .... 429, limit 20/hari (HABIS)
    //   gemini-2.0-flash .......... 429, limit 0/hari (tidak gratis lagi)
    //   gemini-2.0-flash-lite ..... 429, limit 0/hari (tidak gratis lagi)
    //   gemini-2.5-flash(-lite) ... 404 (sudah tidak ada di endpoint ini)
    //   gemini-3.5-flash-lite ..... OK 703 ms  ← dipilih
    //   gemini-3.1-flash-lite ..... OK 605 ms
    //   gemini-3.5-flash .......... OK 901 ms
    //   gemini-3.6-flash .......... OK 1538 ms
    //
    // Kenapa `gemini-3.5-flash-lite`:
    //  (1) GA/stabil, bukan preview — model preview-lah yang dapat jatah kecil;
    //  (2) visi TERVERIFIKASI dengan foto properti asli (mendeskripsikan pintu
    //      garasi kayu, pilar cokelat, lantai carport berpola — cocok dengan 2
    //      model lain, jadi ia benar-benar melihat, bukan mengarang);
    //  (3) kelas `flash-lite` tidak membakar thinking token — `gemini-3.5-flash`
    //      dan `3.6-flash` jawabannya terpotong di 120 token karena berpikir dulu;
    //  (4) nama versi dipatok eksplisit, BUKAN alias `-latest`, supaya Google tidak
    //      diam-diam menggeser perilaku model di bawah prompt yang sudah ditala.
    //
    // ⚠️ Angka RPD model yang BELUM habis tidak bisa dibaca dari API — Google tidak
    // mengirim header kuota dan dokumentasinya sudah tidak memuat tabelnya. Jadi
    // "lebih besar dari 20" itu kesimpulan dari (1), bukan angka terukur. Kalau
    // suatu saat model ini ikut 429, pesan errornya akan menyebut limitnya —
    // CATAT angka itu di sini, jangan diganti tebakan.
    defaultModel: 'gemini-3.5-flash-lite',
    quota: null, // tidak ada endpoint kuota — status dari cek models
    supportsVision: true,
  },
  groq: {
    label: 'Groq',
    settingKey: 'groq_api_key',
    envFallback: 'GROQ_API_KEY',
    base: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    quota: null,
    supportsVision: false,
  },
  openrouter: {
    label: 'OpenRouter',
    settingKey: 'openrouter_api_key',
    base: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    quota: 'https://openrouter.ai/api/v1/auth/key',
    supportsVision: false,
  },
  deepseek: {
    label: 'DeepSeek',
    settingKey: 'deepseek_api_key',
    envFallback: 'DEEPSEEK_API_KEY',
    base: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    quota: 'https://api.deepseek.com/user/balance',
    supportsVision: false,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function maskKey(key) {
  if (!key || typeof key !== 'string') return null;
  const k = key.trim();
  if (k.length <= 4) return '••••';
  return '••••••' + k.slice(-4);
}

// Ambil API key provider: settings D1 dulu, lalu fallback Cloudflare Secret.
export async function getProviderKey(env, provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(cfg.settingKey).first();
    if (row?.value && String(row.value).trim()) return String(row.value).trim();
  } catch { /* tabel/row belum ada */ }
  if (cfg.envFallback && env[cfg.envFallback]) return env[cfg.envFallback];
  return null;
}

// Deteksi error "kuota habis / rate limit" agar caller bisa fallback.
function isQuotaError(status, bodyText) {
  if (status === 429) return true;
  const t = (bodyText || '').toLowerCase();
  return /insufficient|quota|exceeded|resource_exhausted|balance|payment required|out of credits/.test(t)
    || status === 402;
}

/**
 * Panggil chat completion OpenAI-compat.
 *
 * `imageUrls` (opsional): array URL foto publik. Bila diisi (non-kosong), pesan
 * user dikirim sebagai content MULTIMODAL bergaya OpenAI:
 *   [{type:'text', text: userPrompt}, {type:'image_url', image_url:{url}}, ...]
 * Bila tidak diisi/kosong, `content` TETAP string biasa seperti sebelumnya —
 * WAJIB backward-compatible, seluruh caller lain (ai-generate.js, youtube-long.js,
 * captions.js, generate-naskah.js, dll) tidak pernah mengirim `imageUrls` dan
 * perilakunya sama sekali tidak berubah.
 * @returns {Promise<{ ok:boolean, content?:string, status:number, error?:string, quotaExhausted?:boolean }>}
 */
export async function callChatCompletion({ provider, apiKey, model, systemPrompt, userPrompt, imageUrls, maxTokens = 4000, temperature = 0.7, timeoutMs = 24000, reasoningEffort }) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { ok: false, status: 0, error: 'provider tidak dikenal' };
  if (!apiKey) return { ok: false, status: 0, error: `API key ${cfg.label} belum diatur`, quotaExhausted: false };

  const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
  const userContent = hasImages
    ? [
        { type: 'text', text: userPrompt },
        ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
      ]
    : userPrompt;

  const mulai = Date.now();
  const modelDipakai = model || cfg.defaultModel;

  const kirim = (pakaiReasoning, sisaMs) => fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelDipakai,
      temperature,
      max_tokens: maxTokens,
      // Kirim hanya bila caller minta — tidak semua provider kenal field ini.
      ...(pakaiReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(sisaMs),
  });

  let res;
  try {
    res = await kirim(true, timeoutMs);
  } catch (err) {
    return { ok: false, status: 0, error: `Gagal menghubungi ${cfg.label}: ${err.message}`, quotaExhausted: false };
  }

  // ⚠️ Dukungan `reasoning_effort` BERBEDA-BEDA PER MODEL dan TIDAK bisa ditebak
  // dari namanya. Diukur ke API Gemini 2026-08-02:
  //   DITERIMA : gemini-3.1-flash-lite, gemini-3.5-flash
  //   DITOLAK  : gemini-3.5-flash-lite, gemini-3.6-flash, gemini-flash-latest,
  //              gemini-flash-lite-latest   → HTTP 400 "invalid argument"
  // Perhatikan tidak ada polanya: satu `flash-lite` menerima, `flash-lite` lain
  // menolak. Jadi daftar-putih statis pasti basi begitu Google merilis model baru.
  //
  // Keenam pemanggil kita mengirim `reasoning_effort:'none'` untuk Gemini secara
  // hardcoded (tujuannya menekan thinking token, lihat insiden latensi >22 detik).
  // Tanpa penanganan ini, mengganti model default ke mana pun yang menolak field
  // itu akan mematikan SELURUH fitur AI dengan 400 seketika.
  //
  // Solusinya swa-pulih, bukan daftar: kalau 400 dan kita memang mengirim field
  // itu, ulangi SEKALI tanpa field tersebut. Model yang tidak mengenalnya juga
  // tidak melakukan thinking, jadi menghilangkannya tidak mengubah perilaku.
  if (res.status === 400 && reasoningEffort) {
    const sisa = timeoutMs - (Date.now() - mulai);
    if (sisa > 1500) {
      try { res = await kirim(false, sisa); }
      catch (err) { return { ok: false, status: 0, error: `Gagal menghubungi ${cfg.label}: ${err.message}`, quotaExhausted: false }; }
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      error: `${cfg.label} error ${res.status}: ${errText.slice(0, 300)}`,
      quotaExhausted: isQuotaError(res.status, errText),
    };
  }

  let json;
  try { json = await res.json(); }
  catch { return { ok: false, status: res.status, error: `${cfg.label} return non-JSON` }; }

  const content = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!content) return { ok: false, status: res.status, error: `${cfg.label} mengembalikan respons kosong` };
  return { ok: true, content, status: res.status };
}

// Daftar model tersedia (OpenAI-compat GET /models). Difilter ke model teks/chat.
export async function listModels(provider, apiKey) {
  const cfg = PROVIDERS[provider];
  if (!cfg || !apiKey) return [];
  try {
    const res = await fetch(`${cfg.base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const arr = json.data ?? json.models ?? [];
    return arr
      .map(m => (typeof m === 'string' ? m : (m.id ?? m.name ?? '')))
      .map(id => String(id).replace(/^models\//, '')) // Gemini prefix
      .filter(Boolean)
      // buang model non-teks yang jelas (embedding/whisper/tts/vision-only/image)
      .filter(id => !/embed|whisper|tts|image|vision|guard|aqa/i.test(id));
  } catch {
    return [];
  }
}

// Status kuota → { color: 'green'|'yellow'|'red', detail }.
// OpenRouter & DeepSeek: dari saldo nyata. Gemini & Groq: dari cek /models.
export async function getQuotaStatus(provider, apiKey) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { color: 'red', detail: 'provider tidak dikenal' };
  if (!apiKey) return { color: 'red', detail: 'Key belum diatur' };

  try {
    if (provider === 'openrouter') {
      const res = await fetch(cfg.quota, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
      if (res.status === 401) return { color: 'red', detail: 'Key tidak valid' };
      if (!res.ok) return { color: 'yellow', detail: `HTTP ${res.status}` };
      const d = (await res.json()).data ?? {};
      if (d.limit == null) return { color: 'green', detail: 'Kredit (tanpa limit harian)' };
      const remaining = Math.max(0, (d.limit ?? 0) - (d.usage ?? 0));
      const ratio = d.limit ? remaining / d.limit : 1;
      const color = remaining <= 0 ? 'red' : ratio < 0.15 ? 'yellow' : 'green';
      return { color, detail: `Sisa ${remaining.toFixed(2)}/${d.limit}` };
    }
    if (provider === 'deepseek') {
      const res = await fetch(cfg.quota, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
      if (res.status === 401) return { color: 'red', detail: 'Key tidak valid' };
      if (!res.ok) return { color: 'yellow', detail: `HTTP ${res.status}` };
      const d = await res.json();
      if (d.is_available === false) return { color: 'red', detail: 'Saldo habis' };
      const bal = parseFloat(d.balance_infos?.[0]?.total_balance ?? '0');
      const color = bal <= 0 ? 'red' : bal < 1 ? 'yellow' : 'green';
      return { color, detail: `Saldo ${d.balance_infos?.[0]?.total_balance ?? '?'} ${d.balance_infos?.[0]?.currency ?? ''}`.trim() };
    }
    // gemini / groq — tidak ada endpoint kuota; cek models sebagai health check.
    const res = await fetch(`${cfg.base}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
    if (res.status === 401 || res.status === 403) return { color: 'red', detail: 'Key tidak valid' };
    if (res.status === 429) return { color: 'yellow', detail: 'Rate limit tercapai' };
    if (!res.ok) return { color: 'yellow', detail: `HTTP ${res.status}` };
    return { color: 'green', detail: 'Aktif' };
  } catch (err) {
    return { color: 'yellow', detail: `Tidak terjangkau: ${err.message?.slice(0, 40)}` };
  }
}
