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
`JWT_SECRET`, `NIK_ENC_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `SILICONFLOW_API_KEY` — di-set via `wrangler secret put` atau Dashboard (Production **dan** Preview, keduanya harus diisi manual, tidak otomatis sinkron).

## Pattern Arsitektur
- API client: `src/lib/api.ts` — tambah tipe dan fungsi fetch di sini
- Routes: `src/app/routes.ts` — tambah route baru di sini (admin = CSR, halaman publik utama = SSR via `src/app/routes/*.tsx`)
- Admin components: `src/app/components/admin/`
- Public components: `src/app/components/`
- SSR routes: `src/app/routes/` (loader query D1 langsung di server, hydrate di client)
- Komponen ber-`window` (recharts/leaflet/dsb) di SSR: WAJIB dynamic import dalam `useEffect` + mounted-flag. JANGAN `React.lazy` — itu menyebabkan hydration mismatch #421 (server render fallback Suspense, client render komponen asli).

## Modul Admin — Peta Cepat
13 area sidebar admin, 11 sudah terisi penuh (Overview, Listing, Detail Properti, Titip Jual/Agreements, Leads/CRM, Testimoni, Blog, Lokasi, Pengaturan, ViralFrame). **Portfolio dan Media masih placeholder** ("Segera hadir") — belum dikerjakan sama sekali. Lihat `CATATAN_PROGRES.md` section "AUDIT KOMPREHENSIF" untuk status lengkap per modul dan endpoint.

## AI APIs yang Dipakai
- DeepSeek: `https://api.deepseek.com/chat/completions`, model `deepseek-chat` — AI Description Generator (`functions/api/admin/ai/generate-description.js`)
- Groq: `llama-3.3-70b-versatile` — G-CHAT widget (`functions/api/chat.js`), function calling dengan tool `search_properties` + `submit_lead`
- SiliconFlow: `Wan2.2-I2V-A14B` — video generation ViralFrame Jalur B (dalam pengerjaan aktif, submit dari client-side browser bukan Worker)
- Pollinations TTS: `https://text.pollinations.ai/{text}?model=openai-audio&voice=alloy` (gratis, tanpa API key) — voiceover ViralFrame

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
