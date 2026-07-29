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

// Slot 1-5 pertama yang belum dipakai hari ini (WIB); kalau penuh, slot 1 besok.
// scheduled_at WAJIB offset '+07:00' eksplisit (lihat buildSlotTimes) supaya
// substr(scheduled_at,1,10) langsung jadi tanggal WIB (DATE('now') D1 = UTC).
export async function pickNextSlot(env) {
  const todayWib = tanggalWib();
  const res = await env.DB.prepare(
    `SELECT DISTINCT slot_index FROM viralframe_scheduled_posts WHERE substr(scheduled_at,1,10) = ?`
  ).bind(todayWib).all();
  const used = new Set((res.results ?? []).map(r => r.slot_index));

  for (let slot = 1; slot <= 5; slot++) {
    if (!used.has(slot)) return { slotIndex: slot, dateWib: todayWib };
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

export async function callBufferCreatePost({ apiKey, channelId, assetUrl, dueAt, caption }) {
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
  const accounts = (json.accounts ?? []).map(a => ({ id: a.accountId, platform: a.platform, name: a.name }));
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

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { ok: false, error: `Zernio HTTP ${res.status}: ${(json?.message ?? '').slice(0, 200)}`.trim() };
  const id = json.id ?? json.data?.id ?? json.postId;
  return { ok: true, remoteId: id ? String(id) : null };
}
