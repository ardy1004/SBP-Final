// Metrik performa konten (2026-11-18) — normalisasi, penyimpanan, analisis.
//
// Tabel: viralframe_post_metrik & viralframe_video_profil (migrasi 0061).
// Sumber angka: metrikProvider.js (Buffer & Zernio). Pembaca: performa.js.
//
// PRINSIP ANALISIS (sama dengan Retention Checker — retensi.js):
//   · TIDAK ada skor AI 0–100. Hanya angka yang punya makna langsung.
//   · Bandingkan pada UMUR yang sama (snapshot D7) — views terus bertambah.
//   · Normalisasi per AKUN+PLATFORM (indeks = views ÷ median akunnya): akun
//     besar & platform ramai tidak boleh otomatis "menang".
//   · Median, bukan rata-rata — satu video viral tidak boleh menyeret kelompok.
//   · Kelompok dengan n kecil DITANDAI, bukan diberi peringkat.


// ── Normalisasi ─────────────────────────────────────────────────────────────
const angka =(v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const bulat = (v) => (angka(v) == null ? null : Math.round(Number(v)));

/**
 * Buffer `metrics[{type,value,unit}]` → bentuk kanonik. `reactions` = likes
 * (Buffer menormalkan lintas jaringan; `likes` hanya ada untuk Facebook).
 * averageTimeWatched: unit tertulis "count" tapi nilainya DETIK — diukur
 * 2026-11-18: TikTok 11–13, Instagram 5–7 untuk video ±15–30 detik.
 */
export function normalisasiBuffer(metrics) {
  const m = {};
  for (const x of metrics ?? []) if (x?.type) m[x.type] = angka(x.value);
  return {
    views: bulat(m.views),
    reach: bulat(m.reach),
    impressions: bulat(m.impressions),
    likes: bulat(m.likes ?? m.reactions),
    comments: bulat(m.comments),
    shares: bulat(m.shares ?? m.reposts),
    saves: bulat(m.saves),
    avg_tonton_detik: angka(m.averageTimeWatched),
    engagement_rate: angka(m.engagementRate),
    durasi_provider: null,
  };
}

/**
 * Zernio `analytics{…}` → bentuk kanonik. igReelsAvgWatchTime dalam
 * MILIDETIK (9459 untuk Reel ±20 detik) — dibagi 1000.
 */
export function normalisasiZernio(a) {
  const x = a ?? {};
  const avgMs = angka(x.igReelsAvgWatchTime);
  return {
    views: bulat(x.views ?? x.totalViews),
    reach: bulat(x.reach),
    impressions: bulat(x.impressions),
    likes: bulat(x.likes ?? x.totalLikes),
    comments: bulat(x.comments ?? x.totalComments),
    shares: bulat(x.shares ?? x.reposts),
    saves: bulat(x.saves),
    avg_tonton_detik: avgMs != null && avgMs > 0 ? avgMs / 1000 : null,
    engagement_rate: angka(x.engagementRate),
    durasi_provider: angka(x.videoDurationSeconds),
  };
}

/**
 * Rata-rata durasi tonton yang tidak masuk akal (> 3× durasi video) dibuang —
 * tanda satuan salah tafsir. Lebih baik kosong daripada angka keliru yang ikut
 * membentuk kesimpulan.
 */
export function validasiTonton(avgDetik, durasiDetik) {
  if (avgDetik == null || !(avgDetik > 0)) return null;
  if (durasiDetik > 0 && avgDetik > durasiDetik * 3) return null;
  return avgDetik;
}

const adaAngka = (n) => ['views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves'].some(k => (n[k] ?? 0) > 0);

// ── Pendaftaran & profil ────────────────────────────────────────────────────

/**
 * Daftarkan post terbit milik akun ini yang belum tercatat, lalu salin profil
 * video yang belum punya — SELAGI baris video & order masih ada (purge
 * menghapusnya ±30 hari kemudian). Idempoten (INSERT OR IGNORE).
 */
export async function daftarkanPost(env, akunId) {
  const a = await env.DB.prepare(
    `INSERT OR IGNORE INTO viralframe_post_metrik (provider, remote_post_id, video_id, akun_id, platform, terbit_at)
     SELECT provider, remote_post_id, video_id, akun_id, platform, scheduled_at
       FROM viralframe_scheduled_posts
      WHERE akun_id = ? AND status = 'scheduled' AND video_type = 'agent'
        AND remote_post_id IS NOT NULL AND julianday(scheduled_at) < julianday('now')`
  ).bind(akunId).run();

  // json_valid() WAJIB: json_extract pada teks rusak MELEMPAR dan menggagalkan
  // seluruh INSERT. Order terbaru per video bila ada lebih dari satu.
  const dna = (path) => `CASE WHEN json_valid(o.hasil_json) THEN json_extract(o.hasil_json, '$.konsep.dna.${path}') END`;
  // foto_pembuka = id foto (stasiunKonsep.js) → simpan LABEL RUANGAN-nya, yang
  // bisa dikelompokkan lintas listing ("Kolam renang", "Fasad depan", …).
  const b = await env.DB.prepare(
    `INSERT OR IGNORE INTO viralframe_video_profil
       (video_id, character_id, asal_character_id, property_id, kode_listing, jenis_properti, kecamatan, harga,
        durasi_detik, poster_url, order_id, variation_key, dna_sudut, dna_hook, dna_naratif, dna_foto_pembuka, dna_mood)
     SELECT v.id, v.character_id, v.asal_character_id, v.property_id, p.kode_listing, p.jenis_properti, p.kecamatan, p.harga,
            v.duration_sec, v.poster_url, o.id, o.variation_key,
            substr(${dna('sudut')}, 1, 200), substr(${dna('hook_mekanisme')}, 1, 200), substr(${dna('struktur_naratif')}, 1, 200),
            (SELECT NULLIF(TRIM(pi.label_ruangan), '') FROM property_images pi WHERE pi.id = CAST(${dna('foto_pembuka')} AS INTEGER)),
            ${dna('mood')}
       FROM viralframe_agent_videos v
       LEFT JOIN properties p ON p.id = v.property_id
       LEFT JOIN viralframe_orders o ON o.id = (SELECT MAX(o2.id) FROM viralframe_orders o2 WHERE o2.video_id = v.id)
      WHERE v.id IN (SELECT DISTINCT video_id FROM viralframe_post_metrik WHERE akun_id = ?)
        AND NOT EXISTS (SELECT 1 FROM viralframe_video_profil vp WHERE vp.video_id = v.id)`
  ).bind(akunId).run();

  return { post_baru: a.meta?.changes ?? 0, profil_baru: b.meta?.changes ?? 0 };
}

/**
 * Post yang dikenal untuk akun ini: Map "provider|remote_post_id" → {durasi}.
 * `dariJadwal` (dry-run) membaca baris jadwal langsung karena pendaftaran
 * belum ditulis.
 */
export async function petaPostDikenal(env, akunId, { dariJadwal = false } = {}) {
  const res = dariJadwal
    ? await env.DB.prepare(
        `SELECT sp.provider, sp.remote_post_id, v.duration_sec AS durasi
           FROM viralframe_scheduled_posts sp LEFT JOIN viralframe_agent_videos v ON v.id = sp.video_id
          WHERE sp.akun_id = ? AND sp.status = 'scheduled' AND sp.remote_post_id IS NOT NULL`
      ).bind(akunId).all()
    : await env.DB.prepare(
        `SELECT pm.provider, pm.remote_post_id, vp.durasi_detik AS durasi
           FROM viralframe_post_metrik pm LEFT JOIN viralframe_video_profil vp ON vp.video_id = pm.video_id
          WHERE pm.akun_id = ?`
      ).bind(akunId).all();
  const peta = new Map();
  for (const r of res.results ?? []) peta.set(`${r.provider}|${r.remote_post_id}`, { durasi: r.durasi });
  return peta;
}

/**
 * Cocokkan hasil tarikan ke post yang dikenal → daftar pembaruan siap tulis.
 * Zernio dicocokkan lewat latePostId dulu (id yang kita simpan), _id cadangan.
 */
export function cocokkan({ buffer = [], zernio = [] }, peta) {
  const hasil = [];
  let takCocok = 0;
  for (const it of buffer) {
    const kunci = `buffer|${it.remote_post_id}`;
    if (!peta.has(kunci)) { takCocok++; continue; }
    const n = normalisasiBuffer(it.metrics);
    n.avg_tonton_detik = validasiTonton(n.avg_tonton_detik, peta.get(kunci).durasi);
    hasil.push({ provider: 'buffer', remote_post_id: it.remote_post_id, n, diperbarui: it.metricsUpdatedAt, mentah: it.metrics });
  }
  for (const it of zernio) {
    const id = [it.latePostId, it._id].find(x => x && peta.has(`zernio|${x}`));
    if (!id) { takCocok++; continue; }
    const n = normalisasiZernio(it.analytics);
    n.avg_tonton_detik = validasiTonton(n.avg_tonton_detik, n.durasi_provider ?? peta.get(`zernio|${id}`).durasi);
    hasil.push({ provider: 'zernio', remote_post_id: id, n, diperbarui: it.analytics?.lastUpdated ?? null, mentah: it.analytics });
  }
  return { hasil, takCocok };
}

/**
 * Tulis metrik. Hitungan (views, likes, …) memakai MAX(lama, baru): angka
 * kumulatif, dan provider kadang sesaat mengembalikan 0 saat menyinkronkan
 * (Zernio HTTP 202) — itu tidak boleh menghapus angka yang sudah ada.
 * Snapshot D7 diisi sekali, pada pengamatan pertama sesudah umur ≥ 7 hari.
 */
export function pernyataanTulis(env, h) {
  const n = h.n;
  const mx = (kol) => `MAX(COALESCE(${kol}, 0), COALESCE(?, 0))`;
  const umurCukup = `julianday('now') - julianday(terbit_at) >= 7`;
  return env.DB.prepare(
    `UPDATE viralframe_post_metrik SET
        views = ${mx('views')}, reach = ${mx('reach')}, impressions = ${mx('impressions')},
        likes = ${mx('likes')}, comments = ${mx('comments')}, shares = ${mx('shares')}, saves = ${mx('saves')},
        avg_tonton_detik = COALESCE(?, avg_tonton_detik),
        engagement_rate = COALESCE(?, engagement_rate),
        mentah = ?, diperbarui_provider = ?, ditarik_at = datetime('now'), status_tarik = ?,
        views_d7    = CASE WHEN views_d7 IS NULL AND ${umurCukup} THEN ${mx('views')} ELSE views_d7 END,
        likes_d7    = CASE WHEN likes_d7 IS NULL AND ${umurCukup} THEN ${mx('likes')} ELSE likes_d7 END,
        comments_d7 = CASE WHEN comments_d7 IS NULL AND ${umurCukup} THEN ${mx('comments')} ELSE comments_d7 END,
        shares_d7   = CASE WHEN shares_d7 IS NULL AND ${umurCukup} THEN ${mx('shares')} ELSE shares_d7 END,
        saves_d7    = CASE WHEN saves_d7 IS NULL AND ${umurCukup} THEN ${mx('saves')} ELSE saves_d7 END,
        avg_tonton_d7 = CASE WHEN d7_umur_jam IS NULL AND ${umurCukup} THEN COALESCE(?, avg_tonton_detik) ELSE avg_tonton_d7 END,
        d7_umur_jam = CASE WHEN d7_umur_jam IS NULL AND ${umurCukup}
                           THEN CAST((julianday('now') - julianday(terbit_at)) * 24 AS INTEGER) ELSE d7_umur_jam END
      WHERE provider = ? AND remote_post_id = ?`
  ).bind(
    n.views, n.reach, n.impressions, n.likes, n.comments, n.shares, n.saves,
    n.avg_tonton_detik, n.engagement_rate,
    JSON.stringify(h.mentah ?? null).slice(0, 2000), h.diperbarui ?? null, adaAngka(n) ? 'ok' : 'sinkron',
    n.views, n.likes, n.comments, n.shares, n.saves,
    n.avg_tonton_detik,
    h.provider, h.remote_post_id,
  );
}

// ── Analisis ────────────────────────────────────────────────────────────────
//
// Metode DIREVISI 2026-11-19 — laporan analisis pertama (35 hari, 8 agent,
// 2.358 post bermetrik) membuktikan metode awal menyesatkan:
//   1. Grup akun+platform berjangkauan nyaris nol (median < 10 views, atau
//      < 5% median platform) DIKELUARKAN dari indeks. Pada median ±1, satu
//      post ber-100 views terbaca "100×" — top 10 lama dikuasai TikTok ayu
//      60–114×, padahal yang terukur cuma platform hidup/mati, bukan mutu.
//   2. Indeks DINETRALKAN PER MINGGU: views ÷ median (akun, platform, minggu
//      terbit). Jangkauan akun turun dari minggu ke minggu (Monica FB 2.071 →
//      526), jadi tanpa ini listing yang kebetulan diposting lebih awal selalu
//      tampak menang ("kost 1,31×" ternyata 1,02× setelah dinetralkan).
//   3. Indeks video = MEDIAN lintas platform, bukan rata-rata.
//   4. n dihitung per VIDEO dan per LISTING. Satu listing diposting 40× bukan
//      40 bukti ("tanah n376" ternyata 1 listing). data_kurang bila < 8 video
//      ATAU < 3 listing.
//   5. Kualitas = Σinteraksi ÷ Σviews (gabungan). Median per post → 0 karena
//      sebagian besar post tanpa interaksi sama sekali.
//   6. Dimensi "Talent" DIBUANG: indeks dinormalkan per akun dan tiap akun
//      satu wajah, jadi hasilnya ±1,00× BY CONSTRUCTION. Perbandingan antar
//      agent ada di `grid` (angka absolut, % nol, tren, retensi) — retensi
//      pada listing yang SAMA terbukti sinyal paling kokoh (Monica 55–72% vs
//      22–32% agent lain).
export const N_MIN = 8;              // video per kelompok
export const N_MIN_LISTING = 3;      // listing berbeda per kelompok
export const AMBANG_SEHAT_VIEWS = 10;
export const AMBANG_SEHAT_RASIO = 0.05;
const N_MIN_GRUP = 5;                // post matang minimal agar status grup dinilai
const N_MIN_MINGGU = 4;              // post minimal agar median mingguan dipakai
const UMUR_CAKUPAN_HARI = 2;         // post lebih muda belum tentu sudah ditarik
const CAKUPAN_RENDAH = 0.5;
const MIN_VIEWS_KUALITAS = 100;      // Σviews minimal agar rasio interaksi bermakna
const HARI_MS = 86400000;

export function median(arr) {
  const a = arr.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const t = Math.floor(a.length / 2);
  return a.length % 2 ? a[t] : (a[t - 1] + a[t]) / 2;
}

const BUCKET_DURASI = [[0, 15, '< 15 dtk'], [15, 30, '15–30 dtk'], [30, 45, '30–45 dtk'], [45, 60, '45–60 dtk'], [60, Infinity, '> 60 dtk']];
const BUCKET_HARGA = [[0, 5e8, '< 500 jt'], [5e8, 1e9, '500 jt – 1 M'], [1e9, 2e9, '1–2 M'], [2e9, 5e9, '2–5 M'], [5e9, Infinity, '> 5 M']];
const bucket = (v, daftar) => (v == null || !(v > 0) ? null : (daftar.find(([a, b]) => v >= a && v < b)?.[2] ?? null));
function bagianHari(terbitAt) {
  const jam = Number(String(terbitAt ?? '').slice(11, 13)); // ISO +07:00 → jam WIB
  if (!Number.isFinite(jam)) return null;
  if (jam < 10) return 'Pagi (< 10:00)';
  if (jam < 15) return 'Siang (10–15)';
  if (jam < 18) return 'Sore (15–18)';
  return 'Malam (≥ 18:00)';
}

/**
 * Nomor minggu (Senin–Minggu) dari TANGGAL di depan `terbit_at`. terbit_at
 * tersimpan "YYYY-MM-DDTHH:MM:SS+07:00", jadi tanggalnya sudah tanggal WIB —
 * dibaca sebagai teks, bukan lewat Date (string tanpa zona diparse sebagai
 * waktu LOKAL mesin, dan Worker = UTC).
 */
export function mingguKe(terbitAt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(terbitAt ?? ''));
  if (!m) return null;
  const hari = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / HARI_MS);
  return Math.floor((hari + 3) / 7); // 1970-01-01 = Kamis → geser ke Senin
}
export const awalMinggu = (w) => new Date((w * 7 - 3) * HARI_MS).toISOString().slice(0, 10);

const interaksi = (r) => (r.likes_d7 ?? 0) + (r.comments_d7 ?? 0) + (r.shares_d7 ?? 0) + (r.saves_d7 ?? 0);
/** Rasio GABUNGAN Σinteraksi ÷ Σviews × 1000 (null bila Σviews terlalu kecil). */
function kualitasGabungan(rs) {
  const v = rs.reduce((s, r) => s + (r.views_d7 ?? 0), 0);
  return v >= MIN_VIEWS_KUALITAS ? rs.reduce((s, r) => s + interaksi(r), 0) / v * 1000 : null;
}
const retensiPost = (r) => (r.avg_tonton_d7 > 0 && r.durasi_detik > 0 ? Math.min(1.5, r.avg_tonton_d7 / r.durasi_detik) : null);
/** Post pernah ditemukan di provider (cocok minimal sekali). */
const ditemukan = (r) => r.ditarik_at != null || r.views != null || r.views_d7 != null;

/**
 * @param {any[]} rows   baris viralframe_post_metrik ⨝ viralframe_video_profil
 * @param {Map<number,string>} namaAgent
 * @param {{ sekarangMs?: number, minPlatformTop?: number }} [opsi]
 */
export function analisisPerforma(rows, namaAgent = new Map(), opsi = {}) {
  const sekarang = opsi.sekarangMs ?? Date.now();
  const minPlatformTop = opsi.minPlatformTop ?? 2;
  const nama = (id) => (id == null ? null : namaAgent.get(id) ?? `#${id}`);
  const matang = rows.filter(r => r.views_d7 != null);
  for (const r of rows) {
    r._minggu = mingguKe(r.terbit_at);
    r._retensi = r.views_d7 != null ? retensiPost(r) : null;
    r._ix = null;
  }

  // ── Median platform (semua akun) = patokan "lemah" ──
  const platforms = [...new Set(rows.map(r => r.platform))].sort();
  const medPlatform = new Map(platforms.map(p => [p, median(matang.filter(r => r.platform === p).map(r => r.views_d7))]));

  // ── Grid akun × platform ──
  const grupMap = new Map();
  for (const r of rows) {
    const k = `${r.akun_id}|${r.platform}`;
    if (!grupMap.has(k)) grupMap.set(k, { akun_id: r.akun_id, platform: r.platform, semua: [], matang: [] });
    const g = grupMap.get(k);
    g.semua.push(r);
    if (r.views_d7 != null) g.matang.push(r);
  }
  const grid = [];
  for (const g of grupMap.values()) {
    const views = g.matang.map(r => r.views_d7);
    const med = median(views);
    const mp = medPlatform.get(g.platform);
    const lama = g.semua.filter(r => {
      const t = Date.parse(r.terbit_at);
      return Number.isFinite(t) && (sekarang - t) / HARI_MS >= UMUR_CAKUPAN_HARI;
    });
    const nDitemukan = lama.filter(ditemukan).length;
    let status;
    if (g.matang.length === 0) status = 'tanpa_data';
    else if (g.matang.length < N_MIN_GRUP) status = 'data_kurang';
    else if (med < AMBANG_SEHAT_VIEWS || (mp > 0 && med < mp * AMBANG_SEHAT_RASIO)) status = 'lemah';
    else status = 'sehat';
    const perMinggu = new Map();
    for (const r of g.matang) {
      if (r._minggu == null) continue;
      if (!perMinggu.has(r._minggu)) perMinggu.set(r._minggu, []);
      perMinggu.get(r._minggu).push(r.views_d7);
    }
    g.status = status;
    g.med = med;
    g.medMinggu = new Map([...perMinggu].filter(([, v]) => v.length >= N_MIN_MINGGU).map(([w, v]) => [w, median(v)]));
    grid.push({
      akun_id: g.akun_id,
      agent: nama(g.akun_id),
      platform: g.platform,
      n_post: g.semua.length,
      n_matang: g.matang.length,
      n_lama: lama.length,
      n_ditemukan: nDitemukan,
      cakupan_rendah: lama.length >= N_MIN_GRUP && nDitemukan / lama.length < CAKUPAN_RENDAH,
      median_views_d7: med,
      persen_nol: views.length ? views.filter(v => v === 0).length / views.length : null,
      retensi: median(g.matang.map(r => r._retensi)),
      kualitas_per_1000: kualitasGabungan(g.matang),
      tren: [...perMinggu].filter(([, v]) => v.length >= 3).sort((a, b) => a[0] - b[0]).slice(-6)
        .map(([w, v]) => ({ minggu: awalMinggu(w), median: median(v), n: v.length })),
      status,
    });
  }
  grid.sort((a, b) => String(a.agent).localeCompare(String(b.agent)) || a.platform.localeCompare(b.platform));

  // ── Indeks per post: hanya grup sehat, dinetralkan per minggu ──
  for (const g of grupMap.values()) {
    if (g.status !== 'sehat') continue;
    for (const r of g.matang) {
      const dasar = g.medMinggu.get(r._minggu) ?? g.med;
      r._ix = dasar > 0 ? r.views_d7 / dasar : null;
    }
  }

  // ── Ringkasan per platform ──
  const ringkasan = platforms.map(p => {
    const semua = rows.filter(r => r.platform === p);
    const mt = matang.filter(r => r.platform === p);
    return {
      platform: p,
      n_post: semua.length,
      n_matang: mt.length,
      median_views_d7: medPlatform.get(p),
      total_views: semua.reduce((s, r) => s + (r.views ?? 0), 0),
      kualitas_per_1000: kualitasGabungan(mt),
      retensi: median(mt.map(r => r._retensi)),
      n_akun_sehat: grid.filter(x => x.platform === p && x.status === 'sehat').length,
    };
  });

  // ── Per video (median lintas platform sehat) ──
  // Dari SEMUA baris (bukan hanya yang matang) supaya urutan kemunculan
  // listing di bawah menghitung setiap video yang memang diposting.
  const perVideo = new Map();
  for (const r of rows) {
    if (r.video_id == null) continue;
    if (!perVideo.has(r.video_id)) perVideo.set(r.video_id, { r, post: [], terbitAwal: r.terbit_at });
    const v = perVideo.get(r.video_id);
    if (v.r.kode_listing == null && r.kode_listing != null) v.r = r; // baris berprofil lebih lengkap
    if (String(r.terbit_at) < String(v.terbitAwal)) v.terbitAwal = r.terbit_at;
    if (r._ix != null) v.post.push(r);
  }
  // Urutan kemunculan listing per agent dalam periode (pengulangan berat
  // terukur: 1 listing sampai 47–60 video per agent dalam 35 hari).
  const perAgent = new Map();
  for (const v of perVideo.values()) {
    const ag = v.r.character_id ?? v.r.akun_id;
    if (!perAgent.has(ag)) perAgent.set(ag, []);
    perAgent.get(ag).push(v);
  }
  for (const vs of perAgent.values()) {
    vs.sort((a, b) => String(a.terbitAwal).localeCompare(String(b.terbitAwal)));
    const hit = new Map();
    for (const v of vs) {
      if (v.r.property_id == null) continue;
      const n = (hit.get(v.r.property_id) ?? 0) + 1;
      hit.set(v.r.property_id, n);
      v.urutan = n;
    }
  }
  const video = [...perVideo.values()]
    .filter(v => v.post.length > 0)
    .map(v => ({ ...v, ix: median(v.post.map(p => p._ix)), nPlatform: new Set(v.post.map(p => p.platform)).size }));

  const kualitasPost = (r) => (r.views_d7 > 0 ? interaksi(r) / r.views_d7 * 1000 : null);
  const top = video
    .filter(v => v.nPlatform >= minPlatformTop)
    .sort((a, b) => b.ix - a.ix)
    .slice(0, 20)
    .map(({ r, post, ix }) => ({
      video_id: r.video_id,
      indeks: ix,
      total_views_d7: post.reduce((s, x) => s + x.views_d7, 0),
      agent: nama(r.character_id ?? r.akun_id),
      talent: nama(r.asal_character_id ?? r.character_id ?? r.akun_id),
      kode_listing: r.kode_listing ?? null, jenis_properti: r.jenis_properti ?? null, kecamatan: r.kecamatan ?? null, harga: r.harga ?? null,
      durasi_detik: r.durasi_detik ?? null, poster_url: r.poster_url ?? null,
      terbit_at: r.terbit_at,
      platform: post.map(x => ({ platform: x.platform, views_d7: x.views_d7, indeks: x._ix, kualitas: kualitasPost(x), retensi: x._retensi })),
    }));

  // ── Pola per dimensi (unit = VIDEO) ──
  // Dimensi Creative DNA (hook, sudut, struktur naratif, foto pembuka, mood)
  // DIBUANG 2026-11-21 bersama meja kerja Viral Frame — satu-satunya penghasil
  // DNA. Kolom dna_* di viralframe_video_profil dibiarkan (data lama, tak dibaca).
  const DIMENSI = [
    ['Jenis properti', v => v.r.jenis_properti],
    ['Rentang harga', v => bucket(v.r.harga, BUCKET_HARGA)],
    ['Kecamatan', v => v.r.kecamatan],
    ['Durasi video', v => bucket(v.r.durasi_detik, BUCKET_DURASI)],
    ['Jam tayang', v => bagianHari(v.terbitAwal)],
    ['Pengulangan listing (per agent)', v => (v.urutan == null ? null : v.urutan === 1 ? 'Kemunculan ke-1' : v.urutan <= 3 ? 'Ke-2–3' : v.urutan <= 10 ? 'Ke-4–10' : 'Ke-11 dst.')],
    ['Asal video', v => (v.r.asal_character_id ? 'Pindahan agent lain' : 'Asli agent ini')],
  ];
  const pola = DIMENSI.map(([label, ambil]) => {
    const grup = new Map();
    for (const v of video) {
      const nilai = ambil(v);
      if (nilai == null || nilai === '') continue;
      if (!grup.has(nilai)) grup.set(nilai, []);
      grup.get(nilai).push(v);
    }
    const kelompok = [...grup].map(([nilai, vs]) => {
      const post = vs.flatMap(v => v.post);
      const nListing = new Set(vs.map(v => v.r.property_id ?? `v${v.r.video_id}`)).size;
      return {
        nilai,
        n: vs.length,
        n_listing: nListing,
        n_agent: new Set(vs.map(v => v.r.character_id ?? v.r.akun_id)).size,
        median_indeks: median(vs.map(v => v.ix)),
        menang: vs.filter(v => v.ix > 1).length / vs.length,
        kualitas_per_1000: kualitasGabungan(post),
        retensi: median(post.map(p => p._retensi)),
        data_kurang: vs.length < N_MIN || nListing < N_MIN_LISTING,
      };
    });
    // Kelompok cukup data diurutkan dulu; yang data_kurang di bawah.
    kelompok.sort((a, b) => (a.data_kurang - b.data_kurang) || (b.median_indeks - a.median_indeks));
    return { dimensi: label, n_terisi: kelompok.reduce((s, k) => s + k.n, 0), kelompok: label === 'Kecamatan' ? kelompok.slice(0, 12) : kelompok };
  });

  const akunLemah = grid
    .filter(x => x.status === 'lemah')
    .map(x => ({ akun_id: x.akun_id, agent: x.agent, platform: x.platform, n: x.n_matang, median_views_d7: x.median_views_d7, median_platform: medPlatform.get(x.platform) }))
    .sort((a, b) => a.median_views_d7 - b.median_views_d7);

  return {
    n_post: rows.length,
    n_matang: matang.length,
    n_video_berindeks: video.length,
    n_listing_berindeks: new Set(video.map(v => v.r.property_id ?? `v${v.r.video_id}`)).size,
    metode: {
      ambang_sehat_views: AMBANG_SEHAT_VIEWS, ambang_sehat_rasio: AMBANG_SEHAT_RASIO,
      n_min_video: N_MIN, n_min_listing: N_MIN_LISTING, n_min_minggu: N_MIN_MINGGU, top_min_platform: minPlatformTop,
    },
    ringkasan,
    grid,
    akun_lemah: akunLemah,
    tak_ditemukan: grid.filter(x => x.cakupan_rendah).map(x => ({ akun_id: x.akun_id, agent: x.agent, platform: x.platform, n_lama: x.n_lama, n_ditemukan: x.n_ditemukan })),
    top,
    pola,
  };
}
