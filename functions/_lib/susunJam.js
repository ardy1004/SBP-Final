// "Susun jam semua agent" (Konten Agent, 2026-11-07) — fungsi MURNI.
//
// KENAPA ADA. Setelah agent boleh memakai jadwal manual, jam dasarnya diisi
// satu per satu dan menumpuk: diukur 2026-11-07 (simulasi 24 hari, mesin
// produksi), 5 akun mulai 06:00, 4 akun di 21:30, dua akun hanya selisih 5
// menit di kelima jamnya → rata-rata 50 menit/hari di mana ≥2 akun tayang di
// menit yang SAMA, 25 post menumpuk dalam 30 menit, 19 post/hari lewat 22:00.
// Jam ini adalah jam tayang di Buffer (`dueAt`) & Zernio (`scheduledFor`).
//
// ATURAN SUSUNAN
//   • 5 gelombang primetime (GELOMBANG_SUSUN). Jam dasar sengaja di AWAL jam
//     ramai: drift harian (slotPresetHariIni) mendorong semua jam sampai ±2 jam
//     lebih lambat dalam satu siklus.
//   • Di dalam gelombang, akun berjarak `jarakAntarAkun()` = geser platform
//     terjauh + 1 menit (20 untuk 5 platform). Lebih rapat dari itu, platform
//     terakhir akun A bisa jatuh di menit yang sama dengan platform pertama
//     akun B — jarak 15 terukur menyisakan 35 menit kembar/hari.
//   • Urutan akun DIACAK PER GELOMBANG (kocokDeterministik). Rotasi biasa
//     menjaga urutan siklik yang sama di tiap gelombang ("A selalu sebelum B")
//     — pola rapi yang justru ingin dihindari. Deterministik supaya pratinjau
//     = yang diterapkan; `variasi` mengganti hasil acak ("Acak ulang").
//   • SEMUA peserta wajib memakai intervalMenit yang SAMA. Drift identik →
//     jarak antar akun terjaga setiap hari; interval berbeda membuat jadwal
//     saling menyusul dan bertabrakan. Pemanggil yang menetapkan nilainya.
//
// Kelayakan DIPERIKSA, bukan diasumsikan: terlalu banyak agent untuk satu
// gelombang = ditolak dengan pesan, bukan dipaksakan ke jam yang bertabrakan.

import { kocokDeterministik, tanggaUntuk, jamPresetPalingAkhir, validasiPresetJam } from './jadwalOtomatis.js';

// Kapasitas = 9 agent per gelombang. Jarak antar gelombang paling sempit 180
// menit, dan (9−1)×20 + 19 = 179 masih muat. Sore sengaja 15:20, bukan 15:40:
// dengan 15:40 jaraknya ke Malam cuma 170 dan agent ke-9 langsung ditolak.
// Gelombang Malam selesai 18:30 + 8×20 = 21:10 ≤ batas 21:45 (interval 5).
// Agent ke-10 ditolak dengan pesan — menambah kapasitas berarti memindah jam
// gelombang, keputusan produk, bukan sesuatu yang dipaksakan diam-diam.
export const GELOMBANG_SUSUN = [
  { nama: 'Pagi', mulai: '06:00' },
  { nama: 'Siang awal', mulai: '09:00' },
  { nama: 'Siang', mulai: '12:00' },
  { nama: 'Sore', mulai: '15:20' },
  { nama: 'Malam', mulai: '18:30' },
];

// Agent dengan < 5 jam/hari mengisi gelombang menurut urutan ini (indeks ke
// GELOMBANG_SUSUN): Malam, Pagi, Siang, Sore, Siang awal — jam paling ramai dulu.
const PRIORITAS_GELOMBANG = [4, 0, 2, 3, 1];

const keMenit = (j) => Number(j.slice(0, 2)) * 60 + Number(j.slice(3, 5));
const keJam = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Jarak minimum antar akun di satu gelombang = geser platform terjauh + 1. */
export function jarakAntarAkun(jumlahPlatform = 5) {
  return Math.max(...tanggaUntuk(jumlahPlatform)) + 1;
}

/**
 * @param {{ peserta: {id:number, nama:string, jumlah:number}[], intervalMenit:number, jumlahPlatform?:number, variasi?:number }} p
 * @returns {{ ok:true, rencana:{id:number, nama:string, slots:string[]}[], gelombang:{nama:string, mulai:string, jumlah:number}[], jarakMenit:number }
 *          | { ok:false, pesan:string }}
 */
export function susunJamSemuaAgent({ peserta, intervalMenit, jumlahPlatform = 5, variasi = 0 }) {
  if (!Array.isArray(peserta) || peserta.length === 0) {
    return { ok: false, pesan: 'Tidak ada agent yang bisa disusun — agent utama dan agent mode Manual saja yang ikut.' };
  }
  if (!Number.isInteger(intervalMenit) || intervalMenit < 0) {
    return { ok: false, pesan: 'Interval geser harian tidak valid.' };
  }
  for (const p of peserta) {
    if (!Number.isInteger(p.jumlah) || p.jumlah < 1 || p.jumlah > GELOMBANG_SUSUN.length) {
      return { ok: false, pesan: `${p.nama} memakai ${p.jumlah} jam/hari — susun otomatis mendukung 1–${GELOMBANG_SUSUN.length} (satu per gelombang). Kurangi jumlahnya dulu di kartu agent itu.` };
    }
  }

  const jarak = jarakAntarAkun(jumlahPlatform);
  const tangga = jarak - 1;
  // Urutan dasar = id, BUKAN urutan masukan — supaya hasil tidak bergantung
  // pada urutan baris yang kebetulan dikembalikan database.
  const urut = [...peserta].sort((a, b) => a.id - b.id);

  const anggota = GELOMBANG_SUSUN.map(() => []);
  for (const p of urut) {
    for (const w of PRIORITAS_GELOMBANG.slice(0, p.jumlah)) anggota[w].push(p.id);
  }

  const akhirAman = keMenit(jamPresetPalingAkhir(intervalMenit, jumlahPlatform));
  for (let w = 0; w < GELOMBANG_SUSUN.length; w++) {
    const n = anggota[w].length;
    if (n === 0) continue;
    const mulai = keMenit(GELOMBANG_SUSUN[w].mulai);
    const ujung = mulai + (n - 1) * jarak;
    const berikut = GELOMBANG_SUSUN[w + 1];
    if (berikut && ujung + tangga >= keMenit(berikut.mulai)) {
      return { ok: false, pesan: `Gelombang ${GELOMBANG_SUSUN[w].nama} tidak muat: ${n} agent × ${jarak} menit melewati awal gelombang ${berikut.nama} (${berikut.mulai}).` };
    }
    if (!berikut && ujung > akhirAman) {
      return { ok: false, pesan: `Gelombang ${GELOMBANG_SUSUN[w].nama} tidak muat: agent terakhir jatuh di ${keJam(ujung)}, lewat batas aman ${keJam(akhirAman)}.` };
    }
  }

  const slotsPer = new Map(urut.map(p => [p.id, []]));
  anggota.forEach((ids, w) => {
    const mulai = keMenit(GELOMBANG_SUSUN[w].mulai);
    kocokDeterministik(ids, 'susun-jam', w, variasi).forEach((id, i) => {
      slotsPer.get(id).push(keJam(mulai + i * jarak));
    });
  });

  const rencana = [];
  for (const p of urut) {
    const v = validasiPresetJam({ slots: slotsPer.get(p.id), intervalMenit }, jumlahPlatform);
    if (!v.ok) return { ok: false, pesan: `Susunan untuk ${p.nama} ditolak aturan jam: ${v.pesan}` };
    rencana.push({ id: p.id, nama: p.nama, slots: v.preset.slots });
  }

  return {
    ok: true,
    rencana,
    gelombang: GELOMBANG_SUSUN.map((g, w) => ({ ...g, jumlah: anggota[w].length })),
    jarakMenit: jarak,
  };
}
