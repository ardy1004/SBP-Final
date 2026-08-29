// Mesin jam posting: jendela primetime + menit acak-ber-seed + geseran per
// platform. Menggantikan preset 5 slot tetap (migrasi 0041).
//
// KENAPA ADA. Diukur ke produksi 2026-08-11: 25 baris jadwal per hari hanya
// menghasilkan 5 jam berbeda — artinya kelima platform sebuah video terbit pada
// DETIK yang sama, tiap hari, di jam yang nyaris sama. Tidak ada manusia yang
// begitu. Itu satu-satunya tanda tangan mesin yang benar-benar ada di sistem
// ini; volumenya sendiri (5/hari) jauh di bawah batas API mana pun.
//
// KENAPA BER-SEED, BUKAN Math.random(). Indikator slot di UI harus menampilkan
// jam yang sama setiap halaman dimuat, dan tiap keputusan harus bisa
// direproduksi saat menelusuri masalah. Acak murni membuat jam berubah tiap
// refresh: mustahil ditampilkan, mustahil didebug. Ber-seed terlihat acak dari
// luar tapi stabil di dalam.

import { tanggalWib } from './waktu.js';
import { getSetting, scheduleFanOut, persistScheduleResult } from './schedulerProviders.js';
import { logServerError } from './logError.js';

export const JENDELA_DEFAULT = [
  { nama: 'Pagi', mulai: '06:30', akhir: '08:30' },
  { nama: 'Siang', mulai: '11:30', akhir: '13:30' },
  { nama: 'Malam', mulai: '19:00', akhir: '21:30' },
];

// ── Mode PRESET (khusus akun agent utama, 2026-08-15) ───────────────────────
// User minta mekanisme LAMA (sebelum migrasi 0041, lihat git show b2f907b)
// dikembalikan HANYA untuk akun utama: N slot jam tetap + drift linear
// (+intervalMenit tiap hari) — bukan jendela+menit ber-seed. Formula persis,
// tapi jam/jumlah slot/interval sekarang EDITABLE dari UI, bukan konstanta.
//
// Kenapa aman dipakai bersamaan dengan mode jendela (bukan gantikan total):
// semua slot preset pada HARI YANG SAMA bergeser dengan drift yang SAMA
// (bukan per-slot independen) — jadi jarak antar-slot tidak pernah berubah,
// tidak ada risiko tabrakan antar-slot akibat drift berapa pun besarnya.
export const PRESET_UTAMA_DEFAULT = { slots: ['06:00', '09:00', '12:00', '17:00', '19:00'], intervalMenit: 5 };

// Cap drift maksimal — konstanta internal, TIDAK diekspos ke UI. Murni "jangan
// drift terlalu jauh dari makna jam aslinya" (mis. 06:00 tidak sampai bergeser
// ke siang), bukan pencegah tabrakan (lihat catatan di atas). Nilai sama
// seperti formula lama (120 menit, siklus 24 hari saat interval=5).
const MAKS_DRIFT_PRESET_MENIT = 120;
// Titik jangkar siklus — dipertahankan dari kode lama, tanggal sembarang tetap,
// cuma dipakai menghitung posisi siklus.
const ROTATION_ANCHOR_MS = Date.UTC(2026, 6, 1); // 2026-07-01

export async function getPresetUtama(env) {
  const raw = await getSetting(env, 'viralframe_preset_utama');
  if (!raw) return PRESET_UTAMA_DEFAULT;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v?.slots) && v.slots.length > 0 && v.slots.every(s => JAM_RE.test(s))
        && Number.isInteger(v.intervalMenit) && v.intervalMenit >= 0) {
      return { slots: v.slots, intervalMenit: v.intervalMenit };
    }
  } catch { /* pakai default */ }
  return PRESET_UTAMA_DEFAULT;
}

// Drift (menit) untuk SEMUA slot preset pada satu tanggal WIB. intervalMenit=0
// -> cycleDays dipaksa 1 (drift selalu 0, tidak pernah rotasi) supaya tidak
// pernah dibagi nol.
function driftMenitPreset(tanggalWib_, intervalMenit) {
  if (intervalMenit <= 0) return 0;
  const cycleDays = Math.max(1, Math.ceil(MAKS_DRIFT_PRESET_MENIT / intervalMenit));
  const [y, m, d] = tanggalWib_.split('-').map(Number);
  const dayMs = Date.UTC(y, m - 1, d);
  const daysSinceAnchor = Math.round((dayMs - ROTATION_ANCHOR_MS) / 86400000);
  const cyclePos = ((daysSinceAnchor % cycleDays) + cycleDays) % cycleDays;
  return cyclePos * intervalMenit;
}

// Tangga geseran platform (menit). Jaraknya >= 4 menit supaya dua platform tidak
// pernah tabrakan, dan rentangnya <= 19 menit supaya semuanya tetap di dalam
// jendela primetime yang sama.
export const TANGGA_PLATFORM = [0, 4, 9, 14, 19];

// ⚠️ Tangga ini punya PASANGAN yang tidak dijaga apa pun: PLATFORMS di
// functions/_lib/agentAccounts.js. Keduanya kebetulan sama-sama 5 entri, tapi
// hidup di file berbeda tanpa pengikat. terapkanTanggaPlatform() memakai
// `urut[i % urut.length]`, jadi platform ke-6 MEMBUNGKUS dan mendapat menit yang
// sama persis dengan platform pertama — dua post ke akun berbeda pada detik yang
// sama. Diukur di simulasi: 6 platform -> cuma 5 jam unik, tanpa error apa pun.
// LinkedIn/Bluesky/Pinterest semuanya didukung Buffer, jadi ini tinggal menunggu.
//
// Perpanjangannya deterministik dan HANYA aktif kalau platformnya memang lebih
// dari 5 — jalur 5 platform wajib mengembalikan array yang identik supaya jam
// yang sudah berjalan di produksi tidak bergeser sedikit pun.
const JARAK_TAMBAHAN_MENIT = 5;

export function tanggaUntuk(jumlah) {
  if (!Number.isInteger(jumlah) || jumlah <= TANGGA_PLATFORM.length) return TANGGA_PLATFORM;
  const out = [...TANGGA_PLATFORM];
  while (out.length < jumlah) out.push(out[out.length - 1] + JARAK_TAMBAHAN_MENIT);
  return out;
}

// Panjang minimal sebuah jendela primetime. Diturunkan dari tangga, BUKAN angka
// terpisah — jendela harus punya ruang untuk platform paling belakang plus
// sedikit sisa untuk diundi. Dipakai bersama oleh jalur tulis
// (api/admin/settings/scheduler-config.js) dan jalur baca (getJendela) supaya
// keduanya mustahil berbeda.
export function minPanjangJendela(jumlahPlatform = TANGGA_PLATFORM.length) {
  return Math.max(...tanggaUntuk(jumlahPlatform)) + 10;
}

export const KUOTA_MAKS = 3;
const MIN_LEAD_MS = 5 * 60 * 1000; // Buffer/Zernio menolak jadwal < beberapa menit ke depan

const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Jendela tersimpan di settings, bisa diedit admin. Bentuk rusak -> default,
// jangan pernah melempar: ini dipanggil di jalur cron yang tidak ada yang menonton.
// ⚠️ Format jam saja TIDAK CUKUP. Jalur tulis (scheduler-config.js) menolak
// jendela yang lebih pendek dari minPanjangJendela() dan yang terbalik, tapi
// jalur baca ini dulu memakai nilainya apa adanya — jadi nilai yang masuk lewat
// jalur lain (d1 execute langsung, atau tersimpan sebelum validasi tulis ada)
// dipakai tanpa perlawanan. Diukur: jendela 23:50-23:59 menghasilkan 00:04 dan
// 00:09 pada TANGGAL YANG SAMA, yaitu ~24 jam di masa lalu, karena isoWib()
// melakukan % 24 tanpa menaikkan tanggal. Buffer/Zernio menolaknya sebagai
// "dueAt must be in the future" — kalau beruntung.
function jendelaMasukAkal(j) {
  if (!JAM_RE.test(j?.mulai) || !JAM_RE.test(j?.akhir)) return false;
  return keMenit(j.akhir) - keMenit(j.mulai) >= minPanjangJendela();
}

export async function getJendela(env) {
  const raw = await getSetting(env, 'viralframe_jendela');
  if (!raw) return JENDELA_DEFAULT;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length > 0 && v.every(jendelaMasukAkal)) return v;
    // Diam-diam jatuh ke default itu sendiri yang membuat masalah sulit dilacak:
    // admin melihat jendela tersimpan di UI, tapi jam yang keluar memakai nilai
    // lain. Catat supaya selisihnya kelihatan.
    await logServerError(env, {
      source: 'server',
      message: '[scheduler] setting viralframe_jendela ditolak saat dibaca (jendela terlalu pendek, terbalik, atau format salah) — memakai JENDELA_DEFAULT',
      url: '/api/admin/settings/scheduler-config',
      context: { tersimpan: String(raw).slice(0, 500), min_panjang_menit: minPanjangJendela() },
    });
  } catch { /* pakai default */ }
  return JENDELA_DEFAULT;
}

// ── Acak deterministik (FNV-1a 32-bit) ──────────────────────────────────────
export function seedInt(...bagian) {
  let h = 2166136261;
  const s = bagian.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const seed01 = (...bagian) => seedInt(...bagian) / 4294967296;

// Fisher–Yates memakai deretan seed turunan — hasilnya tetap sama untuk input
// sama, tapi permutasinya berubah total begitu salah satu bagian seed berubah.
export function kocokDeterministik(arr, ...bagian) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = seedInt(...bagian, i) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const keMenit = (jam) => {
  const [h, m] = String(jam).split(':').map(Number);
  return h * 60 + m;
};

// ── Pemilihan jendela ────────────────────────────────────────────────────────
// Kuota 3 -> ketiganya. Kuota 1-2 -> dirotasi harian secara melingkar, supaya
// akun baru tidak selalu muncul di jam yang sama DAN sekaligus mencicipi ketiga
// jendela secara merata — setelah sebulan, metrik views/likes bisa dipakai
// memilih jendela terbaik berdasarkan data, bukan tebakan.
export function pilihJendela(akunId, tanggalWib_, kuota, jendela = JENDELA_DEFAULT) {
  const n = Math.max(0, Math.min(kuota, jendela.length));
  if (n === 0) return [];
  if (n >= jendela.length) return jendela.map((j, i) => ({ ...j, index: i }));

  const mulai = seedInt(akunId, tanggalWib_) % jendela.length;
  const dipilih = [];
  for (let k = 0; k < n; k++) {
    const i = (mulai + k) % jendela.length;
    dipilih.push({ ...jendela[i], index: i });
  }
  return dipilih.sort((a, b) => keMenit(a.mulai) - keMenit(b.mulai));
}

// Menit dasar di dalam sebuah jendela.
//
// Rentang undian DIKURANGI tangga tertinggi lebih dulu. Tanpa itu, platform
// yang kebagian geseran +19 menit bisa terlempar KELUAR jendela — terlihat saat
// uji pertama: jendela Pagi 06:30-08:30 menghasilkan 08:38. Dengan pengurangan
// ini, platform paling belakang pun tetap mendarat tepat di batas akhir.
// `tanggaMaks` wajib ikut jumlah platform sebenarnya. Kalau tangganya diperpanjang
// (>5 platform) tapi pengurangan di sini tetap memakai 19, platform paling
// belakang terlempar KELUAR jendela — persis bug yang dulu menghasilkan 08:38 di
// jendela 06:30-08:30. Default-nya dipertahankan supaya pemanggil lama (dan uji
// yang sudah ada) berperilaku sama persis.
export function menitDasar(akunId, tanggalWib_, indexJendela, jendela, tanggaMaks = Math.max(...TANGGA_PLATFORM)) {
  const awal = keMenit(jendela.mulai);
  const akhir = keMenit(jendela.akhir);
  const panjang = Math.max(0, (akhir - awal) - tanggaMaks);
  return awal + Math.floor(seed01(akunId, tanggalWib_, indexJendela) * (panjang + 1));
}

const isoWib = (tanggal, totalMenit) => {
  const hh = String(Math.floor(totalMenit / 60) % 24).padStart(2, '0');
  const mm = String(totalMenit % 60).padStart(2, '0');
  return `${tanggal}T${hh}:${mm}:00+07:00`;
};

// Terapkan tangga geseran platform ke SATU menit dasar. Dipakai bersama oleh
// mode jendela (waktuPerPlatform) dan mode preset (slotPresetHariIni) — supaya
// logika ladder-nya satu sumber, tidak diduplikasi.
function terapkanTanggaPlatform(akunId, tanggalWib_, indexSlot, dasarMenit, platforms) {
  const urut = kocokDeterministik(tanggaUntuk(platforms.length), akunId, tanggalWib_, indexSlot, 'plat');
  const out = {};
  platforms.forEach((p, i) => {
    out[p] = isoWib(tanggalWib_, dasarMenit + urut[i % urut.length]);
  });
  return out;
}

// Waktu tayang per platform untuk SATU slot. Urutan tangga dikocok per
// (akun, tanggal, jendela) — jadi platform mana yang duluan berubah tiap hari.
export function waktuPerPlatform(akunId, tanggalWib_, jendelaTerpilih, platforms) {
  const dasar = menitDasar(akunId, tanggalWib_, jendelaTerpilih.index, jendelaTerpilih, Math.max(...tanggaUntuk(platforms.length)));
  return terapkanTanggaPlatform(akunId, tanggalWib_, jendelaTerpilih.index, dasar, platforms);
}

// ── Slot mode preset (khusus akun utama) ────────────────────────────────────
// Sejajar peran dengan pilihJendela+waktuPerPlatform, tapi SEMUA slot preset
// dipakai (bukan subset dirotasi) — kuota akun utama = persis jumlah slotnya.
// `nama` = jam ASLI sebelum drift (stabil, jadi label UI tidak ikut bergeser
// tiap hari) — sama seperti "Pagi"/"Siang"/"Malam" stabil di mode jendela
// walau menit di dalamnya berubah.
export function slotPresetHariIni(akunId, tanggalWib_, preset, platforms) {
  const drift = driftMenitPreset(tanggalWib_, preset.intervalMenit);
  return preset.slots.map((jam, index) => {
    const dasar = keMenit(jam) + drift;
    return {
      index,
      nama: jam,
      waktu: terapkanTanggaPlatform(akunId, tanggalWib_, index, dasar, platforms),
    };
  });
}

// ── Kuota harian ─────────────────────────────────────────────────────────────
// "Hari nyata" = jumlah hari yang BENAR-BENAR ada postingan sukses dari akun
// ini, bukan hari kalender sejak diaktifkan. Kalau memakai kalender, agent yang
// sempat posting 1x lalu kehabisan stok 25 hari tetap naik ke 2x/hari di hari
// ke-31 — dengan akun yang riwayatnya baru 1 post. Justru profil seperti itu
// yang paling mudah dicurigai.
export async function hariPosting(env, akunId) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(DISTINCT substr(scheduled_at,1,10)) AS n
       FROM viralframe_scheduled_posts WHERE akun_id = ? AND status = 'scheduled'`
    ).bind(akunId).first();
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export function kuotaRamp(hari) {
  if (hari <= 30) return 1;
  if (hari <= 60) return 2;
  return KUOTA_MAKS;
}

// Kuota akun untuk hari ini. Agent utama -> jumlah slot preset-nya (dinamis,
// ikut berubah kalau user tambah/hapus baris jam di UI) — BUKAN lagi KUOTA_MAKS
// tetap. Selebihnya naik bertahap menurut hari nyata (ramp, tidak disentuh).
export async function kuotaAkun(env, akunId, akunUtamaId) {
  if (akunUtamaId && akunId === akunUtamaId) {
    const preset = await getPresetUtama(env);
    return { kuota: preset.slots.length, hari: null, utama: true };
  }
  const hari = await hariPosting(env, akunId);
  return { kuota: kuotaRamp(hari), hari, utama: false };
}

// Berapa slot yang SUDAH terisi sukses hari ini untuk akun ini. Dihitung dari
// jumlah video berbeda, bukan jumlah baris (1 video = 1 slot = banyak platform).
// Inilah yang membuat cron idempoten: jalan dua kali, atau bercampur dengan klik
// manual, tetap tidak pernah melebihi kuota.
export async function slotTerpakaiHariIni(env, akunId, tanggal = tanggalWib()) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(DISTINCT video_id) AS n FROM viralframe_scheduled_posts
       WHERE akun_id = ? AND status = 'scheduled' AND substr(scheduled_at,1,10) = ?`
    ).bind(akunId, tanggal).first();
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

// ── Slot yang sudah terisi ───────────────────────────────────────────────────
// Kunci slot = "<tanggal>|<slot_index>", dengan slot_index = index jendela + 1
// (nilai yang sama yang ditulis persistScheduleResult). Hari ini DAN besok ikut
// dibaca, karena penjadwalan sore/malam wajar mendarat di jendela besok.
export async function slotDipakai(env, akunId, sekarang = Date.now()) {
  const set = new Set();
  try {
    const hariIni = tanggalWib(new Date(sekarang), 0);
    const besok = tanggalWib(new Date(sekarang), 1);
    const res = await env.DB.prepare(
      `SELECT DISTINCT substr(scheduled_at,1,10) AS tgl, slot_index
         FROM viralframe_scheduled_posts
        WHERE akun_id = ? AND status = 'scheduled' AND substr(scheduled_at,1,10) IN (?, ?)`
    ).bind(akunId, hariIni, besok).all();
    for (const r of res.results ?? []) set.add(`${r.tgl}|${r.slot_index}`);
  } catch { /* kolom/tabel belum ada -> anggap kosong, jangan matikan penjadwalan */ }
  return set;
}

// ── Slot yang masih bisa dipakai ─────────────────────────────────────────────
// Mengembalikan slot hari ini yang (a) jendelanya belum terisi dan (b) jamnya
// masih di depan (Buffer/Zernio menolak jadwal di masa lalu). Kalau hari ini
// habis, memakai jendela besok — supaya cron dini hari tetap punya sasaran.
//
// ⚠️ `dipakai` WAJIB dikirim pemanggil yang menjadwalkan lebih dari satu video.
// Tanpa itu pemilihan slot jatuh ke urutan posisi, dan posisi TIDAK SETARA
// dengan "jendela mana yang kosong" — dua bug nyata lahir dari situ (diukur
// 2026-08-12): (1) menjadwalkan jam 23:00 membuat semua video mendarat di
// MENIT YANG SAMA besok pagi, karena penghitung kuota cuma melihat hari ini
// sehingga indeksnya tak pernah naik; (2) sesudah satu jendela lewat, indeks
// bergeser dan jendela kosong di tengah dilompati, jadi kuota 3 cuma terisi 2.
//
// `akunUtamaId`+`preset`: kalau `akunId === akunUtamaId`, dipakai mode PRESET
// (N slot tetap + drift, lihat slotPresetHariIni) — bukan jendela+seed. Cabang
// jendela di bawah TIDAK diubah sama sekali (disalin apa adanya) supaya 6
// agent lain nol risiko regresi.
export function slotTersedia({ akunId, akunUtamaId, kuota, platforms, jendela = JENDELA_DEFAULT, preset, sekarang = Date.now(), dipakai = new Set() }) {
  // Tanpa platform tidak ada jam yang bisa dihitung; Math.min(...[]) = Infinity
  // akan lolos filter waktu dan melaporkan slot yang sebenarnya tidak ada.
  if (!platforms?.length) return [];
  const modePreset = akunUtamaId != null && akunId === akunUtamaId;
  for (let hariKe = 0; hariKe <= 1; hariKe++) {
    const tanggal = tanggalWib(new Date(sekarang), hariKe);
    const layak = modePreset
      ? slotPresetHariIni(akunId, tanggal, preset ?? PRESET_UTAMA_DEFAULT, platforms)
          .filter(s => !dipakai.has(`${tanggal}|${s.index + 1}`))
          .map(s => ({ jendela: { nama: s.nama, index: s.index }, tanggal, waktu: s.waktu }))
          .filter(s => Math.min(...Object.values(s.waktu).map(t => new Date(t).getTime())) > sekarang + MIN_LEAD_MS)
      : pilihJendela(akunId, tanggal, kuota, jendela)
          .filter(j => !dipakai.has(`${tanggal}|${j.index + 1}`))
          .map(j => ({ jendela: j, tanggal, waktu: waktuPerPlatform(akunId, tanggal, j, platforms) }))
          .filter(s => Math.min(...Object.values(s.waktu).map(t => new Date(t).getTime())) > sekarang + MIN_LEAD_MS);
    if (layak.length > 0) return layak;
  }
  return [];
}

// ── Orkestrator: jadwalkan SATU video ────────────────────────────────────────
// Dipakai jalur MANUAL (tombol Jadwalkan) dan jalur CRON, supaya keduanya
// mustahil berbeda perilaku. Pemanggil sudah menyiapkan akun & kuota.
//
// `dipakai` = Set kunci slot dari slotDipakai(), DIPAKAI BERSAMA sepanjang satu
// putaran penjadwalan. Slot yang dipilih langsung diklaim ke dalamnya, jadi
// video berikutnya di putaran yang sama tidak bisa mengambil jendela itu lagi.
// Ini juga satu-satunya pengaman saat `dryRun` — di mode itu tidak ada baris DB
// yang ditulis, jadi Set inilah yang mencegah laporan berisi slot kembar.
//
// `dryRun` mengembalikan jam yang AKAN dipakai tanpa menyentuh Buffer/Zernio —
// itu yang dipakai admin untuk memeriksa jadwal sebelum menyalakan otomatis.
// Gabungkan caption + hashtags jadi SATU teks — Buffer (`text`) dan Zernio
// (`content`) sama-sama cuma punya satu field teks, tidak ada parameter
// hashtag terpisah. Dulu cuma `video.caption` yang dikirim (baik jalur manual
// maupun cron) — `hashtags` tersimpan di DB tapi tidak pernah ikut ke
// Buffer/Zernio sama sekali (dilaporkan user 2026-08-15). Pola gabung sama
// dengan yang sudah dipakai di AdminViralFrameWorkspacePage.tsx (preview ZIP).
function gabungCaptionHashtag(caption, hashtags) {
  const c = (caption ?? '').trim();
  const h = (hashtags ?? '').trim();
  if (!h) return c;
  return c ? `${c}\n\n${h}` : h;
}

// Kegagalan per platform WAJIB sampai ke Admin → Error Logs, bukan cuma mengendap
// di kolom error_message. Instagram gagal 14 dari 14 selama berhari-hari tanpa
// ada yang tahu justru karena tidak ada satu pun logServerError di jalur ini
// (audit 2026-08-29) — penyebab teknisnya sudah diperbaiki, kelas bugnya belum.
//
// source tetap 'server', BUKAN 'scheduler': filter di
// functions/api/admin/errors/index.js cuma menerima 'client'|'server', jadi
// nilai lain akan LENYAP begitu admin memfilter "server" — persis kebalikan dari
// tujuan fungsi ini. Penandanya ditaruh di awal message.
//
// Satu baris per VIDEO, bukan per platform: satu video gagal di 5 platform itu
// satu peristiwa, dan 5 baris identik cuma menenggelamkan error lain.
async function catatKegagalanPlatform(env, { rows, videoId, targetId, slot }) {
  const gagal = (rows ?? []).filter(r => !r.result.ok);
  if (gagal.length === 0) return;

  const semua = gagal.length === (rows ?? []).length;
  const daftar = gagal.map(r => r.platform).join(', ');
  await logServerError(env, {
    source: 'server',
    message: semua
      ? `[scheduler] SEMUA ${gagal.length} platform gagal dijadwalkan (${daftar}) — video ${videoId} tidak terbit di mana pun`
      : `[scheduler] ${gagal.length} platform gagal dijadwalkan (${daftar}) — video ${videoId}`,
    url: '/api/internal/viralframe/auto-schedule',
    context: {
      video_id: videoId,
      akun_id: targetId,
      tanggal: slot?.tanggal ?? null,
      jendela: slot?.jendela?.nama ?? null,
      total_platform: (rows ?? []).length,
      gagal: gagal.map(r => ({ platform: r.platform, provider: r.provider, error: r.result.error })),
    },
  });
}

export async function jadwalkanVideo(env, { video, akun, targetId, akunUtamaId, kuota, jendela, preset, dipakai, dryRun = false }) {
  const platforms = Object.keys(akun.channels ?? {});
  if (platforms.length === 0) return { ok: false, alasan: 'akun belum punya channel sosmed' };

  const klaim = dipakai ?? await slotDipakai(env, targetId);
  const slot = slotTersedia({ akunId: targetId, akunUtamaId, kuota, platforms, jendela, preset, dipakai: klaim })[0];
  if (!slot) return { ok: false, alasan: 'tidak ada jendela kosong yang tersisa' };
  klaim.add(`${slot.tanggal}|${slot.jendela.index + 1}`);

  if (dryRun) return { ok: true, dry: true, tanggal: slot.tanggal, jendela: slot.jendela.nama, waktu: slot.waktu };

  const { rows } = await scheduleFanOut(env, {
    assetUrl: video.cloudinary_url, caption: gabungCaptionHashtag(video.caption, video.hashtags), akun,
    waktu: slot.waktu, slotIndex: slot.jendela.index + 1,
  });

  const adaSukses = await persistScheduleResult(env, {
    videoId: video.id, videoType: 'agent', trashTable: 'viralframe_agent_videos',
    slotIndex: slot.jendela.index + 1, rows, akunId: targetId,
  });

  await catatKegagalanPlatform(env, { rows, videoId: video.id, targetId, slot });

  // Tandai kapan akun ini PERTAMA KALI benar-benar menerbitkan lewat dirinya
  // sendiri — jadi patokan ramp-up, dan hanya diisi sekali.
  if (adaSukses) {
    await env.DB.prepare(
      `UPDATE viralframe_agent_accounts SET mulai_aktif = COALESCE(mulai_aktif, ?) WHERE character_id = ?`
    ).bind(slot.tanggal, targetId).run().catch(() => {});
  }

  return { ok: true, tanggal: slot.tanggal, jendela: slot.jendela.nama, waktu: slot.waktu, rows, adaSukses };
}
