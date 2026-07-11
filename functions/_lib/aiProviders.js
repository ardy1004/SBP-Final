// Abstraksi multi-provider AI (OpenAI-compatible) untuk ViralFrame.
// Keempat provider (Gemini, Groq, OpenRouter, DeepSeek) mengekspos endpoint
// chat/completions bergaya OpenAI, jadi satu jalur panggilan cukup.
//
// Key dibaca dari tabel settings D1 (key: <provider>_api_key). DeepSeek/Groq
// punya fallback ke Cloudflare Secret lama bila belum diisi via UI.

export const PROVIDERS = {
  gemini: {
    label: 'Gemini',
    settingKey: 'gemini_api_key',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    quota: null, // tidak ada endpoint kuota — status dari cek models
  },
  groq: {
    label: 'Groq',
    settingKey: 'groq_api_key',
    envFallback: 'GROQ_API_KEY',
    base: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    quota: null,
  },
  openrouter: {
    label: 'OpenRouter',
    settingKey: 'openrouter_api_key',
    base: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    quota: 'https://openrouter.ai/api/v1/auth/key',
  },
  deepseek: {
    label: 'DeepSeek',
    settingKey: 'deepseek_api_key',
    envFallback: 'DEEPSEEK_API_KEY',
    base: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    quota: 'https://api.deepseek.com/user/balance',
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
 * @returns {Promise<{ ok:boolean, content?:string, status:number, error?:string, quotaExhausted?:boolean }>}
 */
export async function callChatCompletion({ provider, apiKey, model, systemPrompt, userPrompt, maxTokens = 4000, temperature = 0.7, timeoutMs = 55000 }) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { ok: false, status: 0, error: 'provider tidak dikenal' };
  if (!apiKey) return { ok: false, status: 0, error: `API key ${cfg.label} belum diatur`, quotaExhausted: false };

  let res;
  try {
    res = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || cfg.defaultModel,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, status: 0, error: `Gagal menghubungi ${cfg.label}: ${err.message}`, quotaExhausted: false };
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
