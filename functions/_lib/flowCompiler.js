// FLOW COMPILER — merender prompt Google Flow dari IR storyboard (kontrak K3).
//
// DETERMINISTIK. Nol keputusan kreatif di sini: seluruh isinya berasal dari `ir`
// (hasil AI, sudah diverifikasi stasiunStoryboard.js) dan tabel kosakata
// viralframe.js. Renderer yang tidak boleh memutuskan apa pun membuat drift
// antar-jalur mustahil SECARA DESAIN — mesin lama punya tiga jalur prompt
// paralel yang harus dijaga sinkron oleh script penjaga; itu gejala arsitektur,
// bukan solusinya (lihat CLAUDE.md § ViralFrame).
//
// ─── Kontrak K3 (BEKU, jangan diubah tanpa sinkron ulang lintas agent) ───────
//   renderPromptFlow({ ir: { parts, konsep, dnaAgent|null, variasi }, prop, params, faceless })
// `faceless: true` → `ir.dnaAgent` diabaikan SEPENUHNYA, ketiga slot ingredient
// dipakai untuk foto PROPERTI (bukan karakter/talent) — lihat `slotFotoProperti()`.
//
// ─── Asumsi bentuk `ir.parts[].beats[]` (skema K2) ───────────────────────────
// Selain field K2 (`foto_id`, `viewer_question`, `start_state`, `kamera`, `aksi`,
// `reveal`, `informasi_baru`, `end_state`, `next_question`, `mulai`, `selesai`),
// tiap beat diasumsikan JUGA membawa `label` (label ruangan Indonesia hasil
// pencocokan `foto_id` ke foto listing, sama seperti pola lama `cuts[].label`)
// dan `skor` (peringkat visi foto tsb, boleh null) — dipakai untuk memberi
// PERINGKAT reference image per Part. Compiler ini TIDAK menerima daftar foto
// terpisah (K3 hanya `ir/prop/params/faceless`), jadi kedua field itu WAJIB
// sudah menempel di objek beat sebelum sampai ke sini. `kamera`/`aksi`/
// `start_state`/`reveal`/`end_state` diasumsikan sudah berbahasa INGGRIS (siap
// tempel ke prompt Veo) — renderer ini tidak menerjemahkan apa pun.
//
// ─── Tiga hal yang masih mengikat (diwarisi dari mesin lama, terbukti perlu) ─
// 1. TIMESTAMP PROMPTING: blok `[00:00-00:02]` per beat membuat satu Part 10
//    detik berisi beberapa beat, bukan satu bidikan statis.
// 2. FORMULA VEO 3.1: [Cinematography] + [Subject/Action] + [Context] +
//    [Style & Audio] — kamera disebut DULUAN, makanya `kamera` dipisah `aksi`.
// 3. DNA (agent + properti) diulang UTUH di setiap Part karena tiga Part = tiga
//    generate yang tidak saling tahu.

import { FLOW, labelInggris, slotFotoProperti, entriSumbu, bacaBeats } from './viralframe.js';

/** Timecode desimal "00:02.2" dari detik (mulai/selesai K2 berpresisi 0.1). */
function tc(detik) {
  const n = Math.max(0, Number(detik) || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Rapikan teks bebas: string, trim, buang titik/spasi ekor. */
function bersih(v) {
  return String(v ?? '').trim().replace(/[.\s]+$/, '');
}

/**
 * Reference image berperingkat untuk satu Part — inti keputusan batas ingredient.
 *
 * Urut skor visi menurun (peringkat kualitas yang sudah diukur), BUKAN urutan
 * kemunculan di storyboard. Dipotong ke `maxSlot` = `slotFotoProperti(faceless)`.
 */
function fotoUtamaPart(beats, maxSlot) {
  const unik = [...new Map(beats.map(b => [b.foto_id, b])).values()]
    .sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0));
  return { utama: unik.slice(0, maxSlot), cadangan: unik.slice(maxSlot) };
}

/**
 * Baris "VISUAL STORY" satu beat — TEMPORAL INTENT sebagai prosa berurutan
 * (start_state → kamera+aksi → reveal → end_state), bukan sekadar deskripsi
 * sinematografi lepas. Ini yang membedakan dari mesin lama (`"Medium shot,
 * slow push-in."` saja).
 */
function barisBeat(beat, nomorRef, nomorFallback) {
  const kamera = bersih(beat.kamera) || 'Handheld medium shot, steady';
  const aksi = bersih(beat.aksi);
  const awal = bersih(beat.start_state);
  const reveal = bersih(beat.reveal);
  const akhir = bersih(beat.end_state);
  const n = nomorRef.get(beat.foto_id) ?? nomorFallback;

  const bagian = [];
  if (awal) bagian.push(`Starting point: ${awal}.`);
  bagian.push(`${kamera}${aksi ? `, ${aksi}` : ''}.`);
  if (reveal || akhir) {
    const isi = [
      reveal ? `reveals ${reveal}` : null,
      akhir ? `ends with ${akhir}` : null,
    ].filter(Boolean).join(', ');
    bagian.push(`The shot ${isi}.`);
  }
  bagian.push(`Filmed inside reference image [${n}].`);

  return `[${tc(beat.mulai)}-${tc(beat.selesai)}] ${bagian.join(' ')}`;
}

/** Blok CONTINUITY — hanya bila ada sesuatu untuk disambungkan (lihat kontrak K2). */
function blokContinuity(part, adaBerikutnya) {
  const baris = [];
  const masuk = bersih(part.continuity_in);
  const keluar = bersih(part.continuity_out);
  if (masuk) baris.push(`Continuing from the previous part: ${masuk}.`);
  if (adaBerikutnya && keluar) baris.push(`This part ends heading into the next: ${keluar}.`);
  return baris;
}

/**
 * Render prompt Google Flow — satu prompt per Part, siap tempel.
 *
 * @param {object} arg
 * @param {object} arg.ir      { parts, konsep, dnaAgent|null, variasi } — K3.
 * @param {object} arg.prop    baris `properties`.
 * @param {object} arg.params  { detikPerPart, jumlahPart, ... }.
 * @param {boolean} arg.faceless  true → nol talent, 3 slot properti.
 */
export function renderPromptFlow({ ir, prop, params, faceless }) {
  const parts = Array.isArray(ir?.parts) ? ir.parts : [];
  const mood = entriSumbu('mood', ir?.variasi?.mood);
  const dnaAgent = faceless
    ? null
    : (ir?.dnaAgent ?? { bahasaInggris: 'Indonesian presenter', suara: 'natural conversational voice', nama: 'Presenter' });

  const maxSlot = slotFotoProperti(!!faceless);
  const offset = faceless ? 1 : 2; // non-faceless: slot 1 = SUBJECT (talent)

  const gaya = [
    mood?.warna ?? 'natural color grade',
    'shot on mirrorless camera look, shallow depth of field',
    'subtle film grain, natural handheld micro-jitter',
    `${FLOW.rasio} vertical`,
  ].join(', ');

  const lokasi = [prop?.kecamatan, prop?.kabupaten].filter(Boolean).join(', ') || 'Yogyakarta';
  const detikPart = params?.detikPerPart ?? FLOW.detikPerPart;
  const totalPart = parts.length || (params?.jumlahPart ?? FLOW.partPerVideo);

  const suaraDialog = faceless
    ? 'warm neutral narrator voice, relaxed conversational delivery'
    : (dnaAgent?.suara ?? 'natural conversational voice');

  return parts.map((p, i) => {
    const beats = bacaBeats(p);   // toleran skema lama `cuts` — lihat viralframe.js
    const { utama, cadangan } = fotoUtamaPart(beats, maxSlot);
    const nomorRef = new Map(utama.map((b, n) => [b.foto_id, n + offset]));
    const nomorFallback = utama.length ? offset : offset;
    const peran = p.peran || `Part ${i + 1}`;

    // ── REFERENCE IMAGES ──────────────────────────────────────────────────
    const refLines = [];
    if (!faceless) {
      refLines.push('[1] SUBJECT — the presenter. Keep the face, hairstyle, and outfit EXACTLY as in this image.');
    }
    utama.forEach((b, n) => {
      refLines.push(`[${n + offset}] SCENE — the real ${labelInggris(b.label)}. `
        + 'Match its actual layout, materials and lighting. Do not redecorate it or substitute a different place.');
    });

    // ── PROPERTY FIDELITY (penomoran slot digabung ke sini) ────────────────
    const slotProperti = utama.map((b, n) => `[${n + offset}]`).join(', ') || `[${offset}]`;
    const fidelityLines = faceless
      ? [`Reference images ${slotProperti} are the ONLY source of truth for this property — no person appears on camera in this video.`]
      : [`Reference image [1] is the presenter; reference images ${slotProperti} are the ONLY source of truth for the property itself.`];
    fidelityLines.push(
      'Do not redesign or renovate any room. Do not change wall colors, flooring, layout or window placement.',
      'Do not invent or substitute furniture that is not visible in the reference images.',
      'Do not alter the geometry of any room — ceiling height, wall angles and room proportions must match the references exactly.',
    );

    // ── VISUAL STORY ─────────────────────────────────────────────────────
    const storyLines = beats.map(b => barisBeat(b, nomorRef, nomorFallback));

    // ── CONTINUITY ───────────────────────────────────────────────────────
    // Part 1 tidak pernah dapat blok ini, sekalipun `continuity_out`-nya terisi:
    // kontrak K3 hanya menjanjikan blok ini muncul di Part 2–3 (Part 1 tidak
    // punya "Part sebelumnya" untuk disambung), dan info arah akhir Part 1
    // sudah terwakili lewat `end_state` beat terakhirnya di VISUAL STORY.
    const continuityLines = i > 0 ? blokContinuity(p, i < parts.length - 1) : [];

    // ── CAMERA BEHAVIOR ──────────────────────────────────────────────────
    const cameraBehaviorLines = [
      'All camera movement is handheld and realistic: natural walking pace, continuous within each shot, subtle micro-jitter.',
      'No drone shots, no crane or dolly rigs, no floating or gliding camera movement — especially indoors.',
      faceless
        ? 'The camera acts as an unseen observer moving through the space; no person is ever visible operating it.'
        : 'The camera follows the presenter naturally; hands are empty — never shown holding a phone, selfie stick, or camera.',
    ];

    // ── NEGATIVE (umum + spesifik properti) ─────────────────────────────
    const negatifUmum = 'subtitles, captions, burned-in text, watermark, logo, map overlay, infographic, '
      + 'distorted hands, extra people, different room, CGI render, plastic skin, over-smoothed skin, '
      + 'selfie stick, gimbal, camera in hand, mirror reflection of a camera';
    const negatifProperti = 'redesigned or renovated interior, different room layout than the reference images, '
      + 'altered building geometry or ceiling height, staged furniture not present in the photos, '
      + `different exterior facade or address signage, different property, different neighborhood than ${lokasi}`;
    const negatifFaceless = faceless
      ? ', visible person, human figure, on-camera host, narrator visible in frame, hands holding a phone or camera'
      : '';

    const promptLines = [
      `Vertical ${FLOW.rasio} short-form video, ${detikPart} seconds, one continuous scene. Part ${i + 1} of ${totalPart} — role: ${peran}.`,
      `Location: an Indonesian ${prop?.jenis_properti ?? 'residential'} property in ${lokasi}.`,
      '',
      'REFERENCE IMAGES (attached — follow them exactly, they are the source of truth):',
      ...refLines,
      'Everything visible must come from these images. Do not add rooms, furniture, people, '
        + 'graphics, text overlays or map insets that are not in them.',
      ...(dnaAgent ? [`SUBJECT DESCRIPTION (must match image [1]): ${dnaAgent.bahasaInggris}.`] : []),
      '',
      'PROPERTY FIDELITY',
      ...fidelityLines,
      '',
      'VISUAL STORY (temporal sequence — follow start to end exactly):',
      ...storyLines,
      ...(continuityLines.length ? ['', 'CONTINUITY', ...continuityLines] : []),
      '',
      'DIALOG / MUSIC / AMBIENT',
      faceless
        ? `Voiceover narration (off-screen, spoken in Indonesian, ${suaraDialog}): "${p.dialog ?? ''}"`
        : `Dialogue (spoken in Indonesian, ${suaraDialog}): "${p.dialog ?? ''}"`,
      `Music: ${mood?.musik ?? 'subtle background bed'}.`,
      'Ambient: quiet natural room tone, no crowd noise.',
      '',
      'CAMERA BEHAVIOR',
      ...cameraBehaviorLines,
      '',
      'VISUAL QUALITY',
      `Style: ${gaya}.`,
      '',
      'NEGATIVE',
      `Negative: ${negatifUmum}, ${negatifProperti}${negatifFaceless}.`,
    ];

    return {
      part: i + 1,
      peran,
      foto_utama: utama.map(b => ({ id: b.foto_id, label: b.label })),
      foto_cadangan: cadangan.map(b => ({ id: b.foto_id, label: b.label })),
      dialog: p.dialog ?? '',
      teks_layar: p.teks_layar ?? '',
      prompt: promptLines.join('\n'),
    };
  });
}
