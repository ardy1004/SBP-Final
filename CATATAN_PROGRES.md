# Catatan Progres Pembangunan SBP Website

> Dokumen ini mencatat progres per fase. Sumber kebenaran tetap `SBP_MASTER_SPEC.md`.
> Update dokumen ini di akhir setiap fase.

---

## STATUS SAAT INI: Fase C Selesai ✅

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

### Fase-fase berikutnya setelah C:
- **Fase D:** Ganti mock UI → real API (sambungkan komponen ke endpoint Workers)
- **Fase E:** SSR/Edge Rendering (K1 — kritis untuk programmatic SEO)
- **Fase F:** Alur Titip Jual + Tanda Tangan Digital
- **Fase G:** Admin Dashboard lengkap (13 modul)
- **Fase H:** Keamanan & compliance (hapus hardcode, enkripsi, UU PDP)
- **Fase I:** SEO Engine (sitemap, schema JSON-LD, halaman programmatic)
- **Fase J:** Diferensiasi (Investment Intelligence, Proximity Engine, AI content)

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
