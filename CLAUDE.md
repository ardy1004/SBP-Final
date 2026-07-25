# SBP — Salam Bumi Property (salambumi.xyz)

## Identitas Project
- Platform: Website properti Yogyakarta
- Repo: ardy1004/SBP-Final (GitHub)
- Path lokal: G:\A.DataWeb\SBP-Backup\SBP-Blueprint-18\Mobile Friendly Website
- Production: https://salambumi.xyz (Cloudflare Pages, project: sbp-final) — domain sudah LIVE, bukan pending

## Tech Stack
- Frontend: React 18.3.1 + React Router v7 SSR (framework mode), Vite 6, Tailwind CSS v4, shadcn/ui (Radix)
- Backend: Cloudflare Pages Functions (`/functions/`) — bukan Node.js server
- Database: Cloudflare D1 (SQLite) — binding: `DB`, database: `sbp-db`
- Storage: Cloudflare R2 — binding: `MEDIA`, bucket: `sbp-media`
- TypeScript (`src/app/`) + JavaScript (`functions/`)

## Rules Wajib
- SELALU baca file sebelum mengedit
- JANGAN buat file baru kecuali benar-benar perlu
- Semua backend = Cloudflare Pages Functions di `/functions/` (BUKAN Node.js server terpisah)
- Auth: JWT cookie (`sbp_session`, httpOnly+Secure+SameSite=Strict), semua `/api/admin/*` dilindungi `functions/api/admin/_middleware.js`
- Helper response: `functions/api/_shared/response.js` → `jsonOk(data)` / `jsonError(msg, status)`
- Build: `npm run build` (WAJIB 0 error sebelum commit)
- Dev API: `wrangler pages dev dist/client --port=8790` — `npm run dev` (Vite :5173) TIDAK menjalankan `/api/*` maupun D1
- Deploy: `wrangler pages deploy dist/client --project-name sbp-final`
- Windows: matikan zombie node dulu sebelum sesi wrangler baru: `Get-Process node | Stop-Process -Force`
- Setiap ubah route/file yang di-bundle SSR: clean build wajib (`Remove-Item -Recurse -Force dist, .react-router && npm run build`) — hash manifest server/client bisa tidak sinkron kalau tidak

## Secrets di Cloudflare Production
`JWT_SECRET`, `NIK_ENC_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `SILICONFLOW_API_KEY`, `TURNSTILE_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GA4_SERVICE_ACCOUNT_EMAIL`, `GA4_SERVICE_ACCOUNT_PRIVATE_KEY`, `VIRALFRAME_PURGE_SECRET` — di-set via `wrangler pages secret put <KEY> --project-name sbp-final` atau Dashboard (Production **dan** Preview, keduanya harus diisi manual, tidak otomatis sinkron). Untuk Pages gunakan `wrangler pages secret put` (BUKAN `wrangler secret put` yang untuk Worker).
- ⚠️ **Environment Preview saat ini hanya berisi `JWT_SECRET` + `NIK_ENC_KEY`** (audit 2026-07-25). Preview memakai binding D1/R2 yang **sama dengan produksi**, jadi deployment preview tanpa secret lengkap = URL publik yang menulis ke database produksi dengan fitur setengah mati. Cek dengan `wrangler pages secret list --project-name sbp-final --env preview`.
- **API key AI provider** (Gemini/Groq/OpenRouter/DeepSeek) untuk ViralFrame disimpan di tabel D1 `settings` (key `<provider>_api_key`), diinput via Admin → Pengaturan → AI Providers, ditampilkan ter-mask. `getProviderKey()` (`functions/_lib/aiProviders.js`) baca D1 dulu, fallback ke Cloudflare Secret lama (`GROQ_API_KEY`/`DEEPSEEK_API_KEY`).
- **TURNSTILE_SECRET**: verifikasi anti-bot fail-open bila belum di-set (form tetap jalan), fail-closed bila sudah. Site key publik ada di `src/app/components/Turnstile.tsx`. **Fail-open hanya berlaku di host `FAIL_OPEN_HOSTS`** (`salambumi.xyz`, `localhost`) — di host lain (preview `*.pages.dev`) secret kosong = request DITOLAK, agar preview tanpa secret tidak jadi pintu spam ke tabel `leads` produksi.

## Pattern Arsitektur
- API client: `src/lib/api.ts` — tambah tipe dan fungsi fetch di sini
- Routes: `src/app/routes.ts` — tambah route baru di sini (admin = CSR, halaman publik utama = SSR via `src/app/routes/*.tsx`)
- Admin components: `src/app/components/admin/`
- Public components: `src/app/components/`
- SSR routes: `src/app/routes/` (loader query D1 langsung di server, hydrate di client)
- Komponen ber-`window` (recharts/leaflet/dsb) di SSR: WAJIB dynamic import dalam `useEffect` + mounted-flag. JANGAN `React.lazy` — itu menyebabkan hydration mismatch #421 (server render fallback Suspense, client render komponen asli).
  - Pengecualian sah: `React.lazy` aman bila komponennya **tidak pernah dirender saat SSR sama sekali**. Contoh yang sudah ada dan JANGAN "diperbaiki": `PropertiesPage.tsx` merender `LazyPropertyMap` di balik `viewMode === 'map' && isMounted`, sedangkan `viewMode` default `'grid'` — server tidak pernah merender Suspense-nya, jadi tidak ada mismatch.

## Modul Admin — Peta Cepat
13 area sidebar admin, 11 sudah terisi penuh (Overview, Listing, Detail Properti, Titip Jual/Agreements, Leads/CRM, Testimoni, Blog, Lokasi, Pengaturan, ViralFrame). **Portfolio dan Media masih placeholder** ("Segera hadir") — belum dikerjakan sama sekali. Lihat `CATATAN_PROGRES.md` section "AUDIT KOMPREHENSIF" untuk status lengkap per modul dan endpoint.

## AI APIs yang Dipakai
- DeepSeek: `https://api.deepseek.com/chat/completions`, model `deepseek-chat` — AI Description Generator (`functions/api/admin/ai/generate-description.js`)
- Groq: `llama-3.3-70b-versatile` — G-CHAT widget (`functions/api/chat.js`), function calling dengan tool `search_properties` + `submit_lead`
- SiliconFlow: `Wan2.2-I2V-A14B` — video generation ViralFrame Video VO, submit via proxy Worker `functions/api/admin/viralframe/submit-video.js` (API key TIDAK keluar ke browser; ada `negative_prompt` + prompt kamera motion-only agar video setia ke foto referensi)
- Pollinations TTS: `https://text.pollinations.ai/{text}?model=openai-audio&voice=alloy` (gratis, tanpa API key) — voiceover ViralFrame
- **ViralFrame AI Generate (multi-provider)**: Gemini/Groq/OpenRouter/DeepSeek via endpoint OpenAI-compatible, abstraksi di `functions/_lib/aiProviders.js`. Default provider **Gemini**, default model `gemini-3-flash-preview` (free-tier kuota besar). `ai-generate.js` punya **fallback berantai** (provider pilihan → sisanya yang punya key) dengan anggaran waktu 26s (di bawah wall-clock 30s). Model dropdown diambil live dari `/api/admin/viralframe/models?provider=`; status kuota dari `/api/admin/settings/ai-status` (OpenRouter/DeepSeek dari saldo, Gemini/Groq dari health-check).

## ViralFrame — Arketipe & Koreografi Kamera
- **Video Archetype** (`src/app/components/admin/viralframe/archetypes.ts`): 4 gaya (Agen Profesional, Vlogger, POV Walkthrough, Sinematik B-Roll) yang mem-prefill Gaya Visual/Tone/Expression/mode karakter secara koheren + koreografi kamera multi-beat per scene. Diinjeksi ke Master Prompt (BLOK 0) dan ke Jalur C (DeepSeek/multi-provider) via `camera_directives`/`archetype_note` (client compute, backend consume). `compileCameraChoreography()` punya dialek per AI tool (Kling/Veo3/Pika/Runway).
- **Style Pair A/B**: Step 4 bisa generate 2 varian gaya sekaligus untuk uji split.
- Konstanta `LIPSYNC`/`EXPRESSION_EN` = sumber tunggal di `functions/_lib/viralframe-shared.js` (backend impor natif, frontend impor via Vite) — JANGAN duplikasi lagi.

## ViralFrame 2.0 — Memori, Library, Konten (roadmap 6 tahap, semua LIVE)
- **Riwayat**: setiap Master Prompt tersimpan ke `viralframe_generations` (params_json = `{s1,scenes,s3}`). Panel Riwayat di workspace bisa "Muat konfigurasi" (rehydrate) & "Lihat hasil". **Autosave** Step 1-3 ke `localStorage` (`vf_draft_<id>`).
- **Content Library**: video SiliconFlow otomatis diupload ke R2 (`viralframe-videos/`) + tabel D1 `viralframe_videos` (punya kolom `post_url/views/likes` untuk analitik). Endpoint `videos` (POST bytes mentah, GET, `[id]` DELETE/PATCH). Tab "Library" (putar/download/hapus). Tabel dibuat via `wrangler d1 execute --remote` (BUKAN migrations apply, agar tak re-run migrasi lama).
- **List page = dashboard**: badge status (🎬/📝/⬜) dari endpoint `/viralframe/status`, filter "belum ada konten", KPI banner, **batch** multi-select → Storyboard massal.
- **Gaya baru**: arketipe 🤳 Selfie Vlog (tongsis) + parameter **Register Bahasa** (formal/santai/gaul/jawa) lintas arketipe.
- **Caption Studio**, **YouTube Long 1-klik** (`?mode=youtube-long`), **Preset tim** (settings JSON), **Analitik** (gaya pemenang dari metrik), **SRT** di ZIP. Semuanya **tab di dalam `AdminViralFrameWorkspacePage`**, BUKAN route tersendiri — tidak ada entri `/captions`, `/presets`, `/analytics` di `src/app/routes.ts`. Endpoint API-nya tetap terpisah (`/api/admin/viralframe/{captions,presets,analytics,youtube-long}`).
- Semua endpoint AI baru pakai abstraksi `aiProviders.js` + fallback + anggaran waktu <30s.

## Gotcha Wajib Diingat
- **Cloudflare Workers 30 detik wall-clock limit** — panggil API eksternal yang lambat (SiliconFlow, dsb) langsung dari browser (client-side), bukan dari dalam Worker
- **react-leaflet WAJIB v4.2.1** — v5 butuh React 19, project masih React 18.3.1 (downgrade sudah dilakukan, jangan upgrade lagi tanpa upgrade React dulu)
- **Groq function calling**: optional field di schema tool butuh `nullable: true`, bukan cukup opsional biasa
- **Deploy**: selalu verifikasi hash bundle setelah deploy — Cloudflare git integration kadang tidak trigger otomatis
- **PowerShell**: `&&` tidak valid di Windows PowerShell 5.1 — jalankan perintah terpisah atau pakai `;`
- **Meta in-app browser** (Instagram/FB): `window.open()` setelah `await` diblokir — pakai `window.location.href` untuk redirect WA setelah async call
- **Cloudflare Pages [vars] tidak selalu terbaca** dari `wrangler.toml` — env var seperti `ALLOWED_ORIGIN` WAJIB juga di-set manual di Dashboard > Pages > sbp-final > Settings > Environment Variables (Production + Preview)
- **pdf-lib StandardFonts hanya WinAnsi/Latin-1** — karakter di luar itu (≥ ≤ — '' "" …) harus disanitasi sebelum `drawText()` atau akan throw
- **Node zombie di Windows** menahan port wrangler walau sudah Ctrl+C — selalu `Get-Process node | Stop-Process -Force` sebelum sesi baru
- **`public/_headers` TIDAK berlaku untuk response Pages Functions/SSR** — hanya untuk aset statis. Security headers (X-Frame-Options dll) untuk halaman SSR (termasuk `/sign` berisi NIK) WAJIB di-set di `functions/_middleware.js`, bukan cuma `_headers`.
- **Wall-clock 30 detik juga berlaku untuk panggilan AI teks server-side** — fallback berantai multi-provider di `ai-generate.js` dijaga anggaran waktu 26s agar Worker tidak dibunuh (→ 502). Gejala salah model: generate provider pilihan gagal lalu fallback; pesan error 502 sekarang manusiawi (sebut provider + alasan).
- **Verifikasi bundle Functions sebelum deploy** perubahan di `functions/`: `npx wrangler pages functions build --outdir=<tmp>` (exit 0 = aman). `npm run build` HANYA cek bundle React, bukan Functions.
- **`functions/` BISA import file bersama dari `functions/_lib/*.js`** yang juga di-import frontend via Vite (mis. `viralframe-shared.js`) — bukan dari `src/app/`. Ini cara dedup konstanta lintas backend↔frontend tanpa duplikasi.
- **`DATE('now','localtime')` di D1 = UTC, BUKAN WIB** — runtime Cloudflare selalu UTC sehingga modifier `localtime` tidak melakukan apa-apa (diverifikasi ke D1 produksi: `DATE('now')` dan `DATE('now','localtime')` identik). Dulu ini membuat semua metrik "hari ini" di dashboard bergeser 7 jam. Untuk bucket harian WAJIB pakai `functions/_lib/waktu.js` (`SQL_TANGGAL_WIB`, `sqlTanggalWibMinus()`, `tanggalWib()`) — jangan tulis ekspresi tanggal sendiri, dan jangan pakai `toISOString()` untuk mengisi hari kosong pada grafik (itu UTC, akan meleset dari bucket di DB).
- **Batas D1: 100 bound parameter per query** (batas resmi Cloudflare). Query `WHERE id IN (...)` yang dibangun dari array WAJIB dibatasi ≤100 dan dipecah chunk di sisi pemanggil. Lihat `properties/bulk.js` dan `viralframe/agent-videos/bulk.js`.
- **Deploy dari branch**: `wrangler pages deploy dist/client --project-name sbp-final --branch=master` (flag `--branch=master` = produksi; tanpa itu masuk preview). Setelah menggabung beberapa branch fitur untuk deploy, jaga `master` = produksi (push master).
- **Ledger migrasi D1 pernah drift dan sudah direkonsiliasi (2026-07-25)**. Migrasi 0015–0023 dibuat lewat `d1 execute --remote` sehingga objeknya ada tapi tidak tercatat di `d1_migrations`; `migrations apply --remote` berikutnya akan menyeretnya dan GAGAL (0017/0019/0021/0023 = `ALTER TABLE ADD COLUMN` telanjang → "duplicate column name"), bahkan berpotensi menghapus data (0022 = RENAME→CREATE→DROP). Sudah diperbaiki via `scripts/reconcile_d1_migrations_0015_0023.sql`; `migrations list --remote` sekarang bersih.
  - **Aturannya sekarang**: bikin tabel/kolom baru **lewat migrasi**, lalu `wrangler d1 migrations apply sbp-db --remote`. Kalau terpaksa pakai `d1 execute --remote`, WAJIB langsung catat namanya ke `d1_migrations` di transaksi yang sama. Cek `wrangler d1 migrations list sbp-db --remote` harus selalu "No migrations to apply" sebelum menambah migrasi baru.
  - Selalu `wrangler d1 export sbp-db --remote --output=...` sebelum operasi tulis apa pun ke D1 produksi.
