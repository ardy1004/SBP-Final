# Catatan Progres Pembangunan SBP Website

> Dokumen ini mencatat progres per fase. Sumber kebenaran tetap `SBP_MASTER_SPEC.md`.
> Update dokumen ini di akhir setiap fase.

---

## STATUS SAAT INI: Fase B Selesai ✅

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

## FASE C — Cloudflare Workers API (BERIKUTNYA)

### Target:
Membangun lapisan API edge (Cloudflare Workers) yang menghubungkan D1 ke frontend.

### Endpoint prioritas (sesuai spec section 1):
```
GET  /api/properties            → list + filter + pagination
GET  /api/properties/:slug      → detail + increment views
GET  /api/locations?parent_id=  → cascading dropdown
POST /api/leads                 → simpan lead (K6) sebelum redirect WA
GET  /api/sitemap.xml           → SSR/edge generated
```

### Yang perlu disiapkan di Fase C:
- [ ] Setup Cloudflare Workers / Pages Functions
- [ ] Koneksi D1 via `env.DB` binding
- [ ] Implementasi `generateSeoSlug()` (spec 3.2)
- [ ] Implementasi `generateKodeListing()` (format SBP-YYYYMMDD-XXXX)
- [ ] Implementasi `harga_per_m2` calculation saat INSERT/UPDATE
- [ ] Admin auth: session JWT + bcrypt verify (hapus hardcode di AdminLoginPage)
- [ ] Enkripsi AES untuk kolom `nik` di tabel `owners`

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
