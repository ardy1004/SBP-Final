// DNA PRODUK & DNA AGENT — identitas yang diulang UTUH di setiap Part.
//
// ─── Kenapa ini objek sistem, bukan trik prompt ──────────────────────────────
// Model video tidak punya memori antar generate. Tiga Part = tiga panggilan
// terpisah yang tidak tahu satu sama lain, jadi satu-satunya cara membuat Monica
// di Part 1 dan Part 3 tampak sebagai orang yang sama adalah MENGULANG seluruh
// ciri penentunya di ketiga prompt. Hal yang sama berlaku untuk propertinya.
//
// ─── Kenapa deterministik, tanpa AI ──────────────────────────────────────────
// Seluruh isinya SUDAH ADA di database: kolom `properties` diisi manusia saat
// input listing, dan `property_images.vf_catatan` diisi stasiun Material. Memanggil
// AI untuk merangkum data yang sudah terstruktur cuma menambah latensi, biaya, dan
// satu titik gagal baru — sekaligus membuka pintu halusinasi pada bagian yang
// justru harus paling akurat.
//
// ⚠️ `TRIM(COALESCE(x,''))`, bukan truthiness biasa. Banyak kolom di produksi
// berisi STRING KOSONG, bukan NULL (`kelurahan` sempat tampak lengkap 533/533
// padahal kosong). `isi()` di bawah menangani keduanya sekaligus.

import { PHOTO_LABELS } from './viralframe.js';

/** Nilai dianggap ada hanya bila bukan null/undefined DAN bukan string kosong. */
function isi(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  return true;
}

function rupiah(n) {
  if (!isi(n) || n <= 0) return null;
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')} miliar`;
  if (n >= 1e6) return `Rp ${Math.round(n / 1e6)} juta`;
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

const TUJUAN_LABEL = {
  dijual: 'dijual',
  disewa: 'disewakan',
  dijual_disewa: 'dijual atau disewakan',
};

const FURNISHED_LABEL = {
  fully: 'furnished lengkap',
  semi: 'semi furnished',
  unfurnished: 'kosongan (unfurnished)',
};

/**
 * Fitur "wow" yang PALING sering dikarang model saat tidak ada di foto.
 *
 * Sengaja BUKAN seluruh PHOTO_LABELS: properti median cuma punya 4 label unik,
 * jadi melarang 20 label sekaligus menghasilkan pagar sepanjang promptnya sendiri
 * dan menenggelamkan yang penting. Daftar ini dipilih dari kelas kesalahan yang
 * sudah benar-benar terjadi — halusinasi "kolam renang", "lantai dua", dan
 * "fully furnished" pada listing yang tidak punya satu pun.
 */
const FITUR_RAWAN = [
  'Kolam Renang', 'Rooftop', 'Gym/Fitness', 'Taman/Halaman',
  'Carport/Garasi', 'Balkon/Teras', 'Walk-in Closet', 'Musholla',
  'Void/Plafon Tinggi', 'Ruang Kerja/Study',
];

/**
 * DNA Produk — fakta terverifikasi, keunikan terlihat, dan pagar larangan.
 *
 * @param {object} prop  baris `properties`
 * @param {Array}  foto  baris `property_images` (butuh label_ruangan, vf_catatan, vf_skor)
 */
export function rakitDnaProduk({ prop, foto = [] }) {
  const fakta = [];
  const tambah = (label, nilai) => { if (isi(nilai)) fakta.push({ label, nilai: String(nilai) }); };

  tambah('Jenis', `${prop.jenis_properti} — ${TUJUAN_LABEL[prop.tujuan] ?? prop.tujuan}`);
  tambah('Harga', rupiah(prop.harga));
  tambah('Lokasi', [prop.kelurahan, prop.kecamatan, prop.kabupaten].filter(isi).join(', '));
  tambah('Luas tanah', isi(prop.luas_tanah) ? `${prop.luas_tanah} m²` : null);
  tambah('Luas bangunan', isi(prop.luas_bangunan) ? `${prop.luas_bangunan} m²` : null);
  tambah('Kamar', [
    isi(prop.jumlah_kamar_tidur) ? `${prop.jumlah_kamar_tidur} kamar tidur` : null,
    isi(prop.jumlah_kamar_mandi) ? `${prop.jumlah_kamar_mandi} kamar mandi` : null,
  ].filter(Boolean).join(', '));
  tambah('Lantai', isi(prop.lantai) ? `${prop.lantai} lantai` : null);
  tambah('Lebar depan', isi(prop.lebar_depan) ? `${prop.lebar_depan} m` : null);
  tambah('Lebar jalan', isi(prop.lebar_jalan_m) ? `${prop.lebar_jalan_m} m` : null);
  // `furnished` dulu tidak pernah dibaca sama sekali — mesin prompt lama
  // menghardcode `fasilitas = 'tidak disebutkan'`, jadi data yang ADA dibuang
  // dan model mengisinya dengan karangan. Ini perbaikan langsung atas itu.
  tambah('Kelengkapan', FURNISHED_LABEL[prop.furnished] ?? null);
  tambah('Legalitas', prop.legalitas);
  tambah('Pendapatan', rupiah(prop.income_per_bulan) ? `${rupiah(prop.income_per_bulan)}/bulan` : null);
  tambah('Sewa per kamar', rupiah(prop.harga_sewa_kamar_bulan) ? `${rupiah(prop.harga_sewa_kamar_bulan)}/bulan` : null);

  // Keunikan = catatan visi pada foto terbaik. Bukan seluruh catatan: yang
  // dipakai hanya foto berskor tinggi, karena catatan pada foto buruk justru
  // menjelaskan KENAPA foto itu buruk ("gelap", "buram") — bukan nilai jual.
  const keunikan = [...foto]
    .filter(f => isi(f.vf_catatan) && (f.vf_skor ?? 0) >= 60)
    .sort((a, b) => (b.vf_skor ?? 0) - (a.vf_skor ?? 0))
    .slice(0, 5)
    .map(f => `${f.label_ruangan}: ${String(f.vf_catatan).trim()}`);

  const adaLabel = new Set(
    foto.map(f => (f.label_ruangan ?? '').trim()).filter(Boolean),
  );
  const ruangTerbukti = PHOTO_LABELS.filter(l => adaLabel.has(l));

  const larangan = FITUR_RAWAN.filter(l => !adaLabel.has(l));
  if (!isi(prop.furnished)) larangan.push('status furnished (tidak tercatat di data)');
  if (!isi(prop.lantai)) larangan.push('jumlah lantai (tidak tercatat di data)');
  // ⚠️ Kelas larangan yang BUKAN ruangan, dan yang paling mudah terlewat.
  // Terjadi 2026-09-04: dialog mengucapkan "lima ratus meter dari Tugu Jogja"
  // padahal judul listing cuma menulis "Dekat Tugu Jogja" tanpa angka. Klaim
  // jarak itu spesifik, mudah dicek pembeli, dan tidak pernah ada di data —
  // sementara aturan hook kita justru menuntut angka konkret. Tanpa larangan
  // eksplisit ini, model mengisi tuntutan itu dengan karangan.
  larangan.push('jarak atau waktu tempuh dalam ANGKA ke tempat mana pun '
    + '(mis. "500 meter dari X", "5 menit ke Y") kecuali angkanya tertulis di FAKTA di atas');

  return { fakta, keunikan, ruangTerbukti, larangan };
}

/**
 * Kamus ciri agent Indonesia → Inggris.
 *
 * 🔥 Prompt Google Flow berbahasa INGGRIS. Sebelum 2026-09-04 nilai kolom
 * dimasukkan MENTAH, sehingga prompt produksi benar-benar berbunyi
 * "26-year-old, asia_tenggara, man, wearing profesional, wajah tampan, badan
 * berotot, gagah" — campuran token Indonesia + snake_case yang dibaca Veo
 * sebagai kebisingan, bukan deskripsi orang. Itu salah satu sebab hasilnya
 * "tidak konsisten dengan reference image".
 *
 * Isinya pendek dan berulang (diukur ke D1: `etnik` satu nilai, `style` satu
 * nilai, `ciri_fisik` frasa 2-5 kata), jadi kamus kecil sudah menutup hampir
 * semuanya. Yang TIDAK dikenali sengaja DIBUANG, bukan diloloskan: foto
 * referensi Subject sudah membawa penampilan, dan menyisipkan kata Indonesia
 * ke prompt Inggris lebih merusak daripada tidak menyebutnya sama sekali.
 * Hasil terjemahannya ditampilkan di Panel Bahan supaya bisa dilihat & dikoreksi.
 */
const CIRI_EN = {
  asia_tenggara: 'Southeast Asian', asia_timur: 'East Asian', kaukasia: 'Caucasian',
  indonesia: 'Indonesian', jawa: 'Javanese Indonesian', sunda: 'Sundanese Indonesian',
  profesional: 'professional business attire', kasual: 'smart casual outfit',
  formal: 'formal attire', santai: 'relaxed casual outfit', modis: 'fashionable outfit',
  'hijab muslimah': 'wearing a hijab', hijab: 'wearing a hijab', berhijab: 'wearing a hijab',
  'rambut panjang': 'long hair', 'rambut pendek': 'short hair', 'rambut sebahu': 'shoulder-length hair',
  'rambut lurus': 'straight hair', 'rambut ikal': 'wavy hair', 'rambut keriting': 'curly hair',
  hitam: 'black', pirang: 'blonde', blonde: 'blonde', coklat: 'brown',
  'wajah tampan': 'handsome face', 'wajah cantik': 'attractive face',
  'badan berotot': 'athletic build', gagah: 'strong build', ramping: 'slim build', tinggi: 'tall',
  berkacamata: 'wearing glasses', berjenggot: 'with a beard', berkumis: 'with a moustache',
};

/**
 * Terjemahkan frasa ciri; bagian yang tak dikenal dibuang.
 * @returns {string} kosong bila tidak ada satu pun bagian yang dikenali.
 */
function keInggris(teks) {
  if (!isi(teks)) return '';
  const bersih = String(teks).toLowerCase().replace(/\(([^)]*)\)/g, ' $1 ');
  // Frasa terpanjang diuji lebih dulu supaya "rambut panjang" menang atas "panjang".
  const kunci = Object.keys(CIRI_EN).sort((a, b) => b.length - a.length);
  const out = [];
  let sisa = ` ${bersih} `;
  for (const k of kunci) {
    const re = new RegExp(`(?<![a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'g');
    if (re.test(sisa)) {
      out.push(CIRI_EN[k]);
      sisa = sisa.replace(re, ' ');
    }
  }
  // Dipisah koma: "athletic build handsome face strong build" terbaca sebagai
  // satu frasa rusak, sedangkan daftar bersanding dibaca sebagai ciri terpisah.
  return out.join(', ').trim();
}

/**
 * DNA Agent — ciri yang WAJIB identik di ketiga Part.
 *
 * Dipisah `wajahSuara` (tidak boleh berubah antar Part) dari `bahasaInggris`
 * (bentuk siap tempel ke prompt Veo yang memang berbahasa Inggris). Keduanya
 * berasal dari baris yang sama supaya tidak mungkin melenceng satu sama lain.
 */
export function rakitDnaAgent(agent) {
  const ciri = [];
  if (isi(agent.usia)) ciri.push(`${agent.usia} tahun`);
  if (isi(agent.etnik)) ciri.push(agent.etnik);
  if (isi(agent.gender)) ciri.push(agent.gender);
  if (isi(agent.style)) ciri.push(agent.style);
  if (isi(agent.ciri_fisik)) ciri.push(agent.ciri_fisik);

  const bahasaInggris = [
    isi(agent.usia) ? `${agent.usia}-year-old` : null,
    keInggris(agent.etnik) || 'Indonesian',
    agent.gender === 'Wanita' ? 'woman' : agent.gender === 'Pria' ? 'man' : 'presenter',
    keInggris(agent.style) ? `wearing ${keInggris(agent.style)}` : null,
    keInggris(agent.ciri_fisik) || null,
  ].filter(Boolean).join(', ');

  return {
    nama: agent.nama,
    fotoUrl: agent.foto_url ?? null,
    ciri,
    bahasaInggris,
    // Timbre suara sengaja ditulis sebagai sifat, bukan kecepatan bicara.
    // "Berbicara cepat tanpa jeda" pernah dihardcode di setiap dialog dan
    // membuat Veo/Flow membacanya sebagai arahan akting → suara robotik.
    // Kendalikan KARAKTER suara + anggaran waktu, jangan kecepatannya.
    suara: agent.gender === 'Pria'
      ? 'warm mid-range male voice, relaxed conversational delivery'
      : 'warm mid-range female voice, relaxed conversational delivery',
  };
}

/** Blok teks DNA siap sisip ke prompt penyusun storyboard. */
export function dnaKeTeks(dna) {
  const baris = [];
  baris.push('FAKTA TERVERIFIKASI (hanya ini yang boleh disebut sebagai fakta)');
  for (const f of dna.fakta) baris.push(`- ${f.label}: ${f.nilai}`);
  if (dna.keunikan.length) {
    baris.push('', 'KEUNIKAN YANG TERLIHAT DI FOTO');
    for (const k of dna.keunikan) baris.push(`- ${k}`);
  }
  if (dna.ruangTerbukti.length) {
    baris.push('', `RUANG YANG ADA FOTONYA: ${dna.ruangTerbukti.join(', ')}`);
  }
  if (dna.larangan.length) {
    baris.push('', 'DILARANG DISEBUT — tidak ada buktinya di listing ini');
    baris.push(`- ${dna.larangan.join(', ')}`);
  }
  return baris.join('\n');
}
