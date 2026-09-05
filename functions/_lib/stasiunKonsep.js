// STASIUN KONSEP — AI mengusulkan sudut cerita, SISTEM menyaring (kontrak K1).
//
// Membalik urutan lama HANYA untuk lapis kreatif: dulu sistem melempar dadu
// (mekanisme+hook+ritme+mood) SEBELUM AI memahami listing sama sekali, lalu AI
// dipaksa mengeksekusinya — perhatian model habis untuk "jangan salah", bukan
// "buat cerita terbaik". Di sini AI membaca fakta & foto DULU, MENEMUKAN kenapa
// listing ini menarik, baru mengusulkan sudut. Sistem tetap menyaring supaya
// rotasi tertegakkan DATABASE-level (lihat `saringKandidat()` di variasi.js) —
// AI tidak pernah jadi satu-satunya penjaga variasi, persis alasan LAPIS 3
// (viralframe.js) sistem yang melempar dadu, bukan LLM.
//
// ─── Kenapa cerita_global/peta_retensi dititip di TIAP kandidat ─────────────
// K1 (rencana v2) menaruh `cerita_global`/`peta_retensi` di level konsep akhir
// (sesudah disaring), tapi satu panggilan AI hanya bisa menulis SATU cerita
// global yang koheren — dan sistem baru tahu kandidat mana yang MENANG setelah
// AI selesai menjawab. Kalau hanya kandidat teratas versi AI yang dibekali
// cerita_global, dan sistem justru memilih kandidat lain (karena kandidat
// teratas kebetulan kembar dengan riwayat listing ini), storyboard kehilangan
// cerita globalnya sama sekali. Solusinya: minta AI merakit cerita_global DAN
// peta_retensi untuk KETIGA kandidat sekaligus, supaya siapa pun yang menang
// penyaringan sudah siap dieksekusi Stasiun Storyboard tanpa panggilan AI kedua.
//
// ─── Bentuk internal `kandidat[]` (keputusan desain, bukan dari K1 mentah) ──
// Contoh JSON K1 di rencana v2 hanya menulis `{id, sudut, alasan,
// fakta_pendukung, foto_pendukung}` per kandidat — tidak cukup untuk menghitung
// `variation_key` (butuh hook_mekanisme + struktur_naratif + foto_pembuka juga)
// maupun untuk siap dieksekusi tanpa panggilan AI kedua (butuh cerita_global +
// peta_retensi). Jadi tiap kandidat yang dikembalikan fungsi ini punya bentuk
// LEBIH KAYA dari contoh minimal itu:
//   { id, alasan, fakta_pendukung, foto_pendukung,
//     dna: { ...10 field skema K1 `dna`, TEPAT... },
//     cerita_global, peta_retensi }
// `dna` di sini SUDAH persis skema K1 (bukan skema AI mentah) — `saringKandidat()`
// di variasi.js tinggal memanggil `kunciVariasi(kandidat.dna)` langsung, tanpa
// perlu tahu bentuk mentah balasan AI sama sekali.

import { PROVIDERS, getProviderKey, callChatCompletion } from './aiProviders.js';
import { SUDUT, HOOK_MEKANISME, STRUKTUR_NARATIF, MOOD } from './viralframe.js';
import { uraiJsonModel } from './visiFoto.js';
import { uraiKunci } from './variasi.js';
import { rakitDnaProduk, dnaKeTeks } from './dnaProduk.js';

const URUTAN = ['gemini', 'deepseek', 'mistral', 'groq'];

/** Field skema K1 `dna` — urutan tidak penting, kelengkapan yang penting. */
const FIELD_DNA = [
  'sudut', 'hook_mekanisme', 'pemicu_psikologis', 'struktur_naratif', 'foto_pembuka',
  'urutan_informasi', 'profil_pacing', 'bahasa_kamera', 'payoff', 'gaya_cta',
  // ⚠️ `mood` DITAMBAHKAN 2026-09-05, sesudah audit v2.
  //
  // Rencana v2 mencopot MOOD dari sumbu variasi (dulu dilempar dadu) tapi LUPA
  // memberi penggantinya. Akibatnya `ir.variasi.mood` tidak pernah terisi dan
  // `flowCompiler` selalu jatuh ke fallback: SETIAP video keluar dengan
  // "Style: natural color grade …" dan "Music: subtle background bed" yang
  // IDENTIK — bukan variasi berkurang, melainkan hilang sama sekali. Fatal untuk
  // fitur yang seluruh tujuannya rotasi 100 variasi per listing.
  //
  // Dikembalikan sebagai keputusan AI, bukan dadu: ia sudah membaca fakta & foto,
  // jadi "hangat" untuk rumah keluarga dan "sinematik" untuk komersial premium
  // lebih tepat daripada undian. SENGAJA TIDAK masuk `variation_key` (K4) —
  // mood adalah sumbu KOSMETIK; dua video yang cuma beda warna terlihat kembar
  // di feed, dan menghitungnya sebagai variasi baru membuat plafon 100 tercapai
  // tanpa satu pun video yang benar-benar berbeda.
  'mood',
];

/** Nilai `mood` yang sah — id dari katalog MOOD. Di luar ini dibuang ke null. */
const MOOD_SAH = new Set(MOOD.map(m => m.id));

function katalogTeks(daftar) {
  return daftar.map(x => `  - ${x.label}: ${x.kapan_cocok}`).join('\n');
}

function daftarFotoTeks(foto) {
  return foto.map((f, i) =>
    `  ${i + 1}. [id ${f.id}] ${f.label_ruangan}${f.vf_skor != null ? ` (skor ${f.vf_skor})` : ''}${f.vf_catatan ? ` — ${f.vf_catatan}` : ''}`
  ).join('\n');
}

/**
 * Daftar kombinasi yang sudah dipakai listing ini, dibaca dari `variation_key`
 * (kontrak K4). Slug kehilangan spasi tapi tetap terbaca sebagai panduan
 * "jangan ulangi arah ini" — cukup untuk mengarahkan AI, tidak perlu presisi.
 */
function daftarHindari(riwayatKunci) {
  return riwayatKunci.slice(0, 10).map(k => {
    const v = uraiKunci(k);
    return `  - sudut mirip "${v.sudut ?? '?'}", mekanisme hook "${v.hookmek ?? '?'}", struktur "${v.naratif ?? '?'}", dibuka foto id ${v.buka ?? '?'}`;
  }).join('\n');
}

function buatSystem() {
  return `Kamu creative director video pendek properti Indonesia. Tugasmu MENGANALISIS satu listing dan MENEMUKAN sudut cerita paling menarik darinya — bukan menulis naskah, dan bukan memilih dari template siap pakai.

Jawab HANYA JSON valid. Tanpa markdown, tanpa kalimat pembuka.`;
}

function buatUser({ dnaProduk, foto, riwayatKunci }) {
  const hindari = riwayatKunci.length
    ? `\nHINDARI KOMBINASI YANG SUDAH DIPAKAI LISTING INI (buat sudut yang terasa BEDA, bukan variasi kata dari ini)\n${daftarHindari(riwayatKunci)}\n`
    : '';
  const fotoContoh = foto[0]?.id ?? 1;

  return `${dnaKeTeks(dnaProduk)}

FOTO YANG TERSEDIA (pilih HANYA id dari daftar ini untuk foto_pembuka/foto_pendukung — JANGAN mengarang id)
${daftarFotoTeks(foto)}
${hindari}
KATALOG SUDUT CERITA — panduan; boleh kamu tulis sudutmu sendiri kalau lebih pas untuk listing ini
${katalogTeks(SUDUT)}

KATALOG MEKANISME HOOK — panduan untuk 2 detik pertama
${katalogTeks(HOOK_MEKANISME)}

KATALOG STRUKTUR NARATIF — panduan bentuk arc cerita seluruh video
${katalogTeks(STRUKTUR_NARATIF)}

KATALOG MOOD — pilih SATU id, PERSIS seperti tertulis (menentukan warna & musik video)
${MOOD.map(m => `  - ${m.id} (${m.label}): ${m.arahan}`).join('\n')}

TUGASMU
1. Baca FAKTA TERVERIFIKASI, KEUNIKAN, dan FOTO di atas. Temukan creative opportunity
   yang SPESIFIK untuk properti ini — bukan sudut generik yang bisa dipasang di
   listing mana pun.
2. Usulkan TEPAT 3 kandidat, urut dari yang PALING kuat. Ketiganya WAJIB berbeda
   satu sama lain pada sudut, mekanisme hook, ATAU struktur naratif — bukan tiga
   cara mengatakan hal yang sama dengan kata yang berbeda.
3. Untuk TIAP kandidat (bukan cuma yang terkuat), rakit Creative DNA LENGKAP
   sekaligus cerita globalnya — supaya kandidat mana pun yang dipilih sistem
   nanti sudah siap dieksekusi tanpa kamu dipanggil ulang.
4. WAJIB berpijak pada FAKTA TERVERIFIKASI / KEUNIKAN di atas. DILARANG KERAS
   mengarang fakta, jarak, atau fitur yang tidak tercantum di sana — patuhi juga
   daftar DILARANG DISEBUT bila ada.

KELUARAN JSON — tepat 3 objek di "kandidat", tiap objek berisi SEMUA field berikut
{
  "audiens": {"utama":"deskripsi singkat audiens paling relevan","keinginan":"...","keberatan":"...","pemicu":"pemicu psikologis dominan"},
  "kandidat": [
    {
      "id": "A",
      "sudut": "sudut cerita SPESIFIK untuk listing ini, 1 kalimat",
      "alasan": "kenapa sudut ini kuat untuk listing ini, 1-2 kalimat jujur",
      "fakta_pendukung": ["fakta dari FAKTA TERVERIFIKASI di atas yang mendukung sudut ini"],
      "foto_pendukung": [${fotoContoh}],
      "hook_mekanisme": "mekanisme pembuka spesifik untuk sudut ini, 1 kalimat",
      "pemicu_psikologis": "satu dorongan psikologis audiens yang disasar",
      "struktur_naratif": "bentuk arc cerita untuk sudut ini, 1 kalimat",
      "foto_pembuka": ${fotoContoh},
      "urutan_informasi": ["lokasi", "skala", "interior", "cta"],
      "profil_pacing": "pola tempo untuk sudut ini, 1 frasa singkat",
      "bahasa_kamera": "gaya gerak kamera dominan untuk sudut ini, 1 frasa singkat",
      "mood": "SATU id dari KATALOG MOOD di atas, persis apa adanya (mis. hangat)",
      "payoff": "apa yang penonton dapat di akhir video",
      "gaya_cta": "gaya ajakan penutup yang cocok dengan sudut ini, 1 frasa",
      "cerita_global": {
        "janji": "janji yang dibuka di Part 1",
        "part1_open_loop": "celah informasi yang ditinggalkan Part 1",
        "part2_payoff": "apa yang dijawab Part 2",
        "part2_open_loop": "celah baru yang dibuka Part 2",
        "part3_payoff": "apa yang dijawab Part 3/CTA"
      },
      "peta_retensi": {"0_3":"yang menahan 3 detik pertama","3_10":"...","10_20":"...","20_30":"..."}
    }
  ]
}
Tepat 3 kandidat, tiap kandidat berisi SEMUA field di atas. "foto_pembuka" dan
tiap angka di "foto_pendukung" WAJIB id nyata dari daftar FOTO di atas.`;
}

function bentukAudiens(a) {
  const o = a && typeof a === 'object' ? a : {};
  return {
    utama: String(o.utama ?? '').slice(0, 120),
    keinginan: String(o.keinginan ?? '').slice(0, 300),
    keberatan: String(o.keberatan ?? '').slice(0, 300),
    pemicu: String(o.pemicu ?? '').slice(0, 200),
  };
}

function bentukCeritaGlobal(c) {
  const o = c && typeof c === 'object' ? c : {};
  return {
    janji: String(o.janji ?? '').slice(0, 300),
    part1_open_loop: String(o.part1_open_loop ?? '').slice(0, 300),
    part2_payoff: String(o.part2_payoff ?? '').slice(0, 300),
    part2_open_loop: String(o.part2_open_loop ?? '').slice(0, 300),
    part3_payoff: String(o.part3_payoff ?? '').slice(0, 300),
  };
}

function bentukPetaRetensi(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    '0_3': String(o['0_3'] ?? '').slice(0, 200),
    '3_10': String(o['3_10'] ?? '').slice(0, 200),
    '10_20': String(o['10_20'] ?? '').slice(0, 200),
    '20_30': String(o['20_30'] ?? '').slice(0, 200),
  };
}

/**
 * Panggil AI, kembalikan kandidat K1 TERVERIFIKASI — belum disaring (lihat
 * `saringKandidat()` di variasi.js untuk pemilihan pemenang).
 *
 * @param {object} env
 * @param {object} opts
 * @param {object} opts.prop              baris `properties`
 * @param {Array}  opts.foto              baris `property_images` berlabel (dari ambilFotoListing)
 * @param {string[]} [opts.riwayatKunci]  `variation_key` listing ini, TERBARU DULU
 * @param {object|null} [opts.dnaProdukOverride] DNA Produk hasil koreksi manusia di Panel Bahan
 * @returns {Promise<{ ok:true, provider:string, dnaProduk:object, audiens:object, kandidat:Array }
 *                  | { ok:false, error:string }>}
 */
export async function susunKonsep(env, { prop, foto, riwayatKunci = [], dnaProdukOverride = null }) {
  const dnaProduk = dnaProdukOverride ?? rakitDnaProduk({ prop, foto });
  const systemPrompt = buatSystem();
  const userPrompt = buatUser({ dnaProduk, foto, riwayatKunci });

  let raw = null, dipakai = null, errTerakhir = null;
  for (const prov of URUTAN) {
    const key = await getProviderKey(env, prov);
    if (!key) continue;
    const r = await callChatCompletion({
      provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
      systemPrompt, userPrompt,
      maxTokens: 3400, temperature: 0.9,
      reasoningEffort: prov === 'gemini' ? 'none' : undefined,
      timeoutMs: 20000,
    });
    if (r.ok) { raw = r.content; dipakai = prov; break; }
    errTerakhir = r.error;
  }
  if (!raw) {
    return { ok: false, error: `Semua provider gagal — ${(errTerakhir || 'tanpa detail').slice(0, 200)}` };
  }

  const parsed = uraiJsonModel(raw);
  const kandidatMentah = Array.isArray(parsed?.kandidat) ? parsed.kandidat : [];
  if (kandidatMentah.length < 2) {
    return { ok: false, error: `AI hanya mengembalikan ${kandidatMentah.length} kandidat sudut, minimal 2.` };
  }

  // ── Verifikasi keras per kandidat ────────────────────────────────────────
  // Kandidat yang menunjuk foto_id palsu DIBUANG, bukan menggagalkan seluruh
  // panggilan — pelajaran yang sama dengan `sesuaikanDurasi()` di
  // stasiunStoryboard.js: satu angka buruk tidak boleh membuang panggilan AI
  // yang sudah dibayar, SELAMA masih ada kandidat lain yang sah.
  const idSah = new Set(foto.map(f => f.id));
  const bersih = [];
  for (const k of kandidatMentah.slice(0, 3)) {
    const fotoPembuka = parseInt(k?.foto_pembuka, 10);
    if (!idSah.has(fotoPembuka)) continue;
    const sudut = String(k?.sudut ?? '').trim();
    if (!sudut) continue;

    const dna = {
      sudut,
      hook_mekanisme: String(k?.hook_mekanisme ?? '').slice(0, 400),
      pemicu_psikologis: String(k?.pemicu_psikologis ?? '').slice(0, 400),
      struktur_naratif: String(k?.struktur_naratif ?? '').slice(0, 400),
      foto_pembuka: fotoPembuka,
      urutan_informasi: Array.isArray(k?.urutan_informasi)
        ? k.urutan_informasi.map(x => String(x).slice(0, 40)).slice(0, 8)
        : [],
      profil_pacing: String(k?.profil_pacing ?? '').slice(0, 200),
      bahasa_kamera: String(k?.bahasa_kamera ?? '').slice(0, 200),
      payoff: String(k?.payoff ?? '').slice(0, 400),
      gaya_cta: String(k?.gaya_cta ?? '').slice(0, 200),
      // Enum, bukan teks bebas: nilainya dipakai `entriSumbu('mood', …)` untuk
      // mengambil `warna` & `musik` berbahasa Inggris di flowCompiler. Id di luar
      // katalog jatuh ke 'hangat' — bukan dibiarkan lolos, karena nilai liar
      // membuat compiler diam-diam kembali ke fallback generik yang persis
      // masalah yang sedang diperbaiki ini.
      mood: MOOD_SAH.has(String(k?.mood ?? '').trim()) ? String(k.mood).trim() : 'hangat',
    };
    // Jaga FIELD_DNA tetap satu-satunya daftar field K1 `dna` — dipakai di sini
    // sebagai bukti kelengkapan, bukan untuk membangun objeknya (di atas sudah
    // eksplisit per field supaya tiap field bisa dibersihkan caranya sendiri).
    for (const f of FIELD_DNA) if (!(f in dna)) dna[f] = '';

    bersih.push({
      id: String(k?.id ?? '').slice(0, 4) || String.fromCharCode(65 + bersih.length),
      alasan: String(k?.alasan ?? '').slice(0, 400),
      fakta_pendukung: Array.isArray(k?.fakta_pendukung)
        ? k.fakta_pendukung.map(x => String(x).slice(0, 120)).slice(0, 6)
        : [],
      foto_pendukung: Array.isArray(k?.foto_pendukung)
        ? [...new Set(k.foto_pendukung.map(x => parseInt(x, 10)).filter(x => idSah.has(x)))].slice(0, 6)
        : [],
      dna,
      cerita_global: bentukCeritaGlobal(k?.cerita_global),
      peta_retensi: bentukPetaRetensi(k?.peta_retensi),
    });
  }

  if (bersih.length === 0) {
    return { ok: false, error: 'AI mengembalikan kandidat, tapi semuanya menunjuk foto_id yang tidak ada di daftar foto atau tanpa sudut.' };
  }

  return {
    ok: true,
    provider: dipakai,
    dnaProduk,
    audiens: bentukAudiens(parsed?.audiens),
    kandidat: bersih,
  };
}
