// Selector variasi — STASIUN 3 pipeline ViralFrame.
//
// Inilah yang menjawab "AI yang memutuskan gaya/pola/metode" TANPA menyerahkan
// keputusannya ke AI. Sistem melempar dadu; AI mengerjakan kerajinannya.
//
// ─── Kenapa sistem, bukan LLM ────────────────────────────────────────────────
// LLM adalah pencari modus. Diminta "pilih gaya terbaik" 100 kali dengan prompt
// yang sama, ia memilih 3–4 gaya yang itu-itu saja; menaikkan temperature
// menghasilkan kebisingan, bukan keragaman. Kalau lapis ini diserahkan ke AI,
// aturan rotasi gagal — dan gagalnya SENYAP: tiap storyboard "beda" di teks,
// seragam di layar. Tidak ada gate yang bisa menangkap kemiripan.
//
// ⚠️ Fungsi ini SENGAJA MURNI (tanpa DB, tanpa fetch, RNG disuntik dari luar)
// supaya bisa disimulasikan 100 rotasi berturut tanpa menyentuh apa pun. Dua
// mekanisme anti-pengulangan sebelumnya di project ini mati diam-diam justru
// karena tidak pernah bisa diuji terpisah.

import { MEKANISME, HOOK, RITME, MOOD, SUMBU_DOMINAN, kunciVariasi } from './viralframe.js';

/** Berapa variasi terakhir yang dijadikan acuan "harus terasa beda". */
const JENDELA_BEDA = 5;
/** Minimal berapa sumbu dominan yang WAJIB berbeda dari variasi dalam jendela. */
const MIN_SUMBU_BEDA = 2;
/** Kandidat yang diundi tiap pemilihan. Cukup besar untuk menutup ruang, cukup
 *  kecil untuk selesai dalam mikrodetik di Workers. */
const JUMLAH_KANDIDAT = 240;

/** Ubah `variation_key` kembali jadi objek vektor. Toleran nilai tak dikenal. */
export function uraiKunci(kunci) {
  const v = {};
  for (const bagian of String(kunci ?? '').split('|')) {
    const i = bagian.indexOf(':');
    if (i > 0) v[bagian.slice(0, i)] = bagian.slice(i + 1);
  }
  return v;
}

/** Berapa sumbu dominan yang berbeda antara dua vektor. */
export function jarakSumbu(a, b) {
  let n = 0;
  for (const s of SUMBU_DOMINAN) if ((a?.[s] ?? null) !== (b?.[s] ?? null)) n += 1;
  return n;
}

/**
 * Hitung pemakaian tiap nilai per sumbu di seluruh riwayat listing ini.
 * Dipakai untuk cakupan BERTINGKAT: nilai yang jarang dipakai lebih diprioritaskan,
 * sehingga ruang variasi tertutup merata alih-alih acak menumpuk di beberapa titik.
 */
function hitungPemakaian(riwayat) {
  const pakai = {};
  for (const s of SUMBU_DOMINAN) pakai[s] = new Map();
  for (const v of riwayat) {
    for (const s of SUMBU_DOMINAN) {
      const nilai = v?.[s];
      if (nilai == null) continue;
      pakai[s].set(nilai, (pakai[s].get(nilai) ?? 0) + 1);
    }
  }
  return pakai;
}

/** Ambil satu nilai, condong ke yang paling jarang dipakai. */
function undiCondong(pilihan, pakai, acak) {
  if (pilihan.length === 0) return null;
  // Bobot = 1 / (1 + jumlah pakai) → yang belum pernah dipakai berbobot penuh.
  const bobot = pilihan.map(p => 1 / (1 + (pakai.get(p) ?? 0)));
  const total = bobot.reduce((s, b) => s + b, 0);
  let u = acak() * total;
  for (let i = 0; i < pilihan.length; i++) {
    u -= bobot[i];
    if (u <= 0) return pilihan[i];
  }
  return pilihan[pilihan.length - 1];
}

/**
 * Pilih satu vektor variasi untuk listing ini.
 *
 * @param {object} opsi
 * @param {string[]} opsi.riwayatKunci  - `variation_key` seluruh pesanan listing ini.
 * @param {string[]} opsi.labelFoto     - label foto yang tersedia (sumbu `pembukaan`).
 * @param {() => number} [opsi.acak]    - RNG; disuntik agar bisa diuji deterministik.
 * @returns {{ vektor: object, kunci: string, jarakTerdekat: number, longgar: boolean } | null}
 *          null bila listing tidak punya foto sama sekali (tidak ada yang bisa dibuka).
 */
export function pilihVariasi({ riwayatKunci = [], labelFoto = [], acak = Math.random } = {}) {
  if (!Array.isArray(labelFoto) || labelFoto.length === 0) return null;

  const riwayat = riwayatKunci.filter(Boolean).map(uraiKunci);
  const sudahAda = new Set(riwayatKunci.filter(Boolean));
  const terbaru = riwayat.slice(0, JENDELA_BEDA); // riwayat dikirim terbaru dulu
  const pakai = hitungPemakaian(riwayat);

  const idMekanisme = MEKANISME.map(x => x.id);
  const idHook = HOOK.map(x => x.id);
  const idRitme = RITME.map(x => x.id);
  const idMood = MOOD.map(x => x.id);

  const kandidat = [];
  for (let i = 0; i < JUMLAH_KANDIDAT; i++) {
    const v = {
      mekanisme: undiCondong(idMekanisme, pakai.mekanisme, acak),
      hook:      undiCondong(idHook,      pakai.hook,      acak),
      ritme:     undiCondong(idRitme,     pakai.ritme,     acak),
      mood:      undiCondong(idMood,      pakai.mood,      acak),
      pembukaan: undiCondong(labelFoto,   pakai.pembukaan, acak),
    };
    const kunci = kunciVariasi(v);
    if (sudahAda.has(kunci)) continue; // kombinasi persis ini sudah pernah dipakai
    // Jarak ke variasi TERBARU — inilah yang menjaga "terasa beda", bukan sekadar
    // "tidak identik". Dua video yang cuma beda mood terlihat kembar di feed.
    let terdekat = SUMBU_DOMINAN.length;
    for (const lama of terbaru) terdekat = Math.min(terdekat, jarakSumbu(v, lama));
    // Kelangkaan: makin jarang nilainya dipakai, makin tinggi skornya.
    const langka = SUMBU_DOMINAN.reduce((s, sb) => s + 1 / (1 + (pakai[sb].get(v[sb]) ?? 0)), 0);
    kandidat.push({ v, kunci, terdekat, langka });
  }

  if (kandidat.length === 0) return null; // ruang variasi benar-benar habis

  // Tiga tingkat kelonggaran. Turun setingkat HANYA bila tidak ada yang lolos —
  // properti bermaterial tipis (median 4 label) memang akan sampai ke sini, dan
  // menolak menghasilkan apa pun lebih buruk daripada variasi yang agak mirip.
  for (const batas of [MIN_SUMBU_BEDA, 1]) {
    const lolos = kandidat.filter(k => k.terdekat >= batas);
    if (lolos.length > 0) {
      lolos.sort((a, b) => (b.terdekat - a.terdekat) || (b.langka - a.langka));
      const p = lolos[0];
      return { vektor: p.v, kunci: p.kunci, jarakTerdekat: p.terdekat, longgar: batas < MIN_SUMBU_BEDA };
    }
  }
  // Tingkat terakhir: apa pun yang kuncinya belum pernah dipakai.
  kandidat.sort((a, b) => (b.terdekat - a.terdekat) || (b.langka - a.langka));
  const p = kandidat[0];
  return { vektor: p.v, kunci: p.kunci, jarakTerdekat: p.terdekat, longgar: true };
}
