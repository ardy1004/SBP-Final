// Kredensial storage & scheduler PER AGENT (viralframe_characters).
// Tabel: viralframe_agent_accounts (migrasi 0037).
//
// Dua aturan resolusi yang SENGAJA berbeda — jangan disamakan:
//
// 1. STORAGE (Cloudinary) BOLEH fallback ke akun global (Cloudflare env secret).
//    Video agent yang belum punya akun sendiri mendarat di cloud global; itu
//    cuma soal di akun siapa biaya storage tercatat, tidak ada yang terlanjur
//    terbit ke publik.
//
// 2. SCHEDULER (Buffer/Zernio) TIDAK BOLEH fallback. Kalau agent belum punya
//    key sendiri, penjadwalan DITOLAK dengan pesan jelas. Fallback di sini
//    berarti konten agent A terbit di akun sosmed agent B — tidak bisa ditarik
//    kembali, dan tidak akan kelihatan sampai ada yang membuka akun itu.
//
// Arah impor satu jalur: endpoint -> (agentAccounts, schedulerProviders).
// agentAccounts TIDAK mengimpor schedulerProviders dan sebaliknya —
// scheduleFanOut menerima kredensial yang sudah di-resolve dari pemanggil.

export async function getAgentAccount(env, characterId) {
  const id = parseInt(characterId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    return await env.DB.prepare('SELECT * FROM viralframe_agent_accounts WHERE character_id = ?').bind(id).first();
  } catch {
    return null; // tabel belum ada (mis. D1 lokal belum dimigrasi) -> perlakukan seperti belum diisi
  }
}

function cloudinaryLengkap(row) {
  return !!(row?.cloudinary_name && row?.cloudinary_api_key && row?.cloudinary_api_secret);
}

// Kredensial Cloudinary untuk MENULIS (upload/sign) atas nama satu agent.
// sumber: 'agent' = akun milik agent itu, 'global' = env secret lama.
export async function resolveCloudinary(env, characterId) {
  const acc = await getAgentAccount(env, characterId);
  if (cloudinaryLengkap(acc)) {
    return {
      sumber: 'agent',
      cloudName: acc.cloudinary_name,
      apiKey: acc.cloudinary_api_key,
      apiSecret: acc.cloudinary_api_secret,
    };
  }
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { sumber: 'global', cloudName, apiKey, apiSecret };
}

// Cloud name saja (tanpa secret) — cukup untuk delivery URL seperti
// image/fetch di thumbnail.js, yang tidak butuh tanda tangan sama sekali.
export async function resolveCloudName(env, characterId) {
  const acc = await getAgentAccount(env, characterId);
  return acc?.cloudinary_name || env.CLOUDINARY_CLOUD_NAME || null;
}

// Kredensial untuk MENGHAPUS aset yang sudah terlanjur tersimpan. Kuncinya
// cloud_name yang TERCATAT DI BARIS ASET, bukan akun agent sekarang — kalau
// agent pindah akun, aset lamanya tetap harus dihapus di cloud lamanya.
// Mengembalikan null kalau cloud itu tidak dikenali lagi; pemanggil WAJIB
// memperlakukan itu sebagai kegagalan (baris DB jangan dihapus), bukan sukses.
export async function resolveCloudinaryByCloudName(env, cloudName) {
  if (!cloudName) {
    // Baris lama sebelum migrasi 0037 yang backfill-nya gagal (URL tidak
    // berpola res.cloudinary.com) — pakai akun global sebagai tebakan terbaik.
    const g = await resolveCloudinary(env, null);
    return g?.sumber === 'global' ? g : null;
  }
  if (cloudName === env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return { sumber: 'global', cloudName, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET };
  }
  try {
    const row = await env.DB.prepare(
      `SELECT cloudinary_name, cloudinary_api_key, cloudinary_api_secret
       FROM viralframe_agent_accounts
       WHERE cloudinary_name = ? AND cloudinary_api_key IS NOT NULL AND cloudinary_api_secret IS NOT NULL
       LIMIT 1`
    ).bind(cloudName).first();
    if (!row) return null;
    return { sumber: 'agent', cloudName: row.cloudinary_name, apiKey: row.cloudinary_api_key, apiSecret: row.cloudinary_api_secret };
  } catch {
    return null;
  }
}

export const PLATFORMS = ['youtube', 'tiktok', 'threads', 'facebook', 'instagram'];

// channels_json = { "<platform>": { provider: 'buffer'|'zernio', id: '...' } }
// Provider PER PLATFORM, bukan konstanta global — akun Monica menaruh Threads
// di Buffer & Instagram di Zernio, akun agent lain justru kebalikannya
// (diverifikasi ke API asli 2026-08-11, lihat migrasi 0038). Bentuk lama yang
// mengunci pasangan itu membuat 2 platform hilang tanpa pesan.
export function parseChannels(raw) {
  const out = {};
  if (!raw) return out;
  let v;
  try { v = JSON.parse(raw); } catch { return out; }
  if (!v || typeof v !== 'object') return out;
  for (const p of PLATFORMS) {
    const c = v[p];
    if (c && typeof c === 'object' && typeof c.id === 'string' && c.id && (c.provider === 'buffer' || c.provider === 'zernio')) {
      out[p] = { provider: c.provider, id: c.id };
    }
  }
  return out;
}

// Kredensial scheduler milik agent. TIDAK ada fallback (lihat catatan di atas).
// Selalu kembalikan objek — pemanggil memeriksa isinya sendiri supaya pesan
// errornya bisa menyebut platform mana yang belum siap.
export async function resolveScheduler(env, characterId) {
  const acc = await getAgentAccount(env, characterId);
  return {
    bufferKey: acc?.buffer_api_key ?? null,
    zernioKey: acc?.zernio_api_key ?? null,
    channels: parseChannels(acc?.channels_json),
  };
}

// Cloud name dari secure_url Cloudinary — sumber paling tepercaya soal "file
// ini mendarat di akun siapa", karena datang dari respons Cloudinary sendiri
// dan bukan dari field yang bisa salah dikirim client.
// Bentuk: https://res.cloudinary.com/<cloud>/<resource>/upload/...
export function cloudNameDariUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\//);
  return m ? m[1].slice(0, 100) : null;
}

// Spesialis disimpan sebagai JSON array jenis_properti. Data lama/rusak tidak
// boleh membuat pemanggil meledak — selalu kembalikan array (kosong = bebas).
export function parseSpesialis(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}
