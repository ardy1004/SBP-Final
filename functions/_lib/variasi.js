// Selector variasi — STASIUN KONSEP, tahap PENYARINGAN (kontrak K1 → K4).
//
// SEJAK kontrak K4 (2026-09-05): AI (stasiunKonsep.js) mengusulkan 3 kandidat
// Creative DNA; fungsi di sini MENYARING, bukan memilih dari nol. "AI mengusulkan
// sudut, kode menyaring" — bukan lagi "sistem melempar dadu, AI mengeksekusi"
// seperti LAPIS 3 (viralframe.js) di bawah ini.
//
// ─── Kenapa masih perlu lapis sistem sama sekali ────────────────────────────
// Kalau AI dibiarkan memilih sendirian, rotasi bergantung pada kepatuhan model —
// dan LLM adalah pencari modus: diminta "usulkan sudut berbeda dari sebelumnya"
// berkali-kali dengan prompt yang sama, ia cenderung kembali ke 2-3 pola favorit.
// Prompt sudah menyertakan daftar-hindari (lihat stasiunKonsep.js), tapi itu
// PERMINTAAN, bukan JAMINAN. `saringKandidat()` di sini yang menjaminnya:
// menolak kandidat berkunci identik dengan riwayat, dan memilih yang jaraknya
// paling jauh dari variasi TERBARU kalau ada pilihan.
//
// ⚠️ Fungsi ini SENGAJA MURNI (tanpa DB, tanpa fetch, RNG disuntik dari luar)
// supaya bisa disimulasikan berkali-kali tanpa menyentuh apa pun — pelajaran
// project ini: dua mekanisme anti-pengulangan sebelumnya di sini mati diam-diam
// justru karena tidak pernah bisa diuji terpisah dari DB/AI.
//
// ⚠️ SUMBU_K4 di bawah MENGGANTIKAN `SUMBU_DOMINAN` (viralframe.js, LAPIS 3)
// UNTUK FILE INI. `SUMBU_DOMINAN` lama (mekanisme/hook/ritme/mood/pembukaan)
// tetap ada di viralframe.js sebagai referensi legacy untuk `entriSumbu()` yang
// masih dipakai stasiunStoryboard.js/hook-battle.js/retensi.js versi lama —
// tapi TIDAK LAGI relevan untuk `variation_key`, jadi tidak dipakai di sini.

import { kunciVariasi } from './viralframe.js';

/** Sumbu kontrak K4 (`kunciVariasi()` di viralframe.js) — urutan tidak penting. */
export const SUMBU_K4 = ['sudut', 'hookmek', 'naratif', 'buka'];

/** Berapa variasi terakhir yang dijadikan acuan "harus terasa beda". */
const JENDELA_BEDA = 5;
/** Minimal berapa sumbu K4 yang WAJIB berbeda dari variasi dalam jendela. */
const MIN_SUMBU_BEDA = 2;

/**
 * Ubah `variation_key` kembali jadi objek vektor. Toleran nilai tak dikenal.
 *
 * Generik — bekerja untuk bentuk K4 (`sudut:…|hookmek:…|naratif:…|buka:…`)
 * MAUPUN bentuk lama (`mekanisme:…|hook:…|ritme:…|mood:…|pembukaan:…`), karena
 * hanya membelah `sumbu:nilai` tanpa mengasumsikan nama sumbunya. Baris data
 * lama tetap terbaca tanpa migrasi.
 */
export function uraiKunci(kunci) {
  const v = {};
  for (const bagian of String(kunci ?? '').split('|')) {
    const i = bagian.indexOf(':');
    if (i > 0) v[bagian.slice(0, i)] = bagian.slice(i + 1);
  }
  return v;
}

/** Berapa sumbu K4 yang berbeda antara dua vektor variation_key. */
export function jarakSumbu(a, b) {
  let n = 0;
  for (const s of SUMBU_K4) if ((a?.[s] ?? null) !== (b?.[s] ?? null)) n += 1;
  return n;
}

/**
 * Saring kandidat Creative DNA (dari `susunKonsep()`, stasiunKonsep.js) →
 * satu pemenang, dengan alasan.
 *
 * Tiap entri `kandidat[]` sudah membawa `.dna` berskema K1 PERSIS (lihat
 * `stasiunKonsep.js` — keputusan desain: kandidat mentah AI dibersihkan JADI
 * bentuk K1 `dna` di stasiun sebelumnya, supaya fungsi murni ini tidak perlu
 * tahu apa pun soal bentuk balasan AI mentah).
 *
 * @param {object} opsi
 * @param {Array}  opsi.kandidat        - `{ id, alasan, fakta_pendukung, foto_pendukung,
 *                                          dna, cerita_global, peta_retensi }[]`, urut AI
 *                                          terkuat dulu (dipakai sebagai pemecah seri).
 * @param {string[]} [opsi.riwayatKunci] - `variation_key` listing ini, TERBARU DULU.
 * @param {() => number} [opsi.acak]     - RNG disuntik; dipertahankan untuk stabilitas
 *                                          antarmuka & simulasi deterministik. Pemilihan
 *                                          saat ini sepenuhnya deterministik (jarak lalu
 *                                          peringkat AI selalu memberi total order karena
 *                                          `indeks` tidak pernah kembar), jadi RNG belum
 *                                          dipakai — tempatnya di sini kalau kelak butuh
 *                                          pemecah seri acak, tanpa mengubah signature.
 * @returns {{ indeks:number, kandidat:object, dna:object, kunci:string,
 *             jarakTerdekat:number, kembarDitolak:number, longgar:boolean,
 *             alasan:string } | null}  null bila `kandidat` kosong.
 */
export function saringKandidat({ kandidat = [], riwayatKunci = [], acak = Math.random } = {}) {
  if (!Array.isArray(kandidat) || kandidat.length === 0) return null;
  void acak;

  const riwayat = riwayatKunci.filter(Boolean).map(uraiKunci);
  const sudahAda = new Set(riwayatKunci.filter(Boolean));
  const terbaru = riwayat.slice(0, JENDELA_BEDA); // riwayat dikirim terbaru dulu

  const dinilai = kandidat.map((k, i) => {
    const kunci = kunciVariasi(k?.dna);
    const vektor = uraiKunci(kunci);
    let terdekat = SUMBU_K4.length;
    for (const lama of terbaru) terdekat = Math.min(terdekat, jarakSumbu(vektor, lama));
    return { indeks: i, kandidat: k, kunci, terdekat, kembar: sudahAda.has(kunci) };
  });

  const kembarDitolak = dinilai.filter(d => d.kembar).length;
  // Kandidat berkunci identik dengan riwayat SELALU dibuang duluan — itu bukan
  // "kurang beda", itu PERSIS video yang sudah pernah dibuat untuk listing ini.
  let pool = dinilai.filter(d => !d.kembar);
  // Tiga kandidat AI per panggilan itu SEDIKIT (bukan 240 kandidat acak seperti
  // dadu sistem LAPIS 3 lama) — kalau ketiganya kebetulan kembar dengan riwayat,
  // memaksa gagal total lebih buruk daripada memakai yang ada. Daftar-hindari di
  // prompt stasiunKonsep.js sudah menekan peluang ini; pool kosong seharusnya jarang.
  if (pool.length === 0) pool = dinilai;

  // Kelonggaran bertingkat, semangatnya sama dengan `pilihVariasi` lama: turun
  // setingkat HANYA bila tidak ada yang lolos ambang di atasnya.
  for (const batas of [MIN_SUMBU_BEDA, 1, 0]) {
    const lolos = pool.filter(d => d.terdekat >= batas);
    if (lolos.length === 0) continue;
    // Jarak menang duluan (kebaruan), lalu peringkat AI (indeks kecil = lebih
    // kuat menurut AI) memecah seri — AI sudah mengurutkan "terkuat dulu", tugas
    // sistem cuma memastikan pemenangnya tidak kembar/terlalu mirip riwayat.
    lolos.sort((a, b) => (b.terdekat - a.terdekat) || (a.indeks - b.indeks));
    const menang = lolos[0];
    const label = menang.kandidat?.id ?? `#${menang.indeks + 1}`;
    return {
      indeks: menang.indeks,
      kandidat: menang.kandidat,
      dna: menang.kandidat.dna,
      kunci: menang.kunci,
      jarakTerdekat: menang.terdekat,
      kembarDitolak,
      longgar: batas < MIN_SUMBU_BEDA,
      alasan: kembarDitolak > 0
        ? `Dipilih kandidat ${label} — jarak ${menang.terdekat} sumbu dari variasi terbaru (${kembarDitolak} kandidat lain ditolak karena kembar dengan riwayat).`
        : `Dipilih kandidat ${label} — jarak ${menang.terdekat} sumbu dari variasi terbaru.`,
    };
  }
  return null; // tak tercapai secara praktis: batas 0 selalu meloloskan sisa pool
}
