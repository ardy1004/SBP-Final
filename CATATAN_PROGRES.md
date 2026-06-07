# Catatan Progres Pembangunan SBP Website

> Dokumen ini mencatat progres per fase. Sumber kebenaran tetap `SBP_MASTER_SPEC.md`.
> Update dokumen ini di akhir setiap fase.

---

## STATUS SAAT INI: Fase H — Deploy .pages.dev + uji produksi LULUS ✅ (H5 go-live domain pending)

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

---

### F2 — Frontend Titip Jual ✅ SELESAI (2 Juni 2026)

#### File yang dimodifikasi:

| File | Keterangan |
|------|------------|
| `src/app/components/TitipJualPage.tsx` | Form 2 langkah: Langkah 1 = Data Diri, Langkah 2 = Info Properti + Foto |
| `functions/api/titip-jual.js` | Diperluas: terima array foto base64 → upload ke R2 + INSERT property_images |

#### Fitur yang terimplementasi:

- **Form 2 langkah (wizard):** Langkah 1 — Data Diri (nama, NIK, telp, email, bertindak_sebagai); Langkah 2 — Info Properti + Upload Foto. Navigasi Lanjut / Kembali antar langkah.
- **Endpoint diperluas:** `POST /api/titip-jual` kini terima `photos[]` (base64 + mimeType + filename) → upload ke R2 path `property-photos/<propertyId>/<filename>`, INSERT ke `property_images`; foto pertama otomatis jadi cover (`is_cover=1`).
- **Field ahli waris kondisional:** field `nama_pewaris` & `hubungan_pewaris` hanya muncul saat `bertindak_sebagai = ahli_waris`.
- **Cascade lokasi:** Provinsi → Kota/Kab → Kecamatan → Kelurahan/Desa → Jalan via `/api/locations?type=...&parent_id=...`.
- **Consent PDP wajib:** checkbox persetujuan pengolahan data pribadi (Pasal 4 UU 27/2022) harus dicentang sebelum submit bisa aktif.
- **Validasi foto:** max 8 MB per file, tipe image/* saja, tampilkan preview thumbnail + tombol hapus.
- **Halaman sukses:** setelah submit berhasil, tampilkan pesan "Pengajuan Diterima — Tunggu konfirmasi via WhatsApp".
- **4 tabel terisi atomik:** `properties` (status=draft) + `owners` (NIK terenkripsi AES-GCM) + `agreements` (status=draft) + `property_images`.

#### Alur lengkap yang teruji di browser (wrangler port 8790):

```
Pengguna isi Langkah 1 (Data Diri) → Lanjut →
Pengguna isi Langkah 2 (Info Properti + Foto) → Submit →
POST /api/titip-jual { ...formData, photos: [{base64, mimeType, filename}] } →
  ↳ INSERT properties (draft)
  ↳ INSERT owners (NIK terenkripsi)
  ↳ INSERT agreements (draft)
  ↳ FOREACH photo: R2.put(property-photos/<id>/<filename>) + INSERT property_images
→ 201 { status: "draft", propertyId, agreementId } →
Halaman sukses "Tunggu WA"
```

---

### ⚠️ GOTCHA Fase F2 — WAJIB DIBACA

**[a] NODE ZOMBIE menumpuk di Windows:**
Wrangler dev / `wrangler pages dev` sering meninggalkan proses Node yang tetap berjalan di background setelah Ctrl+C. Gejala: server tampak "Ready" tapi koneksi menggantung / timeout / tidak merespons.
Solusi: `Get-Process node | Stop-Process -Force` lalu restart wrangler bersih. Cek berkala: `Get-Process node`.

**[b] JANGAN uji endpoint `/api/*` di `npm run dev` (Vite port 5173):**
Vite dev server TIDAK menjalankan Cloudflare Functions maupun D1. Semua request ke `/api/*` akan 404 atau 500.
Uji API HANYA di mode wrangler: `wrangler pages dev dist/client` (port 8790 atau konfigurasikan sendiri).

**[c] Setiap perubahan komponen/route WAJIB clean build + restart wrangler bersih + hard reload browser:**
Urutan wajib:
1. Hapus `dist/` dan `.react-router/` (`Remove-Item -Recurse -Force dist, .react-router`)
2. Build ulang (`npm run build`)
3. Restart wrangler (setelah kill semua zombie Node)
4. Browser: Empty Cache and Hard Reload (Ctrl+Shift+R atau DevTools)
Jika langkah ini dilewati → 404 aset hash-basi atau hydration error React #418/#421/#423 dari HTML cache lama.

**[d] Jangan jalankan `curl` di terminal yang sama dengan wrangler:**
Curl yang tidak selesai / connection hang di terminal wrangler menyebabkan wrangler hang dan tidak merespons request berikutnya. Pisahkan terminal: satu untuk wrangler, satu untuk curl/testing.

---

### F3 — Halaman /sign Tanda Tangan ✅ SELESAI (2 Juni 2026)

#### File yang dimodifikasi:

| File | Keterangan |
|------|------------|
| `src/app/components/SignPage.tsx` | Ditulis ulang sepenuhnya — konsumsi API nyata GET/POST /api/sign/:token |

#### Fitur yang terimplementasi:

- **State machine token (6 kondisi):**
  - `loading` → skeleton spinner
  - `not_found` / token 404 → "Link Tidak Valid" + tombol WA `wa.me/6281391278889`
  - `kedaluwarsa` / `belum_dikonfigurasi` → "Link Sudah Tidak Berlaku" + tombol WA
  - `sudah_ditandatangani` → "Perjanjian Sudah Ditandatangani" + link ke properti
  - `valid` → dokumen perjanjian + signature pad (alur utama)
  - `success` → halaman sukses 🚀 + "Lihat Properti Saya →" (link properti dari `slug_properti`)
- **Dokumen perjanjian (read-only, scrollable `max-h-[70vh]`):** header "PERJANJIAN JASA PEMASARAN — SALAM BUMI PROPERTY", jenis/nomor/tanggal, Pihak Pertama (CV SBP, data tetap), Pihak Kedua (nama_ktp, NIK, alamat dari API), Pasal 1-7 dari `pasal[]` API, area TTD dua kolom (Ardy kiri, materai+placeholder kanan).
- **Signature pad canvas (mouse + touch):** container `position: relative`, materai `<img>` absolute centered `opacity: 0.55`, `<canvas>` absolute `z-index: 1` transparan di atasnya → goresan TTD tampak menimpa materai (Opsi A visual). Area besar `height: 220px`, buffer `800×220`. Tombol "Hapus" (clearRect). Deteksi non-kosong: `hasSigned` state.
- **Logika tombol "Kirim Perjanjian":** aktif HANYA jika `hasSigned === true` AND `agreed === true`. Disabled abu-abu jika salah satu belum terpenuhi. Petunjuk teks konditional muncul di bawah signature pad.
- **Submit flow:** `canvas.toDataURL('image/png')` → `POST /api/sign/:token { signature, persetujuan: true }` → TTD ke R2 + audit hash + `token_used=1` + properti `auto-publish` → state `success` + link properti dari `buildPropertyUrl(data.properti)`.
- **Stepper dekoratif:** ✓ Data Diri › ✓ Info Properti › ● Tanda Tangan.
- **Checkbox persetujuan** teks persis sesuai spec 12.4.

#### Bug yang diperbaiki selama implementasi:

**isDrawing `useState` → `useRef` (stale closure):**
`draw` di-memoize dengan `useCallback([isDrawing, getPos])`. Saat `startDraw` memanggil `setIsDrawing(true)`, React menjadwalkan re-render secara async. Sebelum re-render selesai, event `mousemove` sudah muncul dan `draw` (closure lama) masih melihat `isDrawing=false` → return early → `setHasSigned(true)` tidak pernah dipanggil → tombol selamanya disabled. Fix: `isDrawingRef = useRef(false)`, diupdate synchronously di `startDraw`/`endDraw`, dicek langsung di `draw` tanpa closure dependency.

#### Alur yang terverifikasi via Playwright Chromium (port 8790):

```
GET /sign/{token-valid}  → dokumen terisi, materai+canvas muncul, submit disabled
Draw TTD di canvas       → "Tanda tangan berhasil direkam", submit masih disabled
Centang checkbox         → submit AKTIF (biru)
GET /sign/{token-invalid}→ "Link Tidak Valid" + tombol WA, tidak ada halaman 404 generik
GET /sign/{token-used}   → "Perjanjian Sudah Ditandatangani"
POST /sign/{token-valid} → R2 upload, token_used=1, status=signed, properti published
```

---

### ⚠️ TODO PRODUKSI F3 (wajib sebelum go-live)

| # | Item | Detail |
|---|------|--------|
| a | **ASET TTD ARDY — BELUM UPLOAD** | URL `https://images.salambumi.xyz/ttd/gsd-removebg-preview.png` → **404**. File `gsd-removebg-preview Copy.png` belum di-upload ke CDN. Akibat: kolom Pihak Pertama (TTD SBP) kosong di dokumen (`onError` menyembunyikan img, tidak crash). **Sebelum produksi:** upload file ke CDN, lalu update konstanta `TTD_ARDY_URL` di baris 10 `src/app/components/SignPage.tsx`. |
| b | **ALIGN PASAL dengan spec 12.6** | Susunan `pasal[]` dari `GET /api/sign/:token` berbeda dari spec 12.6 (saat ini: Pasal 1=PARA PIHAK; spec=Objek properti dengan harga/legalitas). Isi sudah benar — fee dari `fee_persen` API, bukan hardcoded. Align penomoran/konten pasal di `buildPasalPasal()` di `functions/api/sign/[token].js` saat F4 (PDF arsip). |
| c | **VERIFIKASI MATERAI PRODUKSI** | `https://images.salambumi.xyz/materai/hg.png` — konfirmasi CDN menyajikan file ini di produksi. |

---

### ⚠️ GOTCHA tambahan F3 (konfirmasi berulang dari F2)

**[e] NODE ZOMBIE + CHUNK HASH BASI (terjadi LAGI di F3):**
Di sesi F3, 3 proses Node zombie dari sesi sebelumnya semuanya mendengarkan di port 8790. Salah satunya menyajikan HTML dengan chunk hash lama (`SignPage-Ds75rX0F.js`) padahal build baru menghasilkan `SignPage-o6l9CH2t.js`. React tidak bisa load → halaman stuck di "Memuat dokumen perjanjian…" selamanya.

**Protokol wajib sebelum setiap sesi wrangler:**
1. `Get-Process node | Stop-Process -Force` — kill SEMUA node
2. Clean build: `Remove-Item -Recurse -Force dist, .react-router && npm run build`
3. Start SATU instance wrangler: `npx wrangler pages dev dist/client --port 8790`
4. Verifikasi chunk hash benar: `curl http://127.0.0.1:8790/sign/{token} | grep -o "SignPage[^'\"]*\.js"` → harus cocok dengan file di `dist/client/assets/`

---

### F4 — PDF Arsip Perjanjian ✅ SELESAI (2 Juni 2026) — **FASE F TUNTAS**

#### File yang dibuat/dimodifikasi:

| File | Keterangan |
|------|------------|
| `functions/_lib/pdf.js` | **Baru.** Generator PDF perjanjian via pdf-lib: header, nomor+tanggal, Pihak Pertama/Kedua, Pasal 1-7, area TTD overlay (TTD Ardy kiri + materai+TTD owner kanan), footer audit (signed_at/IP/SHA-256/UU ITE). |
| `functions/api/sign/[token]/pdf.js` | **Baru.** `GET /api/sign/:token/pdf` — stream PDF dari R2 (Content-Type: application/pdf, inline). Hanya token status=signed dengan pdf_url tersedia. |
| `functions/api/sign/[token].js` | **Dimodifikasi.** POST handler: setelah TTD tersimpan, generate PDF non-fatal (try/catch) → simpan ke R2 `agreements/{kode}-{uuid}.pdf` → UPDATE agreements SET pdf_url; fix URL TTD Ardy (TODO-a F3 tuntas); align pasal spec 12.6 (fee dari fee_persen, TODO-b F3 tuntas). |
| `src/app/components/SignPage.tsx` | **Dimodifikasi.** Halaman sukses: tambah tombol "Download PDF Perjanjian" yang muncul jika `data.pdf_tersedia === true`, link ke `/api/sign/:token/pdf`. |
| `package.json` + `package-lock.json` | Tambah dependensi `pdf-lib`. |

#### Fitur yang terimplementasi:

- **Generate PDF saat submit sign:** `functions/_lib/pdf.js` dipanggil di POST handler setelah TTD berhasil disimpan ke R2. PDF dibuat dengan pdf-lib (format PDF 1.7), ukuran ~270 KB.
- **Konten PDF (align spec 12.6):**
  - Header: "PERJANJIAN JASA PEMASARAN — SALAM BUMI PROPERTY", nomor, tanggal
  - Pihak Pertama: CV SBP (data tetap)
  - Pihak Kedua: nama_ktp, NIK ter-dekripsi, alamat dari data agreement
  - Pasal 1-7: Objek Perjanjian, Jangka Waktu, Jasa Pemasaran (fee dari `fee_persen`), Kewajiban Para Pihak, Kerahasiaan, Penyelesaian Sengketa, Penutup
  - Area TTD: TTD Ardy (SBP, kiri) + materai+TTD owner kanan — di-fetch dari CDN dan di-embed sebagai gambar
  - Footer audit: signed_at ISO, IP address, SHA-256 hash TTD, UU ITE notice
- **Simpan ke R2:** path `agreements/{kode_listing}-{agreement_uuid}.pdf`; kolom `pdf_url` di tabel `agreements` diisi setelah berhasil.
- **Endpoint GET /api/sign/:token/pdf:** stream isi R2 ke browser sebagai `application/pdf` inline (bukan attachment) — hanya untuk token yang sudah signed dan punya pdf_url.
- **Tombol Download PDF di halaman sukses:** muncul kondisional jika response POST mengandung `pdf_tersedia: true`.
- **Generate PDF non-fatal:** submit perjanjian tetap sukses (return 200) meski PDF gagal di-generate — PDF error hanya di-log, tidak melempar ke client.
- **Fix URL TTD Ardy (TODO-a F3 TUNTAS):** URL `TTD_ARDY_URL` diperbaiki di `[token].js` — fetch dari CDN images.salambumi.xyz berhasil di Workers runtime (TTD Ardy ~21 KB, materai ~231 KB).
- **Align pasal spec 12.6 (TODO-b F3 TUNTAS):** `buildPasalPasal()` di-refactor — penomoran dan konten pasal sesuai spec 12.6.

#### Verifikasi (port 8790):

```
GET /api/sign/:token/pdf          → HTTP 200, Content-Type: application/pdf, body mulai %PDF-1.7 ✅
File size                         → ~270 KB ✅
Fetch TTD Ardy dari CDN           → berhasil (~21 KB) ✅
Fetch materai hg.png dari CDN     → berhasil (~231 KB) ✅
Embed gambar di PDF               → TTD+materai tampil di area tanda tangan ✅
Submit sign → pdf_url terisi      → agreements.pdf_url tidak NULL setelah POST ✅
Tombol Download PDF di SignPage   → muncul saat pdf_tersedia: true ✅
Submit tetap 200 jika PDF gagal   → non-fatal try/catch ✅
```

---

### ⚠️ GOTCHA Fase F4 — WAJIB DIBACA

**[a] pdf-lib StandardFonts HANYA encode WinAnsi / Latin-1:**
Karakter di luar rentang WinAnsi (≥ ≤ — '' "" … dan semua non-Latin) **tidak bisa di-encode** oleh StandardFonts pdf-lib dan akan **throw saat `drawText()`**. Ini terjadi karena pdf-lib StandardFonts menggunakan encoding WinAnsiEncoding (CP-1252) — bukan Unicode.

**Solusi wajib:** sanitizer `toWinAnsi(str)` harus dipanggil pada SEMUA teks sebelum `drawText()`:
```js
function toWinAnsi(str) {
  return (str || '')
    .replace(/≥/g, '>=')   // ≥
    .replace(/≤/g, '<=')   // ≤
    .replace(/—/g, '-')    // em-dash —
    .replace(/[‘’]/g, "'") // '' curly single
    .replace(/[“”]/g, '"') // "" curly double
    .replace(/…/g, '...')  // …
    .replace(/[^\x00-\xFF]/g, '?'); // fallback semua non-Latin-1
}
```
Contoh yang sudah diperbaiki: teks `'≥30%'` → `'>=30%'`, `'Rp —'` → `'Rp -'`.

**Alternatif jangka panjang:** embed font TTF (Noto Sans / DejaVu) via `pdfDoc.embedFont(fontBytes)` → full Unicode. Tapi menambah ukuran PDF ~500 KB. Saat ini WinAnsi sudah cukup untuk konten Latin+angka.

**[b] Fetch gambar dari CDN Workers runtime:**
Fetch gambar dari `https://images.salambumi.xyz/` BERHASIL di Workers runtime (tidak perlu fallback R2). TTD Ardy ~21 KB, materai ~231 KB. Pola `arrayBuffer()` diperlukan untuk embed ke pdf-lib:
```js
const resp = await fetch(url);
const buf = await resp.arrayBuffer();
const img = await pdfDoc.embedPng(buf); // atau embedJpg
```
Jika fetch gagal (404, timeout) → gunakan blok try/catch per gambar, lanjut tanpa gambar (jangan lempar).

---

---

### Perbaikan UI /sign + PDF + Klausul Perjanjian (Revisi Notaris) ✅ SELESAI (3 Juni 2026)

#### Lingkup perbaikan:

**(a) SignPage.tsx — layout UI halaman /sign:**
- Kanvas TTD bebas/luas — TTD menimpa area materai (bukan terkurung kotak sempit)
- Materai proporsional rasio asli (gambar tidak gepeng/distorsi)
- Dua kolom identitas Pihak Pertama / Pihak Kedua rata tengah
- Responsif mobile/tablet: stack vertikal di layar sempit
- Label "Agent Properti" (Pihak Pertama) dan "Pemilik Properti" (Pihak Kedua) — sebelumnya "Direktur"
- Status machine (loading/valid/kedaluwarsa/sudah_ditandatangani/success) tampil tengah bawah
- Tombol "Ulangi TTD" untuk hapus dan gambar ulang tanda tangan

**(b) functions/_lib/pdf.js — layout PDF generator:**
- Materai diperbesar (IMG_H 75→90, slot 20% lebih tinggi) + opacity 0.9 (sebelumnya 0.45 = pucat)
- Rasio materai dijaga (mH × rasio asli, bukan scaleToFit kotak persegi)
- TTD owner menimpa materai (z-order: materai dulu → owner di atas), rapi dalam kolom Pihak Kedua
- Label "Agent Properti" (sebelumnya "Direktur") di bawah nama Ardy Salam
- Nama owner tidak duplikat: hanya muncul SEKALI di bawah garis (sebelumnya muncul 2x)
- Alamat akta: "Jl. Pajajaran, Dabag, Condongcatur, Depok, Sleman, Daerah Istimewa Yogyakarta" — tanpa label "(Virtual Office)"

**(c) functions/api/sign/[token].js — buildPasalPasal — 8 pasal revisi notaris:**
- Hash dokumen: `PT Salam Bumi Property` diperbaiki → `CV Salam Bumi Property` (badan hukum benar)
- **Pasal 2** BERCABANG: Open = berlaku s.d. terjual atau diakhiri sesuai Pasal 6; Exclusive = jangka waktu durasi_kontrak bulan eksplisit
- **Pasal 3** penambahan pemicu fee: fee hak Pihak Pertama jika pembeli diperkenalkan/diperantarai — sebelumnya hanya teks pembayaran
- **Pasal 4** BERCABANG: Open = tidak menutup hak Pihak Kedua pasarkan sendiri; Exclusive = hak tunggal eksklusif
- **Pasal 5** BUG TUNTAS — huruf (d) eksklusivitas ("tidak memasarkan kepada pihak lain...") HANYA muncul jika Exclusive; sebelumnya string `(bila Exclusive)` tercetak di semua jenis listing
- **Pasal 6 BARU** — PENARIKAN PROPERTI & PENGAKHIRAN: notice 14 hari, ganti rugi biaya nyata (iklan/pemotretan/survei), tail period 60 hari → Pasal 3
- **Pasal 7** forum penyelesaian sengketa = PN **lokasi properti** (bukan "Daerah Istimewa Yogyakarta" generik); merujuk ke Pasal 1
- **Pasal 8** (ex-Pasal 7) — UU ITE No. 11/2008 dipertahankan persis, nomor digeser

#### Catatan arsitektur:
- **SATU SUMBER teks pasal:** `buildPasalPasal(agr)` di `[token].js` = sumber tunggal. Dikonsumsi oleh halaman web `/sign` (via GET response JSON) DAN pdf.js (via param `pasalList`). Perubahan teks pasal cukup di satu tempat.
- **Klausul disetujui notaris** — rumusan final Pasal 1-8 sudah direview & disetujui notaris sebelum di-tanam.
- **TODO produksi:** materai yang ditampilkan (gambar `hg.png`) adalah gambar materai, BUKAN e-meterai resmi PERURI. Penggunaan gambar materai = keputusan sadar owner yang harus dipahami sebelum perjanjian digunakan secara hukum formal.

---

### ⚠️ TODO PRODUKSI Fase F — Semua Fase (F1-F4) — Wajib Sebelum Go-Live

| # | Item | Perintah / Tindakan |
|---|------|---------------------|
| 1 | **Set NIK_ENC_KEY production** | `wrangler secret put NIK_ENC_KEY` (passphrase acak ≥ 32 char) |
| 2 | **Verifikasi aset CDN produksi** | Konfirmasi `images.salambumi.xyz/ttd/gsd-removebg-preview.png` (TTD Ardy) dan `images.salambumi.xyz/materai/hg.png` tersedia dan bisa di-fetch dari Workers |
| 3 | **Lock CORS** | Ganti `'*'` → `'https://salambumi.xyz'` di `functions/_middleware.js` |
| 4 | **EXIF strip foto upload** | Foto dari `POST /api/titip-jual` disimpan R2 tanpa strip EXIF — metadata GPS bisa bocor lokasi. Tambahkan EXIF strip sebelum R2.put (masih TODO dari F2). |
| 5 | **Cookie consent banner** | UU PDP memerlukan consent eksplisit sebelum analytics/tracking cookie. Pasang banner sebelum launch. |

---

---

## FASE G — Admin Dashboard Lengkap

**Branch:** `feat/fase-f-agreements`

### G1 — Login Admin + Shell Dashboard ✅ SELESAI (2 Juni 2026)

#### Tujuan:
Mengganti auth mock (sessionStorage + hardcoded credential) di frontend admin dengan auth nyata via API (`POST /api/admin/login`, `GET /api/admin/me`, `POST /api/admin/logout`), dan membangun shell dashboard dengan sidebar 9 modul + placeholder untuk modul G2+.

#### File yang dimodifikasi/dibuat:

| File | Perubahan |
|------|-----------|
| `src/app/components/admin/AdminLoginPage.tsx` | Real auth: `POST /api/admin/login`, handle 401 (salah kredensial) + 429 (rate limit) + network error. Hapus mock sessionStorage. |
| `src/app/components/admin/AdminLayout.tsx` | Auth guard via `GET /api/admin/me` saat mount: redirect ke `/admin/login` jika 401, loading spinner tanpa flash. Nama admin dari API response. Logout via `POST /api/admin/logout`. |
| `src/app/components/admin/AdminOverviewPage.tsx` | Bersih dari mock auth; konten ringkasan dashboard siap sambung API G2. |
| `src/app/components/admin/AdminPlaceholderPage.tsx` | **Baru.** Komponen placeholder "Segera hadir" untuk modul yang belum diisi (G2+). |
| `src/app/routes.ts` | +6 route admin placeholder: Titip Jual, Properti, Leads, Testimoni, Blog, Portfolio, Media, Pengaturan → semua menuju `AdminPlaceholderPage`. |

#### Fitur yang terimplementasi:

- **AdminLoginPage — real auth:** `POST /api/admin/login` dengan body `{ email, password }`. Handle response: 200 → redirect `/admin`; 401 → "Email atau password salah"; 429 → "Terlalu banyak percobaan — coba lagi 15 menit"; network error → pesan generik. Hapus semua mock sessionStorage.
- **AdminLayout — auth guard:** `useEffect` mount → `GET /api/admin/me`. Jika 401 → `navigate('/admin/login')`. Selama fetch berlangsung: tampilkan loading spinner (tidak flash konten terproteksi). Nama admin ditampilkan di header dari response API (`data.nama`).
- **AdminLayout — logout:** tombol Keluar → `POST /api/admin/logout` (clear cookie server-side) → `navigate('/admin/login')`. Tidak mengandalkan state lokal.
- **Sidebar 9 modul:**
  - Ringkasan (AdminOverviewPage — aktif)
  - Titip Jual (AdminPlaceholderPage)
  - Properti (AdminPlaceholderPage)
  - Leads (AdminPlaceholderPage)
  - Testimoni (AdminPlaceholderPage)
  - Blog (AdminPlaceholderPage)
  - Portfolio (AdminPlaceholderPage)
  - Media (AdminPlaceholderPage)
  - Pengaturan (AdminPlaceholderPage)
- **Admin CSR (bukan SSR):** semua route admin dilayani client-side — auth guard lewat `GET /api/admin/me` saat mount, bukan loader SSR. Ini by design agar cookie httpOnly bisa diverifikasi oleh Workers middleware.

#### Alur yang terverifikasi di browser:

```
Akses /admin (tanpa sesi)    → loading spinner → redirect /admin/login (tidak flash konten)
POST /admin/login (salah)    → "Email atau password salah" (401)
POST /admin/login (benar)    → redirect /admin, nama admin tampil di header
Klik sidebar modul G2+       → halaman "Segera hadir" (AdminPlaceholderPage)
Klik Keluar                  → POST /api/admin/logout → redirect /admin/login
```

#### Catatan teknis penting:

- **Kredensial LOCAL dev:** `admin@salambumi.id` / `SbpAdmin2024!` (seed migration `0003_seed_dummy.sql`)
- **Kredensial PRODUKSI:** `salambumiproperty@gmail.com` (akun berbeda — pastikan admin produksi dikonfigurasi dengan benar sebelum go-live via seed atau endpoint `PUT /api/admin/password` di G2)
- **401 dari `GET /api/admin/me` sebelum login adalah NORMAL** — ini cara guard mendeteksi sesi kosong/tidak valid, bukan bug. Jangan alert atau log sebagai error.
- **Fase F masih di branch `feat/fase-f-agreements` dan belum di-merge ke main.** G1 di-commit di branch yang sama. Merge ke main dilakukan setelah semua Fase F + Fase G selesai direview.

---

### G2 — Modul Admin Agreements/Titip Jual ✅ SELESAI (2 Juni 2026)

#### Tujuan:
Mengganti placeholder "Segera hadir" Titip Jual dengan modul admin agreements lengkap: list+filter, detail dengan NIK terdekripsi, edit terbatas field kunci (Opsi X), form konfigurasi perjanjian, generate sign_token, dan tombol Salin+Kirim WA.

#### Endpoint baru:

| Endpoint | File | Keterangan |
|----------|------|------------|
| `GET /api/admin/agreements` | `functions/api/admin/agreements/index.js` | List semua agreement JOIN owners+properties. Filter: `status` query param. Respons tanpa NIK (NIK tidak dikembalikan di list). |
| `GET /api/admin/agreements/:id` | `functions/api/admin/agreements/[id]/index.js` | Detail satu agreement: NIK terdekripsi AES-GCM, foto properti dari R2, semua field perjanjian. |
| `PATCH /api/admin/agreements/:id` | `functions/api/admin/agreements/[id]/index.js` | Edit terbatas field kunci Opsi X: nama, NIK (re-enkripsi), alamat, no_wa, harga, lokasi, jenis_properti. Hanya untuk status `draft` atau `menunggu_ttd`. |

#### Endpoint yang dikonsumsi (dari F1, sudah ada):

| Endpoint | Keterangan |
|----------|------------|
| `POST /api/admin/agreements/:id/configure` | Form konfigurasi: jenis_listing, fee, durasi, jenis_transaksi → generate sign_token + link TTD |

#### File yang dibuat/dimodifikasi:

| File | Perubahan |
|------|-----------|
| `functions/api/admin/agreements/index.js` | **Baru.** GET list + (PATCH di `[id]/index.js`) |
| `functions/api/admin/agreements/[id]/index.js` | **Baru.** GET detail + PATCH update field kunci |
| `functions/api/admin/media.js` | **Baru.** Proxy foto dari R2 ke frontend (via signed URL atau proxy direct) |
| `src/app/components/admin/AdminAgreementsPage.tsx` | **Baru.** Tabel list agreements + filter badge status + navigasi ke detail |
| `src/app/components/admin/AdminAgreementDetailPage.tsx` | **Baru.** Detail agreement: data pemilik (NIK terdekripsi), foto properti, form edit Opsi X, form konfigurasi (radio Open/Exclusive, durasi kondisional, fee manual, jenis transaksi auto), generate link sign + tombol Salin + tombol Kirim WA |
| `src/app/routes.ts` | Tambah route `/admin/agreements` dan `/admin/agreements/:id` → komponen baru |

#### Fitur yang terimplementasi:

- **AdminAgreementsPage — list + filter:**
  - Tabel agreement: nomor, nama pemilik, properti, status (badge warna), tanggal, aksi
  - Filter dropdown status: semua / draft / menunggu_ttd / signed
  - Klik baris → navigasi ke halaman detail

- **AdminAgreementDetailPage — detail lengkap:**
  - Data pemilik: nama, NIK (terdekripsi, tampil di UI), alamat, no_wa
  - Data properti: jenis, lokasi, harga, foto (via proxy R2)
  - Status badge + kode agreement

- **Edit terbatas (Opsi X):**
  - Field yang bisa diedit: nama, NIK, alamat, no_wa, harga, lokasi, jenis_properti
  - NIK diinput plaintext di form → PATCH → re-enkripsi AES-GCM di server sebelum disimpan
  - Hanya aktif untuk status `draft` atau `menunggu_ttd`

- **Form konfigurasi perjanjian (spec 13.5):**
  - Radio `jenis_listing`: Open (non-eksklusif) / Exclusive
  - `durasi_bulan`: input angka — hanya muncul jika jenis_listing = Exclusive
  - `fee_persen`: input manual (persentase)
  - `jenis_transaksi`: auto-detect dari jenis properti (jual / sewa / jual_sewa) — read-only
  - Tombol "Konfigurasi & Generate Link" → `POST /api/admin/agreements/:id/configure`

- **Generate link + Salin + Kirim WA:**
  - Setelah configure berhasil, `sign_token` muncul → URL `/sign/:token` ditampilkan
  - Tombol "Salin Link" → clipboard copy
  - Tombol "Kirim via WA" → `wa.me/{no_wa}?text=...` (Opsi b: wa.me link langsung ke nomor pemilik)

#### Alur end-to-end yang terverifikasi (Playwright Chromium, port 8790):

```
Login /admin/login           → berhasil, redirect /admin
Klik "Titip Jual" sidebar    → AdminAgreementsPage, tabel tampil
Filter status=menunggu_ttd   → tabel terfilter
Klik baris agreement         → AdminAgreementDetailPage, NIK terdekripsi tampil
Edit nama/NIK field          → PATCH /api/admin/agreements/:id → 200, NIK re-terenkripsi di DB
Isi form konfigurasi         → POST configure → link TTD muncul
Klik "Salin Link"            → clipboard terisi URL /sign/:token
Klik "Kirim via WA"          → wa.me/... terbuka di tab baru
Buka /sign/:token            → SignPage tampil dokumen perjanjian (end-to-end ✅)
```

#### Temuan non-bug (dicatat agar tidak dikira bug):

- **Foto kotak hijau di dev:** foto properti tampil sebagai kotak hijau di mode dev — ini bukan bug, melainkan R2 emulation lokal wrangler kosong (tidak ada file foto sebenarnya diupload di local). Di produksi dengan R2 berisi foto nyata, foto tampil normal.

---

### G3a — Modul Admin Properti ✅ SELESAI (3 Juni 2026)

#### Tujuan:
Mengganti placeholder "Segera hadir" Properti dengan modul admin properti lengkap: list semua status + filter, detail/edit 37 field, galeri foto (set cover / hapus), dan manajemen status termasuk soft-delete (archived).

#### Migrasi database:

| File | Isi |
|------|-----|
| `migrations/0006_expand_property_status.sql` | Expand CHECK `status_publish` dari 2 nilai (`draft`/`published`) menjadi 4 (`draft`/`published`/`sold`/`archived`). Recreate tabel karena SQLite tidak support `ALTER COLUMN`. |
| `migrations/0007_restore_property_images.sql` | Restore baris `property_images` yang ikut terhapus saat `DROP TABLE properties` di 0006 (CASCADE DELETE terpicu). 3 seed foto + 6 foto dari sesi uji titip-jual. |

#### Endpoint baru:

| Endpoint | File | Keterangan |
|----------|------|------------|
| `GET /api/admin/properties` | `functions/api/admin/properties/index.js` | List semua properti SEMUA status (draft/published/sold/archived), filter `status`, `q` (cari judul/kode), pagination. Tidak ada filter `status_publish='published'` — khusus admin. |
| `GET /api/admin/properties/:id` | `functions/api/admin/properties/[id]/index.js` | Detail satu properti: semua 37 field + array foto (`property_images` ORDER BY urutan). |
| `PATCH /api/admin/properties/:id` | `functions/api/admin/properties/[id]/index.js` | Update field properti (37 field). Fix NOT NULL: pisah `notNullTextFields` (string kosong `''` dikirim apa adanya) vs `nullableTextFields` (string kosong dikonversi ke `null`). |
| `PATCH /api/admin/properties/:id/status` | `functions/api/admin/properties/[id]/status.js` | Ubah `status_publish`: `draft` / `published` / `sold` / `archived`. Archived = soft-delete (properti tidak dihapus, owner dan agreement tetap utuh). |
| `PATCH /api/admin/properties/:id/photos/:imageId/cover` | `functions/api/admin/properties/[id]/photos/[imageId]/cover.js` | Set foto sebagai cover (`is_cover=1`), reset foto lain di properti yang sama ke `is_cover=0`. |
| `DELETE /api/admin/properties/:id/photos/:imageId` | `functions/api/admin/properties/[id]/photos/[imageId]/index.js` | Hapus satu foto: DELETE dari `property_images`, hapus objek dari R2 (non-fatal jika R2 gagal). |

#### File yang dibuat/dimodifikasi:

| File | Perubahan |
|------|-----------|
| `functions/api/admin/properties/index.js` | **Baru.** GET list semua status + filter |
| `functions/api/admin/properties/[id]/index.js` | **Baru.** GET detail + PATCH update 37 field |
| `functions/api/admin/properties/[id]/status.js` | **Baru.** PATCH ubah status_publish |
| `functions/api/admin/properties/[id]/photos/[imageId]/cover.js` | **Baru.** PATCH set cover foto |
| `functions/api/admin/properties/[id]/photos/[imageId]/index.js` | **Baru.** DELETE hapus foto |
| `src/app/components/admin/AdminPropertyDetailPage.tsx` | **Baru.** Halaman detail/edit properti admin: 37 field dalam form section-based, galeri foto (set cover badge/hapus, placeholder tombol upload untuk G3b), badge status + dropdown ubah status. |
| `src/app/components/admin/AdminListingPage.tsx` | **Dimodifikasi.** Repurpose menjadi list properti admin: filter status (semua/draft/published/sold/archived), badge warna per status, klik baris → navigasi ke AdminPropertyDetailPage. |
| `src/app/routes.ts` | Tambah route `/admin/properties` dan `/admin/properties/:id`. |
| `migrations/0006_expand_property_status.sql` | **Baru.** Expand status CHECK + recreate table. |
| `migrations/0007_restore_property_images.sql` | **Baru.** Restore baris property_images yang hilang. |

#### Fitur yang terimplementasi:

- **List properti admin (`/admin/properties`):**
  - Tabel semua properti SEMUA status (draft, published, sold, archived) — tidak ada filter status_publish='published' seperti endpoint publik
  - Filter dropdown: semua / draft / published / sold / archived
  - Badge warna per status (draft=abu / published=hijau / sold=biru / archived=merah)
  - Pencarian judul/kode listing (`q` query param)
  - Klik baris → navigasi ke halaman detail/edit

- **Detail/edit properti (`/admin/properties/:id`):**
  - Form 37 field dalam section: Info Dasar, Harga, Spesifikasi, Lokasi, Deskripsi, SEO/Meta, Investment
  - Badge status + dropdown ubah status (draft/published/sold/archived) dengan konfirmasi
  - Galeri foto: thumbnail, badge "Cover", tombol "Jadikan Cover" + "Hapus" per foto
  - Placeholder tombol "Upload Foto Baru" (diimplementasikan di G3b)
  - Tombol Simpan → PATCH ke endpoint update field
  - Tombol Kembali ke list

- **Soft-delete via status `archived`:**
  - Status `archived` = properti disembunyikan dari semua tampilan publik
  - Data properti, owner, dan agreement TIDAK dihapus dari DB — aman untuk audit trail
  - Properti `archived` tidak muncul di `GET /api/properties` (publik)

- **Manajemen foto:**
  - Set cover: PATCH `/photos/:imageId/cover` → `is_cover=1`, semua foto lain di properti itu `is_cover=0`
  - Hapus foto: DELETE `/photos/:imageId` → hapus baris DB + hapus objek R2 (non-fatal)

#### Bug yang ditemukan dan diperbaiki:

**NOT NULL error saat update field kosong (kecamatan/kabupaten/provinsi):**
- Gejala: `PATCH /api/admin/properties/:id` dengan field `kecamatan`, `kabupaten`, atau `provinsi` yang dikosongkan → DB reject `NOT NULL constraint failed` → HTTP 500.
- Root cause: semua text field di-handle sama — string kosong `''` dikonversi ke `null` sebelum dimasukkan ke SQL. Tapi kolom lokasi (provinsi/kabupaten/kecamatan/kelurahan) di schema adalah `NOT NULL DEFAULT ''`, sehingga `null` ditolak DB.
- Fix: pisah dua grup field:
  - `notNullTextFields` (provinsi, kabupaten, kecamatan, kelurahan, dll.) → nilai `''` dikirim apa adanya ke DB, tidak dikonversi ke `null`
  - `nullableTextFields` (alamat, deskripsi, gmaps_link, dll.) → `''` dikonversi ke `null` (diperbolehkan DB)

#### Verifikasi keamanan — privasi data publik LULUS:

```
GET /api/properties (publik)         → 7 properti published saja ✅
Properti status=draft                 → TIDAK muncul di endpoint publik ✅
Properti status=archived              → TIDAK muncul di endpoint publik ✅
GET /api/admin/properties (admin)     → semua status tampil (termasuk draft+archived) ✅
```

#### TODO:

| # | Item | Fase |
|---|------|------|
| 1 | Upload foto baru + reorder urutan | G3b |
| 2 | DATA UJI ngawur perlu diarsipkan/dibersihkan sebelum produksi: id=7 (harga 433M / 435 kamar), properti `verified=0` dari sesi uji — ubah status ke `archived` via dashboard atau hapus manual dari D1 sebelum go-live | Sebelum produksi |

---

---

## FASE H — Hardening Pra-Deploy

**Branch:** `feat/fase-h-production`

### H1 — CORS via env + EXIF strip ✅ SELESAI (3 Juni 2026)

#### Lingkup:
Dua hardening keamanan sebelum deploy ke produksi: (1) CORS dari `'*'` menjadi berbasis env var `ALLOWED_ORIGIN` agar fleksibel saat pindah domain; (2) Strip metadata EXIF/GPS dari foto JPEG sebelum disimpan ke R2 — mencegah kebocoran lokasi GPS pemilik properti.

#### CORS — Perubahan:

| File | Perubahan |
|------|-----------|
| `functions/_middleware.js` | **Primary.** Baca `env.ALLOWED_ORIGIN \|\| '*'`. Dipakai di OPTIONS preflight return (intercept semua) dan `headers.set()` pasca-`next()` (override semua response). |
| `functions/api/admin/login.js` | Ganti hardcoded `'*'` → `env.ALLOWED_ORIGIN \|\| '*'` di manual Response. |
| `functions/api/admin/logout.js` | Tambah destruktur `env` dari context; ganti `'*'` → `env.ALLOWED_ORIGIN \|\| '*'`. |
| `functions/api/sign/[token]/pdf.js` | Tambah param `context` pada `onRequestOptions`; ganti `'*'` → `env.ALLOWED_ORIGIN \|\| '*'`. |

**Pola:** `const origin = env.ALLOWED_ORIGIN || '*'` — fallback `'*'` hanya untuk dev lokal (`.dev.vars` tidak di-set atau diset ke `http://localhost:8790`). Di produksi env diset ke URL `.pages.dev`, lalu domain final — **tanpa ubah kode lagi**.

**Note arsitektur:** `functions/api/_shared/response.js` tidak diubah — `_middleware.js` (root) wraps ALL requests, sehingga override CORS headers dari helper statis tersebut otomatis ditimpa. Individual `onRequestOptions` handler juga dead code untuk OPTIONS (root middleware intercepts sebelum `next()`).

**Verifikasi:**
```
GET  /api/health → Access-Control-Allow-Origin: http://localhost:8790 ✅ (dari env)
OPTIONS /api/health → 204, Access-Control-Allow-Origin: http://localhost:8790 ✅ (dari env)
```

#### EXIF strip — Perubahan:

| File | Perubahan |
|------|-----------|
| `functions/_lib/exif.js` | **Baru.** `stripExif(bytes: Uint8Array)` — pure JS, zero dependency, Workers-compatible. Parse JPEG marker chain, skip APP1 segment dengan signature `Exif\0\0` (container GPS + kamera metadata). Non-JPEG (PNG/WebP) dikembalikan tanpa modifikasi. |
| `functions/api/titip-jual.js` | Import `stripExif`. Sebelum `env.MEDIA.put()`: `rawBytes → stripExif(rawBytes) → bytes`. Satu-satunya titik upload foto. |

**Keterbatasan EXIF strip (WAJIB DIBACA sebelum H5/domain publik):**
- ✅ **JPEG:** APP1/EXIF (GPS + kamera metadata) di-strip penuh
- ⚠️ **PNG:** EXIF di chunk `eXIf` — **tidak distrip** (rare di upload properti, namun mungkin di iOS)
- ⚠️ **WebP:** EXIF di chunk `EXIF` — **tidak distrip** (rare, namun bisa dari beberapa kamera/app)
- **Sebelum domain go-live (H5):** pertimbangkan salah satu: (a) batasi upload JPEG saja (drop PNG/WebP), atau (b) strip EXIF di sisi client sebelum upload (FileReader → canvas → toBlob → strip atau cukup canvas re-encode yang sudah drop metadata di kebanyakan browser)

**Verifikasi (unit test 9/9 pass):**
```
EXIF APP1 dihapus dari output ✅
SOI (FF D8) + EOI (FF D9) terjaga ✅
APP0 (JFIF) terjaga ✅
Output lebih kecil dari input ✅
PNG passthrough (sama reference) ✅
Non-JPEG passthrough ✅
JPEG tanpa EXIF: valid SOI+EOI ✅
Build npm run build → sukses, 0 error ✅
```

#### TODO Fase H berikutnya:

| # | Item | Prioritas |
|---|------|-----------|
| **H2** | **Set secret produksi: `wrangler secret put NIK_ENC_KEY` + `wrangler secret put JWT_SECRET`** | 🔴 KRITIS sebelum deploy |
| **H2** | Verifikasi binding D1/R2 Cloudflare Pages project baru (buat project via dashboard atau wrangler) | 🔴 KRITIS |
| **H3** | Migrasi D1 remote (DB produksi kosong): `wrangler d1 execute sbp-db --remote --file=migrations/000x.sql` semua file, lalu seed admin produksi (`0003_seed_dummy.sql` atau buat seed khusus dengan email/password produksi) | 🔴 KRITIS |
| **H4** | Deploy ke `.pages.dev`: `wrangler pages deploy dist/client`. Set env var `ALLOWED_ORIGIN` di Cloudflare Pages dashboard ke URL `.pages.dev` yang diberikan. Verifikasi CORS, submit titip-jual, sign flow. | ⚡ Utama |
| **H5** | Sambung domain `salambumi.xyz` → update `ALLOWED_ORIGIN` ke `https://salambumi.xyz`. Tangani EXIF PNG/WebP (strip client-side atau batasi JPEG). | 📅 Setelah domain aktif |

---

## FASE H — H2/H3/H4 SELESAI ✅

### H2 — wrangler.toml produksi

`name=sbp-final`, `ENVIRONMENT=production`, `account_id` dihapus (Pages tidak mendukung field ini — menyebabkan error deploy).

### H3 — Migrasi DB produksi (sbp-db remote)

Apply manual via `wrangler d1 execute sbp-db --remote --file=...`:
- ✅ 0001_initial_schema.sql — schema + (berisi seed dummy, dibersihkan manual via DELETE setelahnya)
- ✅ 0002_seed_locations.sql — 196 lokasi DIY
- ⏭️ 0003_seed_dummy.sql — SKIP (seed dummy, tidak dipakai produksi)
- ✅ 0004_login_rate_limits.sql
- ⏭️ 0005_agreements_owners.sql — SKIP (schema kolom sudah ada di 0001, apply harmless tapi gagal ALTER di SQLite; schema final sudah benar)
- ✅ 0006_expand_property_status.sql
- ⏭️ 0007_restore_property_images.sql — SKIP (restore data dummy, tidak dipakai produksi)

**PENTING:** 0001 ternyata MENGANDUNG seed dummy (properties, admins dev, testimonials, blog) — dummy dibersihkan via `DELETE FROM` setelah apply. DB final: struktur lengkap + 196 locations + 1 admin produksi (`salambumiproperty@gmail.com`, bcrypt cost-12), 0 data dummy.

**Kelola DB produksi via `d1 execute` manual. JANGAN pakai `migrations apply`** — `d1_migrations` tabel tidak konsisten, bisa retry migration yang sudah pernah jalan dan memasukkan data dummy lagi.

### H4 — Deploy ke project sbp-final (.pages.dev)

Deploy via `wrangler pages deploy dist/client` ke project `sbp-final` (preview env, branch `feat-fase-h-production`).

Secret `NIK_ENC_KEY` + `JWT_SECRET` di-set untuk **Production DAN Preview**. Catatan penting: wrangler 4.94 `pages secret put` tanpa flag `--environment` → set ke Production. Untuk Preview, set via **Cloudflare Dashboard** (Pages > project > Settings > Environment Variables > Preview).

**Uji LULUS di URL preview `.pages.dev`:**
- ✅ `GET /api/health` → `{"status":"ok","environment":"production","db":"connected","locations":196}`
- ✅ Homepage SSR (judul, harga, deskripsi tampil di HTML sebelum JS)
- ✅ Admin login (`salambumiproperty@gmail.com`) — bcrypt verify + JWT cookie
- ✅ Titip jual end-to-end (submit form → property draft + owner + agreement ter-insert atomik)
- ✅ NIK terenkripsi format `IV:ciphertext` (bukan plaintext)
- ✅ Agreement + kode listing ter-generate saat admin configure
- ✅ Data uji sudah dibersihkan dari DB produksi setelah uji

---

### ⚠️ H5 — GO-LIVE DOMAIN (PENDING — WAJIB sebelum publik)

| # | Item | Detail |
|---|------|--------|
| 1 | **APP_URL** | Masih `https://salambumi.xyz` di `wrangler.toml` — benar otomatis saat domain disambungkan ke `sbp-final`. Jika uji lanjut di `.pages.dev`, link `/sign` akan salah arah ke `salambumi.xyz`. |
| 2 | **ALLOWED_ORIGIN** | Belum dikunci (fallback `'*'`). Set ke `https://salambumi.xyz` sebelum publik via Cloudflare Dashboard (Production + Preview). |
| 3 | **NIK_ENC_KEY konsistensi** | Pastikan nilai `NIK_ENC_KEY` Production == Preview (identik) — kritis untuk konsistensi enkripsi/dekripsi NIK lintas environment. |
| 4 | **EXIF PNG/WebP** | H1 hanya strip EXIF JPEG. PNG (`eXIf` chunk) dan WebP (`EXIF` chunk) belum distrip. Sebelum publik: batasi upload JPEG saja, atau strip client-side (canvas re-encode). |
| 5 | **Sambung domain** | Putus `salambumi.xyz` dari project lama `sbp` → sambungkan ke `sbp-final`. Deploy ke Production (branch `master`), bukan preview. |
| 6 | **Uji ulang sign flow** | Setelah domain live: buka link sign, gambar TTD, submit PDF — di domain `salambumi.xyz` asli. |

---

## Pra-Go-Live — Perbaikan Pra-Domain ✅ SELESAI (4 Juni 2026)

**Branch:** `feat/fase-h-prelaunch`

Empat perbaikan kecil & reversible sebelum sambung domain publik. Build sukses, tidak ada error baru.

| # | Item | File | Perubahan |
|---|------|------|-----------|
| 1 | **FAQ fee text → generik** | `src/app/data/mockData.ts` | Teks fee `"3%/5%/10%"` (spec lama) diganti → `"Besaran fee jasa pemasaran disepakati bersama dan dicantumkan dalam perjanjian."` — tidak menyebut persentase tetap, sesuai skema fee manual saat ini. |
| 2 | **Blog & Portfolio disembunyikan dari Navbar + Footer** | `Navbar.tsx`, `Footer.tsx` | Link menu Blog dan Portofolio di-comment dengan tag `// TODO aktifkan kembali`. Halaman/route `BlogPage` dan `PortfolioPage` **tetap ada** — hanya tidak ada link dari navigasi. Alasan: konten masih mock, halaman detail blog (`:slug`) menghasilkan 404. |
| 3 | **Upload foto dibatasi JPEG saja** | `TitipJualPage.tsx` (frontend), `functions/api/titip-jual.js` (backend) | Frontend: `accept="image/jpeg"`, validasi tipe hanya `image/jpeg`, pesan error "Hanya foto JPG yang didukung saat ini." Backend: regex validasi diubah dari `jpeg\|jpg\|png\|webp` → `jpeg\|jpg`, error "Format foto harus JPG". Alasan: `stripExif()` di `functions/_lib/exif.js` hanya bisa strip EXIF dari JPEG — PNG (`eXIf` chunk) dan WebP (`EXIF` chunk) tidak distrip, berpotensi bocorkan GPS. |
| 4 | **Secure flag cookie session diaktifkan** | `functions/api/_shared/jwt.js` | Baris `// 'Secure',` di `makeSessionCookie()` di-uncomment → `'Secure'` aktif. Cookie session kini HttpOnly + SameSite=Strict + **Secure** — hanya dikirim via HTTPS. Catatan: uji login lokal via `http://localhost` tidak akan menge-set cookie ini (wajar dan benar — produksi `.pages.dev` dan domain custom pakai HTTPS). |

---

## Fix Konsistensi Jenis Properti ✅ SELESAI (4 Juni 2026)

**Branch:** `feat/fix-property-types`

### Akar masalah

Daftar jenis properti didefinisikan secara terpisah di 4 tempat frontend dengan value, label, dan urutan yang berbeda-beda. **BUG KRITIS:** `HeroFilter` (HomePage) dan `PropertiesPage` menggunakan value `'apartemen'` padahal DB menyimpan `'apartment'` — akibatnya filter apartemen di-drop secara silent oleh backend (`VALID_JENIS` tidak mengenali `'apartemen'`), sehingga semua properti dikembalikan tanpa filter.

### Solusi

| Komponen | Perubahan |
|---|---|
| `src/lib/propertyTypes.ts` (**baru**) | Sumber kebenaran tunggal — array `PROPERTY_TYPES` (10 tipe, urutan canonical), helper `getPropertyTypeLabel()` + `getPropertyTypeEmoji()` |
| `HomePage.tsx` HeroFilter | Import `PROPERTY_TYPES`, hapus hardcoded array — value `'apartment'` benar (fix bug) |
| `PropertiesPage.tsx` | Hapus 9-item `JENIS_OPTIONS` lokal, pakai `PROPERTY_TYPES.map(...)` — fix value `'apartemen'`→`'apartment'` |
| `TitipJualPage.tsx` | Hapus 9-item array lokal, pakai `PROPERTY_TYPES.map(...)` — label selaras canonical |
| `AdminPropertyDetailPage.tsx` | `JENIS_OPTIONS = PROPERTY_TYPES`, render `t.label` (bukan raw value lowercase) |
| `src/lib/api.ts` `normalizeProperty` | Hapus `JENIS_EMOJI` + `capitalize()`, pakai `getPropertyTypeLabel/Emoji` dari `propertyTypes.ts` |
| `functions/api/titip-jual.js` | Tambah `'ruko'` ke `JENIS_VALID` (jadi 10 nilai) |
| `functions/api/properties/index.js` | Tambah `'ruko'` ke `VALID_JENIS` (jadi 10 nilai) |
| `functions/api/admin/properties/[id]/index.js` | Tambah `'ruko'` ke `VALID_JENIS` (jadi 10 nilai) |
| `migrations/0008_add_ruko_property_type.sql` (**baru**) | Recreate table `properties` — identik 0006, hanya CHECK `jenis_properti` diperluas: tambah `'ruko'` (jadi 10 nilai) |

### 10 jenis properti canonical (urutan & label baku)

`apartment` (Apartment), `rumah` (Rumah), `tanah` (Tanah), `kost` (Kost), `hotel` (Hotel), `homestay` (Homestay/Guesthouse), `villa` (Villa), `ruko` (Ruko — **baru**), `gudang` (Gudang), `komersial` (Komersial Lainnya)

### Hasil verifikasi lokal

- ✅ Build sukses (0 TypeScript error)
- ✅ `GET /api/properties?jenis=apartment` → filter diterapkan benar (bukan di-drop)
- ✅ `POST /api/titip-jual` dengan `jenis_properti=ruko` → lolos validasi (bukan ditolak)
- ✅ Migrasi 0008 diterapkan ke **DB lokal** — 6 perintah sukses

### ⚠️ PENTING — Langkah wajib setelah merge ke master

**DB produksi (remote) BELUM dimigrasi.** Setelah merge, jalankan:

```bash
wrangler d1 execute sbp-db --remote --file=migrations/0008_add_ruko_property_type.sql
```

Aman dijalankan: DB produksi kosong (0 properti), INSERT SELECT tidak akan konflik. Setelah itu redeploy ke Pages.

---

## Admin Dashboard Gelombang 1 — Modul Overview Real ✅ SELESAI (4 Juni 2026)

**Branch:** `feat/admin-overview`

### Konteks

AdminOverviewPage sebelumnya menampilkan 100% data hardcoded (KPI_DATA, MONTHLY_LEADS, JENIS_CHART, ACTIVITY). Diubah untuk mengambil data nyata dari DB via endpoint baru.

### Endpoint baru

**`GET /api/admin/overview`** — dilindungi auth guard JWT (`_middleware.js`, otomatis mencakup semua `/api/admin/*`).

File: `functions/api/admin/overview.js`

Mengembalikan:
- `kpi` — 13 metrik nyata dari DB (lihat tabel di bawah)
- `leads_per_bulan` — 6 bulan terakhir (COUNT GROUP BY bulan, missing month = 0)
- `distribusi_jenis` — COUNT properties GROUP BY jenis_properti
- `aktivitas_terbaru` — gabungan leads terbaru + agreements signed + listings published/sold, sorted by waktu (maks 8 item)

### Tabel investigasi metrik

| Metrik dummy lama | Bisa dihitung dari DB? | Sumber / Catatan |
|---|---|---|
| Total Listing Aktif (47) | ✅ Ya | `COUNT properties WHERE status_publish='published'` → renamed "Properti Published" |
| Total Leads Bulan Ini (128) | ✅ Ya | `COUNT leads WHERE created_at >= start of month` + delta vs bulan lalu |
| Total Views 30 Hari (12.4K) | ⚠️ Partial | `SUM(views_count)` ada — tapi kumulatif, bukan per-30-hari. Label diubah ke "Total Views (Kumulatif)". Delta dihilangkan. |
| Perjanjian Ditandatangani (9) | ✅ Ya | `COUNT agreements WHERE status='signed'` + breakdown pending + total |
| Kontak WA Hari Ini (14) | ✅ Ya | `COUNT leads WHERE DATE(wa_clicked_at,'localtime') = DATE('now','localtime')` |
| Properti Terjual MTD (4) | ⚠️ Partial | `COUNT properties WHERE status_publish='sold'` ada — tapi total (bukan MTD). Label diubah ke "Properti Terjual (Total)". Tidak ada kolom `sold_at` → MTD tidak bisa dihitung. |
| Leads per Bulan (chart) | ✅ Ya | `GROUP BY strftime('%Y-%m', created_at)` 6 bulan terakhir |
| Distribusi Jenis (pie) | ✅ Ya | `GROUP BY jenis_properti ORDER BY cnt DESC` |
| Activity Feed (hardcoded) | ✅ Ya | Gabungan: leads terbaru + agreements signed terbaru + listings published/sold terbaru |

### Metrik yang BELUM tersedia (TODO)

| Metrik | Alasan | Solusi ke depan |
|---|---|---|
| Views per-30-hari | `views_count` adalah counter kumulatif per properti, bukan per-hari | Butuh tabel `property_view_events` (id, property_id, created_at) |
| Delta properti published bulan ini | Tidak ada snapshot historis per-bulan per status_publish | Bisa dihitung jika ada tabel audit/history, atau dengan `published_at` filter bulan ini |
| Properti terjual MTD | Tidak ada kolom `sold_at` di table properties | Tambahkan kolom `sold_at DATETIME` di migrasi berikutnya |

### Perubahan AdminOverviewPage.tsx

- Hapus semua konstanta hardcoded (`KPI_DATA`, `MONTHLY_LEADS`, `JENIS_CHART`, `ACTIVITY`)
- Tambah `fetch('/api/admin/overview')` di `useEffect`, dengan loading skeleton + error state
- 6 KPI cards sekarang dari data nyata; delta hanya tampil untuk "Leads Bulan Ini" (selisih vs bulan lalu)
- Chart bar (leads/bulan) dan pie (distribusi jenis) dari API
- Activity feed dari DB — listing events + leads nyata

### Hasil verifikasi lokal

- ✅ Build sukses (0 error)
- ✅ `GET /api/admin/overview` tanpa session → `401 "Sesi tidak ditemukan"` (auth guard jalan)
- ✅ Setelah login → data nyata tampil: `listing_published: 9`, `views_total: 4256`, `distribusi_jenis: [{Rumah,9},{Kost,2},{Tanah,1}]`, aktivitas listing & leads nyata dari DB lokal
- ✅ DB kosong/minimal → angka masuk akal (0 bukan error)

### Modul admin berikutnya (belum dibangun)

| Prioritas | Modul | Status |
|---|---|---|
| 1 | **Leads** — tabel CRM (baca, ubah status pipeline, tambah catatan) | Belum |
| 2 | **Testimoni** — CRUD testimonial (tambah/edit/hapus/reorder) | Belum |
| 3 | **Blog** — CRUD blog posts (draft/publish/schedule) | Belum |
| 4 | **Lokasi** — kelola data lokasi DIY | Belum |
| 5 | **Settings** — ganti password admin | Belum |

---

---

## Admin Gelombang 1 — Modul 2: Leads/CRM ✅ SELESAI (lokal)

**Branch:** `feat/admin-leads`
**Tanggal:** 6 Juni 2026

### Yang dibangun:

| File | Perubahan |
|---|---|
| `migrations/0009_update_leads_pipeline.sql` | Baru — update CHECK constraint pipeline (6 tahap → 5 tahap) |
| `functions/api/admin/leads/index.js` | Baru — GET list leads + badge count |
| `functions/api/admin/leads/[id]/index.js` | Baru — PATCH status_pipeline + append notes |
| `src/app/components/admin/AdminLeadsPage.tsx` | Diubah — ganti mock ke API real, pipeline 5 kolom, PATCH on drag |
| `src/app/components/ContactPage.tsx` | Diubah — form kini simpan ke DB via POST /api/leads, + pertahankan buka WA |
| `src/app/components/admin/AdminLayout.tsx` | Diubah — badge count leads baru di sidebar (poll 60s + window focus) |

### Migrasi 0009 — Pipeline baru (5 tahap):
`baru → dihubungi → negosiasi → closing → arsip`

Mapping dari pipeline lama saat migrasi data:
- `viewing` → `dihubungi`
- `nego` → `negosiasi`
- `closed` → `closing`
- `lost` → `arsip`

**⚠️ WAJIB setelah merge ke master:** jalankan ke remote DB produksi:
```bash
wrangler d1 execute sbp-db --remote --file=migrations/0009_update_leads_pipeline.sql
```

### Endpoint baru:

| Endpoint | Method | Fungsi |
|---|---|---|
| `GET /api/admin/leads` | GET | List leads (filter `?status=`, `?limit=N`, default 50) |
| `GET /api/admin/leads?count=1` | GET | Badge count `status_pipeline='baru'` |
| `PATCH /api/admin/leads/:id` | PATCH | Update status_pipeline dan/atau append note |

### Keputusan desain:
- **Badge sidebar**: COUNT `status_pipeline='baru'` (tanpa migrasi kolom is_read)
- **Contact form**: gabung ke `/api/leads` existing dengan `source_page='contact'`
- **Notes**: append-only JSON array `[{teks, admin, waktu}]`
- **AdminLeadsPage**: optimistic drag-drop (setState dulu, PATCH API background)

### Hasil verifikasi lokal:

| Test | Hasil |
|---|---|
| GET /api/admin/leads tanpa auth | ✅ 401 |
| GET /api/admin/leads (auth Bearer) | ✅ 200, total=5 |
| GET /api/admin/leads?count=1 | ✅ 200, count=5 |
| PATCH status baru→dihubungi | ✅ 200, new_status=dihubungi |
| PATCH append note | ✅ 200, notes_count=1, admin=Monica Vera S |
| PATCH invalid status_pipeline | ✅ 422 |
| POST /api/leads source_page=contact | ✅ 201 tersimpan ke DB |
| npm run build | ✅ 0 error |

### Modul admin berikutnya:

| Prioritas | Modul | Status |
|---|---|---|
| 3 | **Upload Foto** (G3b + WebP resize) | Belum — menyusul |
| 4 | **Testimoni** — CRUD + reorder | Belum |
| 5 | **Blog** — CRUD draft/publish | Belum |

---

## Admin: Input Properti Manual (Create Mode) ✅ SELESAI (lokal)

**Branch:** `feat/admin-add-property`
**Tanggal:** 7 Juni 2026

### Yang dibangun:

| File | Perubahan |
|---|---|
| `functions/api/admin/properties/index.js` | Diubah — tambah `onRequestPost`: buat properti baru (draft) |
| `src/app/components/admin/AdminPropertyDetailPage.tsx` | Diubah — create mode (`isNew`), field title, POST handler, guard foto |
| `src/app/components/admin/AdminListingPage.tsx` | Diubah — tombol "Tambah Properti" → `/admin/listing/new` |

### Endpoint baru:

| Endpoint | Method | Fungsi |
|---|---|---|
| `POST /api/admin/properties` | POST | Buat properti baru (draft), return `{ id, kode_listing, slug }` |

### Keputusan desain:
- **kode_listing**: pola identik titip-jual.js — `SBP-YYYYMMDD-XXX` (COUNT-based, zero-pad 3 digit)
- **slug**: `${slugify(title)}-${randomHex6}` — pola identik titip-jual.js
- **Create mode** dideteksi via `id === 'new'` — tidak perlu route baru (`/admin/listing/:id` sudah cover)
- **Field `title`** ditambah ke form state kedua mode (create + edit)
- **Foto section** disembunyikan di create mode — tampil pesan "Simpan dulu untuk upload foto"
- **Status card** disembunyikan di create mode (properti baru selalu draft)
- Setelah POST sukses → auto redirect ke `/admin/listing/${newId}` (switch ke edit mode)

### Hasil verifikasi lokal:

| Test | Hasil |
|---|---|
| `npm run build` | ✅ 0 error |
| POST /api/admin/properties tanpa auth | ✅ 401 auth guard aktif |
| POST dengan auth (title, jenis, tujuan, harga, lokasi) | ✅ 201 — `{ id: 13, kode_listing: "SBP-20260607-001", slug: "test-rumah-jogja-a2d275" }` |
| GET list setelah create | ✅ total=13, properti baru muncul di list |

---

## Fix Field Sync Admin ↔ TitipJual ✅ SELESAI (lokal)

**Branch:** `feat/admin-field-sync`
**Tanggal:** 7 Juni 2026

### Yang diperbaiki:

| # | Isu | File | Fix |
|---|---|---|---|
| 1 | **Legalitas opsi mismatch** | `AdminPropertyDetailPage.tsx` | Ganti `LEGALITAS_OPTIONS` dari short-code ke string panjang identik TitipJual. Hapus `.toUpperCase()`. |
| 2 | **`furnished` tidak tersimpan dari TitipJual** | `functions/api/titip-jual.js` | Ekstrak `kelengkapan` dari `detailsObj`, simpan juga ke kolom `furnished` dalam INSERT. `details.kelengkapan` tetap dipertahankan. |
| 3 | **`outstanding_bank` tidak ada di admin** | `AdminPropertyDetailPage.tsx` + `[id]/index.js` | Tambah field ke interface, form state, PATCH body, UI. Tambah ke `numericFields` di PATCH endpoint. |
| 4 | **`meta_title` + `meta_description` tidak ada di admin** | `AdminPropertyDetailPage.tsx` | Tambah ke interface, form state, PATCH body, section SEO baru di form. |

### Nilai legalitas standar (setelah fix):

`SHM & IMB/PBG Lengkap` · `SHGB & IMB/PBG Lengkap` · `SHM Pekarangan Tanpa IMB/PBG` · `SHM Sawah/Tegalan` · `SHGB Tanpa IMB/PBG` · `Girik/Letter C/PPJB/dll` · `Izin Usaha`

> ⚠️ Data lama di DB pakai short-code (`shm`, `shgb`, dll) — perlu update manual atau skrip sebelum produksi.

### Gap BELUM diperbaiki (backlog):

| Gap | Prioritas |
|---|---|
| `ruko` di PROPERTY_TYPES tapi tidak di DB CHECK constraint | 🔴 P1 — butuh migrasi |
| Data lama legalitas short-code perlu diupdate di DB | 🟡 P2 |
| Filter Advanced (legalitas, furnished) di PropertiesPage belum ke API | 🟡 P3 |
| `details` JSON (jenis_kost, no_unit) tidak bisa diedit di admin | 🟡 P3 |
| `jarak_sungai_m/makam_m/sutet_m` tidak di form manapun | 🟡 P3 |
| `latitude`, `longitude` tidak di form manapun | 🟡 P3 |

### Verifikasi:

| Test | Hasil |
|---|---|
| `npm run build` | ✅ 0 error, built in 887ms |

---

## Fix URL Properti + Gambar Publik ✅ SELESAI (lokal)

**Branch:** `feat/admin-field-sync`
**Tanggal:** 7 Juni 2026

### Yang diperbaiki:

| # | Isu | File | Fix |
|---|---|---|---|
| 1 | **kecamatan kosong → URL tidak match route** | `PropertyCard.tsx`, `HomePage.tsx` (2 Link), `property-detail.tsx` (canonical) | Fallback `kecamatan \|\| 'jogja'` di 4 lokasi URL generation |
| 2 | **Public media proxy R2** | `functions/api/media.js` (baru) | Proxy GET `/api/media?key=...` ke R2, prefix `property-photos/` only, `Cache-Control: immutable` |
| 3 | **og:image tidak absolut** | `src/app/routes/property-detail.tsx` | Path relatif di-prefix `https://salambumi.xyz`; fallback ke `/materai/hg.png` |

### Verifikasi:

| Test | Hasil |
|---|---|
| `npm run build` | ✅ 0 error, built in 660ms |

---

## Fix Homepage: Cover Image + Hero Overlay ✅ SELESAI (lokal)

**Branch:** `master`
**Tanggal:** 7 Juni 2026

### Yang diperbaiki:

| # | Isu | File | Fix |
|---|---|---|---|
| 1 | **cover_url null di SSR loader homepage** | `src/app/routes/home.tsx` | Subquery `AND is_cover=1` → `ORDER BY is_cover DESC, urutan ASC` (fallback ke foto pertama) |
| 2 | **Hero overlay terlalu gelap** | `src/app/components/HomePage.tsx` | Opacity dikurangi: `0.92/0.72/0.88` → `0.52/0.35/0.48` |

### Verifikasi:

| Test | Hasil |
|---|---|
| `npm run build` | ✅ 0 error, built in 959ms |

---

## Gelombang 2 Modul 1 — Testimoni CRUD ✅ SELESAI (lokal, belum commit)

**Branch:** `feat/admin-testimoni`
**Tanggal:** 7 Juni 2026

### Yang dibangun:

| File | Status | Keterangan |
|---|---|---|
| `functions/api/admin/testimonials/index.js` | ✅ Baru | GET list semua + POST tambah |
| `functions/api/admin/testimonials/[id]/index.js` | ✅ Baru | PATCH edit + DELETE hapus |
| `src/app/components/admin/AdminTestimoniPage.tsx` | ✅ Baru | List tabel + modal form + toggle tampilkan |
| `src/app/routes.ts` | ✅ Diubah | Route `/admin/testimoni` → `AdminTestimoniPage` (sebelumnya `AdminPlaceholderPage`) |

### Fitur AdminTestimoniPage:
- Tabel list: foto avatar, nama_klien, rating bintang, isi_testimoni (truncate 80 char), lokasi, jenis_transaksi, toggle tampilkan, aksi edit/hapus
- Toggle `tampilkan` → optimistic update (UI langsung berubah, PATCH ke API, revert jika gagal)
- Modal form create & edit: nama_klien (required), isi_testimoni (required), rating (bintang klik), lokasi, foto_url (URL text), jenis_transaksi, toggle tampilkan, urutan
- Delete dengan dialog konfirmasi
- Loading skeleton + error state + empty state
- Auto reload list setelah tambah/edit/hapus

### Endpoint yang tersedia:

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/admin/testimonials` | List semua (termasuk `tampilkan=0`), order urutan ASC, id DESC |
| POST | `/api/admin/testimonials` | Tambah baru — validasi nama_klien, isi_testimoni, rating 1-5 |
| PATCH | `/api/admin/testimonials/:id` | Partial update — hanya field yang dikirim |
| DELETE | `/api/admin/testimonials/:id` | Hapus permanen — validasi row exists |

### Catatan teknis:
- Auth guard: otomatis via `functions/api/admin/_middleware.js` — tanpa login → 401
- Tidak perlu migrasi DB — tabel `testimonials` sudah lengkap di `0001_initial_schema.sql`
- Foto: input URL saja (bukan upload R2) — cukup untuk V1
- Tabel tidak punya kolom `updated_at` — PATCH tidak menyertakan timestamp update

### Verifikasi:

| Test | Hasil |
|---|---|
| `npm run build` | ✅ 0 error |

---

### Gelombang 2 — Modul Berikutnya (Backlog):

| Modul | Prioritas | Catatan |
|---|---|---|
| **Tracking Klik (wa_clicked_at)** | 🔴 P1 | Update `wa_clicked_at` via PATCH saat tombol WA diklik di frontend |
| **CSV Import Leads** | 🟡 P2 | Endpoint `POST /api/admin/leads/import` terima CSV, validasi, bulk insert |
| **Blog Admin CRUD** | 🟡 P2 | `AdminBlogPage.tsx` + endpoint blog admin |
| **Portfolio Admin CRUD** | 🟡 P3 | `AdminPortfolioPage.tsx` |

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
