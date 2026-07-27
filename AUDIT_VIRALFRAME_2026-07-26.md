# Audit ViralFrame — 2026-07-26

Cakupan: 40 berkas / ~9.700 baris (`functions/api/admin/viralframe/*`, `functions/_lib/viralframe-shared.js`,
`src/app/components/admin/viralframe/*`, `AdminViralFrameWorkspacePage.tsx`).
Fokus: arsitektur, struktur, logika, workflow, dan **kualitas prompt JSON untuk Google Flow / Veo**.

Status gate saat audit dimulai: `npm run typecheck` 0 error, `wrangler pages functions build` exit 0.
Tidak ada yang rusak secara build — seluruh temuan bersifat **desain & kualitas output**.

---

## Temuan

| # | Temuan | Tingkat | Status |
|---|---|---|---|
| 1 | Narasi/dialog tidak pernah sampai ke Veo → video bisu | **Kritis** | ✅ diperbaiki (Tahap 1) |
| 2 | Tidak ada `negative_prompt` untuk Veo/Flow | Tinggi | ✅ diperbaiki (Tahap 1) |
| 3 | Durasi per scene Step 1 diabaikan total oleh Jalur C | Tinggi | ⬜ Tahap 3 |
| 4 | Batas 8 detik per klip Veo tidak pernah disebut | Tinggi | ✅ diperbaiki (Tahap 1) |
| 5 | Batas input durasi tidak konsisten (2–30 vs 1–60 vs clamp 2–30) | Sedang | ⬜ Tahap 3 |
| 6 | `ai_ready_prompt` tetap satu string, bukan objek JSON native Veo | Sedang | ⬜ Tahap 2 |
| 7 | Tidak ada `AbortController` — generate tak bisa dibatalkan | Sedang | ⬜ Tahap 4 |
| 8 | Dua konvensi penamaan file antar jalur | Rendah | ⬜ Tahap 4 |
| 9 | `PHOTO_LABEL_TO_FOTO_LABEL` gagal diam-diam ke `lainnya` | Rendah | ⬜ |

---

### 1. Narasi tidak pernah sampai ke Veo — **Kritis**

**Bukti.** Ketiga jalur menaruh narasi sebagai field *tetangga* prompt video, bukan di dalamnya:

| Jalur | Field prompt | Field narasi |
|---|---|---|
| Master Prompt | `ai_ready_prompt` | `script_narration` |
| AI Generate | `prompt` | `dialog_karakter` |
| YouTube Long | `prompt` (objek) | `narration_id` |

README ZIP menyuruh eksplisit menempel `prompt` saja
([AdminViralFrameWorkspacePage.tsx:1115](src/app/components/admin/AdminViralFrameWorkspacePage.tsx#L1115), sebelum perbaikan).

**Dampak.** Veo 3.x menghasilkan audio native + lip-sync **hanya dari teks di dalam prompt**.
Seluruh `LIPSYNC_TABLE` — 6 baris pemetaan durasi↔jumlah kata, ditegakkan compiler, divalidasi
validator, dipaksa backend — dihitung dengan cermat lalu dibuang di langkah terakhir.
Hasilnya orang di layar bergerak tanpa bicara. Ironisnya **musik justru sampai**, karena blok `[8]`
menyisipkan `musik_prompt` ke akhir `prompt`.

**Perbaikan.** Dialog ditanam ulang ke dalam prompt sebagai kutipan:
- Compiler: BLOK 3c baru (`masterPromptCompiler.ts`) + guardrail BLOK 4 + `negative_prompt` di skema BLOK 5.
- Backend: blok `[4b]` di `buildSystemPrompt()`; prompt tanpa kutipan diperlakukan sebagai
  **kegagalan provider** sehingga fallback berantai mencoba provider lain.
- Validator: Step G — memperingatkan bila `ai_ready_prompt` tak memuat kutipan, dan bila isi
  kutipan tidak cocok dengan `script_narration` (perbandingan longgar: abaikan tanda baca/kapital,
  agar parafrase tipis tidak memicu alarm palsu tapi terjemahan/ringkasan tetap tertangkap).

**Jebakan yang ikut ditangani.** Menanam dialog Bahasa Indonesia ke dalam `prompt` bertabrakan
dengan dua aturan lama yang mewajibkan `prompt` 100% Inggris — termasuk detektor `looksIndonesian()`.
Tanpa penyesuaian, output Veo yang **benar** justru akan ditolak. Terverifikasi:

```
Veo BENAR (dialog ID di kutipan) ditolak? false  ← harus false
Veo SALAH (prompt ID seluruhnya)  ditolak? true   ← harus true
Tanpa flag, Veo BENAR ditolak?             true   ← regresi yang dihindari
```

### 2. Tidak ada `negative_prompt` untuk Veo/Flow — Tinggi

Sebelumnya hanya ada di jalur SiliconFlow ([submit-video.js:33](functions/api/admin/viralframe/submit-video.js#L33)),
yang fokusnya berbeda (mencegah adegan berubah dari foto pada image-to-video).

Veo cenderung **membakar subtitle** ke dalam frame begitu ada dialog di prompt — artinya perbaikan
temuan 1 tanpa ini justru menghasilkan video berteks acak yang tidak bisa dihapus. Kedua perbaikan
wajib berpasangan.

`NEGATIVE_PROMPT_VIDEO` ditambahkan di `functions/_lib/viralframe-shared.js`, disuntik **server-side**
(deterministik — tidak ada gunanya membakar token dan menanggung risiko model lupa).

### 3. Durasi per scene diabaikan Jalur C — Tinggi (belum diperbaiki)

[AdminViralFrameWorkspacePage.tsx:920](src/app/components/admin/AdminViralFrameWorkspacePage.tsx#L920) —
`PLATFORM_DURASI_VF[platform] ?? 8` mengunci durasi ke angka per-platform. Akibatnya:
- `maxWords` selalu dihitung dari 8 detik (26 kata) walau user set 20 detik;
- `beatCountForDuration(8)` selalu 2 beat → cabang 3-beat **tidak pernah tereksekusi**;
- user prompt menyebut durasi yang salah.

Kontrol durasi Step 1 praktis dekoratif untuk jalur ini. Jalur A menghormatinya dengan benar.

### 4. Batas 8 detik Veo — Tinggi

UI mengizinkan 2–30 detik (uniform) dan 1–60 detik (manual); Veo 3.x menghasilkan 8 detik per generate.
Tidak ada peringatan di mana pun. Kini: banner di Step 1 + catatan `BATAS KLIP TOOL` di Master Prompt
+ warning validator.

### 6. Struktur JSON untuk Veo — Sedang (Tahap 2)

Struktur terbaik yang ada justru bukan yang dipakai untuk Veo. `youtube-long.js` sudah mengeluarkan
objek per shot (`reference_image`, `shot`, `subject`, `camera_movement`, `lighting`, `mood`, `style`,
`duration_sec`, `aspect_ratio`). Jalur A & C masih satu string natural language.

---

## Diperiksa dan ternyata TIDAK bermasalah

- **`LABEL_MAP` snake_case vs `PHOTO_LABELS` Title Case.** Sempat diduga meruntuhkan grounding foto
  jadi generik. Jembatannya ada dan benar di
  [AdminViralFrameWorkspacePage.tsx:2281](src/app/components/admin/AdminViralFrameWorkspacePage.tsx#L2281).
- **Celah `LIPSYNC_TABLE`.** Rentang 2–3/4–5/6–8/9–12/13–20/21–30 menutup seluruh bilangan bulat 2..30
  setelah `Math.round`; tidak ada durasi yang jatuh ke fallback tak terduga.

## Tidak diperiksa

- Kualitas video hasil akhir di Google Flow — butuh akun & eksekusi manual.
- Endpoint `captions`, `presets`, `analytics`, `badges`, `agent-videos` (di luar fokus prompt JSON).
- Beban/latensi nyata `ai-generate` di produksi.

---

## Verifikasi Tahap 1

| Uji | Hasil |
|---|---|
| `npm run typecheck` | 0 error |
| `wrangler pages functions build` | exit 0 |
| Veo: BLOK 3c, kutipan dialog, `negative_prompt`, peringatan 8s | 4/4 ✅ |
| Kling: **tidak** terkena blok Veo (tidak ada regresi tool lain) | 2/2 ✅ |
| Validator: prompt benar → 0 warning | ✅ |
| Validator: prompt bisu → 2 warning tepat sasaran | ✅ |
| Detektor bahasa: tidak lagi false-positive pada kutipan ID | ✅ |

## Sisa roadmap

| Tahap | Isi |
|---|---|
| 2 | Skema JSON native Veo untuk `google_flow`/`veo3` (temuan 6) |
| 3 | Sambungkan durasi Step 1 ke Jalur C + samakan batas input (temuan 3, 5) |
| 4 | `AbortController` + samakan konvensi nama file (temuan 7, 8) |
