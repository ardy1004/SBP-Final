// Integrasi scheduler sosmed — dua provider: Buffer (GraphQL) dan Zernio (REST).
//
// ⚠️ TIDAK ADA pemetaan tetap platform→provider. Provider ditentukan PER PLATFORM
// PER AKUN lewat `channels_json` tiap agent, dibaca `parseChannels()` di
// functions/_lib/agentAccounts.js. Header file ini dulu berbunyi "Buffer untuk
// YT/TikTok/Threads, Zernio untuk FB/Instagram" seolah itu aturan universal —
// padahal itu cuma pemetaan milik Monica. Tujuh agent lain justru KEBALIKANNYA
// (Instagram di Buffer, Threads di Zernio). Asumsi salah itulah yang membuat
// cabang metadata Instagram di callBufferCreatePost() tidak pernah terpikirkan
// sampai jalurnya gagal 14 dari 14 (audit 2026-08-29). Jangan tulis ulang
// pemetaan satu akun sebagai kalimat umum di sini.
//
// Kredensial per agent (bukan tabel settings global sejak migrasi 0037/0038).
// Buffer GraphQL API masih public beta — kalau enum/response berubah, errornya
// tercatat per-baris di viralframe_scheduled_posts DAN di error_logs
// (lihat catatKegagalanPlatform di jadwalOtomatis.js).

import { logServerError } from './logError.js';


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

// ⚠️ `viralframe_scheduled_posts.status` cuma punya 'scheduled'/'failed' — TIDAK
// ADA status "sudah benar-benar tayang" (Buffer/Zernio tidak mengirim webhook
// balik), jadi baris 'scheduled' TIDAK PERNAH berubah lagi walau videonya sudah
// tayang berminggu-minggu lalu. `scheduled_at` (kapan SEHARUSNYA tayang) dipakai
// sebagai proksi: lewat dari itu, anggap sudah tayang & aman disentuh lagi.
// Bukan solusi sempurna (butuh webhook postback untuk itu), tapi cukup menutup
// dua risiko nyata (audit 2026-08-15): (a) menjadwalkan ulang video yang masih
// ditunggu tayang = posting dua kali, (b) menghapus/purge video yang masih
// ditunggu Buffer/Zernio = link media di post terjadwal jadi mati.
export async function adaJadwalTertunda(env, videoId) {
  try {
    // ⚠️ WAJIB julianday(), BUKAN `scheduled_at > datetime('now')` mentah.
    // scheduled_at berformat ISO "...T06:03:00+07:00" (pemisah 'T', ada offset),
    // datetime('now') berformat "...  14:01:18" (pemisah spasi, UTC tanpa offset).
    // Dites langsung ke D1 produksi: perbandingan TEKS salah — begitu tanggal UTC
    // di kedua sisi sama, karakter 'T' (0x54) > spasi (0x20) MENDOMINASI hasil
    // SEBELUM jamnya sendiri sempat dibandingkan, jadi jam yang sudah lewat
    // berjam-jam tetap terbaca "masih tertunda" sampai tengah malam UTC berganti
    // tanggal. julianday() mem-parse offset dengan benar, hasilnya akurat.
    const row = await env.DB.prepare(
      `SELECT 1 FROM viralframe_scheduled_posts
       WHERE video_id = ? AND status = 'scheduled' AND julianday(scheduled_at) > julianday('now') LIMIT 1`
    ).bind(videoId).first();
    return !!row;
  } catch {
    return false; // tabel/kolom belum ada -> anggap aman, jangan macetkan hapus/jadwalkan
  }
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
        jalan: () => callZernioCreatePost({ env, apiKey: zernioKey, content: caption, scheduledFor: jam,
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
  // ⚠️ Gagal MENCATAT tidak boleh membatalkan penjadwalan yang sudah benar-benar
  // terkirim ke provider. Tanpa try/catch ini, satu INSERT yang ditolak D1
  // melempar sampai ke onRequestPost dan MEMATIKAN SELURUH putaran cron — agent
  // yang antre di belakang tidak pernah diproses, dan tidak ada jejak apa pun
  // karena baris jadwalnya justru yang gagal ditulis (audit 2026-08-29).
  try {
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
  } catch (err) {
    // Post-nya SUDAH terkirim ke Buffer/Zernio dan tetap akan tayang; yang hilang
    // cuma catatannya. Itu berarti pengaman anti-dobel (adaJadwalTertunda) dan
    // penghitung kuota jadi buta untuk video ini — layak dicatat keras.
    console.error('[persistScheduleResult] insert gagal', err.message);
    await logServerError(env, {
      source: 'server',
      message: `[scheduler] gagal mencatat hasil penjadwalan video ${videoId} — post sudah terkirim ke provider tapi tidak tercatat di D1: ${err.message}`,
      stack: err.stack,
      url: '/api/internal/viralframe/auto-schedule',
      context: { video_id: videoId, video_type: videoType, akun_id: akunId, slot_index: slotIndex, jumlah_baris: rows.length },
    });
  }

  const anySuccess = rows.some(r => r.result.ok);
  // trashTable null = pemanggil sengaja tidak mau memindahkan video ke Sampah.
  // Dipakai jalur ulangi-platform-gagal: videonya SUDAH di Sampah, dan menulis
  // ulang trashed_at justru MENGATUR ULANG jam purge 30 harinya.
  if (anySuccess && trashTable) {
    await env.DB.prepare(`UPDATE ${trashTable} SET trashed_at = datetime('now') WHERE id = ?`).bind(videoId).run().catch(err => {
      console.error('[scheduleFanOut] trash video', err.message);
    });
  }
  return anySuccess;
}

// Kategori "People & Blogs" — default aman generik untuk video promosi properti,
// YouTube mewajibkan categoryId untuk tiap post (lihat YoutubePostMetadataInput).
const YOUTUBE_DEFAULT_CATEGORY_ID = '22';

// Video ViralFrame selalu vertikal 9:16 dan ≤60 detik, jadi 'reel'. Pilihan lain
// tidak cocok: 'post' membuat Instagram memotong ke persegi, 'story' hilang
// setelah 24 jam. Enum lengkap PostType (introspeksi skema Buffer 2026-08-29):
// carousel|event|ghost_post|offer|post|reel|short|story|thread|whats_new.
const INSTAGRAM_POST_TYPE = 'reel';

// ⚠️ WAJIB, bukan opsional — `InstagramPostMetadataInput.shouldShareToFeed` bertipe
// `Boolean!`. Introspeksi biasa TIDAK menampakkannya (pembungkus NON_NULL mudah
// terlewat kalau hanya membaca `type.name`); ketahuan saat menguji koersi
// variabel: "Field shouldShareToFeed of required type Boolean! was not provided".
// true = Reel ikut tampil di grid profil, bukan cuma di tab Reels — yang
// diinginkan untuk akun pemasaran properti.
const INSTAGRAM_SHARE_TO_FEED = true;

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
  // Metadata WAJIB untuk sebagian platform; Buffer MENOLAK post tanpa itu, dan
  // penolakannya cuma terlihat di `error_message` baris jadwal — tidak ada gate
  // yang bisa menangkapnya. Bentuk keduanya diverifikasi lewat introspeksi skema
  // Buffer (2026-08-29), bukan tebakan.
  //
  // ⚠️ Cabang Instagram SEMPAT TIDAK ADA berbulan-bulan tanpa ketahuan: Instagram
  // milik Monica — satu-satunya agent yang aktif saat itu — ada di ZERNIO, jadi
  // jalur Buffer→Instagram tidak pernah dijalankan sekali pun. Begitu 7 agent
  // lain menyala (2026-08-27), ketujuhnya gagal 14/14 dengan pesan
  // "Instagram posts require a type (post, story, or reel)". Pelajarannya:
  // provider berbeda per platform per akun berarti sebuah jalur bisa mati total
  // sementara semua metrik terlihat hijau.
  const metadata =
    platform === 'youtube'
      ? { youtube: { title: (caption || 'Video Properti').slice(0, 95), categoryId: YOUTUBE_DEFAULT_CATEGORY_ID } }
      : platform === 'instagram'
        ? { instagram: { type: INSTAGRAM_POST_TYPE, shouldShareToFeed: INSTAGRAM_SHARE_TO_FEED } }
        : null;
  // Catatan untuk nanti: `FacebookPostMetadataInput.type` juga WAJIB. Belum
  // dibuatkan cabang karena Facebook SEMUA agent lewat Zernio, jadi jalur
  // Buffer→Facebook tidak pernah dipakai. Kalau suatu saat ada agent yang
  // memindahkan Facebook ke Buffer, ia akan gagal persis seperti Instagram dulu.

  const variables = {
    input: {
      channelId,
      text: caption || '',
      assets: [{ video: { url: assetUrl } }],
      dueAt,
      schedulingType: 'automatic',
      mode: 'customScheduled',
      ...(metadata ? { metadata } : {}),
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
    // Dulu mengirim objek MENTAH dari Zernio (`a`) ke browser saat id/name tidak
    // terbaca — cukup untuk debug pola field, tapi ikut membawa apa pun yang
    // ada di dalamnya tanpa disaring. Nama field saja sudah cukup untuk
    // menyesuaikan pickString() di atas, tanpa membawa nilainya ke browser
    // (audit 2026-08-15).
    return { id, platform, name, raw: (id && name) ? undefined : Object.keys(a ?? {}) };
  });
  return { ok: true, accounts };
}

// zernioPresign() DIHAPUS 2026-08-22 — nol pemanggil sejak Content Library
// dibongkar. Namanya sempat menyiratkan Zernio bisa dititipi SALINAN file;
// kenyataannya jalur itu tidak pernah dipakai. Zernio (dan Buffer) hanya
// menerima URL dan mengunduhnya sendiri saat waktu tayang — itulah sebabnya
// menghapus aset sebelum post terbit mematikan link medianya.

// `env` cuma dipakai untuk logServerError saat id tidak terbaca — opsional supaya
// fungsi ini tetap bisa diuji terpisah tanpa binding D1.
export async function callZernioCreatePost({ env, apiKey, content, scheduledFor, timezone, platforms, mediaUrl }) {
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
  // ⚠️ Bentuk respons Zernio: { message, post: { _id, ... } } — id-nya `_id` di
  // DALAM `post`, bukan di root. Jalur lama (json.id / json.data.id / json.postId)
  // tidak pernah cocok sekali pun: 316 dari 316 baris Zernio di produksi punya
  // remote_post_id NULL, sementara Buffer 473/473 terisi (audit 2026-08-29).
  // Akibatnya endpoint /posts/{id}/retry, /unpublish dan /edit mustahil dipakai.
  const id = json.post?._id ?? json.post?.id ?? json.id ?? json.data?.id ?? json.postId;

  // ⚠️ SENGAJA tetap ok:true walau id tidak terbaca — BEDA dengan cabang Buffer
  // di atas, dan bedanya penting. Di sini res.ok sudah true, artinya Zernio
  // kemungkinan besar SUDAH membuat post-nya. Menandainya gagal akan membuat
  // jalur ulangi-platform-gagal mengirimnya lagi -> post dobel di akun sosmed
  // nyata, dan post yang sudah tayang tidak bisa ditarik. Lebih baik kehilangan
  // id-nya (cuma melemahkan verifikasi) daripada memposting dua kali.
  // Jangan "dirapikan" jadi seragam dengan Buffer.
  if (!id) {
    await logServerError(env, {
      source: 'server',
      message: '[scheduler] Zernio membalas 2xx tanpa post id yang bisa dibaca — post kemungkinan tetap dibuat, tapi tidak bisa diverifikasi',
      url: 'https://zernio.com/api/v1/posts',
      context: { field_tersedia: Object.keys(json ?? {}), field_post: Object.keys(json?.post ?? {}) },
    });
  }
  return { ok: true, remoteId: id ? String(id) : null };
}
