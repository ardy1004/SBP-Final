// STASIUN 4 & 5 — KONSEP lalu STORYBOARD, dalam satu lintasan AI.
//
// Digabung karena konsep TANPA storyboard tidak berguna, dan memisahkannya
// berarti dua panggilan AI (dua kali latensi, dua kali titik gagal) untuk satu
// keputusan kreatif yang memang menyatu. Yang TIDAK digabung: rendering prompt
// akhir — itu dikerjakan kode, bukan AI (lihat renderPromptFlow di bawah).
//
// ─── Pembagian tugas yang mengikat ───────────────────────────────────────────
//   SISTEM  memilih vektor variasi (stasiun 3) → AI menerimanya sebagai BATASAN
//   AI      mengerjakan kerajinannya: sudut cerita, pilihan foto, dialog
//   SISTEM  merender prompt Google Flow dari hasil AI, deterministik
//
// Renderer nol logika kreatif adalah SYARAT, bukan gaya: begitu renderer tidak
// boleh memutuskan apa pun, drift antar-jalur jadi mustahil secara desain. Mesin
// lama punya tiga jalur prompt paralel yang harus dijaga sinkron oleh script
// penjaga — itu gejala arsitektur, bukan solusinya.

import { PROVIDERS, getProviderKey, callChatCompletion } from './aiProviders.js';
import { FLOW, anggaranKata, entriSumbu, labelInggris } from './viralframe.js';
import { uraiJsonModel } from './visiFoto.js';
import { uraiKunci } from './variasi.js';
import { rakitDnaProduk, rakitDnaAgent, dnaKeTeks } from './dnaProduk.js';

const URUTAN = ['gemini', 'deepseek', 'mistral', 'groq'];

const PERAN = ['Hook', 'Body', 'CTA'];

/** Ajakan terucap per tipe CTA — CONTOH KALIMAT, bukan nama kategori.
 *  Mengirim label saja terbukti membuat model mengarang ajakan kabur yang tidak
 *  menyebut objek ajakannya sama sekali. */
const CTA_UCAP = {
  dm_info:         'DM aku ya, nanti aku kirim detail lengkapnya.',
  komentar:        'Komen di bawah ya, nanti aku balas satu-satu.',
  link_bio:        'Klik link di bio buat jadwalkan survei.',
  simpan:          'Simpan dulu videonya biar nggak lupa pas mau survei.',
  wa:              'Chat aku buat lihat unitnya langsung.',
  survei:          'Yuk jadwalkan survei lokasi, biar lihat sendiri kondisinya.',
};
export const CTA_PILIHAN = Object.keys(CTA_UCAP);

/**
 * Paksa Σ durasi cut = `target`, dengan LANTAI 1 detik per cut. Mengubah di tempat.
 *
 * ⚠️ Selisihnya TIDAK boleh dijatuhkan mentah ke cut terakhir — itu bug yang
 * pernah ada di sini. Kalau model mengalokasikan berlebih (mis. 12 detik untuk
 * klip 10 detik — masih dalam toleransi ±2) dan cut terakhirnya cuma 2 detik,
 * ia jadi NOL, dan renderer memancarkan blok `[00:10-00:10]` yang tidak berarti
 * apa-apa bagi Veo. Tidak ada gate yang menangkapnya: JSON-nya tetap sah, Σ-nya
 * tetap benar, dan videonya cuma kehilangan satu shot tanpa pesan apa pun.
 *
 * Selisih dibagikan dari/ke cut TERPANJANG karena di situ satu detik paling
 * tidak terasa.
 */
export function sesuaikanDurasi(cuts, target) {
  if (!Array.isArray(cuts) || cuts.length === 0) return cuts;
  let selisih = target - cuts.reduce((s, c) => s + c.detik, 0);
  while (selisih !== 0) {
    const naik = selisih > 0;
    const kandidat = naik ? cuts : cuts.filter(c => c.detik > 1);
    if (kandidat.length === 0) break; // semuanya sudah di lantai — berhenti, jangan negatif
    const pilih = kandidat.reduce((a, b) => (b.detik > a.detik ? b : a));
    pilih.detik += naik ? 1 : -1;
    selisih += naik ? -1 : 1;
  }
  return cuts;
}

/** Timecode "00:03" dari detik. */
function tc(detik) {
  const m = Math.floor(detik / 60);
  const s = Math.floor(detik % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buatSystem() {
  return `Kamu sutradara video pendek properti Indonesia. Kamu menerima BATASAN GAYA yang sudah ditetapkan sistem dan TIDAK BOLEH mengubahnya — tugasmu mengeksekusinya sebaik mungkin, bukan memilih gaya lain.

Jawab HANYA JSON valid. Tanpa markdown, tanpa kalimat pembuka.`;
}

function buatUser({ prop, dna, dnaAgent, variasi, params, foto }) {
  const detikPart = params.detikPerPart;
  const voDetik = params.voDetikPerPart;
  const maksKata = anggaranKata(voDetik);
  const cutTarget = entriSumbu('ritme', variasi.ritme)?.cutPerPart ?? 2;
  // Contoh durasi per cut yang MASUK AKAL untuk ritme ini. Wajib angka nyata:
  // contoh skema yang memakai 0 sebagai placeholder membuat model menyalinnya
  // apa adanya, dan verifikasi menolak seluruh storyboard karena satu angka.
  const detikContoh = Math.max(1, Math.round(detikPart / cutTarget));

  const daftarFoto = foto.map((f, i) =>
    `  ${i + 1}. [id ${f.id}] ${f.label_ruangan}${f.vf_skor != null ? ` (skor ${f.vf_skor})` : ''}${f.vf_catatan ? ` — ${f.vf_catatan}` : ''}`
  ).join('\n');

  const arahan = (sumbu) => entriSumbu(sumbu, variasi[sumbu])?.arahan ?? '';

  return `PROPERTI — ${prop.title}
${dnaKeTeks(dna)}
${prop.deskripsi ? `\nCATATAN PEMILIK (boleh dipakai, jangan ditambah-tambahi)\n${String(prop.deskripsi).replace(/\s+/g, ' ').slice(0, 400)}` : ''}

TALENT — ${dnaAgent.nama}
- ${dnaAgent.ciri.join(', ') || 'ciri belum diisi'}

BATASAN GAYA (ditetapkan sistem — WAJIB dipatuhi, JANGAN diganti)
- Mesin cerita : ${entriSumbu('mekanisme', variasi.mekanisme)?.label ?? variasi.mekanisme} — ${arahan('mekanisme')}
- Pembuka      : ${entriSumbu('hook', variasi.hook)?.label ?? variasi.hook} — ${arahan('hook')}
- Ritme        : ${entriSumbu('ritme', variasi.ritme)?.label ?? variasi.ritme} — ${arahan('ritme')} (target ${cutTarget} cut per Part)
- Mood         : ${entriSumbu('mood', variasi.mood)?.label ?? variasi.mood} — ${arahan('mood')}
- Foto pembuka : Part 1 WAJIB dibuka dengan foto berlabel "${variasi.pembukaan}"

FOTO YANG TERSEDIA (pakai HANYA id dari daftar ini)
${daftarFoto}

BENTUK VIDEO (dikunci kuota Google Flow, tidak bisa diubah)
- ${params.jumlahPart} Part × ${detikPart} detik. Peran berurutan: ${PERAN.slice(0, params.jumlahPart).join(' → ')}.
- Voiceover ${voDetik} detik per Part → MAKSIMAL ${maksKata} kata per Part.
  Ini rentang target, bukan plafon: tulis 90-100% dari ${maksKata} kata. Dialog yang
  terlalu pendek membuat model video mengisi sisa waktu dengan mengulang frasa.
- Maksimal ${FLOW.refImagePerPart} foto referensi per Part, dan ${FLOW.refImageUtama} foto
  pertama tiap Part adalah yang PALING PENTING — taruh yang terkuat di depan.

ATURAN KERAS
- Deskripsi tiap cut WAJIB sesuai foto yang benar-benar ada. Patuhi daftar
  "DILARANG DISEBUT" di atas — itu diturunkan dari foto & data listing ini, bukan tebakan.
- Dialog terucap DILARANG menyebut nominal harga, dan dilarang menumpuk urgensi
  ("buruan", "terbatas", "jangan sampai kehabisan"). Harga tampil lewat teks layar.
- Part terakhir WAJIB menutup dengan ajakan yang objeknya sama seperti contoh ini:
  "${CTA_UCAP[params.cta] ?? CTA_UCAP.survei}"
  Diksi boleh berbeda, OBJEK ajakannya tidak boleh diganti jadi ajakan umum.
- JANGAN membuka dengan sapaan atau perkenalan diri ("Halo guys, aku ..."). Detik
  pertama adalah hook, bukan salam.
- Hook Part 1 WAJIB memuat minimal satu hal konkret (angka, ukuran, jumlah kamar,
  atau nama tempat). Pembuka tanpa detail bisa dipasang di listing mana pun.
- "teks_layar" Part 1 dan Part terakhir WAJIB terisi — banyak penonton menonton
  tanpa suara, dan teks layar satu-satunya kanal yang boleh menampilkan harga.
- "kamera" berisi POSISI & GERAK KAMERA saja, BUKAN aksi subjek. Tulis
  "camera at arm's length, selfie perspective, hands empty" — JANGAN
  "presenter holds the camera", karena itu membuat model merender orang yang
  menenteng perangkat.

KELUARAN JSON
{
  "konsep": {
    "sudut": "sudut cerita video ini dalam 1 kalimat",
    "emosi": "satu emosi dominan",
    "payoff": "apa yang penonton dapat di akhir",
    "alasan": "kenapa susunan ini cocok untuk properti ini, 1-2 kalimat jujur"
  },
  "parts": [
    {
      "peran": "Hook",
      "cuts": [
        {
          "foto_id": ${foto[0]?.id ?? 1},
          "detik": ${detikContoh},
          "kamera": "shot size + gerak kamera, BAHASA INGGRIS (contoh: 'Medium shot, slow push-in')",
          "aksi": "apa yang dilakukan subjek & apa yang terlihat, BAHASA INGGRIS, ground pada foto"
        }
      ],
      "dialog": "narasi Part ini dalam Bahasa Indonesia, ${maksKata} kata",
      "teks_layar": "teks overlay singkat untuk editor"
    }
  ]
}
⚠️ "foto_id" WAJIB id nyata dari daftar FOTO di atas. "detik" WAJIB bilangan bulat
minimal 1 (dengan ${cutTarget} cut per Part, sekitar ${detikContoh} detik per cut).
Angka pada contoh di atas HANYA contoh bentuk — jangan disalin apa adanya.
Jumlah "parts" HARUS ${params.jumlahPart}. Σ "detik" tiap Part HARUS ${detikPart}.
"kamera" dan "aksi" dalam BAHASA INGGRIS (dikirim ke Google Flow); "dialog" dan
"teks_layar" dalam BAHASA INDONESIA.`;
}

/**
 * Panggil AI, kembalikan IR terverifikasi.
 *
 * `dnaOverride` = DNA Produk yang sudah DIKOREKSI manusia di Panel Bahan. Kalau
 * user membetulkan fakta yang salah di layar lalu koreksinya tidak sampai ke
 * sini, panel itu cuma hiasan — jadi koreksi selalu menang atas hasil rakitan.
 */
export async function susunStoryboard(env, { prop, agent, variationKey, params, foto, dnaOverride = null }) {
  const variasi = uraiKunci(variationKey);
  const dna = dnaOverride ?? rakitDnaProduk({ prop, foto });
  const dnaAgent = rakitDnaAgent(agent);
  const systemPrompt = buatSystem();
  const userPrompt = buatUser({ prop, dna, dnaAgent, variasi, params, foto });

  let raw = null, dipakai = null, errTerakhir = null;
  for (const prov of URUTAN) {
    const key = await getProviderKey(env, prov);
    if (!key) continue;
    const r = await callChatCompletion({
      provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
      systemPrompt, userPrompt,
      maxTokens: 2600, temperature: 0.8,
      reasoningEffort: prov === 'gemini' ? 'none' : undefined,
      timeoutMs: 22000,
    });
    if (r.ok) { raw = r.content; dipakai = prov; break; }
    errTerakhir = r.error;
  }
  if (!raw) {
    return { ok: false, error: `Semua provider gagal — ${(errTerakhir || 'tanpa detail').slice(0, 200)}` };
  }

  const parsed = uraiJsonModel(raw);
  const parts = Array.isArray(parsed?.parts) ? parsed.parts : null;
  if (!parts || parts.length !== params.jumlahPart) {
    return { ok: false, error: `AI mengembalikan ${parts?.length ?? 0} Part, seharusnya ${params.jumlahPart}.` };
  }

  // ── Verifikasi keras. readNdjson/JSON.parse hanya meng-CAST; tanpa pemeriksaan
  // ini ketidakcocokan muncul sebagai layar putih saat render, bukan pesan error.
  const idSah = new Set(foto.map(f => f.id));
  const bersih = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] ?? {};
    const cutsRaw = Array.isArray(p.cuts) ? p.cuts : [];
    if (cutsRaw.length === 0) return { ok: false, error: `Part ${i + 1} tidak punya cut sama sekali.` };

    const cuts = [];
    for (const c of cutsRaw) {
      const fid = parseInt(c?.foto_id, 10);
      if (!idSah.has(fid)) {
        return { ok: false, error: `Part ${i + 1} menyebut foto_id ${c?.foto_id} yang tidak ada di daftar.` };
      }
      // ⚠️ Durasi cut yang tidak valid TIDAK menggagalkan storyboard.
      //
      // Sebelumnya di sini ada `return { ok:false }`, dan itu membuang seluruh
      // panggilan AI yang sudah dibayar hanya karena SATU angka — persis alasan
      // yang sudah dipakai untuk menoleransi Σ durasi yang meleset. Terjadi
      // sungguhan pada pesanan 4 (2026-09-04): ritme "montase cepat" 5 cut, satu
      // cut tanpa `detik` sah → 502, dan pesanan mandek di status `storyboard`.
      //
      // Nilai penggantinya deterministik (bagi rata sesuai jumlah cut), lalu
      // `sesuaikanDurasi()` di bawah merapikan Σ-nya. Berbeda dari `foto_id`
      // yang tetap ditolak keras: menebak durasi aman, menebak FOTO berarti
      // menarasikan ruangan yang belum tentu ada di gambarnya.
      const detikMentah = Number(c?.detik);
      const detik = Number.isFinite(detikMentah) && detikMentah >= 1
        ? Math.round(detikMentah)
        : Math.max(1, Math.round(params.detikPerPart / cutsRaw.length));
      const f = foto.find(x => x.id === fid);
      cuts.push({
        foto_id: fid,
        label: f?.label_ruangan ?? '',
        skor: f?.vf_skor ?? null,
        detik: Math.round(detik),
        // Dipisah dari `aksi` supaya renderer bisa menaruh sinematografi DULUAN
        // sesuai formula resmi Veo 3.1. Model lama diminta menggabung keduanya,
        // jadi urutan formulanya mustahil ditegakkan tanpa membelah string.
        kamera: String(c?.kamera ?? '').trim().slice(0, 200),
        aksi: String(c?.aksi ?? '').trim().slice(0, 300),
      });
    }
    const total = cuts.reduce((s, c) => s + c.detik, 0);
    // Toleransi 2 detik lalu dikoreksi deterministik: memaksa model berhitung
    // persis hanya menghasilkan kegagalan berulang untuk sesuatu yang bisa
    // dibetulkan di sini.
    if (Math.abs(total - params.detikPerPart) > 2) {
      return { ok: false, error: `Part ${i + 1}: Σ durasi cut ${total}s, seharusnya ${params.detikPerPart}s.` };
    }
    sesuaikanDurasi(cuts, params.detikPerPart);

    bersih.push({
      peran: PERAN[i] ?? `Part ${i + 1}`,
      cuts,
      dialog: String(p.dialog ?? '').trim(),
      teks_layar: String(p.teks_layar ?? '').trim().slice(0, 200),
    });
  }

  return {
    ok: true,
    provider: dipakai,
    dna,
    dnaAgent,
    konsep: {
      sudut: String(parsed?.konsep?.sudut ?? '').slice(0, 300),
      emosi: String(parsed?.konsep?.emosi ?? '').slice(0, 80),
      payoff: String(parsed?.konsep?.payoff ?? '').slice(0, 300),
      alasan: String(parsed?.konsep?.alasan ?? '').slice(0, 500),
    },
    parts: bersih,
    variasi,
  };
}

/**
 * Render prompt Google Flow — SATU prompt per Part, siap tempel.
 *
 * DETERMINISTIK. Tidak ada keputusan kreatif di sini; seluruh isinya berasal dari
 * IR hasil susunStoryboard() dan dari tabel kosakata. Renderer yang tidak boleh
 * memutuskan apa pun membuat drift antar-jalur mustahil SECARA DESAIN — mesin
 * lama punya tiga jalur prompt paralel yang harus dijaga sinkron oleh script
 * penjaga, dan itu gejala arsitektur, bukan solusinya.
 *
 * ─── Tiga hal yang mengikat bentuk keluarannya ───────────────────────────────
 * 1. TIMESTAMP PROMPTING. Google menganjurkan beberapa shot dalam SATU generate
 *    lewat blok `[00:00-00:03]`. Ini yang membuat Part 10 detik bisa berisi 3
 *    potongan alih-alih satu bidikan statis — dan pacing adalah separuh retensi.
 * 2. FORMULA VEO 3.1: [Cinematography] + [Subject] + [Action] + [Context] +
 *    [Style & Audio]. Kamera disebut DULUAN; itu sebabnya `kamera` dipisah dari
 *    `aksi` di IR.
 * 3. DNA DIULANG UTUH DI SETIAP PART. Tiga Part = tiga generate yang tidak saling
 *    tahu, jadi satu-satunya cara membuat orangnya tetap sama adalah mengulang
 *    seluruh cirinya. Ini bukan pemborosan token, ini mekanismenya.
 */
export function renderPromptFlow({ ir, prop, params }) {
  const mood = entriSumbu('mood', ir.variasi.mood);
  const dnaAgent = ir.dnaAgent ?? { bahasaInggris: 'Indonesian presenter', suara: 'natural conversational voice' };
  const gaya = [
    mood?.warna ?? 'natural color grade',
    'shot on mirrorless camera look, shallow depth of field',
    'subtle film grain, natural handheld micro-jitter',
    `${FLOW.rasio} vertical`,
  ].join(', ');

  const lokasi = [prop.kecamatan, prop.kabupaten].filter(Boolean).join(', ');

  return ir.parts.map((p, i) => {
    let t = 0;
    // Blok timestamp: kamera DULU, baru aksi, baru ruang yang jadi konteksnya.
    const baris = p.cuts.map(c => {
      const mulai = tc(t); t += c.detik;
      const kamera = c.kamera || 'Medium shot, steady';
      return `[${mulai}-${tc(t)}] ${kamera}. ${c.aksi} Context: the ${labelInggris(c.label)}.`;
    });

    // Foto berperingkat — inti keputusan "adaptif" soal batas ingredient.
    // Urut skor visi menurun, karena itu peringkat kualitas yang sudah diukur;
    // urutan kemunculan di storyboard bukan peringkat kualitas.
    const unik = [...new Map(p.cuts.map(c => [c.foto_id, c])).values()]
      .sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0));
    const utama = unik.slice(0, FLOW.refImageUtama);
    const cadangan = unik.slice(FLOW.refImageUtama);

    return {
      part: i + 1,
      peran: p.peran,
      foto_utama: utama.map(c => ({ id: c.foto_id, label: c.label })),
      foto_cadangan: cadangan.map(c => ({ id: c.foto_id, label: c.label })),
      dialog: p.dialog,
      teks_layar: p.teks_layar,
      prompt: [
        `Vertical ${FLOW.rasio} short-form video, ${params.detikPerPart} seconds, single scene.`,
        '',
        `SUBJECT: ${dnaAgent.bahasaInggris}. Same face, same outfit, same voice in every part.`,
        `CONTEXT: an Indonesian ${prop.jenis_properti} property in ${lokasi || 'Yogyakarta'}.`,
        '',
        baris.join('\n'),
        '',
        `Dialogue (Indonesian, ${dnaAgent.suara}): "${p.dialog}"`,
        `Music: ${mood?.musik ?? 'subtle background bed'}.`,
        'Ambient: quiet natural room tone, no crowd noise.',
        '',
        `Style: ${gaya}.`,
        // Negative prompt spesifik, bukan kabur — Google menganjurkan menyebut
        // benda yang tidak diinginkan, bukan kategori abstrak. `selfie stick` dan
        // `camera in hand` menutup halusinasi perangkat rekam yang muncul saat
        // foto referensi talent kebetulan memegang alat.
        'Negative: subtitles, captions, burned-in text, watermark, logo, distorted hands, extra people, CGI render, plastic skin, over-smoothed skin, selfie stick, gimbal, camera in hand, mirror reflection of a camera.',
      ].join('\n'),
    };
  });
}
