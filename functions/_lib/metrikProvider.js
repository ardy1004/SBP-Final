// Penarik metrik post dari Buffer (GraphQL) & Zernio (REST) — 2026-11-18.
//
// MASSAL per akun, bukan per post: satu halaman = puluhan post sekaligus.
// Bentuk kedua API diverifikasi lewat probe & introspeksi ke akun produksi
// (baca-saja) sebelum ditulis:
//   Buffer  posts(first, after, input:{organizationId, filter:{channelIds,
//           status:[sent], dueAt:{start,end}}}) → node.metrics{type value unit}.
//           Instagram Reels, TikTok, YouTube & Threads SEMUANYA mengembalikan
//           metrik — klaim dokumentasi "Reels tidak ada analitik" terbantah.
//   Zernio  GET /v1/analytics?source=late&view=summary&fromDate&toDate&limit&page
//           → posts[]{_id, latePostId, platform, publishedAt, analytics{…}},
//           pagination{pages}. `latePostId` = id yang kita simpan saat membuat
//           post (terverifikasi 4/4); `_id` adalah id dokumen analitik.
//
// Tidak menulis apa pun — hanya membaca. Kredensial dikirim pemanggil (hasil
// resolveScheduler), arah impornya sama dengan schedulerProviders.js.

const BATAS_HALAMAN = 12;      // ±600 post per akun per provider — 35 hari jauh di bawahnya
const UKURAN_HALAMAN = 50;

async function gqlBuffer(apiKey, query, variables, timeoutMs) {
  const res = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    const e = new Error(`Buffer HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  if (json.errors?.length) throw new Error(`Buffer GraphQL: ${json.errors.map(x => x.message).join('; ').slice(0, 200)}`);
  return json.data;
}

/**
 * @param {{ apiKey: string, channelIds: string[], sejakIso: string, timeoutMs: number, bolehLanjut: () => boolean }} p
 * @returns {Promise<{ items: {remote_post_id:string, channelId:string, dueAt:string, metrics:any[], metricsUpdatedAt:string|null}[], galat: string[], panggilan: number, terpotong: boolean, channelBasi: string[] }>}
 *   channelBasi = id di channelIds yang TIDAK terlihat oleh key ini di organisasi mana pun.
 */
export async function tarikBuffer({ apiKey, channelIds, sejakIso, timeoutMs, bolehLanjut }) {
  const items = [];
  const galat = [];
  const channelBasi = [];
  let panggilan = 0;
  let terpotong = false;
  if (!apiKey || channelIds.length === 0) return { items, galat, panggilan, terpotong, channelBasi };

  let orgs;
  try {
    panggilan++;
    const d = await gqlBuffer(apiKey, 'query { account { organizations { id } } }', {}, timeoutMs);
    orgs = (d?.account?.organizations ?? []).map(o => o.id);
  } catch (err) {
    return { items, galat: [`organisasi: ${err.message}`], panggilan, terpotong, channelBasi };
  }

  // Saring channelIds per organisasi ke channel yang BENAR-BENAR terlihat key.
  // WAJIB: Buffer menolak SELURUH query posts ("Actor can not access the
  // specified channels") bila SATU saja id di filter tidak bisa diakses — mis.
  // channel yang disambung ulang (Buffer memberi ID baru) sementara
  // channels_json masih menyimpan ID lama. Tanpa penyaring ini satu channel
  // basi mematikan metrik SEMUA platform Buffer agent itu: 2026-11-18 angle,
  // Andi & vina kehilangan Instagram + YouTube karena TikTok-nya saja yang basi.
  const perOrg = [];
  const terlihat = new Set();
  let daftarLengkap = true;
  for (const org of orgs) {
    if (!bolehLanjut()) { terpotong = true; daftarLengkap = false; break; }
    try {
      panggilan++;
      const d = await gqlBuffer(apiKey, 'query C($o: OrganizationId!) { channels(input: { organizationId: $o }) { id } }', { o: org }, timeoutMs);
      const ada = new Set((d?.channels ?? []).map(c => String(c.id)));
      const milik = channelIds.map(String).filter(id => ada.has(id));
      for (const id of milik) terlihat.add(id);
      if (milik.length > 0) perOrg.push([org, milik]);
    } catch (err) {
      daftarLengkap = false;
      galat.push(`daftar channel: ${err.message}`);
      if (err.status === 429) { terpotong = true; break; }
    }
  }
  // "Basi" hanya disimpulkan bila SEMUA organisasi berhasil didaftar — kalau
  // satu gagal, channel yang tak terlihat bisa saja justru ada di sana.
  if (daftarLengkap) for (const id of channelIds.map(String)) if (!terlihat.has(id)) channelBasi.push(id);

  const query = `query P($input: PostsInput!, $after: String) {
    posts(first: ${UKURAN_HALAMAN}, after: $after, input: $input) {
      edges { node { id channelId dueAt metrics { type value unit } metricsUpdatedAt } }
      pageInfo { endCursor hasNextPage }
    }
  }`;
  // Channel milik akun lain di organisasi yang sama tidak ikut — filter
  // channelIds. Satu agent biasanya satu organisasi.
  for (const [org, milik] of perOrg) {
    let after = null;
    for (let hal = 0; hal < BATAS_HALAMAN; hal++) {
      if (!bolehLanjut()) { terpotong = true; break; }
      try {
        panggilan++;
        const d = await gqlBuffer(apiKey, query, {
          after,
          input: { organizationId: org, filter: { channelIds: milik, status: ['sent'], dueAt: { start: sejakIso, end: new Date().toISOString() } } },
        }, timeoutMs);
        for (const e of d?.posts?.edges ?? []) {
          const n = e.node;
          if (n?.id) items.push({ remote_post_id: String(n.id), channelId: n.channelId, dueAt: n.dueAt, metrics: n.metrics ?? [], metricsUpdatedAt: n.metricsUpdatedAt ?? null });
        }
        if (!d?.posts?.pageInfo?.hasNextPage) break;
        after = d.posts.pageInfo.endCursor;
      } catch (err) {
        galat.push(`posts: ${err.message}`);
        if (err.status === 429) terpotong = true;
        break;
      }
    }
  }
  return { items, galat, panggilan, terpotong, channelBasi };
}

/**
 * @param {{ apiKey: string, dari: string, sampai: string, timeoutMs: number, bolehLanjut: () => boolean }} p  dari/sampai = YYYY-MM-DD
 */
export async function tarikZernio({ apiKey, dari, sampai, timeoutMs, bolehLanjut }) {
  const items = [];
  const galat = [];
  let panggilan = 0;
  let terpotong = false;
  if (!apiKey) return { items, galat, panggilan, terpotong };

  let pages = 1;
  for (let page = 1; page <= Math.min(pages, BATAS_HALAMAN); page++) {
    if (!bolehLanjut()) { terpotong = true; break; }
    const url = `https://zernio.com/api/v1/analytics?source=late&view=summary&fromDate=${dari}&toDate=${sampai}&limit=${UKURAN_HALAMAN}&page=${page}`;
    let res;
    try {
      panggilan++;
      res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      galat.push(`halaman ${page}: ${err.message}`);
      break;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      // 402 = paket lama tanpa add-on Analytics; 429 = batas laju (retryAfter
      // di details). Keduanya: hentikan akun ini untuk tick sekarang.
      const kode = json?.code ?? json?.error ?? '';
      galat.push(`HTTP ${res.status}${kode ? ` ${String(kode).slice(0, 80)}` : ''}${json?.details?.retryAfterSeconds ? ` (coba lagi ${json.details.retryAfterSeconds} dtk)` : ''}`);
      if (res.status === 429) terpotong = true;
      break;
    }
    for (const p of json.posts ?? []) {
      items.push({
        latePostId: p.latePostId ? String(p.latePostId) : null,
        _id: p._id ? String(p._id) : null,
        platform: p.platform ?? null,
        publishedAt: p.publishedAt ?? null,
        analytics: p.analytics ?? null,
      });
    }
    pages = Number(json.pagination?.pages) || 1;
  }
  if (pages > BATAS_HALAMAN) terpotong = true;
  return { items, galat, panggilan, terpotong };
}
