# Catatan Progres Pembangunan SBP Website

> Dokumen ini mencatat progres per fase. Sumber kebenaran tetap `SBP_MASTER_SPEC.md`.
> Update dokumen ini di akhir setiap fase.

---

## STATUS SAAT INI: Fase G — G1 Login + Shell Dashboard Selesai ✅ (Fase F masih di branch, belum merge — lihat TODO)

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
