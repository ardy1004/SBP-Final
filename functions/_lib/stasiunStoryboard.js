// STASIUN STORYBOARD — v2: eksekusi Creative DNA (K1), keluaran beat (K2).
//
// ─── Apa yang berubah dari v1 ────────────────────────────────────────────────
// v1 menggabung KONSEP + STORYBOARD dalam satu panggilan AI: model memilih
// sudut cerita SENDIRI di tengah 15 aturan keras, jadi perhatiannya habis untuk
// "jangan salah" alih-alih "buat cerita terbaik". v2 memisahkan itu ke Stasiun
// Konsep (`stasiunKonsep.js`, K1) yang SUDAH menetapkan sudut/hook/struktur
// naratif SEBELUM sampai di sini. Stasiun ini TIDAK LAGI memilih gaya — ia
// mengeksekusinya jadi beat-demi-beat.
//
// ─── Pembagian tugas yang mengikat ───────────────────────────────────────────
//   STASIUN KONSEP  memutuskan sudut, mekanisme hook, struktur naratif (K1)
//   AI (di sini)    mengeksekusi K1 jadi beat: foto, kamera, dialog, reveal
//   KODE (di sini)  memaksa foto_id sah, Σ durasi, continuity antar Part
//   FLOW COMPILER   merender prompt Google Flow dari K2, deterministik (A4)
//
// Renderer prompt (dulu `renderPromptFlow` di file ini) SUDAH DIPINDAH ke
// `flowCompiler.js` — file ini nol logika rendering, hanya AI-call + validator.

import { PROVIDERS, getProviderKey, callChatCompletion } from './aiProviders.js';
import { anggaranKata, slotFotoProperti } from './viralframe.js';
import { uraiJsonModel } from './visiFoto.js';
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
 * Paksa Σ durasi item = `target`, dengan LANTAI per item. Mengubah di tempat.
 *
 * Generik lewat opsi `{ langkah, lantai, field }` supaya satu fungsi melayani
 * cut lama (detik bulat, langkah 1, dipertahankan sebagai bawaan) maupun beat
 * baru (durasi desimal 0.1) TANPA duplikasi algoritma. Kerja dalam satuan
 * "tick" (kelipatan `langkah`) supaya aritmetikanya tetap BILANGAN BULAT —
 * desimal 0.1 langsung rawan floating point drift (0.1 + 0.2 !== 0.3 di JS).
 *
 * ⚠️ Selisihnya TIDAK boleh dijatuhkan mentah ke item terakhir — itu bug yang
 * pernah ada di sini. Kalau model mengalokasikan berlebih dan item terakhirnya
 * kecil, ia bisa jadi NOL/negatif dan renderer memancarkan rentang waktu yang
 * tidak berarti apa-apa bagi Veo. Tidak ada gate yang menangkapnya.
 *
 * Selisih dibagikan dari/ke item TERPANJANG karena di situ satu langkah paling
 * tidak terasa.
 */
export function sesuaikanDurasi(items, target, { langkah = 1, lantai = 1, field = 'detik' } = {}) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const keTick = (n) => Math.round(n / langkah);
  const dariTick = (t) => Math.round(t * langkah * 10) / 10;
  const lantaiTick = keTick(lantai);
  const tick = items.map(it => keTick(it[field]));
  let selisih = keTick(target) - tick.reduce((s, t) => s + t, 0);
  while (selisih !== 0) {
    const naik = selisih > 0;
    let idx = -1;
    for (let i = 0; i < tick.length; i++) {
      if (!naik && tick[i] <= lantaiTick) continue; // sudah di lantai — jangan turun lagi
      if (idx === -1 || tick[i] > tick[idx]) idx = i;
    }
    if (idx === -1) break; // semuanya sudah di lantai — berhenti, jangan negatif
    tick[idx] += naik ? 1 : -1;
    selisih += naik ? -1 : 1;
  }
  items.forEach((it, i) => { it[field] = dariTick(tick[i]); });
  return items;
}

/** Potong teks ke maksimal N kata (bukan N karakter) — dipakai untuk "kamera". */
function batasKata(teks, maks) {
  const kata = String(teks ?? '').trim().split(/\s+/).filter(Boolean);
  return kata.slice(0, maks).join(' ');
}

function buatSystem() {
  return `Kamu sutradara video pendek properti Indonesia. Creative DNA (sudut cerita, mekanisme hook, struktur naratif) SUDAH DITETAPKAN sistem — tugasmu MENGEKSEKUSINYA jadi storyboard beat-demi-beat yang hidup, bukan memilih sudut lain atau menggantinya.

Jawab HANYA JSON valid. Tanpa markdown, tanpa kalimat pembuka.`;
}

function buatUser({ prop, dna, dnaAgent, konsep, params, foto, faceless }) {
  const detikPart = params.detikPerPart;
  const voDetik = params.voDetikPerPart;
  const maksKata = anggaranKata(voDetik);
  const slot = slotFotoProperti(faceless);
  const d = konsep?.dna ?? {};
  const urutanInformasi = Array.isArray(d.urutan_informasi) ? d.urutan_informasi : [];
  const cerita = konsep?.cerita_global ?? {};

  const daftarFoto = foto.map((f, i) =>
    `  ${i + 1}. [id ${f.id}] ${f.label_ruangan}${f.vf_skor != null ? ` (skor ${f.vf_skor})` : ''}${f.vf_catatan ? ` — ${f.vf_catatan}` : ''}`
  ).join('\n');

  // Contoh durasi beat yang MASUK AKAL (bukan placeholder 0) — contoh 0 pernah
  // membuat model menyalinnya apa adanya dan menggagalkan seluruh storyboard.
  const beatContoh = Math.max(0.5, Math.round((detikPart / 3) * 10) / 10);

  const blokTalent = faceless
    ? 'MODE FACELESS — TIDAK ADA PRESENTER MANUSIA. Jangan sebut orang, tangan, wajah, atau aksi manusia di "aksi"/"reveal"/"start_state"/"end_state". Video murni showcase properti; "dialog" tetap voiceover naratif, bukan ucapan seseorang yang tampil di layar.'
    : `TALENT — ${dnaAgent.nama}\n- ${dnaAgent.ciri.join(', ') || 'ciri belum diisi'}`;

  const blokCerita = cerita.janji
    ? `\nCERITA GLOBAL LINTAS PART (jaga benang merahnya)\n- Janji video: ${cerita.janji}\n- Part 1 open loop: ${cerita.part1_open_loop || '-'}\n- Part 2 payoff: ${cerita.part2_payoff || '-'}\n- Part 2 open loop: ${cerita.part2_open_loop || '-'}\n- Part 3 payoff: ${cerita.part3_payoff || '-'}\n`
    : '';

  return `PROPERTI — ${prop.title}
${dnaKeTeks(dna)}
${prop.deskripsi ? `\nCATATAN PEMILIK (boleh dipakai, jangan ditambah-tambahi)\n${String(prop.deskripsi).replace(/\s+/g, ' ').slice(0, 400)}` : ''}

${blokTalent}

CREATIVE DNA — SUDAH DITETAPKAN, WAJIB DIEKSEKUSI (jangan ganti dengan sudut lain)
- Sudut cerita      : ${d.sudut || '-'}
- Hook mekanisme    : ${d.hook_mekanisme || '-'}
- Pemicu psikologis : ${d.pemicu_psikologis || '-'}
- Struktur naratif  : ${d.struktur_naratif || '-'}
- Profil pacing     : ${d.profil_pacing || '-'}
- Bahasa kamera     : ${d.bahasa_kamera || '-'} (acuan gaya "kamera" tiap beat)
- Payoff            : ${d.payoff || '-'}
- Gaya CTA          : ${d.gaya_cta || '-'}
- Urutan informasi (garis besar seluruh video): ${urutanInformasi.join(' → ') || '-'}
- Foto pembuka Part 1: beat pertama Part 1 SEBAIKNYA pakai foto id ${d.foto_pembuka ?? '(pilih dari daftar foto)'}
${blokCerita}
FOTO YANG TERSEDIA (pakai HANYA id dari daftar ini)
${daftarFoto}

BENTUK VIDEO (dikunci kuota Google Flow, tidak bisa diubah)
- ${params.jumlahPart} Part × ${detikPart} detik. Peran berurutan: ${PERAN.slice(0, params.jumlahPart).join(' → ')}.
${params.jumlahPart === 1 ? `- ⚠️ HANYA SATU Part: beat pertama menahan (hook), beat tengah membawa nilai jual terkuat, beat terakhir menutup dengan ajakan.` : ''}
- Tiap Part berisi 2-4 BEAT — satu beat = satu potongan CERITA (bukan sekadar potongan gambar). Tiap beat WAJIB membawa satu informasi baru; kalau tidak ada info baru, gabung ke beat sebelumnya alih-alih menambah beat kosong.
- Voiceover: tulis 2-4 kalimat PENDEK, SATU per beat, mengikuti urutan beat (sebar sepanjang durasi Part, jangan menumpuk semua di awal lalu diam di sisanya). Buang apa pun yang bisa masuk teks layar (harga, legalitas, angka luas persis) — dialog fokus ke yang paling penting DIDENGAR. Information hierarchy > information quantity. Total kata per Part maksimal ${maksKata} kata — ini batas ATAS, bukan target yang wajib dipenuhi.
- Maksimal ${slot} foto properti berbeda per Part; foto yang disebut lebih dulu adalah yang PALING PENTING.

PERPINDAHAN RUANG
Boleh berpindah ruang DI DALAM satu Part asal gerakan kameranya berkelanjutan & searah (mis. berjalan dari teras masuk ke ruang tamu). DILARANG potongan keras antar ruang yang tidak berhubungan — itu memaksa model mengarang transisi dan jadi sumber utama hasil tidak konsisten dengan foto referensi.

ATURAN KERAS
- Setiap beat WAJIB sesuai foto yang benar-benar ada. Patuhi "DILARANG DISEBUT" di atas — diturunkan dari data listing ini, bukan tebakan.
- Dialog terucap DILARANG menyebut nominal harga, dan dilarang menumpuk urgensi ("buruan", "terbatas", "jangan sampai kehabisan"). Harga hanya lewat teks layar.
- Beat terakhir Part terakhir WAJIB menutup dengan ajakan yang objeknya sama seperti contoh ini: "${CTA_UCAP[params.cta] ?? CTA_UCAP.survei}" — diksi boleh beda, objek ajakannya tidak boleh diganti jadi ajakan umum.
- JANGAN membuka dengan sapaan/perkenalan diri ("Halo guys, aku ..."). Beat pertama Part 1 adalah hook, bukan salam.
- Beat pertama Part 1 WAJIB memuat hal konkret (angka, ukuran, jumlah kamar, atau nama tempat) di "viewer_question" atau "reveal"-nya.
- 🔥 SETIAP ANGKA yang diucapkan HARUS berasal dari FAKTA TERVERIFIKASI di atas. Dilarang keras mengarang jarak/waktu tempuh ("500 meter dari Tugu"). Kedekatan boleh disebut TANPA angka.
- "teks_layar" Part 1 dan Part terakhir WAJIB terisi — banyak penonton menonton tanpa suara.
- "kamera" berisi POSISI & GERAK KAMERA saja (maksimal 8 kata, Inggris, mis. "Handheld, slow push-in through doorway"). DILARANG menuliskan aksi subjek di situ, dan DILARANG menyebut orang memegang/membawa kamera — itu membuat model merender presenter yang menenteng perangkat.

KELUARAN JSON
{
  "parts": [
    {
      "beats": [
        {
          "foto_id": ${foto[0]?.id ?? 1},
          "durasi": ${beatContoh},
          "viewer_question": "pertanyaan di benak penonton saat beat ini mulai",
          "start_state": "kondisi/posisi penonton sebelum beat ini",
          "kamera": "posisi & gerak kamera, BAHASA INGGRIS, maks 8 kata",
          "aksi": "apa yang terlihat/terjadi, BAHASA INGGRIS, ground pada foto",
          "reveal": "apa yang baru terlihat/terungkap di beat ini",
          "informasi_baru": "satu info baru yang dibawa beat ini, Bahasa Indonesia",
          "end_state": "kondisi/posisi penonton di akhir beat ini",
          "next_question": "pertanyaan baru yang muncul untuk beat berikutnya"
        }
      ],
      "continuity_out": "posisi & arah kamera di frame TERAKHIR Part ini — jadi dasar Part berikutnya",
      "dialog": "voiceover Part ini, Bahasa Indonesia",
      "teks_layar": "teks overlay singkat untuk editor, Bahasa Indonesia"
    }
  ]
}
⚠️ "foto_id" WAJIB id nyata dari daftar FOTO di atas. "durasi" desimal (boleh 1
angka di belakang koma) — ${beatContoh} pada contoh HANYA gambaran, jangan disalin
apa adanya. Jumlah "parts" HARUS ${params.jumlahPart}; tiap Part berisi 2-4 "beats";
Σ "durasi" tiap Part ≈ ${detikPart} detik. "kamera" dan "aksi" BAHASA INGGRIS (dikirim
ke Google Flow); field lainnya BAHASA INDONESIA.`;
}

/**
 * Panggil AI, kembalikan IR terverifikasi (K2: `parts[].beats[]`).
 *
 * `konsep` = keluaran Stasiun Konsep (K1, `hasil_json.konsep`) — AI di sini
 * TIDAK memilih sudut lagi, hanya mengeksekusi `konsep.dna`.
 *
 * `agent` boleh null/undefined → MODE FACELESS: tidak ada DNA Agent, prompt
 * tidak menyebut presenter sama sekali. `dnaAgent` pada hasil ikut null,
 * sesuai kontrak K3 (`ir.dnaAgent|null`) yang dibaca Flow Compiler.
 *
 * `dnaOverride` = DNA Produk yang sudah DIKOREKSI manusia di Panel Bahan. Kalau
 * user membetulkan fakta yang salah di layar lalu koreksinya tidak sampai ke
 * sini, panel itu cuma hiasan — jadi koreksi selalu menang atas hasil rakitan.
 */
export async function susunStoryboard(env, { prop, agent, konsep, params, foto, dnaOverride = null }) {
  const dna = dnaOverride ?? rakitDnaProduk({ prop, foto });
  const faceless = !agent;
  const dnaAgent = faceless ? null : rakitDnaAgent(agent);
  const systemPrompt = buatSystem();
  const userPrompt = buatUser({ prop, dna, dnaAgent, konsep, params, foto, faceless });

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
  const partsRaw = Array.isArray(parsed?.parts) ? parsed.parts : null;
  if (!partsRaw || partsRaw.length !== params.jumlahPart) {
    return { ok: false, error: `AI mengembalikan ${partsRaw?.length ?? 0} Part, seharusnya ${params.jumlahPart}.` };
  }

  // ── Verifikasi keras. readNdjson/JSON.parse hanya meng-CAST; tanpa pemeriksaan
  // ini ketidakcocokan muncul sebagai layar putih saat render, bukan pesan error.
  const idSah = new Set(foto.map(f => f.id));
  const bersih = [];
  for (let i = 0; i < partsRaw.length; i++) {
    const p = partsRaw[i] ?? {};
    const beatsRaw = Array.isArray(p.beats) ? p.beats : [];
    if (beatsRaw.length < 2 || beatsRaw.length > 4) {
      return { ok: false, error: `Part ${i + 1}: ${beatsRaw.length} beat, seharusnya 2-4.` };
    }

    const beats = [];
    for (const b of beatsRaw) {
      const fid = parseInt(b?.foto_id, 10);
      if (!idSah.has(fid)) {
        return { ok: false, error: `Part ${i + 1} menyebut foto_id ${b?.foto_id} yang tidak ada di daftar.` };
      }
      const informasiBaru = String(b?.informasi_baru ?? '').trim();
      if (!informasiBaru) {
        return { ok: false, error: `Part ${i + 1}: ada beat tanpa "informasi_baru".` };
      }
      // ⚠️ Durasi tak sah TIDAK menggagalkan storyboard, sama seperti "detik"
      // di mesin lama — menebak durasi aman (dirapikan `sesuaikanDurasi` di
      // bawah), menebak FOTO berarti menarasikan ruangan yang belum tentu ada.
      const durasiMentah = Number(b?.durasi);
      const durasi = Number.isFinite(durasiMentah) && durasiMentah > 0
        ? durasiMentah
        : Math.max(0.5, params.detikPerPart / beatsRaw.length);
      const f = foto.find(x => x.id === fid);
      beats.push({
        foto_id: fid,
        // `label`/`skor` bukan bagian K2, tapi Flow Compiler (K3) tidak menerima
        // daftar foto terpisah — ini satu-satunya jalan baginya tahu label &
        // peringkat foto tiap beat tanpa query ulang.
        label: f?.label_ruangan ?? '',
        skor: f?.vf_skor ?? null,
        durasi,
        viewer_question: String(b?.viewer_question ?? '').trim().slice(0, 150),
        start_state: String(b?.start_state ?? '').trim().slice(0, 200),
        kamera: batasKata(String(b?.kamera ?? '').trim(), 8).slice(0, 160),
        aksi: String(b?.aksi ?? '').trim().slice(0, 300),
        reveal: String(b?.reveal ?? '').trim().slice(0, 200),
        informasi_baru: informasiBaru.slice(0, 200),
        end_state: String(b?.end_state ?? '').trim().slice(0, 200),
        next_question: String(b?.next_question ?? '').trim().slice(0, 150),
      });
    }

    const total = beats.reduce((s, b) => s + b.durasi, 0);
    // Toleransi 2 detik lalu dikoreksi deterministik — memaksa model berhitung
    // persis hanya menghasilkan kegagalan berulang untuk sesuatu yang bisa
    // dibetulkan di sini.
    if (Math.abs(total - params.detikPerPart) > 2) {
      return { ok: false, error: `Part ${i + 1}: Σ durasi beat ${total.toFixed(1)}s, seharusnya ${params.detikPerPart}s.` };
    }
    sesuaikanDurasi(beats, params.detikPerPart, { langkah: 0.1, lantai: 0.5, field: 'durasi' });

    // `mulai`/`selesai` dihitung KODE dari Σ berjalan, bukan diminta ke model —
    // model tidak andal menjaga jumlah kumulatif tetap konsisten antar beat.
    let t = 0;
    const beatsFinal = beats.map(b => {
      const mulai = Math.round(t * 10) / 10;
      t += b.durasi;
      const selesai = Math.round(t * 10) / 10;
      const { durasi, ...sisa } = b;
      return { ...sisa, mulai, selesai };
    });

    bersih.push({
      peran: PERAN[i] ?? `Part ${i + 1}`,
      continuity_in: null, // Part 1 tetap null; Part 2+ diisi di bawah, sesudah loop.
      continuity_out: String(p.continuity_out ?? '').trim().slice(0, 300),
      beats: beatsFinal,
      dialog: String(p.dialog ?? '').trim(),
      teks_layar: String(p.teks_layar ?? '').trim().slice(0, 200),
    });
  }

  // Continuity antar Part DIPAKSA KODE: `continuity_out` Part N menjadi
  // `continuity_in` Part N+1 secara harfiah. Lebih andal daripada berharap
  // model menyalinnya sendiri konsisten di dua Part yang tidak saling tahu
  // (tiga Part = tiga generate terpisah, nol memori bersama).
  for (let i = 1; i < bersih.length; i++) {
    bersih[i].continuity_in = bersih[i - 1].continuity_out || null;
  }

  return {
    ok: true,
    provider: dipakai,
    dna,
    dnaAgent,
    konsep,
    parts: bersih,
  };
}
