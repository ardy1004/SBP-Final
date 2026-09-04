// RETENTION CHECKER — gerbang cacat DETERMINISTIK. Nol AI, nol I/O, nol biaya.
//
// ─── Kenapa daftar cacat, bukan skor 0-100 ───────────────────────────────────
// Skor viral gaya Opus Clip terlihat canggih dan menyesatkan: diukur 2026, klip
// berskor 40 rutin mengalahkan klip berskor 85. Riset LLM-as-judge menjelaskan
// kenapa — skor ABSOLUT tidak terkalibrasi ("7 dari 10" berarti beda tiap hari,
// bahkan untuk model yang sama), sementara perbandingan BERPASANGAN jauh lebih
// akurat. Jadi: angka subjektif diserahkan ke Adu Hook (berpasangan, dua arah),
// dan file ini hanya memeriksa hal-hal yang punya jawaban benar-salah.
//
// Semua pemeriksaan di sini bisa dijawab kode tanpa menebak. Yang TIDAK bisa —
// "apakah hook ini menarik" — sengaja tidak ada di sini.
//
// ─── Sifatnya PENASIHAT, bukan pemblokir ─────────────────────────────────────
// Manusia adalah gerbang di alur ini (Google Flow tidak punya API render), jadi
// user tetap boleh lanjut dengan cacat yang ia terima. Yang wajib adalah cacatnya
// TERLIHAT dan SPESIFIK — "Part 2 kelebihan 9 kata" bisa langsung diperbaiki,
// "skor 62" tidak.
//
// Dipanggil dua tempat dari SATU modul ini: server (saat storyboard jadi, supaya
// catatannya ikut tersimpan di `hasil_json`) dan browser (supaya hasilnya
// dihitung ulang seketika setelah hook diganti lewat Adu Hook). Satu definisi,
// dua pemanggil — tidak ada duplikasi yang bisa drift, jadi tidak butuh script
// penjaga seperti yang dulu menjaga tiga jalur prompt paralel.

import { anggaranKata, entriSumbu, FLOW } from './viralframe.js';

/**
 * Patokan retensi 2026 — ditampilkan sebagai konteks, bukan sebagai prediksi.
 * Angkanya milik platform, bukan hasil hitungan kita, jadi jangan pernah
 * disajikan seolah checker ini memprediksi retensi video tertentu.
 */
export const PATOKAN = {
  tiktok_15_30: { target: 50, kuat: 65 },
  hook_3_detik: 'Hook 3 detik pertama menentukan distribusi — 63% video ber-CTR tertinggi mengunci di sana.',
  diagnosis: 'Jatuh curam di awal = hook. Turun pelan di tengah = pacing. Jatuh di ujung = ending menggantung.',
};

const SAPAAN = /^\s*(halo|hallo|haloo|hai+|hi\b|hey|selamat\s+(pagi|siang|sore|malam)|perkenalkan|assalamu|apa\s+kabar)/i;

// Nominal harga terucap. `nego`/`nett` tidak ikut — itu istilah, bukan nominal.
const NOMINAL = /\b(rp\.?\s*\d|rupiah|\d+\s*(juta|jt|miliar|milyar|m\b)|harganya\s+\d)/i;

// Penanda "hook ini konkret": angka, satuan, atau kata ukur properti.
const KONKRET = /\d|\bm²|\bmeter\b|\bkamar\b|\bmenit\b|\blantai\b|\bhektar\b|\bare\b/i;

// Kata kerja ajakan per tipe CTA — dipakai memastikan OBJEK ajakannya tidak
// menguap jadi ajakan umum ("hubungi kami ya"). Kunci = CTA_PILIHAN.
const JEJAK_CTA = {
  dm_info:  ['dm', 'pesan langsung', 'inbox'],
  komentar: ['komen', 'komentar', 'tulis di bawah'],
  link_bio: ['link', 'bio'],
  simpan:   ['simpan', 'save', 'bookmark'],
  wa:       ['chat', 'whatsapp', 'wa '],
  survei:   ['survei', 'survey', 'lihat langsung', 'jadwalkan'],
};

function hitungKata(teks) {
  return String(teks ?? '').trim().split(/\s+/).filter(Boolean).length;
}

// Klaim jarak / waktu tempuh: "500 meter dari Tugu", "5 menit ke kampus".
// Angka semacam ini SPESIFIK, MUDAH DICEK ORANG, dan hampir tak pernah ada di
// data listing — kombinasi terburuk untuk sebuah iklan.
const KLAIM_JARAK = /(\d[\d.,]*)\s*(meter|metre|m\b|km|kilometer|menit)\s+(dari|ke|menuju)\b/gi;

// Angka yang ditulis sebagai KATA — model rutin memakainya untuk voiceover
// ("lima ratus meter dari Tugu"), dan pemeriksaan berbasis digit akan melewatkannya.
const ANGKA_KATA = '(?:se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu)';
const KLAIM_JARAK_KATA = new RegExp(
  `((?:${ANGKA_KATA}[\\s-]*)+)\\s*(meter|kilometer|menit)\\s+(dari|ke|menuju)\\b`, 'gi');

/**
 * @param {object} ir      hasil susunStoryboard (punya .parts[], .variasi)
 * @param {object} params  parameter manusia (jumlahPart, detikPerPart, voDetikPerPart, cta)
 * @param {object} [dna]   DNA Produk — dipakai memeriksa klaim jarak yang dikarang.
 *                         Boleh kosong; pemeriksaan itu dilewati, bukan gagal.
 * @returns {{lolos: boolean, cacat: Array, ringkas: string}}
 */
export function periksaRetensi({ ir, params, dna = null }) {
  const cacat = [];
  const catat = (part, jenis, pesan, berat = 'sedang') => cacat.push({ part, jenis, pesan, berat });

  const parts = Array.isArray(ir?.parts) ? ir.parts : [];
  if (parts.length === 0) {
    return { lolos: false, ringkas: 'Storyboard kosong.', cacat: [{ part: null, jenis: 'kosong', pesan: 'Tidak ada Part sama sekali.', berat: 'tinggi' }] };
  }

  const maksKata = anggaranKata(params.voDetikPerPart);
  const cutTarget = entriSumbu('ritme', ir?.variasi?.ritme)?.cutPerPart ?? null;
  const totalDetik = parts.length * params.detikPerPart;

  // Seluruh fakta listing sebagai satu teks huruf kecil — dasar pemeriksaan
  // klaim jarak. Kalau DNA tidak dikirim, pemeriksaan itu dilewati diam-diam:
  // lebih baik tidak memeriksa daripada menuduh setiap angka sebagai karangan.
  const teksDna = dna
    ? [
        ...(dna.fakta ?? []).map(f => `${f.label} ${f.nilai}`),
        ...(dna.keunikan ?? []),
      ].join(' | ').toLowerCase()
    : null;

  let totalCut = 0;

  parts.forEach((p, i) => {
    const nomor = i + 1;
    const dialog = String(p.dialog ?? '').trim();
    const cuts = Array.isArray(p.cuts) ? p.cuts : [];
    totalCut += cuts.length;

    // ── Anggaran kata ────────────────────────────────────────────────────────
    // Rentang, BUKAN plafon. Dialog yang terlalu pendek membuat model video
    // mengisi sisa klip dengan mengulang frasa dan tersendat — kegagalan yang
    // sudah benar-benar terjadi pada Part CTA (17 kata untuk klip 10 detik).
    const kata = hitungKata(dialog);
    if (kata === 0) {
      catat(nomor, 'dialog_kosong', `Part ${nomor} tidak punya dialog.`, 'tinggi');
    } else if (kata < Math.round(maksKata * 0.9)) {
      catat(nomor, 'kata_kurang',
        `Part ${nomor}: ${kata} kata, target ${Math.round(maksKata * 0.9)}–${maksKata}. Kekurangan ${Math.round(maksKata * 0.9) - kata} kata — sisa klip akan diisi model dengan mengulang frasa.`,
        'tinggi');
    } else if (kata > maksKata) {
      catat(nomor, 'kata_lebih',
        `Part ${nomor}: ${kata} kata, maksimal ${maksKata} untuk voiceover ${params.voDetikPerPart} detik. Kelebihan ${kata - maksKata} kata akan terpotong.`,
        'tinggi');
    }

    // ── Klaim jarak yang tidak ada di data ───────────────────────────────────
    //
    // Terjadi sungguhan 2026-09-04: dialog mengucapkan "Hanya lima ratus meter
    // dari Tugu Jogja" padahal judul listing cuma menulis "Dekat Tugu Jogja" —
    // tanpa satu pun angka. AI mengarang jarak yang spesifik dan mudah dicek.
    //
    // Bukan kebetulan: aturan keras kita MENDORONG hook memuat "hal konkret
    // (angka, ukuran, nama tempat)" tanpa mengikat dari mana angkanya berasal.
    // Kita memberi insentif spesifik tanpa mengikat sumbernya.
    if (teksDna) {
      for (const re of [KLAIM_JARAK, KLAIM_JARAK_KATA]) {
        re.lastIndex = 0;
        let k;
        while ((k = re.exec(dialog)) !== null) {
          const angka = k[1].trim().toLowerCase();
          if (!teksDna.includes(angka)) {
            catat(nomor, 'jarak_dikarang',
              `Part ${nomor} menyebut "${k[0].trim()}" — angka itu TIDAK ADA di fakta listing. `
              + 'Jarak yang dikarang mudah dicek pembeli dan merusak kepercayaan; sebut kedekatannya tanpa angka.',
              'tinggi');
          }
        }
      }
    }

    // ── Harga tidak boleh diucapkan ──────────────────────────────────────────
    if (NOMINAL.test(dialog)) {
      catat(nomor, 'harga_diucapkan',
        `Part ${nomor} menyebut nominal harga dalam dialog. Harga hanya boleh lewat teks layar — Google Flow pernah menolak dialog berisi harga + ajakan + urgensi.`,
        'tinggi');
    }

    // ── Cut & ritme ──────────────────────────────────────────────────────────
    if (cuts.length === 0) {
      catat(nomor, 'tanpa_cut', `Part ${nomor} tidak punya cut.`, 'tinggi');
    } else {
      const fotoUnik = new Set(cuts.map(c => c.foto_id)).size;
      if (fotoUnik > FLOW.refImagePerPart) {
        catat(nomor, 'foto_lebih',
          `Part ${nomor} memakai ${fotoUnik} foto, batas ${FLOW.refImagePerPart} per generate.`,
          'tinggi');
      }
      if (cutTarget != null && Math.abs(cuts.length - cutTarget) > 1) {
        catat(nomor, 'ritme_meleset',
          `Part ${nomor}: ${cuts.length} cut, ritme "${entriSumbu('ritme', ir.variasi.ritme)?.label}" menargetkan ${cutTarget}. Variasi yang tidak sampai ke layar membuat rotasi cuma beda di teks.`);
      }
    }
  });

  // ── Hook: 3 detik pertama menentukan segalanya ─────────────────────────────
  const hook = String(parts[0]?.dialog ?? '').trim();
  if (SAPAAN.test(hook)) {
    catat(1, 'hook_sapaan',
      'Part 1 dibuka dengan sapaan. Sapaan tidak membawa informasi dan bisa dipasang di listing mana pun — penonton scroll sebelum isinya muncul.',
      'tinggi');
  }
  if (hook && !KONKRET.test(hook)) {
    catat(1, 'hook_kabur',
      'Hook tidak memuat satu pun angka, ukuran, atau detail konkret. Buka dengan hal paling spesifik dari properti ini, bukan klaim umum.',
      'tinggi');
  }

  // ── Teks layar: sebagian besar video sosial ditonton TANPA SUARA ───────────
  if (!String(parts[0]?.teks_layar ?? '').trim()) {
    catat(1, 'teks_layar_kosong',
      'Part 1 tanpa teks layar. Banyak penonton menonton tanpa suara — tanpa teks, hook-nya tidak sampai sama sekali.',
      'tinggi');
  }
  const terakhir = parts[parts.length - 1];
  if (!String(terakhir?.teks_layar ?? '').trim()) {
    catat(parts.length, 'cta_tanpa_teks',
      `Part ${parts.length} (CTA) tanpa teks layar. Ini satu-satunya kanal yang boleh menampilkan harga dan spesifikasi.`);
  }

  // ── CTA masih punya objek ──────────────────────────────────────────────────
  const jejak = JEJAK_CTA[params.cta] ?? [];
  const dialogAkhir = String(terakhir?.dialog ?? '').toLowerCase();
  if (jejak.length && !jejak.some(k => dialogAkhir.includes(k))) {
    catat(parts.length, 'cta_kabur',
      `Ajakan di Part terakhir tidak menyebut objek CTA yang dipilih ("${params.cta}"). Diksi boleh berbeda, objek ajakannya tidak boleh diganti jadi ajakan umum.`,
      'tinggi');
  }

  // ── Kepadatan potongan seluruh video ───────────────────────────────────────
  //
  // 🔥 HANYA dipakai bila RITME TIDAK DIKETAHUI.
  //
  // Kepadatan cut ADALAH keputusan sumbu `ritme`, dan sumbu itu dipilih SISTEM
  // sebelum AI menulis apa pun. Menerapkan aturan absolut di atasnya berarti
  // memerintahkan sesuatu lalu menghukum kepatuhannya. Terukur 2026-09-04:
  // aturan lama (min = totalDetik/5, maks = totalDetik/2,5) menghukum
  // **7 dari 12 kombinasi (jumlah Part × ritme)** padahal AI patuh 100% —
  // `tunggal` dan `montase_cepat` DIJAMIN gagal di semua konfigurasi.
  // Contoh nyata: pesanan 3 memakai `montase_cepat` (5 cut), AI menghasilkan
  // tepat 5, lalu checker menyebutnya "terlalu banyak (3-4)".
  //
  // Kepatuhan pada ritme sudah diperiksa per Part lewat `ritme_meleset` di atas,
  // dan ITU pemeriksaan yang benar: bukan "berapa cut yang ideal", melainkan
  // "apakah cut-nya sesuai gaya yang sudah ditetapkan".
  //
  // Kelas bug yang sama dengan `MEKANISME.hitung_angka` yang dulu menyuruh AI
  // menyebut harga padahal aturan keras melarangnya.
  if (cutTarget == null) {
    const minCut = Math.max(3, Math.round(totalDetik / 5));
    const maksCut = Math.round(totalDetik / 2.5);
    if (totalCut < minCut) {
      catat(null, 'pacing_datar',
        `Total ${totalCut} cut untuk ${totalDetik} detik — terlalu sedikit (${minCut}–${maksCut}). Penurunan pelan di tengah video adalah masalah pacing.`);
    } else if (totalCut > maksCut) {
      catat(null, 'terlalu_ramai',
        `Total ${totalCut} cut untuk ${totalDetik} detik — terlalu banyak (${minCut}–${maksCut}). Potongan berlebihan biasanya menutupi konsep yang lemah.`);
    }
  }

  const berat = cacat.filter(c => c.berat === 'tinggi').length;
  return {
    lolos: cacat.length === 0,
    cacat,
    ringkas: cacat.length === 0
      ? `Bersih — ${totalCut} cut, ${totalDetik} detik, semua Part dalam anggaran kata.`
      : `${cacat.length} catatan${berat ? `, ${berat} perlu diperbaiki` : ''}.`,
  };
}
