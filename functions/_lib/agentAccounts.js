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

// ── Mode akun ────────────────────────────────────────────────────────────────
// 'terpusat'  : SEMUA agent memakai akun agent utama (storage + scheduler).
//               Dipakai selama masa "habiskan dulu antrean video lama lewat
//               satu kanal", sebelum tiap agent benar-benar jalan sendiri.
// 'per_agent' : tiap agent memakai akunnya sendiri.
//
// Satu saklar mengatur storage DAN scheduler sekaligus, sengaja tidak
// dipisah: kalau cuma posting yang dipusatkan, video baru tetap mendarat di
// cloud agent sementara yang lama di cloud utama — justru memecah aset ke dua
// tempat, yang persis mau dihindari.
export async function getModeAkun(env) {
  try {
    const res = await env.DB.prepare(
      `SELECT key, value FROM settings WHERE key IN ('viralframe_akun_mode','viralframe_akun_utama')`
    ).all();
    const map = Object.fromEntries((res.results ?? []).map(r => [r.key, r.value]));
    const utama = parseInt(map.viralframe_akun_utama ?? '', 10);
    return {
      mode: map.viralframe_akun_mode === 'per_agent' ? 'per_agent' : 'terpusat',
      utama: Number.isInteger(utama) && utama > 0 ? utama : null,
    };
  } catch {
    // Tabel/baris belum ada -> anggap terpusat tanpa agent utama, artinya
    // resolver jatuh ke perilaku lama (env global). Aman, bukan diam-diam
    // memakai akun agent lain.
    return { mode: 'terpusat', utama: null };
  }
}

// Agent yang AKUNNYA benar-benar dipakai untuk sebuah video milik characterId.
export async function resolveAkunTarget(env, characterId) {
  const { mode, utama } = await getModeAkun(env);
  if (mode === 'terpusat' && utama) return { targetId: utama, mode, utama };
  return { targetId: parseInt(characterId, 10) || null, mode, utama };
}

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
  const { targetId } = await resolveAkunTarget(env, characterId);
  const acc = await getAgentAccount(env, targetId);
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
  const { targetId } = await resolveAkunTarget(env, characterId);
  const acc = await getAgentAccount(env, targetId);
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
  const { targetId, mode } = await resolveAkunTarget(env, characterId);
  const acc = await getAgentAccount(env, targetId);
  return {
    mode,
    // Agent yang akunnya dipakai — beda dari characterId saat mode terpusat.
    // Dipakai pesan error supaya admin tahu akun SIAPA yang belum lengkap.
    targetId,
    bufferKey: acc?.buffer_api_key ?? null,
    zernioKey: acc?.zernio_api_key ?? null,
    channels: parseChannels(acc?.channels_json),
  };
}

// Aturan spesialis (keputusan user 2026-08-11): pembatasan mengikuti STORAGE
// TUJUAN, bukan sekadar agent yang dipilih.
//   • Menuju akun agent utama (entah karena mode terpusat, entah karena yang
//     dipilih memang agent utama) -> BEBAS jenis apa pun.
//   • Menuju akun agent spesialis -> jenis properti WAJIB cocok.
// Agent tanpa spesialis tersimpan juga bebas — belum diatur, bukan "tidak boleh
// apa-apa".
export async function cekSpesialis(env, characterId, jenisProperti) {
  const { targetId, utama } = await resolveAkunTarget(env, characterId);
  if (!targetId || (utama && targetId === utama)) return { boleh: true };

  const row = await env.DB.prepare(
    `SELECT c.nama, a.spesialis
     FROM viralframe_characters c LEFT JOIN viralframe_agent_accounts a ON a.character_id = c.id
     WHERE c.id = ?`
  ).bind(targetId).first().catch(() => null);
  if (!row) return { boleh: true }; // agent tidak dikenal -> biarkan validator lain yang menolak

  const spesialis = parseSpesialis(row.spesialis);
  if (spesialis.length === 0) return { boleh: true };
  if (jenisProperti && spesialis.includes(jenisProperti)) return { boleh: true };

  return {
    boleh: false,
    pesan: `${row.nama} khusus properti ${spesialis.join('/')}, sedangkan properti ini ${jenisProperti || 'tidak diketahui jenisnya'}. Pilih agent yang sesuai, atau pakai agent utama yang bebas semua jenis.`,
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
