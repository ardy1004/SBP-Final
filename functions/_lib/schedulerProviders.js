// Integrasi scheduler sosmed — Buffer (GraphQL) untuk YT Shorts/TikTok/Threads,
// Zernio (REST) untuk FB Pages/Instagram. Kredensial di tabel settings D1
// (pola functions/_lib/aiProviders.js). Buffer GraphQL API masih public beta —
// kalau enum/response berubah, errornya tercatat per-baris di
// viralframe_scheduled_posts, bukan gagal senyap.


// Helper setting dipakai lintas modul ViralFrame.
export async function getSetting(env, key) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(env, key, value) {
  return env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
}

// Fan-out inti. Kredensial WAJIB dikirim pemanggil (`akun` hasil
// resolveScheduler) — file ini tidak boleh mengimpor agentAccounts.js, arah
// impornya satu jalur. Alasan larangan fallback kredensial ada di sana.
//
// `waktu` = peta { platform: ISO+07:00 } dari jadwalOtomatis.waktuPerPlatform().
// Tiap platform punya jamnya SENDIRI sekarang; dulu kelimanya memakai satu
// timestamp yang sama persis (lihat migrasi 0041).
export async function scheduleFanOut(env, { assetUrl, caption, akun, waktu, slotIndex = 1 }) {
  const bufferKey = akun?.bufferKey ?? null;
  const zernioKey = akun?.zernioKey ?? null;
  const channels = akun?.channels ?? {};

  // Provider tiap platform dibaca dari konfigurasi akun, TIDAK dipasangkan mati
  // di kode — lihat migrasi 0038.
  const tugas = [];
  for (const [platform, cfg] of Object.entries(channels)) {
    if (!cfg?.id) continue;
    const jam = waktu?.[platform];
    if (!jam) continue; // platform tanpa jadwal (mis. jumlah platform > tangga) dilewati
    if (cfg.provider === 'buffer') {
      tugas.push({ platform, provider: 'buffer', scheduledAt: jam,
        jalan: () => callBufferCreatePost({ apiKey: bufferKey, channelId: cfg.id, assetUrl, dueAt: jam, caption, platform }) });
    } else if (cfg.provider === 'zernio') {
      // SATU panggilan per platform, bukan satu panggilan berisi banyak platform
      // seperti dulu. Perlu supaya tiap platform bisa punya jam sendiri — dan
      // efek sampingnya bagus: status sukses/gagal FB dan Threads jadi terpisah,
      // tidak lagi atomik.
      tugas.push({ platform, provider: 'zernio', scheduledAt: jam,
        jalan: () => callZernioCreatePost({ apiKey: zernioKey, content: caption, scheduledFor: jam,
          timezone: 'Asia/Jakarta', platforms: [{ platform, accountId: cfg.id }], mediaUrl: assetUrl }) });
    }
  }

  const hasil = await Promise.all(tugas.map(t => t.jalan()));
  const rows = tugas.map((t, i) => ({ platform: t.platform, provider: t.provider, scheduledAt: t.scheduledAt, result: hasil[i] }));
  return { slotIndex, rows };
}

// Simpan hasil fan-out ke viralframe_scheduled_posts + trash video sumber
// (tabel & videoType berbeda antara Library dan Konten Agent).
export async function persistScheduleResult(env, { videoId, videoType, trashTable, slotIndex, rows, akunId = null }) {
  await Promise.all(rows.map(r => env.DB.prepare(
    `INSERT INTO viralframe_scheduled_posts (video_id, video_type, provider, platform, slot_index, scheduled_at, status, remote_post_id, error_message, akun_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    videoId, videoType, r.provider, r.platform, slotIndex, r.scheduledAt,
    r.result.ok ? 'scheduled' : 'failed',
    r.result.ok ? (r.result.remoteId ?? null) : null,
    r.result.ok ? null : (r.result.error ?? 'Gagal tanpa keterangan').slice(0, 500),
    akunId,
  ).run()));

  const anySuccess = rows.some(r => r.result.ok);
  if (anySuccess) {
    await env.DB.prepare(`UPDATE ${trashTable} SET trashed_at = datetime('now') WHERE id = ?`).bind(videoId).run().catch(err => {
      console.error('[scheduleFanOut] trash video', err.message);
    });
  }
  return anySuccess;
}

// Kategori "People & Blogs" — default aman generik untuk video promosi properti,
// YouTube mewajibkan categoryId untuk tiap post (lihat YoutubePostMetadataInput).
const YOUTUBE_DEFAULT_CATEGORY_ID = '22';

export async function callBufferCreatePost({ apiKey, channelId, assetUrl, dueAt, caption, platform }) {
  if (!apiKey) return { ok: false, error: 'Buffer API key belum diatur' };
  if (!channelId) return { ok: false, error: 'Buffer channel ID belum diatur' };

  // createPost mengembalikan union type (contoh resmi developers.buffer.com) —
  // WAJIB inline fragment ... on PostActionSuccess / ... on MutationError,
  // tidak bisa select field langsung di root createPost.
  const query = `mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id } }
      ... on MutationError { message }
    }
  }`;
  const variables = {
    input: {
      channelId,
      text: caption || '',
      assets: [{ video: { url: assetUrl } }],
      dueAt,
      schedulingType: 'automatic',
      mode: 'customScheduled',
      // YouTube wajib title + categoryId (YoutubePostMetadataInput) — platform lain tidak butuh ini.
      ...(platform === 'youtube' ? {
        metadata: { youtube: { title: (caption || 'Video Properti').slice(0, 95), categoryId: YOUTUBE_DEFAULT_CATEGORY_ID } },
      } : {}),
    },
  };

  let res;
  try {
    res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return { ok: false, error: `Gagal menghubungi Buffer: ${err.message}` };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { ok: false, error: `Buffer HTTP ${res.status}` };
  if (json.errors?.length) return { ok: false, error: json.errors.map(e => e.message).join('; ').slice(0, 300) };
  const result = json.data?.createPost;
  if (result?.message) return { ok: false, error: `Buffer: ${result.message}`.slice(0, 300) };
  const id = result?.post?.id;
  if (!id) return { ok: false, error: 'Buffer tidak mengembalikan post id' };
  return { ok: true, remoteId: String(id) };
}

// Channel ID Buffer tidak muncul di dashboard biasa — harus ditanya lewat API.
// organizationId dulu, baru channels per organisasi (pola resmi "Your First Post").
export async function listBufferChannels(apiKey) {
  if (!apiKey) return { ok: false, error: 'Buffer API key belum diatur' };
  const orgQuery = `query { account { organizations { id name } } }`;
  let res;
  try {
    res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: orgQuery }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, error: `Gagal menghubungi Buffer: ${err.message}` };
  }
  const orgJson = await res.json().catch(() => null);
  if (!res.ok || !orgJson) return { ok: false, error: `Buffer HTTP ${res.status}` };
  if (orgJson.errors?.length) return { ok: false, error: orgJson.errors.map(e => e.message).join('; ').slice(0, 300) };
  const orgs = orgJson.data?.account?.organizations ?? [];
  if (orgs.length === 0) return { ok: false, error: 'Tidak ada organisasi Buffer ditemukan' };

  const chQuery = `query GetChannels($organizationId: OrganizationId!) {
    channels(input: { organizationId: $organizationId }) { id name service }
  }`;
  const channels = [];
  for (const org of orgs) {
    let chRes;
    try {
      chRes = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: chQuery, variables: { organizationId: org.id } }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      return { ok: false, error: `Gagal menghubungi Buffer (channels): ${err.message}` };
    }
    const chJson = await chRes.json().catch(() => null);
    if (!chRes.ok || !chJson) continue;
    for (const ch of (chJson.data?.channels ?? [])) channels.push({ id: ch.id, name: ch.name, service: ch.service });
  }
  return { ok: true, channels };
}

export async function listZernioAccounts(apiKey) {
  if (!apiKey) return { ok: false, error: 'Zernio API key belum diatur' };
  let res;
  try {
    res = await fetch('https://zernio.com/api/v1/accounts', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, error: `Gagal menghubungi Zernio: ${err.message}` };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { ok: false, error: `Zernio HTTP ${res.status}` };
  const list = json.accounts ?? json.data?.accounts ?? json.data ?? [];

  // Nama field persis belum terverifikasi ke response nyata — beberapa field
  // (mis. 'name') ternyata objek bersarang {_id,name}, bukan string langsung.
  // pickString() WAJIB dipakai di sini: nilai apa pun yang bukan string primitif
  // tidak boleh sampai ke UI mentah-mentah (React #31 — objek tidak valid sbg child).
  const pickString = (...candidates) => {
    for (const c of candidates) {
      if (typeof c === 'string' && c) return c;
      if (c && typeof c === 'object') {
        if (typeof c.name === 'string' && c.name) return c.name;
        if (typeof c.id === 'string' && c.id) return c.id;
      }
    }
    return null;
  };

  const accounts = (Array.isArray(list) ? list : []).map(a => {
    const id = pickString(a.accountId, a.id, a._id, a.account_id, a.profileId);
    const name = pickString(a.name, a.username, a.displayName, a.display_name, a.pageName);
    const platform = pickString(a.platform, a.type);
    return { id, platform, name, raw: (id && name) ? undefined : a };
  });
  return { ok: true, accounts };
}

export async function zernioPresign({ apiKey, filename, contentType }) {
  if (!apiKey) return { ok: false, error: 'Zernio API key belum diatur' };

  let res;
  try {
    res = await fetch('https://zernio.com/api/v1/media/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ filename, contentType }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, error: `Gagal menghubungi Zernio (presign): ${err.message}` };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { ok: false, error: `Zernio presign HTTP ${res.status}` };
  const uploadUrl = json.uploadUrl ?? json.data?.uploadUrl;
  const publicUrl = json.publicUrl ?? json.data?.publicUrl;
  if (!uploadUrl || !publicUrl) return { ok: false, error: 'Zernio presign tidak mengembalikan uploadUrl/publicUrl' };
  return { ok: true, uploadUrl, publicUrl };
}

export async function callZernioCreatePost({ apiKey, content, scheduledFor, timezone, platforms, mediaUrl }) {
  if (!apiKey) return { ok: false, error: 'Zernio API key belum diatur' };
  if (!platforms?.length) return { ok: false, error: 'Tidak ada akun Zernio yang dikonfigurasi' };

  let res;
  try {
    res = await fetch('https://zernio.com/api/v1/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        content,
        scheduledFor,
        timezone,
        platforms,
        mediaItems: [{ url: mediaUrl, type: 'video' }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return { ok: false, error: `Gagal menghubungi Zernio: ${err.message}` };
  }

  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* body bukan JSON, pakai raw text di bawah */ }
  if (!res.ok || !json) {
    // Field pesan error Zernio belum terverifikasi persis (message/error/detail/errors[]) —
    // coba semua kandidat umum, fallback ke potongan body mentah supaya tidak pernah kosong.
    const detail = json?.message ?? json?.error ?? json?.detail ?? json?.errors?.[0]?.message ?? raw.slice(0, 300);
    return { ok: false, error: `Zernio HTTP ${res.status}: ${detail}`.trim() };
  }
  const id = json.id ?? json.data?.id ?? json.postId;
  return { ok: true, remoteId: id ? String(id) : null };
}
