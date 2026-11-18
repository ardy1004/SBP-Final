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

import { SUDUT, HOOK_MEKANISME, STRUKTUR_NARATIF, MOOD } from './viralframe.js';

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
export const N_MIN = 8;

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
 * Creative DNA sudut/hook/naratif adalah TEKS BEBAS tulisan AI (stasiunKonsep
 * tidak memvalidasinya ke katalog) — dikelompokkan mentah, tiap video jadi
 * kelompoknya sendiri dan tidak ada pola yang terbaca. Dipetakan ke label
 * katalog yang muncul di teksnya (prompt memang menyodorkan label katalog).
 */
export function labelKatalog(teks, katalog) {
  if (teks == null || String(teks).trim() === '') return null;
  const t = String(teks).toLowerCase();
  const hit = katalog.find(k => t.includes(String(k.label ?? '').toLowerCase())
    || t.includes(String(k.id ?? '').toLowerCase())
    || t.includes(String(k.id ?? '').toLowerCase().replace(/_/g, ' ')));
  return hit ? (hit.label ?? hit.id) : 'Lainnya (di luar katalog)';
}

/**
 * @param {any[]} rows   baris viralframe_post_metrik ⨝ viralframe_video_profil
 * @param {Map<number,string>} namaAgent
 */
export function analisisPerforma(rows, namaAgent = new Map()) {
  const nama = (id) => (id == null ? null : namaAgent.get(id) ?? `#${id}`);
  const matang = rows.filter(r => r.views_d7 != null);

  // Median per akun+platform → indeks tiap post.
  const grupAkun = new Map();
  for (const r of matang) {
    const k = `${r.akun_id}|${r.platform}`;
    if (!grupAkun.has(k)) grupAkun.set(k, []);
    grupAkun.get(k).push(r.views_d7);
  }
  const medAkun = new Map([...grupAkun].map(([k, v]) => [k, median(v)]));
  const kualitas = (r) => (r.views_d7 > 0 ? ((r.likes_d7 ?? 0) + (r.comments_d7 ?? 0) + (r.shares_d7 ?? 0) + (r.saves_d7 ?? 0)) / r.views_d7 * 1000 : null);
  const retensi = (r) => (r.avg_tonton_d7 > 0 && r.durasi_detik > 0 ? Math.min(1.5, r.avg_tonton_d7 / r.durasi_detik) : null);
  for (const r of matang) {
    const m = medAkun.get(`${r.akun_id}|${r.platform}`);
    r._indeks = m > 0 ? r.views_d7 / m : null;
    r._kualitas = kualitas(r);
    r._retensi = retensi(r);
  }

  // Ringkasan per platform.
  const platforms = [...new Set(rows.map(r => r.platform))].sort();
  const ringkasan = platforms.map(p => {
    const semua = rows.filter(r => r.platform === p);
    const mt = matang.filter(r => r.platform === p);
    return {
      platform: p,
      n_post: semua.length,
      n_matang: mt.length,
      median_views_d7: median(mt.map(r => r.views_d7)),
      total_views: semua.reduce((s, r) => s + (r.views ?? 0), 0),
      kualitas_per_1000: median(mt.filter(r => r.views_d7 >= 50).map(r => r._kualitas)),
      retensi: median(mt.map(r => r._retensi)),
    };
  });

  // Akun berjangkauan nyaris nol: median akun < 5% median platform, n ≥ 3.
  const medPlatform = new Map(ringkasan.map(s => [s.platform, s.median_views_d7]));
  const akunLemah = [];
  for (const [k, v] of grupAkun) {
    const [akun, p] = k.split('|');
    const mp = medPlatform.get(p);
    const ma = medAkun.get(k);
    if (v.length >= 3 && mp > 0 && ma < mp * 0.05) {
      akunLemah.push({ akun_id: Number(akun), agent: nama(Number(akun)), platform: p, n: v.length, median_views_d7: ma, median_platform: mp });
    }
  }

  // Top video: rata-rata indeks lintas platformnya (min 2 platform matang).
  const perVideo = new Map();
  for (const r of matang) {
    if (r._indeks == null) continue;
    if (!perVideo.has(r.video_id)) perVideo.set(r.video_id, { r, post: [] });
    perVideo.get(r.video_id).post.push(r);
  }
  const top = [...perVideo.values()]
    .filter(x => x.post.length >= 2)
    .map(({ r, post }) => ({
      video_id: r.video_id,
      indeks: post.reduce((s, x) => s + x._indeks, 0) / post.length,
      total_views_d7: post.reduce((s, x) => s + x.views_d7, 0),
      agent: nama(r.character_id), talent: nama(r.asal_character_id ?? r.character_id),
      kode_listing: r.kode_listing, jenis_properti: r.jenis_properti, kecamatan: r.kecamatan, harga: r.harga,
      durasi_detik: r.durasi_detik, poster_url: r.poster_url,
      dna: {
        sudut: labelKatalog(r.dna_sudut, SUDUT), hook: labelKatalog(r.dna_hook, HOOK_MEKANISME),
        naratif: labelKatalog(r.dna_naratif, STRUKTUR_NARATIF), foto_pembuka: r.dna_foto_pembuka,
        mood: labelKatalog(r.dna_mood, MOOD),
      },
      terbit_at: r.terbit_at,
      platform: post.map(x => ({ platform: x.platform, views_d7: x.views_d7, indeks: x._indeks, kualitas: x._kualitas, retensi: x._retensi })),
    }))
    .sort((a, b) => b.indeks - a.indeks)
    .slice(0, 20);

  // Pola per dimensi.
  const DIMENSI = [
    ['Hook (mekanisme)', r => labelKatalog(r.dna_hook, HOOK_MEKANISME)],
    ['Sudut cerita', r => labelKatalog(r.dna_sudut, SUDUT)],
    ['Struktur naratif', r => labelKatalog(r.dna_naratif, STRUKTUR_NARATIF)],
    ['Foto pembuka (ruangan)', r => r.dna_foto_pembuka],
    ['Mood', r => labelKatalog(r.dna_mood, MOOD)],
    ['Jenis properti', r => r.jenis_properti],
    ['Rentang harga', r => bucket(r.harga, BUCKET_HARGA)],
    ['Kecamatan', r => r.kecamatan],
    ['Durasi video', r => bucket(r.durasi_detik, BUCKET_DURASI)],
    ['Jam tayang', r => bagianHari(r.terbit_at)],
    ['Talent (wajah)', r => nama(r.asal_character_id ?? r.character_id)],
    ['Asal video', r => (r.asal_character_id ? 'Pindahan agent lain' : 'Asli agent ini')],
  ];
  const pola = DIMENSI.map(([label, ambil]) => {
    const grup = new Map();
    for (const r of matang) {
      if (r._indeks == null) continue;
      const v = ambil(r);
      if (v == null || v === '') continue;
      if (!grup.has(v)) grup.set(v, []);
      grup.get(v).push(r);
    }
    const kelompok = [...grup].map(([nilai, rs]) => ({
      nilai,
      n: rs.length,
      median_indeks: median(rs.map(x => x._indeks)),
      menang: rs.filter(x => x._indeks > 1).length / rs.length,
      kualitas_per_1000: median(rs.filter(x => x.views_d7 >= 50).map(x => x._kualitas)),
      retensi: median(rs.map(x => x._retensi)),
      data_kurang: rs.length < N_MIN,
    }));
    // Kelompok cukup data diurutkan dulu; yang data_kurang di bawah.
    kelompok.sort((a, b) => (a.data_kurang - b.data_kurang) || (b.median_indeks - a.median_indeks));
    return { dimensi: label, n_terisi: kelompok.reduce((s, k) => s + k.n, 0), kelompok: label === 'Kecamatan' ? kelompok.slice(0, 12) : kelompok };
  });

  return {
    n_post: rows.length,
    n_matang: matang.length,
    ringkasan,
    akun_lemah: akunLemah.sort((a, b) => a.median_views_d7 - b.median_views_d7),
    top,
    pola,
  };
}
