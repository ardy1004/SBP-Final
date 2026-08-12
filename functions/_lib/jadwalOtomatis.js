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

export const JENDELA_DEFAULT = [
  { nama: 'Pagi', mulai: '06:30', akhir: '08:30' },
  { nama: 'Siang', mulai: '11:30', akhir: '13:30' },
  { nama: 'Malam', mulai: '19:00', akhir: '21:30' },
];

// Tangga geseran platform (menit). Jaraknya >= 4 menit supaya dua platform tidak
// pernah tabrakan, dan rentangnya <= 19 menit supaya semuanya tetap di dalam
// jendela primetime yang sama.
export const TANGGA_PLATFORM = [0, 4, 9, 14, 19];

export const KUOTA_MAKS = 3;
const MIN_LEAD_MS = 5 * 60 * 1000; // Buffer/Zernio menolak jadwal < beberapa menit ke depan

const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Jendela tersimpan di settings, bisa diedit admin. Bentuk rusak -> default,
// jangan pernah melempar: ini dipanggil di jalur cron yang tidak ada yang menonton.
export async function getJendela(env) {
  const raw = await getSetting(env, 'viralframe_jendela');
  if (!raw) return JENDELA_DEFAULT;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length > 0 && v.every(j => JAM_RE.test(j?.mulai) && JAM_RE.test(j?.akhir))) return v;
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
export function menitDasar(akunId, tanggalWib_, indexJendela, jendela) {
  const awal = keMenit(jendela.mulai);
  const akhir = keMenit(jendela.akhir);
  const tanggaMaks = Math.max(...TANGGA_PLATFORM);
  const panjang = Math.max(0, (akhir - awal) - tanggaMaks);
  return awal + Math.floor(seed01(akunId, tanggalWib_, indexJendela) * (panjang + 1));
}

const isoWib = (tanggal, totalMenit) => {
  const hh = String(Math.floor(totalMenit / 60) % 24).padStart(2, '0');
  const mm = String(totalMenit % 60).padStart(2, '0');
  return `${tanggal}T${hh}:${mm}:00+07:00`;
};

// Waktu tayang per platform untuk SATU slot. Urutan tangga dikocok per
// (akun, tanggal, jendela) — jadi platform mana yang duluan berubah tiap hari.
export function waktuPerPlatform(akunId, tanggalWib_, jendelaTerpilih, platforms) {
  const dasar = menitDasar(akunId, tanggalWib_, jendelaTerpilih.index, jendelaTerpilih);
  const urut = kocokDeterministik(TANGGA_PLATFORM, akunId, tanggalWib_, jendelaTerpilih.index, 'plat');
  const out = {};
  platforms.forEach((p, i) => {
    out[p] = isoWib(tanggalWib_, dasar + urut[i % urut.length]);
  });
  return out;
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

// Kuota akun untuk hari ini. Agent utama akun mapan -> langsung plafon, tidak
// ikut ramp. Selebihnya naik bertahap menurut hari nyata.
export async function kuotaAkun(env, akunId, akunUtamaId) {
  if (akunUtamaId && akunId === akunUtamaId) return { kuota: KUOTA_MAKS, hari: null, utama: true };
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

// ── Slot yang masih bisa dipakai ─────────────────────────────────────────────
// Mengembalikan seluruh slot hari ini yang jamnya masih di depan (Buffer/Zernio
// menolak jadwal di masa lalu). Kalau hari ini sudah habis, memakai jendela
// besok — supaya cron yang jalan dini hari tetap punya sasaran.
// Pemanggil tinggal mengambil sebanyak kekurangannya.
export function slotTersedia({ akunId, kuota, platforms, jendela = JENDELA_DEFAULT, sekarang = Date.now() }) {
  for (let hariKe = 0; hariKe <= 1; hariKe++) {
    const tanggal = tanggalWib(new Date(sekarang), hariKe);
    const layak = pilihJendela(akunId, tanggal, kuota, jendela)
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
// `dryRun` mengembalikan jam yang AKAN dipakai tanpa menyentuh Buffer/Zernio —
// itu yang dipakai admin untuk memeriksa jadwal sebelum menyalakan otomatis.
export async function jadwalkanVideo(env, { video, akun, targetId, kuota, jendela, urutanSlot = 0, dryRun = false }) {
  const platforms = Object.keys(akun.channels ?? {});
  if (platforms.length === 0) return { ok: false, alasan: 'akun belum punya channel sosmed' };

  const slots = slotTersedia({ akunId: targetId, kuota, platforms, jendela });
  const slot = slots[urutanSlot];
  if (!slot) return { ok: false, alasan: 'tidak ada jendela tersisa hari ini' };

  if (dryRun) return { ok: true, dry: true, tanggal: slot.tanggal, jendela: slot.jendela.nama, waktu: slot.waktu };

  const { rows } = await scheduleFanOut(env, {
    assetUrl: video.cloudinary_url, caption: video.caption ?? '', akun,
    waktu: slot.waktu, slotIndex: slot.jendela.index + 1,
  });

  const adaSukses = await persistScheduleResult(env, {
    videoId: video.id, videoType: 'agent', trashTable: 'viralframe_agent_videos',
    slotIndex: slot.jendela.index + 1, rows, akunId: targetId,
  });

  // Tandai kapan akun ini PERTAMA KALI benar-benar menerbitkan lewat dirinya
  // sendiri — jadi patokan ramp-up, dan hanya diisi sekali.
  if (adaSukses) {
    await env.DB.prepare(
      `UPDATE viralframe_agent_accounts SET mulai_aktif = COALESCE(mulai_aktif, ?) WHERE character_id = ?`
    ).bind(slot.tanggal, targetId).run().catch(() => {});
  }

  return { ok: true, tanggal: slot.tanggal, jendela: slot.jendela.nama, waktu: slot.waktu, rows, adaSukses };
}
