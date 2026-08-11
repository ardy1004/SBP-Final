# Laporan Audit Komprehensif SBP — 5 Agent, 2 Agustus 2026

**Project**: Salam Bumi Property (salambumi.xyz)
**Stack**: React Router v7 SSR + Cloudflare Pages Functions + D1 + R2
**Metode**: Audit read-only oleh 5 agent paralel dengan fokus tidak tumpang tindih. **Tidak ada kode yang diubah.**
**Basis commit**: `ff67fcb` (working tree bersih saat audit dimulai)

## Pembagian Agent

| # | Agent | Fokus |
|---|---|---|
| 1 | Security & Privasi Data | NIK end-to-end, `/sign` token lifecycle, endpoint publik, JWT, R2, rate limit |
| 2 | Kode & Tabel Mati | Tabel D1 dibaca tapi tak diisi, endpoint yatim, tombstone, kolom mati |
| 3 | Paritas Kontrak & Perilaku | Frontend↔backend field parity, NDJSON cast, state persisten, invarian numerik |
| 4 | Integritas Data & Skema | Ledger migrasi, tanggal WIB, FK cascade, orphan R2/Cloudinary, atomisitas |
| 5 | UX Nyata & Kejujuran Gate | Mobile/a11y/SEO/hydration + apakah gate & dokumentasi jujur |

**Konteks yang mengubah cara menilai** (vs audit 1 Agustus):
- Akun sudah **Workers Paid** sejak 2026-08-01 → batas 10 ms CPU tidak berlaku. Framing performa audit sebelumnya **usang**.
- Terdokumentasi: semua bug nyata sesi 1–2 Agustus **lolos typecheck + bundle + smoke**. Audit ini karena itu memburu bug perilaku, bukan sekadar cek statis.

---

## 🔴 HIGH

### H1. Tombol bulk "SOLD" menghapus jejak SEO listing secara permanen

**Lokasi**: `functions/api/admin/properties/bulk.js:90-100`

Action `'sold'` menjalankan:
```sql
UPDATE properties SET status_sold = 1, status_publish = 'sold', ... WHERE id IN (...)
```

Tapi `functions/api/properties/[slug].js:70` dan `src/app/routes/property-detail.tsx:67` query `WHERE status_publish = 'published'` → halaman properti **langsung 404** (bukan 410, bukan redirect). Efek: hilang dari `sitemap.xml`, backlink & sinyal ranking yang sudah terkumpul hangus seketika.

**Yang membuat ini jelas bug, bukan sekadar pilihan produk**: ada jalur kedua yang berperilaku berbeda. Checkbox `status_sold` individual di `AdminPropertyDetailPage.tsx:534` (via PATCH) **tidak** menyentuh `status_publish` — properti tetap live dengan badge SOLD + schema `SoldOut`. Schema itu dirancang rapi di `property-detail.tsx:224-227` (`availability: p.status_sold ? SoldOut : InStock`) tapi menjadi **kode mati** untuk properti yang di-SOLD lewat tombol bulk, karena halamannya sudah tidak bisa diakses sebelum sempat menampilkannya.

**Dampak**: admin yang pakai tombol bulk (jalur lebih nyaman untuk kerja massal) tanpa sadar menghapus jejak SEO listing yang barusan terjual.

**Rekomendasi**: samakan perilaku — `bulk.js` action `'sold'` cukup set `status_sold=1` saja. Atau kalau memang ingin diarsipkan dari publik, ganti 404 jadi **410 Gone + halaman "properti sudah terjual"** supaya sinyal ke crawler jujur.

---

### H2. Invarian `Σ durasi cut = durationSec Part` pecah senyap

**Terverifikasi dari kedua sisi kode.**

`functions/api/admin/viralframe/suggest-storyboard.js:393-396` menjaga invarian ini saat AI merancang storyboard (tolak bila selisih > 0.5s). Invarian valid tepat setelah "AI Rancang Storyboard" sukses — tapi setelah itu **dua jalur UI mengubah `durationSec` tanpa menyentuh `cuts`**:

| Jalur | Lokasi |
|---|---|
| `gantiAiTool()` — clamp durasi saat ganti AI tool | `AdminViralFrameWorkspacePage.tsx:2603-2615` |
| Input manual durasi Part | `AdminViralFrameWorkspacePage.tsx:3576-3581` |
| `normalisasiParts()` — clamp saat rehidrasi draft | `options.ts:309-354` |

Backend `functions/api/admin/viralframe/ai-generate.js:674-710` (`validatePartAssignments`) **tidak pernah membandingkan** Σ cuts vs `part_durations` — hanya cek jumlah Part, kelengkapan foto, dan kuota `MAX_REF_IMAGES_PER_PART`. `partDurations` divalidasi hanya rentang statis `2 <= durasi <= 30` (`:925-929`), tidak dibandingkan terhadap `getClipMaxSec(aiTool)` maupun terhadap cuts.

**Skenario kegagalan konkret**:
1. User jalankan "AI Rancang Storyboard" dengan `aiTool = google_flow` (clip max 10s) → Part Body dapat 3 cut @ 3-4s (total 10s, valid).
2. User ganti dropdown AI Tool ke `veo3` (clip max 8s) → `gantiAiTool()` potong `durationSec` jadi 8s, **3 cut tetap total 10s**.
3. Tidak ada error, tidak ada warning UI.
4. User lanjut ke tab "AI Generate" → `buildUserPrompt()` (`:594-597`) menulis instruksi kontradiktif: *"PART N — durasi 8 detik"* diikuti daftar cut yang totalnya 10 detik.

**Ironi**: `sumDurasiCuts()` sudah ada di `options.ts:216-221` dan sudah dipakai untuk peringatan tekstual di Jalur A (`masterPromptCompiler.ts:321`) — **tidak dipanggil sama sekali** di Jalur C, padahal Jalur C yang paling mudah memicunya.

**Rekomendasi**:
- Di `gantiAiTool()`: panggil ulang `distribusiDurasiCut(newDurationSec, p.cuts.length)` untuk redistribusi, atau tampilkan warning eksplisit.
- Panggil `sumDurasiCuts()` di Jalur C — badge peringatan di kartu Part (dekat `:3729` yang sudah tampilkan `{p.durationSec}s · {p.cuts.length} cut`).
- Replikasi validasi keras `suggest-storyboard.js:393-396` ke `validatePartAssignments()`, tolak 422 bila menyimpang.

---

## 🟠 MEDIUM

### M1. Iklan Meta berjalan tanpa tracking konversi — `pixel_configs` = 0 baris

**Terverifikasi dengan `COUNT(*)` ke D1 produksi.**

Fitur Meta Pixel + CAPI (P1-P4) ditandai "Live" di `CATATAN_PROGRES.md:155`. Kodenya lengkap dan benar di 7 file: `admin/pixel-configs/index.js`, `[id].js`, `wa-click.js`, `tracking-config.js`, `leads.js`, `createLead.js`, `properties/[slug]/wa-click.js`. **Tapi belum ada satu pun admin yang mengisi config di produksi.**

**Konsekuensi konkret**:
- `tracking-config.js` (dipanggil frontend publik untuk inisialisasi Pixel client-side) selalu mengembalikan array kosong.
- Dedup CAPI di `wa-click.js`/`leads.js`/`createLead.js` selalu no-op.

Ini **bukan bug kode** — ini fitur hidup yang tak pernah dikonfigurasi. Dampaknya: uang iklan Meta jalan tanpa data konversi server-side, padahal iklan Meta adalah sumber trafik utama situs ini.

**Tindakan**: isi config di Admin → Pengaturan → Tracking. Jangan hapus kodenya.

---

### M2. Race condition slot penjadwalan — 2 video bisa terpost di jam yang sama

**Lokasi**: `functions/_lib/schedulerProviders.js:77-95` (`pickNextSlot`), pemanggil di `commit-agent.js`

`pickNextSlot` membaca slot terpakai via SELECT, lalu pemanggil menjalankan `scheduleFanOut` (posting nyata ke Buffer/Zernio, 5 platform) **sebelum** `persistScheduleResult` menulis baris ke D1. Tidak ada transaksi/lock antara baca-slot dan tulis-baris, dan `viralframe_scheduled_posts` tidak punya `UNIQUE(scheduled_at_date, slot_index)` (migrasi 0030 hanya index biasa).

**Skenario**: admin klik "Jadwalkan" untuk 2 video Konten Agent berbeda dalam <1 detik → kedua request baca "slot 3 (12:00) kosong" sebelum salah satu commit → **kedua video benar-benar terpost ke 5 platform sosmed pada jam yang sama**, D1 simpan 2 baris `slot_index=3` tanpa error apa pun.

**Rekomendasi**: reservasi slot via `INSERT ... OR IGNORE` dengan UNIQUE constraint **sebelum** `scheduleFanOut` dipanggil; retry ke slot berikutnya bila gagal.

---

### M3. Orphan Cloudinary di badges — tidak ada pembersihan sama sekali

| Lokasi | Masalah |
|---|---|
| `functions/api/admin/viralframe/badges/[id].js:34-47` | DELETE hanya `DELETE FROM viralframe_badge_assets` — **tidak pernah panggil `destroyCloudinaryAsset`** |
| `functions/api/admin/viralframe/badges/index.js:62-70` | POST upsert menimpa `cloudinary_public_id` lama tanpa menghancurkan asset lama dulu |

Berbeda dengan `agent-videos/[id].js`, `agent-videos/bulk.js`, dan `purge-trash.js` yang **sudah benar** melakukannya. Asset badge jadi orphan permanen di Cloudinary setiap kali admin ganti badge (dan admin ViralFrame kemungkinan sering ganti saat iterasi gaya).

**Rekomendasi**: baca `cloudinary_public_id` lama sebelum UPDATE/DELETE, panggil `destroyCloudinaryAsset` best-effort (pola try/catch sudah ada di file lain untuk dicontoh).

---

### M4. Tidak ada backup terjadwal untuk data NIK & agreement

Tidak ditemukan cron, GitHub Action terjadwal, maupun skrip backup rutin. `.github/workflows/ci.yml` (satu-satunya workflow) hanya build+smoke. Yang ada di repo hanya 3 dump ad-hoc: `backup-audit-2026-07-26.sql`, `backup-sebelum-mojibake.sql`, `backup-sebelum-0026.sql` — namanya sendiri menunjukkan snapshot sebelum operasi berisiko tertentu, bukan rutin.

Mengingat `owners` menyimpan NIK terenkripsi dan `agreements` menyimpan bukti tanda tangan hukum, satu migrasi salah tanpa dump terbaru = kehilangan permanen.

⚠️ **Belum diverifikasi**: apakah **Cloudflare D1 Time Travel** (fitur native D1) sudah cukup menutupi ini. **Cek ini dulu sebelum membangun solusi apa pun.**

---

### M5. Kanvas tanda tangan tanpa alternatif aksesibilitas

**Lokasi**: `src/app/components/SignPage.tsx:395-408`

`<canvas>` mouse+touch only, tanpa `aria-label`, tanpa alternatif keyboard, tanpa instruksi teks untuk pengguna assistive tech. Ini **form legal** (NIK + perjanjian jual-beli) — pengguna yang mengandalkan pembaca layar/keyboard tidak punya jalur menandatangani sama sekali.

**Rekomendasi**: minimal tambah `aria-label="Kanvas tanda tangan — gunakan mouse atau layar sentuh"`; idealnya sediakan jalur fallback (mis. konfirmasi via WA dicatat manual admin).

---

## 🟡 LOW

| # | Temuan | Lokasi |
|---|---|---|
| L1 | `purge-trash.js` **tidak punya pemicu cron sama sekali** — tidak ada `[triggers] crons` di `wrangler.toml`, tidak ada workflow terjadwal. Sampah >30 hari + asset Cloudinary menumpuk tanpa batas, bertentangan dengan asumsi 30 hari di kodenya sendiri | `wrangler.toml`, `functions/api/internal/viralframe/purge-trash.js` |
| L2 | Perbandingan secret non-timing-safe (`header !== secret`) — masih ada dari audit lalu | `purge-trash.js:25` |
| L3 | Fallback CORS `\|\| '*'` — dead code (middleware root intercept OPTIONS duluan), tapi ranjau bila routing berubah. File ini merender NIK | `functions/api/sign/[token]/pdf.js:41` |
| L4 | Turnstile **fail-open** bila `fetch` ke siteverify Cloudflare gagal/timeout, **tanpa memandang hostname** — membuka kembali vektor spam yang dijaga cek host, tapi hanya saat outage Cloudflare | `functions/_lib/turnstile.js:63-66` |
| L5 | Kolom `views`/`likes` **0 baris terisi** (terverifikasi produksi, 85 baris total) → tab Analitik ViralFrame selalu kosong tanpa penjelasan. Pertimbangkan banner "belum ada data" | `viralframe_agent_videos` (migrasi 0034) |
| L6 | `check-viralframe-rulebook.mjs` klaim menjaga paritas kontrak NDJSON tapi `NDJSON_CONTRACT` hanya daftarkan **2 dari 3** jalur — `youtube-long.js` tidak terdaftar | `scripts/check-viralframe-rulebook.mjs` |
| L7 | `min-h-screen` + inline `style={{minHeight:'100vh'}}` — pola bermasalah di mobile browser (address bar). **Butuh verifikasi visual** | `HomePage.tsx:605` |
| L8 | `WHERE substr(scheduled_at,1,10) = ?` tidak bisa pakai index — tabel masih kecil (5 slot/hari) | `schedulerProviders.js:81`, `schedule/status.js:33` |
| L9 | Default kolom `DATE('now','localtime')` (no-op UTC). Tidak berbahaya sekarang (semua INSERT eksplisit pakai `SQL_TANGGAL_WIB`), tapi ranjau laten | `migrations/0010_add_property_view_daily.sql:10` |
| L10 | Path absolut ke mesin ini — gagal di mesin lain | `scripts/find_gmaps.py:3` |
| L11 | Blok `"pnpm": { "overrides": {...} }` inert padahal project pakai npm (`.gitignore` bahkan ignore `pnpm-lock.yaml`) | `package.json:87-91` |
| L12 | `viralframe_videos` **0 baris tanpa penulis aktif** — pembacanya sudah defensif (UNION/`.catch`). Kandidat `DROP TABLE` + bersihkan prefix `viralframe-videos/` dari `ALLOWED_PREFIXES` | `functions/api/admin/media.js:10`, `r2Cleanup.js`, `purge-trash.js` |

---

## ⚠️ Temuan Meta: Dua narasi sebab-akibat yang saling bertentangan

`scripts/check-bundle-budget.mjs:11-16` menyatakan **sebagai fakta terukur** bahwa penyebab Error 1102 (2026-07-25) adalah **anggaran CPU startup** (evaluasi modul saat isolate lahir), dan mengklaim ini "diukur, bukan diduga".

`CLAUDE.md` (bagian Gotcha, diperbarui lebih baru) menyatakan teori itu **salah dan sudah dikoreksi** lewat uji pembeda 2026-07-26: penyebab sebenarnya **berat render per-request** — dibuktikan `/robots.txt` gagal 0% vs `/` gagal 85% di Worker yang sama (kalau memang startup, semuanya akan gagal merata). CLAUDE.md bahkan mencatat teori startup inilah yang dulu membuat berjam-jam habis mengecilkan bundle tanpa hasil.

**Risiko konkret**: dua sumber saling kontradiksi sama-sama diperlakukan otoritatif. Sesi berikutnya yang menghadapi 1102 baru dan membaca script duluan (bukan CLAUDE.md) berisiko mengulang kesalahan diagnosis yang sama.

**Terkait**: `BUDGET_FUNCTIONS_RAW = 6.000.000` kini di ~99% (5.940.611 B). Sejak Workers Paid, ini **anggaran yang ditetapkan sendiri, bukan batas platform**. Perlu keputusan eksplisit: apakah masih menjaga sesuatu yang nyata (startup time, bila itu memang tidak berubah oleh Paid), atau warisan diagnosis lama yang boleh dilonggarkan. Jangan naikkan angka begitu saja untuk menghijaukan CI (sudah dilakukan 2× menurut log ratchet).

**Rekomendasi**: perbarui komentar header `check-bundle-budget.mjs` — akui teori startup sudah disuperseded, atau jelaskan eksplisit kenapa keduanya bisa benar sekaligus.

---

## ✅ Dikonfirmasi Aman / Sudah Diperbaiki Sejak Audit 1 Agustus

### Sudah diperbaiki
- **CORS wildcard** di `functions/api/_shared/response.js` — dihapus total, `functions/_middleware.js` jadi satu-satunya sumber kebenaran (`DEFAULT_ORIGIN` hardcoded, tidak pernah `'*'`).
- **`overview.js` query bulan** — kini pakai `SQL_BULAN_INI_WIB`/`sqlBulanWibMinus` dari `waktu.js`, tidak ada lagi `strftime('now')` mentah.
- **Route admin** — semua 17 route (`src/app/routes/admin/*.tsx`, termasuk `login.tsx` & `layout.tsx`) kini lewat `clientOnly()`. Temuan lama tidak berlaku lagi.
- **Hapus properti** — kini ditolak **409** bila ada `agreements.status='signed'`, di jalur single (`properties/[id]/index.js:364-372`) **dan** bulk (`bulk.js:102-116`, all-or-nothing). Skema `ON DELETE CASCADE` masih ada di `migrations/0001:172-173`, tapi konsekuensinya sudah dimitigasi di lapisan aplikasi.
- **Adapter ViralFrame** — `flatCuts`/`legacyPartsForAI` sudah **tidak ada**; `ai-generate.js` menerima kontrak Part langsung (komentar eksplisit di `AdminViralFrameWorkspacePage.tsx:2491-2493`). Utang teknis dari sesi sebelumnya sudah lunas.

### Terverifikasi kuat
- **Jalur NIK end-to-end**: AES-256-GCM (authenticated encryption), IV acak 12-byte fresh per panggilan (`functions/_lib/crypto.js`) — tidak mungkin reuse. Disimpan `base64(iv):base64(ciphertext)`, tidak pernah plaintext. Semua titik dekripsi hanya log `err.message`, tidak pernah plaintext/ciphertext. Tidak ter-cache di mana pun.
- **Token `/sign`**: `crypto.randomUUID()` (122 bit), expiry 72 jam server-side, sekali-pakai atomik via `UPDATE ... WHERE sign_token=? AND token_used=0` + guard `changes===0` untuk race double-submit (rollback file R2 pada request yang kalah). Setelah ditandatangani, GET berhenti mengembalikan NIK.
- **JWT**: HS256, algoritma **hardcoded** di `verifyJWT` (struktural kebal `alg:none`/confusion), `exp` divalidasi, dan `payload.iat` dicek terhadap `password_changed_at` di D1 → ganti password mencabut token lama.
- **R2**: `PUBLIC_PREFIXES` hanya `property-photos/`, `testimonials/`, `viralframe-characters/`. `signatures/` & `agreements/` (PDF ber-NIK) **tidak** publik. Semua object key pakai `crypto.randomUUID()` → tidak bisa dienumerasi.
- **Tidak ada SQL injection** — semua nilai lewat `.bind()`, interpolasi hanya untuk identifier server-fixed/allowlist.
- **Endpoint publik** semua punya kontrol nyata: `wa-click.js` (enum whitelist + throttle 30/min), `client-error.js` (field capped + throttle 60/min + retensi 90 hari), `chat.js` (CAPTCHA + HMAC ticket 2 jam), `leads.js`/`titip-jual.js` (Turnstile + sanitasi + cap payload + validasi NIK).
- **Ledger migrasi bersih**: 0001–0035 tanpa gap, `wrangler d1 migrations list --remote` = **"No migrations to apply"**. (0033 & 0035 nama file kembar tapi isi berbeda dan keduanya berkomentar — bukan bug.)
- **Batas 100 bound parameter** aman di semua call site `IN (...)`.
- **Tidak ada endpoint yatim** — scan otomatis 81 file `functions/api/**` terhadap seluruh `src/`. Pembersihan 2026-08-02 tuntas di kedua sisi. `siliconflow-token.js` = tombstone 410 yang disengaja.
- **`.gitignore` bersih** dari brace tak berpasangan + dijaga rangkap oleh `assertCssTerbangun()` (lantai 80.000 B + wajib `.flex`/`.grid`/`.rounded`).
- **Redirect WA** — semua jalur (`PropertyDetailPage.tsx:134`, `ContactAdminSheet.tsx:69,82,100`, `ContactPage.tsx:66`) pakai `window.location.href` setelah `await`, sesuai gotcha Meta in-app browser. `ChatWidget.tsx:195,287` pakai `window.open()` tapi sinkron di dalam `onClick` (gestur baru) — aman.
- **SEO lain**: title/meta unik per halaman, OG + Twitter Card lengkap, JSON-LD `RealEstateListing`+`BreadcrumbList` valid, `robots.txt` benar (blokir `/admin`, `/api/`, `/sign/`), `sitemap.xml` & `llms.txt` dinamis dari D1, 404 route ber-`noindex`.
- **Error handling**: `root.tsx:194-229` ErrorBoundary dengan pesan Bahasa Indonesia + auto-report + tombol kembali. Bukan layar putih.
- **`pastikanHasilGenerate()`** (`AdminViralFrameWorkspacePage.tsx:397-406`) memvalidasi `Array.isArray(d.parts)` sebelum setState — pola benar sesuai CLAUDE.md.
- **`applyConfig()`** dipanggil konsisten dari kedua jalur rehidrasi (draft localStorage `:2323-2329` dan riwayat D1 `:3350`).
- **Portfolio & Media** genuinely placeholder — tidak ada tabel/endpoint/kode setengah jadi yang menggantung.

---

## Yang TIDAK Tercakup (diakui jujur oleh agent)

- **Verifikasi visual/browser**: kontras warna, urutan fokus keyboard, ukuran target sentuh 44px, perilaku modal/drawer di layar kecil, dampak nyata `100vh` di mobile browser, dan **perilaku sesungguhnya di in-app browser Instagram/Facebook** (analisis WA redirect murni statis).
- **Status Cloudflare D1 Time Travel** — relevan untuk M4, harus dicek sebelum memutuskan solusi backup.
- **Paritas generic `T` pada `bacaJson<T>()`** untuk endpoint non-streaming satu per satu (`analytics.js`, `status.js`, `models.js`, `presets.js`, `captions.js`).
- **`AdminPropertyDetailPage.tsx` & `AdminViralFramePage.tsx`** — keduanya memanggil `readNdjsonFinal`, kontraknya belum diperiksa detail.
- **Isi objek R2 secara independen** — wrangler 4.95.0 tidak punya `r2 object list`; verifikasi via Dashboard Cloudflare.
- **Kolom legacy** di `properties`/`leads` (migrasi 0006-0011) belum digali baris-per-baris.
- **Audit baris-per-baris tabel endpoint** di `CATATAN_PROGRES.md` (dokumen sangat panjang).
- **Dependensi tak terpakai** di `package.json` (tidak menjalankan `depcheck`).
- **Endpoint `functions/api/admin/viralframe/*`** belum diperiksa exhaustif untuk IDOR/auth-bypass (di luar spot-check `characters`, `backsounds`, `media.js`).

---

## Rekomendasi Prioritas

1. **M1 — bukan ngoding.** Isi `pixel_configs` di Admin → Pengaturan → Tracking. Dampak uang paling langsung, paling cepat dibereskan.
2. **H1** — samakan perilaku dua jalur SOLD (praktis 1 baris di `bulk.js`).
3. **H2** — tambah validasi + redistribusi cuts (pola sudah ada di `suggest-storyboard.js`, tinggal replikasi).
4. **M4** — **cek D1 Time Travel dulu** sebelum membangun solusi backup apa pun.
5. **M2 / M3 / L1** — kelompok ViralFrame housekeeping, bisa dikerjakan satu batch.
6. **Temuan Meta** — selaraskan narasi 1102 antara `check-bundle-budget.mjs` dan `CLAUDE.md` sebelum insiden berikutnya.

---

*Laporan ini murni hasil audit read-only. Tidak ada kode yang diubah, tidak ada commit/push/deploy.*
