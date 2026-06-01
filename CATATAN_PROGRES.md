# Catatan Progres Pembangunan SBP Website

> Dokumen ini mencatat progres per fase. Sumber kebenaran tetap `SBP_MASTER_SPEC.md`.
> Update dokumen ini di akhir setiap fase.

---

## STATUS SAAT INI: Fase F — F1 Backend Agreements Selesai ✅

---

## FASE A — Analisis & Setup Git ✅ SELESAI

**Tanggal:** 1 Juni 2026

### Temuan utama:
- Framework: React 18 + Vite 6, CSR murni (belum SSR)
- Styling: Tailwind CSS v4 + shadcn/ui (47 primitif Radix)
- Data: 100% mock di `src/app/data/mockData.ts`
- Admin Dashboard: baru 3 dari 13 modul (Overview, Listing, Leads)
- Credential hardcoded: `admin@salambumi.id / sbpadmin2024` di `AdminLoginPage.tsx` + NIK mock di `SignPage.tsx` → **ditangani di fase keamanan**

### Yang dilakukan:
- [x] Git init + `.gitignore` + commit pertama (`9eeee36`)
- [x] Inventaris fitur lengkap (tabel Ada/Sebagian/Belum Ada)

---

## FASE B — Fondasi Data Layer ✅ SELESAI

**Tanggal:** 1 Juni 2026

### Resource Cloudflare yang dibuat:

| Resource | Nama | ID / Lokasi | Status |
|---|---|---|---|
| D1 Database | `sbp-db` | `76019082-43b7-41b0-81c1-9f652ef7ac45` | ✅ Active (APAC/SIN) |
| R2 Bucket | `sbp-media` | binding: `MEDIA` | ✅ Active |

### File yang dibuat:

| File | Isi |
|---|---|
| `wrangler.toml` | Config Cloudflare: account, D1, R2, vars, dev |
| `migrations/0001_initial_schema.sql` | 9 tabel + 12 index (spec section 4) |
| `migrations/0002_seed_locations.sql` | Lokasi DIY: 1 prov, 5 kab, 76 kec, 114 kel |
| `migrations/0003_seed_dummy.sql` | 3 properti, 1 admin, 2 testimoni, 3 blog |

### Schema D1 — 9 tabel:

| Tabel | Referensi Spec | Catatan |
|---|---|---|
| `locations` | 4.9 | Hierarki 4 level via `parent_id` |
| `admins` | 4.10 | bcrypt hash, `twofa_secret` nullable |
| `properties` | 4.1 + 4.11 | `harga_per_m2` di app layer; `details` JSON |
| `property_images` | 4.2 | CASCADE delete |
| `owners` | 4.4 | `nik` terenkripsi AES di app layer |
| `agreements` | 4.5 | `sign_token` unique, `token_used`, audit trail |
| `leads` | 4.6 | `no_wa` NOT NULL (K6); `notes` JSON array |
| `testimonials` | 4.7 | `tampilkan` + `urutan` untuk reorder |
| `blog_posts` | 4.8 | `tags` JSON; `author_id` → admins |

### Index — 12 total (7 wajib spec 4.11 + 5 tambahan):

**Wajib:** `idx_properties_jenis_status`, `idx_properties_lokasi`, `idx_properties_slug`, `idx_properties_harga`, `idx_leads_status_pipeline`, `idx_agreements_sign_token`, `idx_locations_parent_id`

**Tambahan:** `idx_properties_pilihan`, `idx_properties_published_at`, `idx_blog_posts_status`, `idx_leads_property_id`, `idx_property_images_property_id`

### Data di D1 (local & remote):

| Tabel | Jumlah baris |
|---|---|
| `locations` | 196 (1 prov + 5 kab + 76 kec + 114 kel) |
| `properties` | 3 (rumah, kost, tanah) |
| `admins` | 1 (Monica Vera S, bcrypt hash) |
| `testimonials` | 2 |
| `blog_posts` | 3 |
| `property_images` | 3 |

### Admin seed:
- Email: `admin@salambumi.id`
- Password: `SbpAdmin2024!` (disimpan sebagai bcrypt cost-12, bukan plaintext)
- ⚠️ **Ganti password ini sebelum production via Admin Dashboard**

### Catatan teknis penting:
- `INSERT OR IGNORE` dipakai di semua seed → idempotent, aman dijalankan ulang
- Slug lokasi dibuat unik (suffix `-kel`/`-kec`/`-[kecamatan]` untuk disambiguasi)
- 30+ kecamatan belum ada kelurahannya → lengkapi via Admin Dashboard (Data Lokasi)
- `bcryptjs` ditambahkan sebagai devDependency (untuk generate hash development)
- Vulnerability `npm audit` 1 high → pre-existing, ditangani di fase keamanan

---

## FASE C — Cloudflare Workers API ✅ SELESAI

**Tanggal:** 1 Juni 2026

### Arsitektur yang dipilih:
**Cloudflare Pages Functions** (`/functions/`) — file-system routing, deploy satu perintah bersama frontend, binding D1/R2 otomatis dari `wrangler.toml`.

### File yang dibuat:

| File | Endpoint | Status |
|------|----------|--------|
| `functions/_middleware.js` | CORS global | ✅ |
| `functions/api/_shared/response.js` | Helper `jsonOk/jsonError` | ✅ |
| `functions/api/_shared/jwt.js` | JWT sign/verify (Web Crypto) + cookie helper | ✅ |
| `functions/api/health.js` | `GET /api/health` | ✅ |
| `functions/api/locations.js` | `GET /api/locations?parent_id=` | ✅ |
| `functions/api/properties/index.js` | `GET /api/properties` | ✅ |
| `functions/api/properties/[slug].js` | `GET /api/properties/:slug` | ✅ |
| `functions/api/leads.js` | `POST /api/leads` | ✅ |
| `functions/api/admin/_middleware.js` | JWT auth guard `/api/admin/*` | ✅ |
| `functions/api/admin/login.js` | `POST /api/admin/login` | ✅ |
| `functions/api/admin/logout.js` | `POST /api/admin/logout` | ✅ |
| `functions/api/admin/me.js` | `GET /api/admin/me` | ✅ |
| `migrations/0004_login_rate_limits.sql` | Rate limit table | ✅ |
| `API_REFERENCE.md` | Dokumentasi endpoint lengkap | ✅ |

### Fitur per endpoint:

**`GET /api/health`** — query COUNT locations, kembalikan status DB + jumlah baris.

**`GET /api/locations`** — cascading dropdown 4 level via `parent_id`. Validasi + 404 bila parent tidak ada.

**`GET /api/properties`** — filter: tujuan (dijual/disewa/dijual_disewa), jenis (multi comma-separated), lokasi 4 level (case-insensitive), rentang harga (price-field-aware untuk disewa), KT/KM min. Sort: terbaru (badge-priority) / termurah / termahal / luas / yield. Pagination: page+limit (default 20, max 50). Privasi: `alamat` tidak disertakan.

**`GET /api/properties/:slug`** — detail lengkap + array `images` (urutan) + `details` JSON ter-parse + `investment_intelligence` (yield, payback, cap rate, skor bintang) bila ada `income_per_bulan`. Increment `views_count` non-blocking via `context.waitUntil()`.

**`POST /api/leads`** — K6 kritis: INSERT ke DB SEBELUM response. Sanitasi HTML + normalisasi no_wa (08xx→628xx). Validasi 422 per-field. Response: `lead_id` + `wa_url` + `wa_pesan` terformat (spec 8.8).

**`POST /api/admin/login`** — bcryptjs verify + rate limit 5x/15mnt via D1. JWT HS256 (Web Crypto, tanpa library). Cookie: `sbp_session` httpOnly SameSite=Strict 8 jam. Pesan error generik (tidak bocorkan email exists).

**`POST /api/admin/logout`** — clear cookie (`Max-Age=0`).

**`GET /api/admin/me`** — kembalikan payload JWT (sub, email, nama, role). Dilindungi middleware.

### Migration tambahan:
`migrations/0004_login_rate_limits.sql` — perlu diapply (lihat perintah di bawah).

### Catatan teknis:
- JWT_SECRET wajib dikonfigurasi sebagai secret (`.dev.vars` lokal, `wrangler secret put` produksi)
- `bcryptjs` dipindah ke `dependencies` (runtime, bukan devOnly)
- UI login React (`AdminLoginPage.tsx`) belum diubah — disambungkan di Fase D
- `generateSeoSlug()` & `generateKodeListing()` belum diimplementasi — masuk Fase D saat form admin aktif
- Enkripsi AES untuk `nik` owners — masuk Fase H (keamanan)

### ⚠️ TODO PRODUKSI (wajib sebelum go-live)

Langkah-langkah ini **belum** dilakukan dan harus diselesaikan sebelum deploy ke production:

| # | Item | Perintah / Tindakan |
|---|------|---------------------|
| a | **Kunci CORS** dari `*` ke domain resmi | Edit `functions/_middleware.js`: ganti `'Access-Control-Allow-Origin': '*'` → `'https://salambumi.xyz'` (dan `Access-Control-Allow-Credentials: true`) |
| b | **Set JWT_SECRET production** | `wrangler secret put JWT_SECRET` (isi dengan string acak ≥ 32 karakter, simpan di password manager) |
| c | **Apply migrasi 0004 ke remote** | `wrangler d1 execute sbp-db --remote --file=migrations/0004_login_rate_limits.sql` |
| d | **Ganti data dummy dengan data nyata** | Via Admin Dashboard (Fase G): tambah listing nyata, hapus/tandai dummy sebagai draft, upload foto asli ke R2 |
| e | **Aktifkan flag `Secure` di cookie** | Edit `functions/api/_shared/jwt.js`: uncomment baris `'Secure'` di `makeSessionCookie()` |
| f | **Ganti password admin seed** | Via `POST /api/admin/login` (baru ada endpoint-nya) → tambah endpoint `PUT /api/admin/password` di Fase G |

---

## FASE D — Integrasi Frontend React ↔ Workers API ✅ SELESAI

**Tanggal:** 1 Juni 2026

### Tujuan:
Mengganti semua data mock di frontend dengan data nyata dari Workers API. UI/desain tidak berubah — hanya sumber data yang diganti.

### Commits Fase D:

| Hash | Task | Keterangan |
|------|------|------------|
| `2db6bba` | Task 0 | `src/lib/api.ts` terpusat + Vite proxy `/api → :8787` |
| `e02b289` | Task 1 | Homepage Banner & Cards dari `GET /api/properties` |
| `3f06b53` | Task 2 | Endpoint baru `/api/testimonials` + `/api/blog`; sambung ke homepage |
| `81f7945` | Task 3 | PropertiesPage: filter+sort+pagination server-side via API; lokasi cascade via `GET /api/locations` |
| `1fbc09b` | Task 4 | PropertyDetailPage: galeri, spesifikasi, Investment Intelligence, peta, 404 inline |
| `4a5e879` | Task 5 | LeadForm K6: `POST /api/leads` → simpan DB → buka `wa_url` dari response |

### File baru yang dibuat:

| File | Keterangan |
|------|------------|
| `src/lib/api.ts` | Lapisan API client terpusat: tipe TS, `normalizeProperty()`, `normalizePropertyDetail()`, semua fungsi fetch |
| `functions/api/testimonials.js` | `GET /api/testimonials` — tampilkan=1, ORDER BY urutan |
| `functions/api/blog.js` | `GET /api/blog?limit=&page=` — published, JOIN admins, tags JSON parse |

### Status Data per Halaman/Komponen:

| Halaman / Komponen | Status | Sumber Data |
|--------------------|--------|-------------|
| Homepage — Banner Properti Pilihan | ✅ Live | `GET /api/properties?sort=terbaru&limit=10` |
| Homepage — 6 Kartu Properti | ✅ Live | Sama (slice 6 pertama) |
| Homepage — Investment Teaser | ✅ Live | Sama (find premium+income) |
| Homepage — Testimoni Slider | ✅ Live | `GET /api/testimonials` |
| Homepage — Blog Spill (3 artikel) | ✅ Live | `GET /api/blog?limit=3` |
| PropertiesPage — listing + filter + sort | ✅ Live | `GET /api/properties?{params}` server-side |
| PropertiesPage — lokasi cascade | ✅ Live | `GET /api/locations` → prov → kab → kec |
| PropertyDetailPage — semua field | ✅ Live | `GET /api/properties/:slug` |
| PropertyDetailPage — galeri | ✅ Live | `images[].url_webp` dari detail API |
| PropertyDetailPage — Investment Intelligence | ✅ Live | Objek `investment_intelligence` pre-computed API |
| PropertyDetailPage — peta | ✅ Live | `latitude`, `longitude`, `gmaps_link` dari API |
| PropertyDetailPage — properti serupa | ✅ Live | `GET /api/properties?kabupaten={kab}&limit=5` |
| Form Kontak / LeadForm (K6) | ✅ Live | `POST /api/leads` → `wa_url` dari response |
| **Homepage — HeroFilter cascade** | ⚠️ Mock | `LOCATION_HIERARCHY` statis dari mockData (data sudah cukup untuk UX) |
| **BlogPage** (list + detail) | ⚠️ Mock | `BLOG_POSTS` dari mockData — endpoint `/api/blog/:slug` belum ada |
| **PortfolioPage** | ⚠️ Mock | `PORTFOLIO_ITEMS` dari mockData |
| **FAQPage** | ⚠️ Statis | `FAQ_DATA` konten statis — tidak perlu API |
| **Admin Dashboard** | 🔲 Menyusul | Fase G |

### Endpoint API yang ditambah di Fase D:

| Endpoint | File | Catatan |
|----------|------|---------|
| `GET /api/testimonials` | `functions/api/testimonials.js` | Baru di Fase D |
| `GET /api/blog` | `functions/api/blog.js` | Baru di Fase D |

### Pola loading & error state (semua halaman live):
- **Loading:** `<Skeleton />` (shadcn/ui) — placeholder shape sesuai konten
- **Error:** `AlertCircle` + pesan + tombol "Coba Lagi" (retry fetch)
- **Empty:** Pesan + tombol Reset Filter (PropertiesPage)
- **404:** Inline `PropertyNotFound` (PropertyDetailPage)

### Catatan teknis:
- `src/lib/api.ts` → `normalizeProperty()` dan `normalizePropertyDetail()` mengadaptasi field API (integer 0/1 → boolean, `jenis_properti` → `jenis`, `jumlah_kamar_tidur` → `kamar_tidur`, dll.) agar komponen UI yang sudah ada tidak perlu diubah
- `PropertyCard` tetap menerima tipe lama via `as any` cast — refactor tipe resmi di Fase H
- `mockData.ts` tidak dihapus — masih dipakai HeroFilter, BlogPage, FAQPage, PortfolioPage
- Dev workflow: `npm run dev` (:5173) + `npm run api:dev` (:8787) — atau cukup `:8787` sebagai main URL

---

---

## FASE E — SSR / Edge Rendering 🔄 IN PROGRESS

**Branch:** `feat/ssr-migration`

### Tujuan:
Migrasi dari CSR murni ke SSR via React Router v7 framework mode. Setiap halaman utama mendapat loader D1 server-side, meta dinamis, dan JSON-LD untuk SEO.

### Commits Fase E:

| Hash | Task | Keterangan |
|------|------|------------|
| `6c34643` | Task 1 | Fondasi SSR: react-router.config.ts framework mode, entry.server.tsx, cloudflareDevProxy. Homepage pilot: loader D1 → props SSR, meta + JSON-LD WebSite+LocalBusiness |
| `11e431c` | Task 2 | Fix: exclude static assets dari catch-all route; fix number-format hydration mismatch (`formatRibuan` locale-agnostic) |
| *(pending)* | Task 3 | SSR PropertyDetailPage: loader D1 by slug, meta dinamis, JSON-LD RealEstateListing+BreadcrumbList, HTTP 404, KPRCalculator client-only |

### Task 3 — SSR PropertyDetailPage (selesai, belum commit):

**File baru/diubah:**

| File | Perubahan |
|------|-----------|
| `src/app/routes/property-detail.tsx` | Baru: loader D1 + meta dinamis + JSON-LD + komponen wrapper |
| `src/app/routes.ts` | Diubah: route dijual-detail & disewa-detail → `./routes/property-detail.tsx` |
| `src/app/components/PropertyDetailPage.tsx` | Diubah: terima `ssrProperty?` prop, skip fetch useEffect jika SSR ada; KPRCalculatorClient mounted-flag |
| `.gitignore` | Tambah `.react-router/` |

**Fitur yang diimplementasi:**
- Loader SSR: query D1 by slug (identik dengan `GET /api/properties/:slug`), hitung `investment_intelligence` server-side, throw `Response(null, {status: 404})` jika slug tidak ditemukan
- Meta dinamis per properti: `<title>`, `description` (<160 char), `og:title`, `og:description`, `og:image` (cover properti), `og:url` canonical, `robots: index,follow`
- JSON-LD server-side: `RealEstateListing` (nama, harga IDR, gambar, area kecamatan/kabupaten — tanpa alamat persis sesuai K7) + `BreadcrumbList` (5 level: Home → Dijual/Disewa → Jenis → Kabupaten → Properti)
- HTTP status 404 benar untuk slug tidak valid (bukan 200 fallback)
- HTML awal berisi judul, harga, deskripsi, spesifikasi (terlihat tanpa JS)

**Verifikasi (wrangler pages dev :8787):**
```
curl judul → "Kost Eksklusif Putri 20 Kamar Dekat UNY..." ✅
curl RealEstateListing → FOUND ✅
curl <title> → dinamis sesuai properti ✅
curl 404 → HTTP 404 ✅
BreadcrumbList → FOUND ✅
Harga (Rp...) → FOUND di HTML body ✅
Deskripsi Properti section → FOUND ✅
Console browser → bersih (hanya favicon.ico 404 kosmetik) ✅
```

**KPRCalculator client-only — pola mounted-flag:**

```tsx
// BENAR — dynamic import dalam useEffect (tidak jalan saat SSR)
function KPRCalculatorClient({ defaultHarga }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    let alive = true;
    import('./KPRCalculator').then((m) => { if (alive) setComp(() => m.default); });
    return () => { alive = false; };
  }, []);
  if (!Comp) return <div className="h-40 animate-pulse" />;
  return <Comp defaultHarga={defaultHarga} />;
}

// SALAH — React.lazy + Suspense → server render fallback, client render komponen → mismatch #421
// const KPRCalculator = lazy(() => import('./KPRCalculator'));
```

### ⚠️ GOTCHA Fase E — WAJIB DIBACA sebelum lanjut:

**[a] Clean build wajib setelah perubahan route/file:**
Setiap menambah atau menghapus file yang di-bundle SSR, hash manifest server-client bisa tidak sinkron → muncul 404 aset dengan hash lama. Selalu jalankan clean build:
```powershell
# Windows
Remove-Item -Recurse -Force dist, .react-router
npm run build
```
```bash
# Bash/Linux
rm -rf dist .react-router && npm run build
```

**[b] Wrangler zombie di Windows:**
Wrangler bisa jadi zombie menahan port walau sudah Ctrl+C. Cek dan matikan:
```powershell
Get-NetTCPConnection -LocalPort 8787 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
# Atau pakai port lain: wrangler pages dev dist/client --port=8788
```

**[c] Komponen ber-window (recharts/leaflet) di SSR:**
Pakai **dynamic import dalam useEffect** (mounted-flag), BUKAN `React.lazy`.
- `React.lazy` → server render fallback Suspense, client render asli → **hydration mismatch error #421**
- Mounted-flag → server & client-pertama render placeholder identik → **tidak ada mismatch**

---

### Fase-fase berikutnya setelah D:
- **Fase E:** SSR/Edge Rendering (K1 — kritis untuk programmatic SEO) ✅
- **Fase F:** Alur Titip Jual + Tanda Tangan Digital (F1 backend selesai ✅)
- **Fase G:** Admin Dashboard lengkap (13 modul) — sambungkan juga BlogPage, PortfolioPage ke API
- **Fase H:** Keamanan & compliance (hapus hardcode, enkripsi UU PDP, refactor tipe PropertyCard)
- **Fase I:** SEO Engine (sitemap, schema JSON-LD, halaman programmatic)
- **Fase J:** Diferensiasi (Investment Intelligence lanjutan, Proximity Engine, AI content)

---

---

## FASE F — Alur Titip Jual + Tanda Tangan Digital

**Branch:** `feat/fase-f-agreements`

### F1 — Backend Agreements ✅ SELESAI (2 Juni 2026)

#### Migrasi database:
`migrations/0005_agreements_owners.sql` — 4 perubahan:
1. `ALTER TABLE owners RENAME COLUMN nik TO nik_encrypted` — nama kolom mempertegas isinya ciphertext
2. `ALTER TABLE owners ADD COLUMN updated_at` — kolom yang hilang di skema awal
3. `CREATE INDEX idx_agreements_status` — filter dashboard admin per status
4. `CREATE INDEX idx_owners_property_id` — lookup owner dari property

#### File yang dibuat:

| File | Keterangan |
|------|------------|
| `functions/_lib/crypto.js` | Helper enkripsi/dekripsi NIK: AES-256-GCM via Web Crypto. Passphrase → SHA-256 → 32-byte key. Format: `base64(iv):base64(ciphertext)`. |
| `functions/api/titip-jual.js` | `POST /api/titip-jual` — form titip jual publik: validasi 422, enkripsi NIK, insert 3 tabel atomik (property draft + owner + agreement draft) |
| `functions/api/admin/agreements/[id]/configure.js` | `POST /api/admin/agreements/:id/configure` — admin set jenis_listing/fee/durasi, generate sign_token UUID + expiry 72 jam, status → menunggu_ttd |
| `functions/api/sign/[token].js` | `GET` — validasi token, dekripsi NIK untuk ditampilkan, kembalikan pasal-pasal; `POST` — upload TTD PNG ke R2, atomic UPDATE agreements (token_used=1, status=signed, audit_ip, audit_hash), auto-publish properti |

#### Alur lengkap yang teruji:

```
Pemilik → POST /api/titip-jual                 [NIK terenkripsi AES-GCM, 3 INSERT atomik]
Admin   → POST /api/admin/agreements/:id/configure [sign_token + link TTD]
Pemilik → GET  /api/sign/:token                 [dokumen + pasal ditampilkan]
Pemilik → POST /api/sign/:token {signature PNG}  [R2 upload + DB atomic update + auto-publish]
```

**Bukti R2:** `signatures/SBP-AGR-20260601-001-7e8ceb99-998f-4898-ba33-ecbc746a6be1.png` (PNG valid, 70 bytes) tersimpan di bucket lokal `sbp-media`. Verifikasi: `wrangler r2 object get sbp-media/signatures/... --local` → Download complete ✅.

**Bukti enkripsi:** `POST /api/titip-jual` → `"status": "draft"` 201 OK setelah NIK_ENC_KEY dipindah dari `wrangler.toml` ke `.dev.vars` saja.

**Properti auto-publish:** setelah POST sign berhasil, `UPDATE properties SET status_publish='published'` berjalan non-blocking.

---

### ⚠️ GOTCHA Fase F1 — WAJIB DIBACA

**[a] `.dev.vars` — nilai dengan `=` (base64 padding) gagal ter-inject:**
Wrangler Pages dev pernah gagal menginjeksi env var dari `.dev.vars` jika nilai mengandung karakter `=` (mis. base64 key seperti `abc123==`). Solusi: gunakan passphrase biasa tanpa `=` sebagai `NIK_ENC_KEY`, lalu derive AES key via SHA-256 di dalam `crypto.js` → tidak ada ketergantungan pada karakter tertentu.

**[b] NIK_ENC_KEY JANGAN masuk `wrangler.toml`:**
Kunci enkripsi adalah rahasia. Wrangler.toml di-commit ke Git → kunci masuk riwayat forever.
- Dev lokal: set di `.dev.vars` (gitignored)
- Produksi: `wrangler secret put NIK_ENC_KEY`
- Wrangler.toml hanya boleh punya komentar pengingat, TIDAK nilai kunci.

**[c] `wrangler r2 object list` tidak tersedia di wrangler 4.x:**
Gunakan `wrangler r2 object get <bucket>/<key> --local` untuk verifikasi manual.

---

### ⚠️ TODO PRODUKSI Fase F1 (wajib sebelum go-live)

| # | Item | Perintah / Tindakan |
|---|------|---------------------|
| a | **Set NIK_ENC_KEY production** | `wrangler secret put NIK_ENC_KEY` (isi passphrase acak kuat ≥ 32 char, simpan di password manager) |
| b | **Apply migrasi 0005 ke remote** | `wrangler d1 execute sbp-db --remote --file=migrations/0005_agreements_owners.sql` |
| c | **Endpoint GET /api/admin/agreements** | Tambahkan di Fase G (Admin Dashboard) untuk list semua agreement + filter status |
| d | **Notifikasi WhatsApp** | Setelah POST sign berhasil, kirim WA ke admin via nomor `WA_ADMIN` (Fase F2) |
| e | **Generate PDF arsip** | `TODO F4` di sign handler — simpan ke `pdf_url` di D1 (Fase F3/F4) |

---

## REFERENSI CEPAT

| Item | Nilai |
|---|---|
| D1 database_id | `76019082-43b7-41b0-81c1-9f652ef7ac45` |
| Cloudflare account_id | `f1bac4af6572062bfcf88549ed59c823` |
| R2 bucket | `sbp-media` |
| Admin email (dev) | `admin@salambumi.id` |
| Admin password (dev) | `SbpAdmin2024!` ← **ganti sebelum prod** |
| Wrangler version | 4.94.0 |
| Node.js | 24.16.0 |
