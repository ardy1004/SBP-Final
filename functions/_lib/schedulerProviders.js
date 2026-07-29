// Integrasi scheduler sosmed — Buffer (GraphQL) untuk YT Shorts/TikTok/Threads,
// Zernio (REST) untuk FB Pages/Instagram. Kredensial di tabel settings D1
// (pola functions/_lib/aiProviders.js). Buffer GraphQL API masih public beta —
// kalau enum/response berubah, errornya tercatat per-baris di
// viralframe_scheduled_posts, bukan gagal senyap.

import { tanggalWib } from './waktu.js';

// Fallback kalau setting 'viralframe_schedule_preset' kosong/rusak. FB/IG/Threads
// condong pagi-siang, TikTok/YouTube Shorts condong siang-malam (riset primetime 2026).
export const DEFAULT_SCHEDULE_PRESET = [
  { slot: 1, fb_ig_threads: '09:00', tiktok: '12:30', youtube: '12:30' },
  { slot: 2, fb_ig_threads: '11:00', tiktok: '18:00', youtube: '17:30' },
  { slot: 3, fb_ig_threads: '13:00', tiktok: '19:30', youtube: '19:00' },
  { slot: 4, fb_ig_threads: '19:00', tiktok: '20:30', youtube: '20:00' },
  { slot: 5, fb_ig_threads: '20:00', tiktok: '21:00', youtube: '13:30' },
];

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

export async function getSchedulePreset(env) {
  const raw = await getSetting(env, 'viralframe_schedule_preset');
  if (!raw) return DEFAULT_SCHEDULE_PRESET;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 5) return parsed;
  } catch { /* fallback ke default di bawah */ }
  return DEFAULT_SCHEDULE_PRESET;
}

// Slot 1-5 pertama hari ini yang belum dipakai DAN semua jamnya masih di masa
// depan (Buffer/Zernio menolak dueAt/scheduledFor yang sudah lewat — kalau
// sekarang sudah lewat jam 09:00 WIB, slot 1 dilewati meski belum dipakai).
// Kalau tidak ada slot hari ini yang lolos, pakai slot 1 besok (pasti future).
// scheduled_at WAJIB offset '+07:00' eksplisit (lihat buildSlotTimes) supaya
// substr(scheduled_at,1,10) langsung jadi tanggal WIB (DATE('now') D1 = UTC).
const MIN_LEAD_MS = 5 * 60 * 1000; // minimal 5 menit ke depan, hindari mepet detik terakhir

export async function pickNextSlot(env, preset) {
  const todayWib = tanggalWib();
  const res = await env.DB.prepare(
    `SELECT DISTINCT slot_index FROM viralframe_scheduled_posts WHERE substr(scheduled_at,1,10) = ?`
  ).bind(todayWib).all();
  const used = new Set((res.results ?? []).map(r => r.slot_index));
  const now = Date.now();

  for (let slot = 1; slot <= 5; slot++) {
    if (used.has(slot)) continue;
    const row = preset.find(p => p.slot === slot);
    if (!row) continue;
    const times = buildSlotTimes(todayWib, row);
    const allFuture = [times.fbIgThreads, times.tiktok, times.youtube]
      .every(t => new Date(t).getTime() > now + MIN_LEAD_MS);
    if (allFuture) return { slotIndex: slot, dateWib: todayWib };
  }
  return { slotIndex: 1, dateWib: tanggalWib(new Date(), 1) };
}

// Gabungkan tanggal WIB + jam preset jadi datetime ISO ber-offset +07:00.
export function buildSlotTimes(dateWib, presetRow) {
  const withOffset = (hhmm) => `${dateWib}T${hhmm}:00+07:00`;
  return {
    fbIgThreads: withOffset(presetRow.fb_ig_threads),
    tiktok: withOffset(presetRow.tiktok),
    youtube: withOffset(presetRow.youtube),
  };
}

// Fan-out inti dipakai oleh Content Library (viralframe_videos) DAN Konten
// Agent (viralframe_agent_videos) — satu-satunya beda antar keduanya adalah
// dari mana assetUrl datang (browser upload ke Zernio vs cloudinary_url yang
// sudah publik). Slot harian dihitung LINTAS kedua sumber (tabel yang sama),
// jadi "5 slot/hari" berlaku total, bukan per modul.
export async function scheduleFanOut(env, { assetUrl, caption }) {
  const [bufferKey, zernioKey, ytChannel, tiktokChannel, threadsChannel, fbAccount, igAccount] = await Promise.all([
    getSetting(env, 'buffer_api_key'),
    getSetting(env, 'zernio_api_key'),
    getSetting(env, 'buffer_channel_id_youtube'),
    getSetting(env, 'buffer_channel_id_tiktok'),
    getSetting(env, 'buffer_channel_id_threads'),
    getSetting(env, 'zernio_account_id_facebook'),
    getSetting(env, 'zernio_account_id_instagram'),
  ]);

  const preset = await getSchedulePreset(env);
  const { slotIndex, dateWib } = await pickNextSlot(env, preset);
  const presetRow = preset.find(p => p.slot === slotIndex) ?? preset[0];
  const times = buildSlotTimes(dateWib, presetRow);

  const zernioPlatforms = [];
  if (fbAccount) zernioPlatforms.push({ platform: 'facebook', accountId: fbAccount });
  if (igAccount) zernioPlatforms.push({ platform: 'instagram', accountId: igAccount });

  const zernioJob = zernioPlatforms.length > 0
    ? () => callZernioCreatePost({
        apiKey: zernioKey, content: caption, scheduledFor: times.fbIgThreads,
        timezone: 'Asia/Jakarta', platforms: zernioPlatforms, mediaUrl: assetUrl,
      })
    : () => Promise.resolve({ ok: false, error: 'Akun Facebook/Instagram belum dikonfigurasi' });

  const [ytRes, tiktokRes, threadsRes, zernioRes] = await Promise.all([
    callBufferCreatePost({ apiKey: bufferKey, channelId: ytChannel, assetUrl, dueAt: times.youtube, caption, platform: 'youtube' }),
    callBufferCreatePost({ apiKey: bufferKey, channelId: tiktokChannel, assetUrl, dueAt: times.tiktok, caption, platform: 'tiktok' }),
    callBufferCreatePost({ apiKey: bufferKey, channelId: threadsChannel, assetUrl, dueAt: times.fbIgThreads, caption, platform: 'threads' }),
    zernioJob(),
  ]);

  const rows = [
    { platform: 'youtube', provider: 'buffer', scheduledAt: times.youtube, result: ytRes },
    { platform: 'tiktok', provider: 'buffer', scheduledAt: times.tiktok, result: tiktokRes },
    { platform: 'threads', provider: 'buffer', scheduledAt: times.fbIgThreads, result: threadsRes },
    // Satu panggilan Zernio menjadwalkan FB+IG sekaligus (jam sama) — sukses/gagalnya
    // atomik untuk keduanya, respons Zernio tidak memisahkan status per-platform.
    ...(zernioPlatforms.some(p => p.platform === 'facebook')
      ? [{ platform: 'facebook', provider: 'zernio', scheduledAt: times.fbIgThreads, result: zernioRes }] : []),
    ...(zernioPlatforms.some(p => p.platform === 'instagram')
      ? [{ platform: 'instagram', provider: 'zernio', scheduledAt: times.fbIgThreads, result: zernioRes }] : []),
  ];

  return { slotIndex, rows };
}

// Simpan hasil fan-out ke viralframe_scheduled_posts + trash video sumber
// (tabel & videoType berbeda antara Library dan Konten Agent).
export async function persistScheduleResult(env, { videoId, videoType, trashTable, slotIndex, rows }) {
  await Promise.all(rows.map(r => env.DB.prepare(
    `INSERT INTO viralframe_scheduled_posts (video_id, video_type, provider, platform, slot_index, scheduled_at, status, remote_post_id, error_message)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(
    videoId, videoType, r.provider, r.platform, slotIndex, r.scheduledAt,
    r.result.ok ? 'scheduled' : 'failed',
    r.result.ok ? (r.result.remoteId ?? null) : null,
    r.result.ok ? null : (r.result.error ?? 'Gagal tanpa keterangan').slice(0, 500),
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
