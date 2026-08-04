// POST /api/admin/viralframe/youtube-long — storyboard YouTube 16:9 terpandu.
// User memilih foto + label per scene + gaya visual + gaya kamera; AI menyusun
// skenario & mengeluarkan prompt JSON siap-tempel per blok:
//   thumbnail, opening, scene 1..N (per foto), ending.
// Body: { property_id, photos:[{label,url_webp}], visual_style, camera_style,
//         language? ('id'|'en'), use_agent?, agent_id?, provider? }
// Bila use_agent: agen (viralframe_characters) hadir sebagai host di semua blok,
// dengan mandat konsistensi ke reference image agent.webp.
// Auth: _middleware.js

import { jsonError, handleOptions } from '../../_shared/response.js';
import { PROVIDERS, getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';
// Negative prompt video + kosakata realisme = sumber tunggal bersama Jalur A & C
// (audit 2026-07-26 & 2026-07-28). REALISM_* dipakai supaya jalur ini tidak lagi
// tertinggal dari perbaikan "kelihatan AI banget" yang sudah diterapkan ke 2 jalur
// lain — sebelumnya jalur ini tidak mengimpor sama sekali (audit 2026-07-28).
// VOICE_PERSONA_HINT/VOICE_PRIORITY_NOTE (audit 2026-08-04): jalur ini SUDAH
// punya pola "dialogue.voice WAJIB SAMA di semua blok" sejak awal — justru
// preseden yang dipakai menulis VOICE_PERSONA_HINT di viralframe-shared.js
// (lihat komentar di sana). Diimpor dari sumber tunggal di sini juga supaya
// KEDUANYA (jalur ini & Jalur C ai-generate.js) tidak bisa lagi drift satu
// sama lain kalau salah satu diubah tanpa yang lain.
import {
  NEGATIVE_PROMPT_VIDEO, getClipMaxSec, getMaxWords,
  REALISM_QUALITY_CUES, REALISM_BANNED_QUALITY_PHRASES, RULEBOOK_VERSION,
  VOICE_PERSONA_HINT, VOICE_PRIORITY_NOTE,
} from '../../../_lib/viralframe-shared.js';

// Jalur ini diasumsikan untuk Veo/Google Flow. Batas panjang satu klip mengikuti
// tool itu — ambil dari konstanta bersama (10 detik, dikonfirmasi pemilik akun
// 2026-07-28), JANGAN hardcode angka sendiri di sini lagi (dulu pernah salah
// mengira batasnya 8 padahal viralframe-shared.js sudah benar 10).
const KLIP_MAKS = getClipMaxSec('google_flow') ?? 10;
// Budget kata narasi per blok. Jalur ini SAMA SEKALI tidak punya batas ini sebelum
// 2026-07-28 — narration_id boleh sepanjang apa pun, padahal klipnya tetap
// ${KLIP_MAKS} detik. Itu bug yang persis sama dengan 'suara terpotong' di AI
// Generate: 41 kata untuk 10 detik = 246 kata/menit, mustahil diucapkan.
// getMaxWords() sudah bermargin nafas — dipakai bersama Jalur A & C.
const NARASI_MAKS = getMaxWords(KLIP_MAKS);
// Ambang penolakan: bukan 100% agar selisih sepele tidak membakar keempat provider,
// tapi cukup rapat untuk menangkap model yang mengabaikan aturan sepenuhnya.
const NARASI_TOLERANSI = 1.4;

const PROVIDER_ORDER = ['gemini', 'groq', 'openrouter', 'deepseek'];

function fmtRupiah(n) {
  if (n == null || n <= 0) return 'hubungi kami';
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')} Miliar`;
  if (n >= 1e6) return `Rp ${Math.round(n / 1e6)} Juta`;
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

/** Blok video (bukan thumbnail) yang wajib punya dialog terucap. */
function blokVideo(parsed) {
  return [parsed?.opening, ...(Array.isArray(parsed?.scenes) ? parsed.scenes : []), parsed?.ending]
    .filter(b => b && typeof b === 'object');
}

/**
 * Validasi struktur hasil AI. Sebelum audit 2026-07-26 tidak ada pemeriksaan apa pun:
 * instruksi "scenes berisi TEPAT N item" hanya ada di teks prompt dan tidak pernah
 * ditegakkan, sehingga respons terpotong (12 foto → 3 scene) diterima, DISIMPAN ke
 * viralframe_generations, dan baru ketahuan saat dipakai.
 *
 * Mengembalikan pesan error (string) atau null bila lolos. Pemanggil memperlakukan
 * error sebagai kegagalan provider supaya fallback berantai mencoba provider lain —
 * sama seperti parseSceneJson() di ai-generate.js.
 *
 * BATAS KETAT vs LONGGAR (revisi setelah evaluasi):
 * Yang FATAL hanya yang membuat hasilnya TIDAK BISA DIPAKAI — jumlah scene, objek
 * prompt tiap blok video, dan dialogue.line. Metadata pelengkap (thumbnail, titles)
 * SENGAJA ditoleransi: membuang storyboard 12 scene yang sempurna hanya karena blok
 * thumbnail hilang berarti menukar satu mode kegagalan dengan mode kegagalan lain,
 * dan keempat provider ikut terbakar percuma. Frontend sudah menangani keduanya
 * secara opsional (result.thumbnail?.prompt, result.titles ?? []).
 */
function validasiStoryboard(parsed, jumlahFoto) {
  if (!parsed || typeof parsed !== 'object') return 'respons bukan objek JSON';
  if (!Array.isArray(parsed.scenes)) return 'field "scenes" bukan array';
  if (parsed.scenes.length !== jumlahFoto) {
    return `jumlah scene ${parsed.scenes.length}, seharusnya ${jumlahFoto} (respons kemungkinan terpotong)`;
  }
  // Blok VIDEO = deliverable-nya. Tanpa ini videonya tidak bisa dirakit.
  for (const key of ['opening', 'ending']) {
    if (!parsed[key] || typeof parsed[key] !== 'object') return `blok "${key}" tidak ada`;
    if (!parsed[key].prompt || typeof parsed[key].prompt !== 'object') return `blok "${key}" tanpa objek prompt`;
  }

  const kurangPrompt = parsed.scenes.findIndex(s => !s?.prompt || typeof s.prompt !== 'object');
  if (kurangPrompt >= 0) return `scene ${kurangPrompt + 1} tanpa objek prompt`;

  // Audio native: tanpa dialogue.line, video keluar BISU walau narration_id terisi.
  for (const b of blokVideo(parsed)) {
    const line = String(b.prompt?.dialogue?.line ?? '').trim();
    if (!line) return 'ada blok video tanpa dialogue.line (video akan bisu di Veo/Flow)';
  }

  // Budget kata. Ditolak hanya bila JAUH melewati batas — selisih sepele tidak
  // sepadan dengan membakar keempat provider, tapi narasi 2× lipat berarti model
  // mengabaikan aturan dan videonya pasti terpotong di tengah kalimat.
  const batasKeras = Math.ceil(NARASI_MAKS * NARASI_TOLERANSI);
  for (const b of blokVideo(parsed)) {
    const line = String(b.prompt?.dialogue?.line ?? '').trim();
    const kata = line ? line.split(/\s+/).length : 0;
    if (kata > batasKeras) {
      return `narasi ${kata} kata melebihi batas ${NARASI_MAKS} kata untuk klip ${KLIP_MAKS} detik (akan terpotong saat diucapkan)`;
    }
  }
  return null;
}

/**
 * Sisipkan negative_prompt ke tiap blok VIDEO. Nilainya tetap dan deterministik,
 * jadi disuntik server — bukan diminta ke AI (membakar token + berisiko dilupakan).
 * Thumbnail sengaja dilewati: itu gambar sampul yang justru BUTUH text_overlay.
 */
function suntikNegativePrompt(parsed) {
  for (const b of blokVideo(parsed)) {
    if (b.prompt && typeof b.prompt === 'object') b.prompt.negative_prompt = NEGATIVE_PROMPT_VIDEO;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const propertyId = parseInt(body.property_id, 10);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return jsonError('property_id wajib', 422);
  const chosenProvider = PROVIDER_ORDER.includes(body.provider) ? body.provider : 'gemini';

  const photos = Array.isArray(body.photos)
    ? body.photos.filter(x => x && typeof x.label === 'string' && x.label.trim()).slice(0, 12)
    : [];
  if (photos.length < 2) return jsonError('Pilih minimal 2 foto beserta labelnya', 422);
  const visualStyle = typeof body.visual_style === 'string' ? body.visual_style.slice(0, 80) : '';
  const cameraStyle = typeof body.camera_style === 'string' ? body.camera_style.slice(0, 80) : '';
  const language = body.language === 'en' ? 'en' : 'id';
  const useAgent = body.use_agent === true;

  let p;
  try {
    p = await env.DB.prepare(`SELECT title, jenis_properti, tujuan, harga, kecamatan, kabupaten, provinsi,
                                     jumlah_kamar_tidur, jumlah_kamar_mandi, luas_tanah, luas_bangunan,
                                     legalitas, kode_listing, deskripsi FROM properties WHERE id = ?`).bind(propertyId).first();
  } catch (err) { console.error('[yt-long] property', err.message); return jsonError('Gagal ambil properti', 500); }
  if (!p) return jsonError('Properti tidak ditemukan', 404);

  // Agen (host) opsional — ambil profil dari viralframe_characters.
  let agent = null;
  if (useAgent) {
    const agentId = parseInt(body.agent_id, 10);
    if (!Number.isInteger(agentId) || agentId <= 0) return jsonError('Pilih agen terlebih dahulu', 422);
    try {
      agent = await env.DB.prepare(`SELECT id, nama, foto_url, gender, usia, etnik, style, ciri_fisik
                                    FROM viralframe_characters WHERE id = ?`).bind(agentId).first();
    } catch (err) { console.error('[yt-long] agent', err.message); return jsonError('Gagal ambil data agen', 500); }
    if (!agent) return jsonError('Agen tidak ditemukan', 404);
  }

  const sceneList = photos.map((f, i) => `${i + 1}. ${f.label}`).join('\n');
  const langName = language === 'en' ? 'English' : 'Bahasa Indonesia';
  const agentDesc = agent
    ? [agent.gender, agent.usia ? `${agent.usia} th` : null, agent.etnik, agent.style, agent.ciri_fisik]
        .filter(Boolean).join(', ')
    : '';

  const system = `Kamu sutradara & prompt engineer video properti YouTube profesional. Output HANYA satu objek JSON valid, mulai { akhiri }, tanpa markdown/komentar/proses berpikir.
SYARAT WAJIB — AUDIO NATIVE (DIALOG TERUCAP): prompt ini dieksekusi di Veo 3.x / Google Flow yang menghasilkan AUDIO NATIVE — kalimat yang ada DI DALAM objek "prompt" akan BENAR-BENAR DIUCAPKAN dengan lip-sync, sedangkan kalimat yang hanya ada di field tetangga TIDAK akan terdengar sama sekali.
  • Setiap objek "prompt" untuk blok VIDEO (opening, tiap scene, ending) WAJIB punya field "dialogue" berisi { "speaker", "language", "line", "voice", "delivery" }.
  • "dialogue.line" WAJIB berisi teks yang SAMA PERSIS dengan "narration_id" blok itu — karakter demi karakter, tetap dalam ${langName}. Jangan diterjemahkan, diringkas, atau diparafrase.
  • "dialogue.voice" WAJIB SAMA di semua blok agar timbre narator konsisten (mis. "${language === 'en' ? 'warm confident young English female voice, natural documentary pace' : VOICE_PERSONA_HINT}").
  • "audio" (ambience/musik latar blok VIDEO) WAJIB tunduk pada prioritas ini: ${VOICE_PRIORITY_NOTE} — jangan tulis ambience/musik yang mengesankan volumenya menutupi dialog.
  • ${agent ? `"dialogue.speaker" = nama agen (host tampil di layar dan berbicara).` : `"dialogue.speaker" = "narrator (voiceover, off-screen)" karena tidak ada orang di layar.`}
  • Semua field lain di dalam "prompt" ditulis dalam BAHASA INGGRIS — HANYA "dialogue.line" yang memakai ${langName}.
  • Blok "thumbnail" TIDAK punya "dialogue" (gambar diam, bukan video).
BATAS PANJANG NARASI — WAJIB: setiap "narration_id" (dan "dialogue.line" yang menyalinnya) MAKSIMAL ${NARASI_MAKS} KATA.
Klipnya hanya ${KLIP_MAKS} detik. Narasi lebih panjang TIDAK muat diucapkan — Veo akan memotongnya di tengah kalimat, dan kalimat CTA-mu hilang.
  • Hitung katanya. ${NARASI_MAKS} kata itu kira-kira 1-2 kalimat pendek, BUKAN paragraf.
  • Lebih baik kurang dari batas daripada lebih. Buang kata pengisi, pertahankan angka & fakta yang menjual.
  • Ini berlaku untuk SETIAP blok video: opening, tiap scene, dan ending.
✗ SALAH (${NARASI_MAKS}+ kata): "Rumah megah ini punya empat kamar tidur luas, legalitasnya lengkap SHGB dan IMB, lokasinya sangat strategis dekat kampus, dan harganya masih sangat bisa dinegosiasikan"
✓ BENAR: "Empat kamar tidur, legalitas lengkap. Lokasinya dekat kampus!"

GERAKAN KAMERA WAJIB TETAP DI DALAM BINGKAI FOTO — WAJIB:
Setiap blok dieksekusi image-to-video dengan foto referensi terlampir. Foto itu hanya memuat apa
yang ada di dalam bingkainya. Gerakan yang membawa kamera KELUAR bingkai memaksa AI mengarang area
yang tidak ada di foto — hasilnya properti berubah bentuk dan tidak lagi sesuai gambar user.
  • AMAN: slow push-in, pull-back ringan, orbit sempit di sekitar subjek, tilt/pan kecil, gimbal glide pendek.
  • DILARANG meski diminta GAYA KAMERA di atas: drone/aerial sweep, terbang mengelilingi bangunan,
    crane naik tinggi, fly-through antar ruangan, lateral track melintasi properti.
  • Bila GAYA KAMERA menyebut drone/aerial, TERJEMAHKAN jadi kesan setara yang tertahan di bingkai —
    mis. "drone aerial reveal" → "slow pull-back that keeps the same view in frame, evoking an aerial reveal".
  • Setiap "camera_movement" WAJIB diakhiri frasa: "camera stays within the framing of the reference image".

REALISME TEKNIS — WAJIB (blok VIDEO saja, thumbnail statis dikecualikan): field "style"/"lighting"/"mood" WAJIB memakai kosakata fisik kamera nyata, BUKAN kata sifat generik. Pilih yang relevan (boleh diparafrase, jaga maknanya):
${REALISM_QUALITY_CUES.map(c => `  - ${c}`).join('\n')}
DILARANG menutup deskripsi visual blok VIDEO dengan frasa generik seperti: ${REALISM_BANNED_QUALITY_PHRASES.join(', ')}. Frasa ini terbukti mendorong hasil video terlihat CGI/render 3D, bukan rekaman kamera sungguhan ("kelihatan AI banget").

BATAS PANJANG KLIP: setiap blok video dihasilkan sebagai SATU klip berdurasi maksimal ${KLIP_MAKS} detik. Field "duration_sec" WAJIB bernilai ${KLIP_MAKS} atau kurang, dan deskripsi aksi tiap blok harus muat dalam durasi itu — jangan menuliskan rangkaian kejadian panjang yang mustahil selesai dalam ${KLIP_MAKS} detik. Video panjang dirakit dari banyak klip di tahap editing, bukan dari satu prompt.
LARANGAN TEKS DI FRAME: Veo cenderung MEMBAKAR subtitle ke dalam gambar begitu ada dialog. Objek "prompt" blok VIDEO DILARANG meminta teks, caption, subtitle, atau tulisan muncul di dalam frame. (Pengecualian tunggal: blok "thumbnail" memang butuh "text_overlay" karena itu gambar sampul, bukan video.)
SYARAT WAJIB — KONSISTENSI REFERENCE IMAGE: setiap prompt yang kamu tulis akan dieksekusi image-to-video/image dengan foto referensi terlampir. Setiap objek "prompt" WAJIB punya field "reference_image" (nama file referensinya) dan instruksi harus SETIA ke foto itu: jangan mengarang arsitektur, furnitur, warna, atau material yang tidak ada di foto. Gaya visual & kamera harus konsisten di semua blok agar terasa satu film.${agent ? `
SYARAT WAJIB — KONSISTENSI AGEN: agen/host yang sama (dari reference image "agent.webp") hadir di thumbnail, opening, scene, dan ending. WAJIB tulis "exact same person as reference image agent.webp — identical face, hair or head covering, and outfit in every shot" di field subject/agent tiap prompt. Tulis 'hair or head covering' (atau sebut penutup kepala yang terlihat, mis. 'hijab') — JANGAN 'hair' saja, karena talent berhijab/berpeci akan membuat instruksi itu bertentangan dengan foto referensi. Jangan pernah mengganti wajah, penutup kepala/gaya rambut, atau pakaian antar blok.` : ''}`;
  const user = `Susun STORYBOARD video tur properti YouTube (16:9, long-form) berdasarkan foto & urutan scene yang DIPILIH user. JANGAN mengarang fitur yang tak disebutkan di data.

GAYA VISUAL : ${visualStyle || 'cinematic real estate, clean & aspiratif'}
GAYA KAMERA : ${cameraStyle || 'kombinasi drone aerial + gimbal interior yang mulus'}
BAHASA DIALOG/NARASI : ${langName} (semua field narration_id ditulis dalam ${langName})
${agent ? `AGEN/HOST : ${agent.nama}${agentDesc ? ` (${agentDesc})` : ''} — reference image: agent.webp. Agen tampil sebagai host tur: berjalan, menunjuk fitur, bicara ke kamera secara natural. narration_id = kalimat yang DIUCAPKAN agen on-camera.` : 'TANPA AGEN : murni sinematik properti (tanpa manusia); narration_id = voiceover.'}

DATA PROPERTI:
- Judul: ${p.title}
- Jenis: ${p.jenis_properti} (${p.tujuan})
- Harga: ${fmtRupiah(p.harga)}
- Lokasi: ${p.kecamatan}, ${p.kabupaten}, ${p.provinsi}
- Spesifikasi: ${p.jumlah_kamar_tidur ?? '-'} KT / ${p.jumlah_kamar_mandi ?? '-'} KM, LT ${p.luas_tanah ?? '-'}m², LB ${p.luas_bangunan ?? '-'}m²
- Legalitas: ${p.legalitas ?? '-'} · Kode: ${p.kode_listing}
${p.deskripsi ? `- Deskripsi: ${String(p.deskripsi).slice(0, 300)}` : ''}

URUTAN SCENE (buat TEPAT 1 scene per item, sesuai ruangan/area foto; reference_image scene ke-N = "scene_N.webp"):
${sceneList}

Untuk SETIAP blok VIDEO (opening, tiap scene, ending), field "prompt" WAJIB berupa OBJEK JSON siap-tempel ke AI video generator, English sinematik, dengan field: reference_image, shot, subject, camera_movement (terapkan gaya kamera di atas), lighting, mood, style (terapkan gaya visual di atas), dialogue (lihat SYARAT AUDIO NATIVE), audio (ambience/musik latar SAJA — TANPA kalimat narasi), duration_sec, aspect_ratio ("16:9"). Prompt harus grounded ke ruangan/fitur nyata sesuai label — bukan generik. Opening & ending pakai reference_image "scene_1.webp" (establishing shot).

THUMBNAIL — WAJIB WOW & CATCHY (gaya high-CTR YouTube real estate, ini penentu klik):
- Basis foto terbaik (reference_image "scene_1.webp")${agent ? ' + agen dengan ekspresi wajah kuat (kagum/excited, mulut terbuka atau menunjuk ke rumah) di sepertiga kiri/kanan frame' : ''}.
- Field wajib di prompt thumbnail: reference_image, shot, subject, text_overlay (2-4 kata ${langName} HURUF BESAR yang provokatif, mis. harga atau hook — bukan judul panjang), text_style (bold sans-serif ekstra besar, warna kontras + outline/glow, mudah dibaca di layar HP), color_grade (vivid, high-saturation, dramatic golden-hour/HDR, langit biru dramatis), focal_point, composition (rule of thirds, depth, sudut rendah heroik), badge (badge harga/label mencolok, mis. "${fmtRupiah(p.harga)}"), style, aspect_ratio "16:9".
- Hindari: thumbnail datar, teks kecil, warna pucat, komposisi pas-foto.

FORMAT JSON WAJIB (patuhi persis):
{
  "titles": ["3 judul video SEO Bahasa Indonesia"],
  "description": "deskripsi YouTube 3-5 kalimat + CTA subscribe/WA",
  "chapters_timestamp": ["00:00 Opening", "00:08 <label scene 1>", "..."],
  "caption": "caption share singkat",
  "hashtag_sets": ["5 string, tiap string 5-8 hashtag campur lokasi+jenis+brand #salambumiproperty"],
  "thumbnail": { "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "text_overlay": "...", "text_style": "...", "color_grade": "...", "focal_point": "...", "composition": "...", "badge": "...", "style": "...", "aspect_ratio": "16:9" } },
  "opening": { "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "camera_movement": "... , camera stays within the framing of the reference image", "lighting": "...", "mood": "...", "style": "...", "dialogue": { "speaker": "...", "language": "${language}", "line": "SAMA PERSIS dengan narration_id blok ini", "voice": "...", "delivery": "..." }, "audio": "ambience/musik latar saja", "duration_sec": ${KLIP_MAKS}, "aspect_ratio": "16:9" }, "narration_id": "narasi ${langName}, MAKSIMAL ${NARASI_MAKS} kata" },
  "scenes": [ { "scene": 1, "photo_label": "<label>", "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "camera_movement": "... , camera stays within the framing of the reference image", "lighting": "...", "mood": "...", "style": "...", "dialogue": { "speaker": "...", "language": "${language}", "line": "SAMA PERSIS dengan narration_id blok ini", "voice": "...", "delivery": "..." }, "audio": "ambience/musik latar saja", "duration_sec": ${KLIP_MAKS}, "aspect_ratio": "16:9" }, "narration_id": "narasi ${langName}, MAKSIMAL ${NARASI_MAKS} kata" } ],
  "ending": { "prompt": { "reference_image": "scene_1.webp", "shot": "...", "subject": "...", "camera_movement": "... , camera stays within the framing of the reference image", "cta": "...", "dialogue": { "speaker": "...", "language": "${language}", "line": "SAMA PERSIS dengan narration_id blok ini", "voice": "...", "delivery": "..." }, "audio": "ambience/musik latar saja", "duration_sec": ${KLIP_MAKS}, "aspect_ratio": "16:9" }, "narration_id": "narasi CTA ${langName}, MAKSIMAL ${NARASI_MAKS} kata" }
}
"scenes" berisi TEPAT ${photos.length} item (urutan sama dengan daftar di atas). hashtag_sets TEPAT 5 string. titles/description/caption/hashtag tetap Bahasa Indonesia. Keluarkan HANYA objek JSON.`;

  const tryOrder = [chosenProvider, ...PROVIDER_ORDER.filter(x => x !== chosenProvider)];
  // Output nyata 12 scene ≈ 2.200 token; skala per scene + headroom, jangan flat 8000
  // (max_tokens Gemini juga menghitung token thinking). Mode agen menambah detail subject.
  const maxTokens = Math.min(8000, 1500 + photos.length * 300 + (agent ? 500 : 0));

  // Respons STREAMING NDJSON, bukan JSON tunggal. Alasannya: dari dalam Worker,
  // latensi Gemini terukur >22s bahkan untuk 2 scene (jauh di atas 7-17s dari luar),
  // sehingga pola "tunggu lalu balas" selalu menabrak wall-clock 30s → 502.
  // Dengan mengirim heartbeat tiap 2s response sudah "mengalir" sejak awal, koneksi
  // tetap hidup tanpa batas 30s, dan tiap provider bisa diberi waktu penuh (55s).
  // Baris terakhir: { done:true, data:{...} } atau { done:true, error:"..." }.
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n')).catch(() => {});

  const work = (async () => {
    const heartbeat = setInterval(() => send({ status: 'progress' }), 2000);
    try {
      // Parse + validasi dilakukan DI DALAM loop: output yang rusak/terpotong =
      // kegagalan provider juga, jadi fallback berantai mencoba provider berikutnya
      // alih-alih langsung menyerah. Pola sama dengan parseSceneJson() ai-generate.js.
      let parsed = null, used = null, lastErr = null;
      for (const prov of tryOrder) {
        const key = await getProviderKey(env, prov);
        if (!key) continue;
        const r = await callChatCompletion({
          provider: prov, apiKey: key, model: PROVIDERS[prov].defaultModel,
          systemPrompt: system, userPrompt: user, maxTokens, temperature: 0.6,
          // Gemini 3 Flash = model thinking: tanpa ini ±1.400 token reasoning tersembunyi
          // memperlambat drastis. Dengan "none" JSON tetap valid.
          reasoningEffort: prov === 'gemini' ? 'none' : undefined,
          timeoutMs: 55000,
        });
        if (!r.ok) {
          lastErr = r.error;
          console.error(`[yt-long] ${prov} gagal:`, r.error?.slice(0, 160));
          continue;
        }

        // Ekstraksi JSON tahan-banting: '{' pertama sampai '}' terakhir.
        let kandidat;
        try {
          let txt = String(r.content).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const first = txt.indexOf('{'), last = txt.lastIndexOf('}');
          if (first > 0 || last < txt.length - 1) txt = txt.slice(first, last + 1);
          kandidat = JSON.parse(txt);
        } catch {
          lastErr = 'respons bukan JSON valid (kemungkinan terpotong)';
          console.error(`[yt-long] ${prov} JSON rusak`);
          continue;
        }

        const salah = validasiStoryboard(kandidat, photos.length);
        if (salah) {
          lastErr = salah;
          console.error(`[yt-long] ${prov} output tidak valid:`, salah);
          continue;
        }

        parsed = kandidat; used = prov; break;
      }
      if (!parsed) {
        send({ done: true, error: `Gagal generate storyboard: ${(lastErr || 'semua provider gagal/kehabisan kuota').slice(0, 200)}. Coba lagi / kurangi jumlah foto / ganti provider.` });
        return;
      }

      // negative_prompt disuntik server (deterministik) — lihat suntikNegativePrompt().
      suntikNegativePrompt(parsed);

      // Tautkan foto (url) ke tiap scene sesuai urutan, agar client bisa tampilkan referensinya.
      parsed.scenes = parsed.scenes.map((s, i) => ({ ...s, url_webp: photos[i]?.url_webp ?? null }));

      try {
        await env.DB.prepare(`INSERT INTO viralframe_generations (property_id, params_json, master_prompt, result_json)
                              VALUES (?,?,?,?)`)
          .bind(propertyId, JSON.stringify({ mode: 'youtube_long', photos, visualStyle, cameraStyle, language, agent_id: agent?.id ?? null, rulebook_version: RULEBOOK_VERSION }), null, JSON.stringify(parsed)).run();
      } catch { /* non-fatal */ }

      send({
        done: true,
        data: {
          ...parsed, provider_used: used, kode_listing: p.kode_listing, language,
          agent: agent ? { id: agent.id, nama: agent.nama, foto_url: agent.foto_url } : null,
        },
      });
    } catch (err) {
      console.error('[yt-long] stream', err.message);
      send({ done: true, error: 'Terjadi kesalahan internal saat generate. Coba lagi.' });
    } finally {
      clearInterval(heartbeat);
      await writer.close().catch(() => {});
    }
  })();
  context.waitUntil?.(work);

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions() { return handleOptions(); }
