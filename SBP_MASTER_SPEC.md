# SALAM BUMI PROPERTY — MASTER BUILD SPECIFICATION

> **Dokumen ini adalah blueprint tunggal & final** untuk membangun website **Salam Bumi Property (SBP)**.
> Ditujukan sebagai input langsung ke AI Web Builder (Figma Make / sejenisnya) untuk men-generate website produksi.
> Setiap bagian ditulis eksplisit, terstruktur per modul, dan dapat dieksekusi bertahap.

- **Tagline:** *Finding The Best Properties, Will Be Easier And More Precise*
- **Slogan:** *“Don’t Wait To Buy Real Estate, Buy Real Estate And Wait”*
- **Positioning inti:** Portal properti **berbasis kepercayaan & kecerdasan investasi** untuk Yogyakarta — tanpa sistem agen/member, seluruh listing dikurasi & diverifikasi langsung oleh tim SBP.
- **Pasar awal:** DI Yogyakarta (Kota Yogyakarta, Sleman, Bantul, Gunung Kidul, Kulon Progo).
- **Bahasa:** Indonesia (single language).

---

## DAFTAR ISI

0. Prinsip Produk & Keputusan Arsitektur Kunci
1. Tech Stack & Infrastruktur
2. Design System (Brand, Warna, Tipografi, Komponen, Motion)
3. SEO Teknis (SSR, URL, Slug, Sitemap, Schema, Meta, OG)
4. Data Model (Skema Database D1)
5. Pustaka Field Per Jenis Properti (Shared)
6. Homepage
7. Halaman Properties (Listing + Map Search)
8. Halaman Detail Properti
9. Programmatic SEO (Halaman Lokasi & Fitur)
10. Halaman Statis (About, Notaris, Portfolio, Blog, FAQ, Contact, Privacy)
11. Lead Capture & WhatsApp CRM
12. Alur Form Submission Owner (Titip Jual + Tanda Tangan Digital)
13. Admin Dashboard (Kompleks, Modern, User-Friendly)
14. Sistem Kepercayaan & Verifikasi
15. Keamanan & Kepatuhan UU PDP
16. Error States, Loading & Edge Cases
17. Analytics & Tracking
18. Acceptance Criteria & Roadmap Pembangunan

---

## 0. PRINSIP PRODUK & KEPUTUSAN ARSITEKTUR KUNCI

Ini adalah keputusan fondasi yang **wajib** dipatuhi seluruh modul. Mengabaikannya akan menggagalkan tujuan SEO & legalitas.

| # | Keputusan | Alasan |
|---|-----------|--------|
| K1 | **Rendering: SSR / Prerendering wajib (bukan CSR murni)** | Strategi situs ini adalah programmatic SEO ribuan halaman. HTML harus jadi di sisi server/edge agar terindeks penuh. React+Vite di-deploy dengan rendering edge di Cloudflare Workers (atau prerender SSG untuk halaman statis). |
| K2 | **Satu URL kanonik per konten** | Mencegah konten duplikat. URL path (`/dijual/...`) = kanonik & terindeks. URL query filter (`/properties?...`) = `noindex` + `canonical` mengarah ke versi path bila relevan. |
| K3 | **Paritas Dijual ↔ Disewa** | Seluruh struktur SEO, kategori, dan slug dibuat paralel untuk `/dijual/` dan `/disewa/`. Pasar sewa (kost, villa, ruko) tidak boleh diabaikan. |
| K4 | **Mobile-First & Core Web Vitals first** | Mayoritas trafik mobile. Target: LCP < 2.5s, CLS < 0.1, INP < 200ms. |
| K5 | **Kepercayaan menggantikan peran agen** | Karena tidak ada sistem agen, brand trust (verifikasi, testimoni, rekam jejak, legitimasi) menjadi pilar konversi utama. |
| K6 | **Semua lead disimpan sebelum redirect WA** | Inquiry pembeli WAJIB tersimpan ke database lebih dulu, baru membuka WhatsApp. Tidak ada lead yang menguap. |
| K7 | **Data sensitif = liability** | NIK, KTP, tanda tangan, kontrak diperlakukan dengan enkripsi, consent, kontrol akses, dan jejak audit (UU PDP & UU ITE). |
| K8 | **Konten cerdas dari data terstruktur** | Deskripsi, meta, alt-text, dan metrik investasi di-generate otomatis dari field terstruktur (Cloudflare Workers AI). |

### 0.1 ⚠️ BUILDER GUARDRAILS (WAJIB — Jangan Ditafsir Ulang / Disederhanakan)

Daftar aturan tegas hasil koreksi iterasi. Builder **dilarang** menyimpang dari ini:

1. **Filter Homepage:** Lokasi = **4 dropdown TERPISAH & searchable** (Provinsi → Kab./Kota → Kecamatan → Kel./Desa) yang bertingkat. **DILARANG** menggabungkan menjadi satu kolom "Wilayah". (Detail 6.3)
2. **Banner Properti Pilihan:** auto-slider **full-width sinematik** (1 properti/slide, gradient overlay, kartu info melayang), bukan kartu split datar. (Detail 6.5)
3. **Homepage WAJIB punya section "Artikel Terbaru" (spill blog)** berisi 3 artikel sebelum footer. (Detail 6.10)
4. **Halaman Detail — tombol WhatsApp HANYA SATU**, di **bawah form** "Kirim Pesan ke Admin", **disabled** sampai semua field wajib terisi lalu **aktif**. **DILARANG** menaruh tombol WA di kotak harga atau di tempat lain. (Detail 8.1 & 8.8)
5. **Alur Owner Titip Jual = 3 langkah** (`Data Diri → Info Properti → Tanda Tangan`). **DILARANG** menampilkan halaman/langkah "Opsi Perjanjian" ke publik. Opsi (Open/Exclusive/Sewa, durasi, fee) **dikonfigurasi ADMIN** di dashboard sebelum mengirim link tanda tangan. (Detail 12.0 & 13.5)
6. **SSR/prerender wajib** untuk halaman publik (K1). **Tidak ada kredensial hardcoded** (K7).
7. **Properties page = sidebar filter kiri (sticky) + grid 3 kolom kanan.** Jangan jadikan filter horizontal saja. (Detail 7.x)
8. **Kalkulator KPR = 2 panel (input kiri + output/chart kanan), semua output real-time, donut chart + amortisasi accordion.** Bukan form statis. (Detail 8.3)
9. **Admin Dashboard sidebar = token `--navy #0B2447` (bukan abu/putih, bukan warna lepas).** Overview wajib punya 6 KPI card animasi + bar chart + donut chart + funnel. (Detail 13.2)
10. **Submission: setelah "Kirim Properti" di Step 2, halaman berikutnya adalah SUKSES, bukan Step 3 Tanda Tangan.** Step 3 hanya bisa dibuka via link khusus dari admin. (Detail 12.2b)

---

## 1. TECH STACK & INFRASTRUKTUR

| Komponen | Pilihan | Catatan |
|----------|---------|---------|
| Framework Frontend | React + Vite | Dengan lapisan **SSR/edge rendering** (lihat K1). |
| Styling | Tailwind CSS + komponen kustom | Mengikuti Design System Bagian 2. |
| Database | Cloudflare **D1** (SQLite) | Untuk listing, lead, owner, kontrak, testimoni, blog. Pakai indeks pada kolom filter & lokasi. |
| Backend / API | Cloudflare **Workers** | Rendering edge, API listing, generator sitemap, generator OG image, AI content. |
| Storage Media | Cloudflare **R2** | Foto properti, brosur PDF, arsip kontrak. |
| Image Pipeline | Auto-konversi **.webp** + ukuran responsif (srcset) + lazy-load + placeholder blur | Cloudflare Images / transform on-the-fly. |
| Deploy | Cloudflare **Pages** + Workers | |
| Peta | **Leaflet** | Detail properti + map search di listing. |
| AI (opsional kuat) | Cloudflare **Workers AI** | Auto deskripsi listing, auto meta, auto alt-text. |
| Auth Admin | Sesi aman + password ter-hash + rate limit (+2FA opsional) | **Tidak ada kredensial hardcoded di produksi.** |
| Analytics | GA4 / Cloudflare Web Analytics + Google Search Console | Event tracking custom. |
| Font Loading | Google Fonts via `<link rel="preconnect">` + `display=swap`; ATAU self-host di R2 (lebih cepat) | Plus Jakarta Sans + Inter. Preload font display & body untuk LCP. |
| Keamanan | HTTPS only, CSRF token pada form, sanitasi input (XSS), enkripsi AES untuk NIK/KTP | Lihat Bagian 15. |

**Wajib (mandatory):** Mobile Friendly & Mobile First · User Friendly · SEO Friendly · Slug URL SEO-friendly.

**Struktur API (Workers) — minimal endpoint:**
```
GET  /api/properties            ?jenis&tujuan&provinsi&kabupaten&kecamatan&kelurahan
                                &harga_min&harga_max&kt&km&sort&page  → list + total
GET  /api/properties/:slug      → detail 1 properti (+ increment views)
GET  /api/properties/:id/similar→ smart suggestion (8.6)
GET  /api/locations?parent_id=  → cascading dropdown
POST /api/leads                 → simpan lead (K6) → return ok sebelum redirect WA
POST /api/titip-jual            → simpan draft owner (Step 2)
GET  /api/sign/:token           → validasi token + ambil dokumen (12.4)
POST /api/sign/:token           → submit TTD → publish properti
GET  /sitemap.xml · /robots.txt → SSR/edge generated
[/api/admin/*]                  → semua dilindungi auth (CRUD listing, lead, dll)
```
Semua response JSON; error pakai HTTP status + `{error}`. Endpoint publik di-cache di edge (revalidate berkala); endpoint admin tidak di-cache.

**Aset Visual:**
- Logo & Favicon: `https://images.salambumi.xyz/materai/fav.webp`
- Tanda Tangan Agent (Ardy Salam): `https://images.salambumi.xyz/materai/gsd-removebg-preview%20-%20Copy.png`
- Materai: `https://images.salambumi.xyz/materai/hg.png`
- Background Hero: `https://images.salambumi.xyz/kost%20dijual%20jogja.webp`
- Foto Admin/Agent (Monica Vera S): `https://images.salambumi.xyz/monic%20sbp.webp`

---

## 2. DESIGN SYSTEM (Brand, Warna, Tipografi, Komponen, Motion)

Tujuan estetik: **modern, premium, terpercaya, bernapas.** Nuansa "Authority" via deep navy + electric blue + gold — bukan biru generik. Setiap halaman terasa ringan, lega, dan hidup.

### 2.1 Palet Warna — FINAL (HEX EKSPLISIT)

**Blues (5 tingkat, dari gelap ke terang):**
| Token | Hex | Penggunaan |
|-------|-----|------------|
| `--navy-deep` | `#061B35` | Hero overlay paling gelap, shadow terdalam |
| `--navy` | `#0B2447` | Sidebar, footer, topbar admin, navbar solid |
| `--blue` | `#1565C0` | Tombol primer, link aktif, badge FEATURED |
| `--blue-medium` | `#1E88E5` | Hover state tombol, highlight interaktif |
| `--sky` | `#29B6F6` | Gradient terang, badge highlights, accent |
| `--sky-pale` | `#E3F2FD` | Background section alternatif, input focus ring |

**Accent (3 warna):**
| Token | Hex | Penggunaan |
|-------|-----|------------|
| `--gold` | `#F5A623` | Badge PREMIUM, bintang rating, highlight investasi |
| `--gold-glow` | `#FFD54F` | Glow efek PREMIUM, shimmer |
| `--emerald` | `#10B981` | Tombol WhatsApp, badge Terverifikasi, status sukses |
| `--coral` | `#EF4444` | Badge HOT, SOLD, pita diagonal, alert error |

**Neutrals:**
| Token | Hex | Penggunaan |
|-------|-----|------------|
| `--white` | `#FFFFFF` | Card surface, modal background |
| `--bg` | `#F0F4F8` | Page background keseluruhan (putih kebiruan tipis) |
| `--ink` | `#0F172A` | Teks utama |
| `--muted` | `#64748B` | Teks sekunder, placeholder, label |
| `--border` | `#E2E8F0` | Garis batas card, divider |

**Irama Warna Antar Seksi Homepage (rhythm):**
```
Navbar:     navy #0B2447 (solid setelah scroll) / transparan (di atas hero)
Hero:       full-image + deep navy overlay
Stat Strip: navy #0B2447 (gelap, kontras tinggi)
Banner:     sky-pale #E3F2FD (terang, segar)
Cards Grid: white #FFFFFF (bersih)
Investment: navy gradient (gelap, premium)
Testimoni:  sky-pale #E3F2FD (terang lagi)
Blog:       white #FFFFFF
Footer:     navy-deep #061B35 (paling gelap)
```
Pola gelap→terang→putih→gelap membuat mata bernapas dan tidak jenuh.

### 2.2 Tipografi

| Tingkat | Font | Ukuran | Berat | Digunakan |
|---------|------|--------|-------|-----------|
| Display | Plus Jakarta Sans / Sora | 48–60px | 800 | Hero headline |
| H1 | Plus Jakarta Sans | 36–40px | 700 | Page title |
| H2 | Plus Jakarta Sans | 28–32px | 700 | Section title |
| H3 | Plus Jakarta Sans | 20–22px | 600 | Card title, subseksi |
| Body | Inter | 15–16px | 400 | Teks konten |
| Small | Inter | 12–14px | 400–500 | Label, caption, badge |
| Mono/Angka | Inter (tabular-nums) | sesuai | 600–700 | Harga, metrik |

Sub-headline hero: tambahkan efek **text gradient** dari `#29B6F6` ke `#FFFFFF` atau murni sky `#29B6F6` — baris ke-2 headline yang berkilau.

**Font loading (WAJIB untuk performa/LCP):** muat via Google Fonts dengan `<link rel="preconnect">` + `display=swap`, ATAU self-host di R2 (lebih cepat). Hanya muat weight yang dipakai (Plus Jakarta Sans 600/700/800, Inter 400/500/600/700). Preload font hero. Sediakan fallback `system-ui, sans-serif`.

### 2.2b Dark Mode Palette (Admin Dashboard)
> Toggle dark-mode hanya untuk Admin Dashboard (publik tetap light). Token dark:
| Token | Light | Dark |
|-------|-------|------|
| Surface/card | `#FFFFFF` | `#1E293B` |
| Page bg | `#F0F4F8` | `#0F172A` |
| Sidebar | `#0B2447` | `#060F1F` |
| Teks utama | `#0F172A` | `#E2E8F0` |
| Teks sekunder | `#64748B` | `#94A3B8` |
| Border | `#E2E8F0` | `#334155` |
| Aksen (tetap) | `#1565C0` / `#29B6F6` | sama |
Simpan preferensi di sisi admin (cookie/DB), bukan localStorage di artifact. Transisi warna 200ms.

### 2.3 ✦ Breathing Animation — HERO SECTION

> Ini spesifikasi animasi utama yang membuat hero "bernapas dan hidup."

**Layer stack hero (dari bawah ke atas):**
```
Layer 1: .hero-bg-wrap (overflow:hidden, position:absolute, inset:0)
  └── img.hero-bg (object-fit:cover, transform-origin:center, ANIMATED)

Layer 2: .hero-overlay (gradient gelap, position:absolute, inset:0)

Layer 3: .hero-orb-1 (blurred orb, position:absolute, ANIMATED float)
Layer 4: .hero-orb-2 (blurred orb, position:absolute, ANIMATED float)
Layer 5: .hero-orb-3 (blurred orb kecil, position:absolute, ANIMATED float)

Layer 6: .hero-content (z-index tinggi, teks + filter card)
```

**Animasi Layer 1 — Ken Burns (Napas Utama):**
```css
@keyframes heroBreath {
  0%   { transform: scale(1.00); }
  100% { transform: scale(1.09); }
}
.hero-bg {
  animation: heroBreath 9s ease-in-out infinite alternate;
  will-change: transform;
}
```
*Efek: gambar sangat perlahan membesar dan mengecil → terasa seperti napas dada.*

**Animasi Layer 2 — Gradient Overlay:**
```css
.hero-overlay {
  background: linear-gradient(
    135deg,
    rgba(6,27,53,0.92)   0%,
    rgba(11,36,71,0.72)  45%,
    rgba(6,27,53,0.88)  100%
  );
}
```

**Animasi Layer 3, 4, 5 — Floating Ambient Orbs:**
```css
/* Orb 1: besar, biru terang, kanan bawah */
.hero-orb-1 {
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(41,182,246,0.18), transparent 70%);
  border-radius: 50%; filter: blur(60px);
  bottom: -100px; right: -100px;
  animation: floatOrb1 12s ease-in-out infinite alternate;
}

/* Orb 2: sedang, gold, kiri atas */
.hero-orb-2 {
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(245,166,35,0.12), transparent 70%);
  border-radius: 50%; filter: blur(80px);
  top: -80px; left: 5%;
  animation: floatOrb2 15s ease-in-out infinite alternate;
}

/* Orb 3: kecil, biru medium, tengah kiri */
.hero-orb-3 {
  width: 250px; height: 250px;
  background: radial-gradient(circle, rgba(30,136,229,0.20), transparent 70%);
  border-radius: 50%; filter: blur(50px);
  top: 40%; left: 20%;
  animation: floatOrb3 10s ease-in-out infinite alternate;
}

@keyframes floatOrb1 {
  0%   { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-40px, -50px) scale(1.12); }
}
@keyframes floatOrb2 {
  0%   { transform: translate(0, 0) scale(1); }
  100% { transform: translate(30px, 40px) scale(1.08); }
}
@keyframes floatOrb3 {
  0%   { transform: translate(0, 0); }
  100% { transform: translate(20px, -25px); }
}
```

*Semua orb bergerak asinkron (durasi berbeda 10/12/15s) → efek "nyawa" organik.*

### 2.4 Resep Gradien (Reusable)

| Nama | CSS | Digunakan |
|------|-----|-----------|
| `gradient-hero-overlay` | `linear-gradient(135deg, rgba(6,27,53,0.92) 0%, rgba(11,36,71,0.72) 45%, rgba(6,27,53,0.88) 100%)` | Hero background overlay |
| `gradient-blue-cta` | `linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)` | Tombol CTA premium, "Titip Jual" button navbar |
| `gradient-premium-gold` | `linear-gradient(135deg, #F5A623 0%, #FFD54F 60%, #F5A623 100%)` | PREMIUM badge glow |
| `gradient-navy-section` | `linear-gradient(160deg, #0B2447 0%, #1565C0 100%)` | Section investasi, footer alt |
| `gradient-sky-section` | `linear-gradient(180deg, #E3F2FD 0%, #F0F9FF 100%)` | Section banner, testimoni |
| `gradient-card-hover` | `linear-gradient(180deg, rgba(11,36,71,0) 50%, rgba(6,27,53,0.7) 100%)` | Overlay bawah foto kartu |

### 2.5 Glassmorphism — Filter Card Hero & Komponen Glass

```css
.glass-card {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.50);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(11, 36, 71, 0.18);
}

/* Varian gelap (untuk elemen di atas foto gelap) */
.glass-dark {
  background: rgba(11, 36, 71, 0.72);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.12);
  color: white;
}
```

Gunakan `.glass-card` untuk: filter card hero, kartu info banner slider, modal.
Gunakan `.glass-dark` untuk: kartu info melayang di atas foto banner.

### 2.6 Motion & Micro-interaction

- **Hover card:** `translateY(-6px)` + `box-shadow: 0 20px 40px rgba(11,36,71,0.14)` + transition 220ms ease.
- **Angka count-up:** easing cubic-bezier(0.25,0.46,0.45,0.94), durasi 800ms.
- **Skeleton loading:** gradient sweep kiri ke kanan, warna `#E3F2FD → #EFF6FF`.
- **Badge PREMIUM pulse:** `@keyframes goldPulse { 0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,0.4)} 50%{box-shadow:0 0 0 8px rgba(245,166,35,0)} }` — 2.5s infinite.
- **Slide in section:** section masuk viewport → `opacity:0,translateY(30px)` → `opacity:1,translateY(0)` via Intersection Observer, 500ms ease-out. Berikan sedikit delay staggered per elemen.
- **Filter card:** saat tab Dijual/Disewa diklik → tab baru slide-bounce kecil.

### 2.7 Komponen Inti (Reusable)
Button (primary gradient / secondary outline / ghost / danger / WhatsApp-green), Input + Select-searchable, Range Slider branded, Card properti (badge system lengkap), Modal (backdrop blur), Toast (kanan atas, 4 varian), Breadcrumb (chevron separator), Pagination (numbered), Tabs (underline active), Accordion, Leaflet Map, Carousel (swiper), Chart (donut + bar + funnel + sparkline), Skeleton, Empty-state (ilustrasi), Floating WA button, Glassmorphism card.

> Dark Mode admin: lihat palet di **2.2b**.

---

## 3. SEO TEKNIS

### 3.1 Struktur URL (Kanonik)
**Listing detail (terindeks):**
```
/dijual/{jenis_properti}/{provinsi}/{kabupaten}/{kecamatan}/{slug}
/disewa/{jenis_properti}/{provinsi}/{kabupaten}/{kecamatan}/{slug}
```
Contoh:
```
/dijual/kost/yogyakarta/sleman/depok/kost-20-kamar-dekat-ugm
/disewa/villa/yogyakarta/sleman/kaliurang/villa-view-merapi
```

**Halaman kategori / programmatic (terindeks):**
```
/rumah-dijual-jogja
/kost-dijual-dekat-ugm
/tanah-dijual-bantul
/villa-disewa-kaliurang
```

**Halaman filter interaktif (TIDAK terindeks):**
```
/properties?jenis=rumah&provinsi=di-yogyakarta&kabupaten=sleman&kecamatan=depok
```
→ diberi `noindex, follow` + `canonical` ke halaman programmatic yang relevan bila ada.

### 3.2 Aturan Slug (FINAL — menyelesaikan kontradiksi dokumen lama)
Fungsi `generateSeoSlug(title)`:
1. lowercase semua
2. hapus simbol
3. hapus stopwords: `yang, dan, di, ke, dari, harga, nego, murah, terbaik, promo`
4. **PERTAHANKAN** kata `jogja` & `yogyakarta` (keyword lokal bernilai tinggi — JANGAN dihapus)
5. prioritaskan 3–5 keyword pertama
6. ganti spasi → `-`
7. maksimal 60 karakter, **tidak boleh diakhiri tanda `-`**
8. slug dibuat saat properti pertama kali disimpan; **slug tidak berubah** walau judul diedit setelah publish (stabilitas URL)

Helper `ensureUniqueSlug(slug)`: bila bentrok, tambahkan angka (`rumah-minimalis-sleman-2`).

Contoh final:
- Input: `Rumah Minimalis 2 Lantai Dekat UGM Sleman Jogja`
- Output: `rumah-minimalis-dekat-ugm-sleman-jogja`

### 3.3 Meta Title & Description (auto)
- `generateMetaTitle(property)` → `{Jenis} Dijual {Lokasi Utama} {Kota} | Salam Bumi Property` (≤ 60 char, keyword di depan, tidak boleh kosong).
- `generateMetaDescription(property)` → ≤ 155 char, mengandung jenis + lokasi, tidak duplikat antar halaman.
- Halaman lokasi: `generateLocationMetaTitle(type, location)` & `generateLocationMetaDescription(type, location)`.
- Disuntik ke `<title>` dan `<meta name="description">` pada SSR.

### 3.4 Structured Data (JSON-LD) — wajib di SSR
| Halaman | Schema |
|---------|--------|
| Detail properti | `RealEstateListing` (name, description, url, image, address, price, numberOfRooms, floorSize) + `BreadcrumbList` + `Offer` |
| Semua halaman | `Organization` / `LocalBusiness` (CV Salam Bumi Property) |
| Homepage | `WebSite` + `SearchAction` (sitelinks search box) |
| FAQ | `FAQPage` |
| Blog post | `BlogPosting` (author, datePublished, dateModified) |

### 3.5 Sitemap
- `/sitemap.xml` sebagai **sitemap index** yang menunjuk sitemap terpecah (batas 50.000 URL / 50MB per file).
- Mencakup: listing (dijual & disewa), halaman kategori, halaman lokasi, halaman fitur, blog, halaman statis.
- **Auto-update** saat listing baru tayang.
- `robots.txt` (isi eksplisit):
```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /sign/
Disallow: /titip-jual/
Disallow: /*?*        # blokir URL filter ber-query agar tak indeks duplikat
Allow: /properties$   # /properties tanpa query tetap boleh
Sitemap: https://salambumi.xyz/sitemap.xml
``` **Isi wajib:**
  ```
  User-agent: *
  Allow: /
  Disallow: /admin/
  Disallow: /sign/
  Disallow: /titip-jual/
  Disallow: /properties?     (parameter filter)
  Sitemap: https://salambumi.xyz/sitemap.xml
  ```

### 3.6 Open Graph & Social Card
- OG tags + Twitter Card di semua halaman.
- **OG image dinamis per listing** (foto + harga + judul + badge), di-generate di edge → fitur Share Link tampil profesional di WA/IG.

### 3.7 Image SEO
- Auto alt-text deskriptif (jenis + lokasi + fitur), nama file SEO-friendly, srcset responsif, lazy-load.

### 3.8 Anti Thin-Content
- Halaman programmatic hanya di-generate jika **jumlah listing ≥ 3**. Jika < 3 → jangan generate, redirect ke kategori induk.

---

## 4. DATA MODEL (Skema Database D1)

> Field minimal untuk mendukung listing, programmatic SEO, lead, kontrak, testimoni, blog, dan **Investment Intelligence**.

### 4.1 Tabel `properties`
| Field | Tipe | Catatan |
|-------|------|---------|
| id | INTEGER PK | |
| kode_listing | TEXT unik | auto-generate |
| title | TEXT | |
| slug | TEXT unik | stabil pasca-publish |
| jenis_properti | TEXT | rumah, tanah, kost, hotel, homestay, villa, apartment, gudang, komersial |
| tujuan | TEXT | dijual / disewa / dijual_disewa |
| harga | INTEGER | harga jual |
| harga_lama | INTEGER nullable | OLD price → memicu badge HOT + harga dicoret |
| harga_sewa_tahun | INTEGER nullable | |
| nego | BOOLEAN | |
| nett | BOOLEAN | |
| jumlah_kamar_tidur | INTEGER | |
| jumlah_kamar_mandi | INTEGER | |
| luas_tanah | INTEGER | m² |
| luas_bangunan | INTEGER | m² |
| lebar_depan | REAL | |
| lantai | INTEGER | |
| harga_per_m2 | INTEGER | **Dihitung di application layer** saat simpan (harga ÷ luas_tanah) lalu disimpan. D1/SQLite tidak punya computed column native — JANGAN andalkan generated column. |
| furnished | TEXT | fully / semi / unfurnished |
| legalitas | TEXT | lihat 5.x |
| status_legalitas | TEXT | on_hand / on_bank |
| bank_agunan | TEXT nullable | jika on_bank |
| outstanding_bank | INTEGER nullable | |
| jarak_sungai_m | INTEGER nullable | |
| jarak_makam_m | INTEGER nullable | |
| jarak_sutet_m | INTEGER nullable | |
| lebar_jalan_m | REAL | |
| provinsi | TEXT | |
| kabupaten | TEXT | |
| kecamatan | TEXT | |
| kelurahan | TEXT | |
| alamat | TEXT | Alamat penuh (privat). **Publik hanya menampilkan Kecamatan + Kabupaten** — jalan/nomor disembunyikan otomatis. |
| latitude | REAL | |
| longitude | REAL | |
| gmaps_link | TEXT | |
| deskripsi | TEXT | bisa auto-AI |
| info_tambahan | TEXT | |
| alasan_dijual | TEXT | |
| video_youtube | TEXT nullable | |
| income_per_bulan | INTEGER nullable | kost/hotel/villa/homestay → Investment Intelligence |
| pengeluaran_per_bulan | INTEGER nullable | |
| harga_sewa_kamar_bulan | INTEGER nullable | |
| badge_premium | BOOLEAN | |
| badge_featured | BOOLEAN | |
| badge_hot | BOOLEAN | (otomatis true bila harga_lama terisi) |
| status_sold | BOOLEAN | |
| properti_pilihan | BOOLEAN | tampil di banner carousel |
| verified | BOOLEAN | "Terverifikasi SBP" |
| views_count | INTEGER | untuk sinyal sosial |
| status_publish | TEXT | draft / published |
| meta_title | TEXT nullable | override manual |
| meta_description | TEXT nullable | override manual |
| created_at / updated_at / published_at | DATETIME | freshness |

### 4.2 Tabel `property_images`
id, property_id (FK), url_webp, alt_text, urutan, is_cover.

### 4.3 Field spesifik per jenis → kolom `details` (JSON) di tabel `properties`
Field spesifik per jenis (jenis_kost putra/putri/campur, jenis_hotel bintang, ruang_penjaga, token_listrik_per_kamar, no_unit apartemen, dll) disimpan dalam **satu kolom JSON `details`** di tabel `properties` (lihat catatan 4.11). Tidak perlu tabel terpisah.

### 4.4 Tabel `owners` (PRIVAT)
id, nama_pemilik, no_wa_1, no_wa_2, gmaps, nik (terenkripsi), nama_ktp, alamat_ktp, rt_rw, kelurahan, kecamatan, bertindak_sebagai, data_ahli_waris (JSON), property_id.

### 4.5 Tabel `agreements` (kontrak)
| Field | Tipe | Catatan |
|-------|------|---------|
| id | INTEGER PK | |
| kode_perjanjian | TEXT unik | |
| property_id | INTEGER FK | |
| owner_id | INTEGER FK | |
| jenis_transaksi | TEXT | jual / sewa |
| jenis_listing | TEXT | open / exclusive |
| durasi_kontrak | INTEGER nullable | bulan (3/6/12); null = open |
| fee_persen | REAL | 3 / 5 / 10 |
| status | TEXT | draft / opsi_dikonfigurasi / menunggu_ttd / signed / expired |
| **sign_token** | TEXT unik | **token rahasia URL `/sign/{token}` — UUID v4 / random 32-char** |
| **token_expires_at** | DATETIME | **kedaluwarsa link TTD (default +72 jam dari generate)** |
| **token_used** | BOOLEAN | **true setelah ditandatangani — link single-use, tidak bisa dipakai ulang** |
| signature_image_url | TEXT nullable | TTD owner (PNG transparan) di R2 |
| signed_at | DATETIME nullable | |
| audit_ip | TEXT nullable | IP penandatangan |
| audit_user_agent | TEXT nullable | device/browser |
| audit_hash_dokumen | TEXT nullable | SHA-256 dokumen final |
| link_opened_count | INTEGER | berapa kali link dibuka |
| pdf_url | TEXT nullable | arsip PDF kontrak di R2 |
| created_at / updated_at | DATETIME | |

### 4.6 Tabel `leads` (CRM pembeli — K6)
id, property_id (nullable FK), nama, **no_wa (nomor kontak pengirim — wajib untuk follow-up)**, asal_daerah, tipe_pengirim (pembeli/penjual/broker), budget, rencana_pembayaran, pesan, source_page, wa_clicked_at, status_pipeline (baru/dihubungi/viewing/nego/closed/lost), **notes (JSON array {teks, admin, waktu})**, created_at, updated_at.

### 4.7 Tabel `testimonials` (untuk slider homepage)
id, nama_klien, foto_url, lokasi, rating (1–5), isi_testimoni, jenis_transaksi, properti_terkait (nullable FK), tanggal, tampilkan (BOOLEAN), urutan, **created_at**.

### 4.8 Tabel `blog_posts`
id, judul, slug (unik), cover, excerpt, konten (HTML), kategori, **tags (JSON array)**, **author_id (FK → admins)**, **reading_time_menit (INTEGER, auto-hitung)**, status (draft/published/scheduled), published_at, meta_title, meta_description, **created_at, updated_at**.

### 4.9 Tabel `locations` (hierarkis — untuk cascading dropdown & programmatic SEO)
| Field | Tipe | Catatan |
|-------|------|---------|
| id | INTEGER PK | |
| nama | TEXT | mis. "Sleman", "Depok" |
| tipe | TEXT | provinsi / kabupaten / kecamatan / kelurahan |
| parent_id | INTEGER nullable FK → locations.id | provinsi: null; kabupaten→provinsi; dst |
| slug | TEXT | untuk URL programmatic (mis. "sleman") |
| latitude / longitude | REAL nullable | titik tengah area (untuk peta) |

Cascading dropdown query: ambil `WHERE parent_id = {id_terpilih_di_atasnya}`. Pre-seed seluruh wilayah DI Yogyakarta (5 kab/kota + seluruh kecamatan & kelurahan).

### 4.10 Tabel `admins`
id, email (unik), password_hash (bcrypt), nama, role (superadmin/admin), last_login, 2fa_secret (nullable), created_at.

### 4.11 Catatan Teknis Schema (WAJIB DIBACA)
- **`properties.harga_per_m2`** BUKAN computed column (D1/SQLite tidak mendukung native). Hitung di application layer saat simpan (`harga / luas_tanah`) dan simpan sebagai kolom INTEGER biasa; atau hitung on-the-fly di query. JANGAN tulis sebagai `GENERATED` column.
- **`property_type_details`**: gunakan **kolom JSON tunggal** `details (TEXT berisi JSON)` pada tabel `properties` (mis. `{"jenis_kost":"putra","ruang_penjaga":true,"no_unit":"A-12"}`). Lebih sederhana daripada EAV key-value dan cukup karena field ini jarang di-query langsung. Field yang SERING difilter (KT, KM, LT, LB, harga) tetap kolom asli di `properties`.
- Indeks WAJIB: `properties(jenis_properti, status_publish)`, `properties(provinsi, kabupaten, kecamatan)`, `properties(slug)`, `properties(harga)`, `leads(status_pipeline)`, `agreements(sign_token)`, `locations(parent_id)`.
- Semua tabel: `created_at` default `CURRENT_TIMESTAMP`.

---

## 5. PUSTAKA FIELD PER JENIS PROPERTI (Shared / DRY)

> Didefinisikan SEKALI di sini, dipakai ulang oleh **Form Input Admin (13.x)** dan **Form Owner (12.x)**. Wajib memilih minimal satu jenis.

**Rumah:** Luas Tanah, Luas Bangunan, Lebar Depan, Lantai, Jumlah KT, Jumlah KM.

**Kost:** Jenis Kost (Putra/Putri/Campur), Luas Tanah, Luas Bangunan, Lebar Depan, Lantai, Jumlah KT, Jumlah KM, Ruang Penjaga, Token Listrik Per Kamar? (Ya/Tidak), Harga Sewa Kamar/Bulan, Biaya Pengeluaran/Bulan, Kelengkapan (Fully/Semi/Unfurnished).

**Tanah:** Luas Tanah, Lebar Depan.

**Hotel:** Jenis Hotel (Budget/Melati, Bintang 1–5, Boutique), Luas Tanah, Luas Bangunan, Lebar Depan, Lantai, Jumlah KT, Jumlah KM, Harga Sewa Kamar/Bulan, Income Rata-rata/Bulan, Biaya Pengeluaran/Bulan, Kelengkapan.

**Homestay / Guesthouse:** Luas Tanah, Luas Bangunan, Lebar Depan, Lantai, Jumlah KT, Jumlah KM, Harga Sewa Kamar/Bulan, Income Rata-rata/Bulan, Biaya Pengeluaran/Bulan, Kelengkapan.

**Villa:** sama dengan Homestay (+ konteks villa).

**Apartment:** Luas Bangunan, Lantai, No. Unit, Jumlah KT, Jumlah KM, Kelengkapan.

**Gudang:** Luas Tanah, Luas Bangunan, Lebar Depan.

**Bangunan Komersial Lainnya:** Luas Tanah, Luas Bangunan, Lebar Depan + deskripsi lengkap.

**Legalitas (umum):** SHM & IMB/PBG Lengkap · SHGB & IMB/PBG Lengkap (berlaku s/d ____) · SHM Pekarangan Saja Tanpa IMB/PBG · SHM Sawah/Tegalan · SHGB Saja Tanpa IMB/PBG · Girik/Letter C/PPJB/dll · Izin Usaha.

**Status Legalitas:** On Hand | On Bank → jika On Bank: "Diagunkan di Bank apa?" + "Outstanding di Bank?".

**Lingkungan:** Jauh dari Makam/Sungai/Sutet? → Ya Jauh | Dekat Sungai (jarak m) | Dekat Makam (jarak m) | Dekat Sutet (jarak m).

**Field umum:** Lebar Jalan (m), Informasi Tambahan & Fasilitas, Alasan Dijual, Upload Foto (auto .webp).

---


## 6. HOMEPAGE

### 6.1 Navbar
> ⚠️ **DIREKTIF BUILDER — MENU TETAP (jangan diubah/dikurangi):** urutan menu kiri→kanan **WAJIB**: `Home · Properties · Portofolio · About Us · Blog · FAQ · Contact` + tombol **"Titip Jual"** (paling kanan). Halaman Notaris tetap ada tapi diakses via footer & internal link (bukan di navbar utama).
- **Background:** transparan di posisi atas → `--navy #0B2447` solid setelah scroll 60px (transisi 300ms ease).
- **Logo:** putih (kiri). **Nav links:** putih, hover → sky `#29B6F6` + underline slide. Link aktif = underline biru permanen.
- **Tombol "Titip Jual":** `gradient-blue-cta` (biru→sky), teks putih, border-radius 10px, hover → `brightness(1.1)` + slight shadow.
- Mobile: hamburger putih, drawer dari kanan, background `--navy`, menu vertikal + tombol Titip Jual di bawah.

### 6.2 Hero Section — BREATHING BACKGROUND

> ⚠️ **DIREKTIF BUILDER:** Hero harus menerapkan Breathing Animation persis seperti Bagian 2.3. Background image bergerak napas, tiga orb blur mengambang, overlay gradient gelap. JANGAN buat hero statis.

**Implementasi (lihat 2.3 untuk CSS lengkap):**
```
[Layer: bg-wrap overflow:hidden inset:0]
  [img.hero-bg: url(kost dijual jogja.webp) cover, BREATHING animation 9s]
[Layer: hero-overlay: gradient-hero-overlay]
[Layer: orb-1 kanan-bawah biru besar + orb-2 kiri-atas gold + orb-3 tengah]
[Layer: hero-content z-50]
```

**Konten hero (centered, padding top ~14vh):**
1. **Badge pill glassmorphism** (kecil, atas): `🏠 PORTAL PROPERTI TERPERCAYA YOGYAKARTA` — background `rgba(255,255,255,0.15)`, border `rgba(255,255,255,0.25)`, blur(10px), teks putih, border-radius penuh.
2. **Headline** (Display 52–60px, bold, teks putih, line-height 1.1):
   `Finding The Best Properties,`
   *baris ke-2:* `Will Be Easier And More Precise` — warna **sky `#29B6F6`** (atau gradient sky→white).
3. **Slogan** (16px, teks `rgba(255,255,255,0.75)`, italic):
   *"Don't Wait To Buy Real Estate, Buy Real Estate And Wait"*
4. **Filter Card** (lihat 6.3) — melayang 40–60px di bawah slogan.

**Tinggi hero:** 100vh desktop, min 600px mobile.

### 6.3 Filter Pencarian (di Hero) — GLASSMORPHISM CARD

> Spesifikasi filter TIDAK BERUBAH dari Bagian sebelumnya (4-level cascade, dll). Yang berubah adalah **visual wrapper-nya**.

**Wrapper card filter:** gunakan `.glass-card` (lihat 2.5):
```css
background: rgba(255,255,255,0.88);
backdrop-filter: blur(20px);
border-radius: 20px;
padding: 28px 32px;
max-width: 900px; margin: 0 auto;
```
Tab Dijual/Disewa: full-width di atas input, tab aktif biru solid `#1565C0` background putih bulat, tab tidak aktif transparan.
Tombol "Cari Properti": gradient-blue-cta, full-width, border-radius 12px, tinggi 52px, teks putih bold 16px.

### 6.4 ✦ Stats Counter Strip (BARU — Trust Signal di Bawah Hero)
Tepat di bawah hero, **sebelum** banner carousel. Background `--navy #0B2447`, padding 28px vertikal.
4 angka besar dalam 1 baris (grid 4 kolom):
```
[🏠 150+ Listing Aktif]  [✅ 80+ Transaksi]  [🔍 100% Dikurasi]  [⭐ 5.0 Rating]
```
Setiap item: angka `gradient-blue-cta` text (font 36px bold, animasi count-up saat terlihat) + label putih kecil di bawahnya. Divider vertikal tipis antar item. Efek: meyakinkan dan impresif. **Sumber angka: dinamis dari DB** (COUNT listing aktif, COUNT properti SOLD/portofolio, rata-rata rating testimoni); "100% Dikurasi" statis. Bila data minim di awal, admin dapat set angka minimum di Pengaturan (13.15).

### 6.5 Banner Carousel "Properti Pilihan" — AUTO-SLIDER SINEMATIK
> ⚠️ **DIREKTIF BUILDER:** Menampilkan listing `properti_pilihan = true`, **satu properti per slide, auto-slide tiap 5 detik**. BUKAN kartu split datar.

*Background section:* `gradient-sky-section` (`#E3F2FD → #F0F9FF`), padding 60px vertikal.
*Section header:* label kecil `⭐ PROPERTI PILIHAN`, judul "Properti Unggulan Terkurasi", subtitle abu.

**Desain per slide (sinematik):**
- **Full-width**, tinggi 460–520px (desktop), foto properti sebagai latar penuh + **gradient overlay gelap** di sisi kiri (`gradient-card-hover`) agar teks terbaca.
- **Kartu info melayang** (gunakan `.glass-dark`, lihat 2.5) di atas foto, berisi: badge ({PREMIUM/FEATURED/HOT}, glow emas untuk PREMIUM), Kode Listing, Judul, ringkasan 1 baris, **Harga besar menonjol**, ikon ringkas (📍 Lokasi · LT · KT/KM), dan **dua tombol**: "Lihat Detail" (`gradient-blue-cta`) + "WhatsApp" (`--emerald` hijau).

**Kontrol & interaksi:**
- Panah navigasi kiri/kanan + **dot pagination** di bawah.
- **Auto-advance 5 detik, pause on hover**, **swipe** di mobile, transisi geser/fade mulus.
- Mobile: kartu info menumpuk di bawah/menimpa foto, tetap terbaca.
- Diisi & diurutkan dari Admin (13.8); interval auto-slide dapat diatur admin.

### 6.6 Product Cards Section — "Semua Properti"
*Background section:* `--white`.
*Section header:* "Temukan Properti Impian Anda" (h2 center) + tombol "Lihat Semua →" (outline, kanan).
Grid 3 kolom (desktop) dengan kartu **sesuai anatomi & badge di 7.3**. Load 6 kartu di homepage (prioritas: Properti Pilihan/PREMIUM → FEATURED → HOT → terbaru), lalu tombol "Lihat Semua Properti →".

### 6.7 ✦ Investment Intelligence Teaser (BARU — Section Premium)
*Background:* `gradient-navy-section` (`#0B2447 → #1565C0`), teks putih.
*Layout: 2 kolom.*
- **Kiri (55%):** Judul besar putih "Properti Investasi Terbaik di Yogyakarta 💡" + subtitle + 3 poin benefit (income bulanan, yield tahunan, analisis ROI) + tombol "Jelajahi Properti Investasi →" (putih outline atau gold solid).
- **Kanan (45%):** Kartu "preview" Investment Intelligence — menampilkan **properti investasi yield tertinggi yang sedang tayang** (dinamis dari DB): yield, payback, badge "Skor Investasi" + glow gold, klik → detail. Bila belum ada data income, sembunyikan kartu atau tampilkan ilustrasi statis.
*Tujuan:* menonjolkan positioning SBP sebagai portal investasi, bukan sekadar jual beli biasa. Selaras slogan.

### 6.8 ✦ Testimoni Klien (Auto-Slider)
*Background:* `gradient-sky-section`.
*Section header:* teks kecil `💬 KLIEN KAMI` (biru), judul `"Apa Kata Mereka?"` (h2 bold).

**Desain slider:**
- 3 kartu tampil sejajar (desktop), swipe 1 per 1 (mobile).
- Auto-advance tiap 5 detik, pause on hover.
- **Per kartu:** background putih, shadow `0 4px 20px rgba(11,36,71,0.08)`, border-radius 16px, padding 28px.
  - Tanda kutip dekoratif `"` (besar, `--sky #29B6F6`, opacity 0.3, absolute top-left).
  - Foto klien (bulat 56px, border biru 2px).
  - Nama klien (bold) + lokasi (abu kecil).
  - Rating ⭐ (gold, 5 bintang penuh atau sebagian).
  - Teks testimoni (italic, 3–4 baris).
  - Label jenis transaksi (pill kecil biru muda): "Pembeli Rumah" / "Owner Kost" / dst.
- Dot navigation + panah kiri/kanan (biru, bulat, hover gold).

### 6.9 Trust Strip (Compact)
*Background:* `--white`, border top + bottom `--border`.
Baris 4 elemen ikon + teks: `🛡️ Tanpa Biaya Tersembunyi` · `✅ Listing Diverifikasi SBP` · `⚖️ Legalitas Dicek Notaris` · `🤝 Transaksi Transparan`. Jarak merata, teks abu gelap, ikon biru.

### 6.10 ✦ Spill Blog / Artikel Terbaru
*Background:* `--white`.
*Section header:* "Artikel & Tips Properti" (h2) + "Lihat Semua →" (kanan, link biru).
3 kartu artikel blog:
- Cover image (rasio 16:9, rounded atas, object-fit cover).
- Chip kategori (biru muda pill, mis. "KPR", "Investasi", "Panduan").
- Judul (bold, 2 baris max, hover → biru).
- Excerpt (2 baris, abu).
- Bawah kartu: avatar author + nama + tanggal + "X menit baca".
- Hover: lift + shadow + cover image zoom halus.

### 6.11 Footer (SEO Internal Link)
*Background:* `--navy-deep #061B35`. Teks putih/abu muda.
**4 kolom:**
- Kol 1: Logo SBP + deskripsi singkat + kontak (WA, email) + sosial media.
- Kol 2: Properti Dijual (link SEO).
- Kol 3: Properti Investasi & Sewa (link SEO).
- Kol 4: Hyperlokal + About/Blog/FAQ/Privacy.
Baris paling bawah: "© 2024 CV Salam Bumi Property. Semua hak dilindungi." + Privacy Policy link.
Warna link: `rgba(255,255,255,0.65)`, hover → sky `#29B6F6`.

---

## 7. HALAMAN PROPERTIES — LAYOUT REFERENSI GAMBAR 5

> ⚠️ **DIREKTIF BUILDER:** Terapkan PERSIS layout berikut. Sidebar filter kiri + grid 3 kolom kanan. JANGAN simpan layout ini jadi filter horizontal atau filter top-bar saja.

### 7.0 Layout Keseluruhan
```
[SIDEBAR FILTER ~270px] | [AREA KONTEN — topbar + card grid]
```
- **Sidebar** fixed/sticky kiri, lebar ~270px, background putih, border-right tipis, padding internal 20px. Tampil di desktop; di mobile → tombol "Filter" membuka drawer dari kiri.
- **Area konten** mengisi sisa lebar, padding 24px.

### 7.1 Sidebar Filter (Kiri, Sticky)

**Header:** Teks "Filter" (bold, ukuran 18px) + teks "Reset" (merah, kanan — reset semua pilihan ke default saat diklik).

---

**Bagian: Tujuan**
Tiga tombol toggle (pill/rounded): `[Semua]` `[Dijual]` `[Disewa]`
- Aktif = biru metalik (background solid + teks putih).
- Tidak aktif = outline abu + teks gelap.

---

**Bagian: Jenis Properti**
Daftar checkbox dengan emoji per tipe, SCROLLABLE jika melebihi area:
```
☐ 🏠 Rumah
☐ 🏗️ Kost
☐ 🌟 Kost Eksklusif
☐ 🏨 Hotel
☐ 🏡 Homestay
☐ 🌴 Villa
☐ 🏢 Apartemen
☐ 🏬 Ruko
☐ 🌿 Tanah
☐ 🏭 Gudang
☐ 📊 Komersial Lainnya
```
- Bisa pilih lebih dari satu (multi-select).
- Checkbox yang aktif: warna biru metalik, teks bold.
- Jika semua dicentang atau tidak ada yang dicentang → tampilkan semua jenis.

---

**Bagian: Rentang Harga**
Label "Rentang Harga" + satu dropdown "Semua Harga".
- *Konteks Dijual:* Semua Harga / < 500jt / 500jt–1M / 1M–2M / 2M–3M / 3M–5M / 5M–10M / > 10M.
- *Konteks Disewa:* Semua Harga / < 5jt/th / 5–10jt/th / 10–25jt/th / 25–50jt/th / > 50jt/th.
- Dropdown mengubah pilihan otomatis sesuai tab Tujuan (Dijual/Disewa).

---

**Bagian: Lokasi**
Label "Lokasi" + dropdown searchable "Semua Lokasi" yang saat diklik **mengembang menjadi cascading panel 4 level**: Provinsi → Kab./Kota → Kecamatan → Kel./Desa (sinkron dengan 6.3, sumber: tabel `locations`).

---

**Filter Lanjutan (expandable accordion):**
Klik "Filter Lanjutan ▼" membuka: Kamar Tidur (min, stepper), Kamar Mandi (min, stepper), Luas Tanah (range slider), Luas Bangunan (range slider), Legalitas (multi-checkbox), Furnished.

---

**Filter Chip Aktif:** Di atas grid kartu, tampilkan **chip aktif** untuk setiap filter yang sedang aktif. Tiap chip punya tanda "×" untuk remove individual.

### 7.2 Topbar Area Konten

Baris di atas grid, space-between kiri↔kanan:
- **Kiri:** teks "Menampilkan **{X}** dari **{Y}** properti" (bold pada angka).
- **Kanan:** [Dropdown Sort: Terbaru ▼ | Termurah | Termahal | Luas Terbesar | Yield Tertinggi] + [Toggle ikon: Grid (default) | List | Peta 🗺️].

### 7.3 Grid Kartu Properti (3 Kolom — tampilan Grid)
Layout: `grid-template-columns: repeat(3, 1fr)`, gap 24px. Mobile: 1 kolom. Tablet: 2 kolom.

**Anatomi setiap kartu (dari atas → bawah):**

```
┌─────────────────────────────────┐
│ [Jenis Badge]     [PREMIUM/HOT] │  ← overlay di atas foto
│                                 │
│         FOTO PROPERTI           │  ← rasio 3:2, object-fit cover
│    ← galeri mini (arrow kiri/kanan) →   │
│ [Dijual/Disewa]       [Share ⇗] │  ← overlay bawah foto
├─────────────────────────────────┤
│ SBP-YYYYMMDD-XXXX               │  ← kode listing, abu kecil
│ Judul Properti (bold, 2 baris)  │
│ 📍 Kecamatan, Kabupaten         │  ← lokasi + ikon pin
├─────────────────────────────────┤
│ Rp X.XX M (Nego)                │  ← harga besar biru metalik
│ ~ Rp X Jt/m²                   │  ← harga per m², abu kecil
├─────────────────────────────────┤
│ LT: Xm²    LB: Xm²              │
│ KT: X      KM: X                │
│ Lantai: X                       │
│ Legalitas: SHM & IMB            │
├─────────────────────────────────┤
│  [  Lihat Detail →  ]           │  ← tombol lebar penuh, biru tua
└─────────────────────────────────┘
```

**Aturan badge foto:**
- Kiri atas: `{emoji} {Jenis}` (background solid warna per jenis, teks putih).
- Kanan atas: `FEATURED` (biru) | `PREMIUM` (emas, glow) | `HOT` (merah + 🔥) | `SOLD` (pita diagonal merah kanan atas).
- Kiri bawah: `Dijual` (hijau) | `Disewa` (biru muda) | `Dijual & Disewa` (keduanya).
- Kanan bawah: ikon share (subtle, muncul on hover).

**State tombol CTA:**
- Normal: `Lihat Detail →` (biru tua/navy, solid, full-width).
- SOLD: `Sudah Terjual` (abu/disabled — tidak dapat diklik atau klik mengarah ke konfirmasi).

**State kartu:**
- PREMIUM: border seluruh kartu berpendar emas (box-shadow gold).
- HOT: badge api merah kanan atas; tidak ada border khusus.
- SOLD: opacity gambar sedikit lebih gelap, overlay pita "SOLD" diagonal.

**Hover kartu:** lift (translateY -4px) + shadow naik + transisi 200ms.

### 7.4 Tampilan List (toggle alternatif)
Kartu horizontal: foto kiri (30% lebar) + info kanan (70%), lebih kompak, tampil 1 per baris. Sama field-nya.

### 7.5 Tampilan Peta (toggle Peta 🗺️)
Peta Leaflet full-width kanan, pin harga per properti (klik pin → popup card mini dengan foto + harga + "Lihat Detail"). Sidebar filter tetap di kiri.

### 7.6 Pagination & Load More
Pagination bernomor SEO-friendly (`?page=2`) + tombol "Muat Lebih Banyak" sebagai opsi sekunder. 20 kartu per halaman.

### 7.7 Empty State
Jika hasil pencarian = 0: ilustrasi ramah + "Belum ada properti yang cocok dengan filter Anda" + tombol "Reset Filter".

---

## 8. HALAMAN DETAIL PROPERTI

### 8.0 LAYOUT KESELURUHAN HALAMAN (WIREFRAME WAJIB)

> ⚠️ **DIREKTIF BUILDER:** Halaman detail memakai **layout 2 kolom** (desktop): konten utama kiri (~64%) + sidebar sticky kanan (~36%). Urutan komponen WAJIB persis seperti di bawah. Di mobile → single column, sidebar pindah ke posisi yang ditandai, dan ada **sticky bottom bar** (lihat 8.9).

```
DESKTOP (≥1024px):
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb (8.2)                                              │
├────────────────────────────────────┬─────────────────────────┤
│ KOLOM KIRI (konten, ~64%)          │ SIDEBAR KANAN (sticky)  │
│                                    │ ~36%, top:88px          │
│ 1. Galeri Foto (carousel+lightbox) │                         │
│ 2. Badge row (Jenis·Dijual·Verif)  │ ┌─────────────────────┐ │
│ 3. Kode + Judul + Lokasi(pin)      │ │ KOTAK HARGA (8.1)   │ │
│ 4. Quick Specs strip               │ │ Harga · /m² · NEGO  │ │
│    (LT·LB·KT·KM·Lantai·Legalitas)  │ │ views · updated     │ │
│ 5. Proximity Engine (8.5)          │ │ (TANPA tombol WA)   │ │
│ 6. Deskripsi (+SEO content 8.10)   │ └─────────────────────┘ │
│ 7. Investment Intelligence (8.4)   │ ┌─────────────────────┐ │
│ 8. Kalkulator KPR (8.3)            │ │ FORM KONTAK (8.8)   │ │
│ 9. Peta Leaflet lokasi             │ │ + Foto Monica       │ │
│ 10. Video YouTube (bila ada)       │ │ + 1 tombol WA       │ │
│                                    │ │   (di bawah form)   │ │
│                                    │ └─────────────────────┘ │
├────────────────────────────────────┴─────────────────────────┤
│ 11. Smart Suggestion / Properti Serupa (8.6) — FULL WIDTH    │
└──────────────────────────────────────────────────────────────┘

MOBILE (<1024px): single column, urutan:
Breadcrumb → Galeri → Badge → Judul → Kotak Harga → Quick Specs →
Proximity → Deskripsi → Investment → KPR → Peta → Video →
Form Kontak (8.8) → Smart Suggestion → [STICKY BOTTOM BAR 8.9]
```

- Sidebar kanan **sticky** (mengikuti scroll, berhenti sebelum footer).
- Investment Intelligence (poin 7) **hanya tampil** bila properti punya data income/pengeluaran; jika tidak, lewati.
- Proximity (poin 5) hanya tampil bila lat/long tersedia.

### 8.1 Konten Utama & Kotak Harga
Galeri foto (webp, lightbox), Kode Listing, Judul, Harga (lama dicoret bila ada), Spesifikasi lengkap, Deskripsi, embed video YouTube, peta Leaflet lokasi.

**Kotak Harga (sidebar/atas):** menampilkan Harga besar, **Harga per m²**, status NEGO/NETT, "Dilihat {views} kali", "Terakhir diperbarui {tanggal}".
> ⚠️ **DIREKTIF BUILDER:** Kotak harga **TIDAK BOLEH** memuat tombol WhatsApp. **Hanya ada SATU tombol WhatsApp di seluruh halaman detail**, yaitu di bagian bawah form "Kirim Pesan ke Admin" (lihat 8.8). Hapus tombol "Hubungi via WhatsApp" yang sebelumnya muncul di kotak harga.

### 8.2 Breadcrumb Dinamis & SEO
`Home / Properties / {Jenis} / {Provinsi} / {Kab.Kota} / {Kec.} / {Judul}`
- Tiap segmen = link **filter kumulatif** (mewarisi level di atas).
  - Home → homepage
  - Properties → semua properti
  - {Jenis} → `/properties?jenis=rumah`
  - {Provinsi} → +provinsi … {Kec.} → +kecamatan
  - {Judul} = teks aktif (non-link, tebal)
- Schema `BreadcrumbList` (JSON-LD).
- Responsif: truncate ellipsis / scroll horizontal di mobile; separator chevron `›`.

### 8.3 Kalkulator KPR — SUPER MODERN & INTERAKTIF

> ⚠️ **DIREKTIF BUILDER:** Kalkulator ini harus terlihat premium dan interaktif — BUKAN sekadar form biasa. Semua output berubah real-time (0ms latency, tanpa submit). Gunakan animasi angka, chart dinamis, dan split-panel layout.

**Layout: 2 Panel Berdampingan** (desktop), stack vertikal (mobile):
```
┌──────────────────────┬─────────────────────────┐
│   PANEL KIRI         │   PANEL KANAN            │
│   Input & Slider     │   Output & Visualisasi   │
└──────────────────────┴─────────────────────────┘
```

**PANEL KIRI — Input:**

*Field 1: Harga Properti*
- Input angka format Rupiah (pre-filled dari harga listing, bisa diubah).
- Slider horizontal di bawahnya: min Rp 100jt, max Rp 50M, step 50jt.
- Label kecil biru "Harga Listing" jika sama dengan harga listing.

*Field 2: Uang Muka (DP)*
- Dua input saling terkait: `[  20  ] %` ↔ `Rp [XX.XXX.XXX]` (ubah satu = update lainnya real-time).
- Slider 0–80%.
- Preset chip cepat: `[10%]` `[20%]` `[30%]` `[40%]` — klik langsung isi.

*Field 3: Suku Bunga per Tahun*
- Input angka + `%` suffix.
- Slider 5.0–15.0%, step 0.25%.
- Label kecil abu: "Rata-rata bunga KPR saat ini ~7%" (nilai default `7`, dapat diatur admin di Pengaturan 13.15).

*Field 4: Tenor (Jangka Waktu)*
- Slider besar dengan track berwarna: 1–30 tahun.
- Preset tombol pill di bawah: `[5 thn]` `[10 thn]` `[15 thn]` `[20 thn]` `[25 thn]` `[30 thn]`.
- Angka besar di tengah slider bergerak sesuai.

---

**PANEL KANAN — Output Real-time:**

*Kartu utama (biru metalik, teks putih, rounded-xl):*
- Label abu muda kecil: "ANGSURAN PER BULAN"
- Angka besar animasi count-up: **Rp X.XXX.XXX** (font besar tebal, berubah smooth saat input diubah)
- Label kecil di bawah: "{tenor} tahun · bunga {rate}% per tahun"

*Grid 3 kartu ringkasan (di bawah kartu utama):*
```
┌──────────────┬──────────────┬──────────────┐
│ Total        │ Total        │ Total        │
│ Pinjaman     │ Bunga        │ Pembayaran   │
│ Rp X.XX M    │ Rp X.XX M    │ Rp X.XX M   │
└──────────────┴──────────────┴──────────────┘
```
Setiap kartu: latar abu sangat muda, border tipis, label kecil + angka semi-bold.

*Donut Chart Interaktif:*
- Tampilkan proporsi **Pokok (biru)** vs **Bunga (merah muda)**.
- Di tengah donut: persentase pokok/bunga bergantian setiap 2 detik.
- Legend di samping chart.
- Animasi easing saat proporsi berubah.

*Progress bar "DP vs Pinjaman":*
- Bar horizontal warna dua segmen (hijau = DP, biru = pinjaman), persentase di ujung.

*Toggle "Lihat Tabel Amortisasi":*
- Teks link kecil "Lihat Tabel Amortisasi Tahunan ▼".
- Accordion expand → tabel: Tahun, Sisa Pokok, Angsuran, Pokok, Bunga (per tahun).
- Max 30 baris.

*CTA (opsional, sekunder):*
- Tombol outline kecil `💬 Konsultasi KPR via WhatsApp` — membawa ringkasan simulasi dalam pesan WA. Ini BUKAN tombol kontak utama.

*Disclaimer (wajib):*
`⚠️ "Simulasi ini hanya estimasi, bukan penawaran resmi dari lembaga perbankan manapun."`

**Rumus:** `M = P × [i(1+i)^n] / [(1+i)^n − 1]`, i = rate/12, n = tenor×12.

### 8.4 ✦ Investment Intelligence (BARU — pembeda utama)

> ⚠️ **DIREKTIF BUILDER:** Tampil sebagai **panel premium** (background `gradient-navy-section`, teks putih) — bukan tabel polos. Hanya muncul bila properti punya `income_per_bulan`.

**Layout panel (card gelap, rounded-2xl, padding 32px):**
```
┌────────────────────────────────────────────────────┐
│ 💡 ANALISIS INVESTASI            [Skor: ⭐⭐⭐⭐☆]  │
├──────────────┬──────────────┬──────────────────────┤
│ YIELD/TAHUN  │ PAYBACK      │ CAP RATE             │
│  8.2%        │  ~12 tahun   │  8.5%                │
│ (besar gold) │ (besar)      │ (besar)              │
├──────────────┴──────────────┴──────────────────────┤
│ Income bersih/bln: Rp XX jt · Income/th: Rp XXX jt │
│ [▓▓▓▓▓▓▓░░░] Visual yield vs deposito (3%)         │
│ 💬 Konsultasi Investasi via WhatsApp (opsional)    │
└────────────────────────────────────────────────────┘
```
**Rumus:** Yield = `(income − pengeluaran) × 12 / harga` · Payback = `harga / ((income−pengeluaran)×12)` · Cap Rate = `(income×12) / harga`.
**Skor Investasi** (bintang 1–5): dipetakan dari yield (mis. <4%→2★, 4–6%→3★, 6–8%→4★, >8%→5★).
**Highlight komparatif:** tampilkan bar membandingkan yield properti vs bunga deposito (~3%) → memvisualkan keunggulan.
Disclaimer: *"Estimasi berdasarkan data yang diberikan pemilik, bukan jaminan imbal hasil."* Selaras slogan *"buy real estate and wait."*

### 8.5 ✦ Proximity Engine (BARU)

> Tampil sebagai **strip badge "Lokasi Strategis"** di bawah quick specs. Hanya muncul bila lat/long tersedia.

**Layout (kartu putih, judul "📍 Lokasi Strategis"):**
```
┌─────────────────────────────────────────────┐
│ 📍 LOKASI STRATEGIS                          │
│ 🎓 UGM          1.2 km   (~4 mnt berkendara) │
│ 🏥 RS Sardjito  2.0 km                       │
│ 🛍️ Mall Jogja   3.5 km                       │
│ ✈️ Bandara YIA  38 km                        │
└─────────────────────────────────────────────┘
```
- Jarak dihitung Haversine dari lat/long properti ke daftar landmark (disimpan di config/DB).
- Landmark terdekat (mis. kampus) dapat juga muncul sebagai **badge di galeri foto** ("🎓 500m dari UGM").
- Mendukung halaman programmatic `kost-dekat-ugm` berbasis data jarak nyata, bukan sekadar keyword.

### 8.6 ✦ Smart Suggestion — Properti Serupa yang Mungkin Anda Suka

> ⚠️ **DIREKTIF BUILDER:** Bagian ini WAJIB tampil di halaman detail. Bukan sekadar grid kartu biasa — tiap kartu harus memiliki **"Relevance Reason Badge"** yang menjelaskan MENGAPA properti ini disarankan. Layout: horizontal scrollable grid, bukan vertical list.

**Posisi di halaman:** Tepat di bawah seksi "Properti Serupa" (setelah Proximity + Investment, sebelum form kontak).

---

**Section Header:**
- Teks kecil biru atas: `🔍 REKOMENDASI CERDAS`
- Judul h2: **"Properti Serupa yang Mungkin Anda Suka"**
- Subtitle abu: *"Dipilih otomatis berdasarkan lokasi, harga, dan jenis properti yang serupa"*
- (Kanan header): link `"Lihat Semua Properti Serupa →"` (biru, kecil)

**Background section:** `--sky-pale #E3F2FD`, padding atas/bawah 60px.

---

**Layout Kartu:**
- Desktop: **4 kartu sejajar** (grid 4 kolom, gap 20px).
- Tablet: 2 kolom.
- Mobile: **horizontal scroll** (swipe kanan-kiri, kartu lebar ~280px, peek kartu berikutnya 30px).
- Arrow navigasi kiri/kanan (biru, bulat, shadow) tampil di desktop; swipe di mobile.

---

**Anatomi per Kartu (compact property card dengan relevance badge):**

```
┌──────────────────────────────┐
│ [Jenis]       [PREMIUM/HOT]  │  ← badge overlay foto
│                              │
│      FOTO PROPERTI           │  ← rasio 4:3, height ~180px
│ ════════════════════════════ │
│ [🏘️ Kecamatan Sama]          │  ← RELEVANCE REASON BADGE ← NEW
├──────────────────────────────┤
│ SBP-XXXXXX-XXXX              │  ← kode abu kecil
│ Judul Properti (bold, 2brs)  │
│ 📍 Kec, Kab                  │
│ Rp X.XX M (Nego)             │  ← harga biru bold
│ ~Rp X Jt/m²   [KT:X KM:X]  │
│ [   Lihat Detail →   ]       │  ← CTA full width
└──────────────────────────────┘
```

---

**Relevance Reason Badge (⬆ INI FITUR UTAMA yang membedakan):**
Badge pill melayang tepat di atas area info (border antara foto dan konten), background putih, border biru tipis, teks biru small bold. Setiap kartu mendapat SATU alasan terkuat:

| Kondisi | Badge |
|---------|-------|
| Kecamatan = sama | `🏘️ Kecamatan Sama` |
| Kabupaten = sama, kecamatan ≠ | `📍 Kabupaten Sama` |
| Jenis properti = sama | `🏠 Jenis Sama` |
| Selisih harga ≤ 20% | `💰 Harga Serupa` |
| Luas tanah ±30% | `📐 Luas Serupa` |
| Badge PREMIUM/pilihan editor | `⭐ Pilihan Editor` |
| Properti baru tayang (<7 hari) | `🆕 Baru Tayang` |
| Proximity landmark sama | `🎓 Dekat Kampus` / `🏥 Dekat RS` |

Prioritas: Lokasi Sama > Harga Serupa > Jenis Sama > Pilihan Editor.

---

**Quick-View Hover (desktop):**
Saat hover kartu → overlay putih semi-transparan muncul di separuh bawah kartu berisi: 2–3 spesifikasi tambahan (LT, LB, Legalitas) + tombol "👁️ Lihat Cepat" yang membuka **modal preview** tanpa navigasi:
- Modal: foto besar + judul + spesifikasi lengkap + dua tombol "Lihat Detail Penuh" + "WA".
- Berguna untuk membandingkan cepat tanpa kehilangan halaman saat ini.

---

**Algoritma Scoring (backend):**
```
Skor = 
  (kecamatan_sama × 40) +
  (kabupaten_sama × 20) +
  (jenis_sama × 25) +
  (harga_dalam_range_20% × 15) +
  (luas_dalam_range_30% × 10) +
  (badge_premium × 5) +
  (baru_tayang_7hr × 8) -
  (is_sold × 999)     ← SOLD selalu disembunyikan
```
- Kecualikan properti yang sedang dibuka.
- Fallback bertahap jika kandidat < 4: lepas filter harga → perluas ke kab → lintas jenis (hanya jika benar-benar tidak ada).
- Tampilkan **4–6 kartu** urut skor tertinggi.
- Skeleton loading 4 kartu saat data di-fetch.

---

**Empty State:** Jika tidak ada kandidat setelah semua fallback: sembunyikan seluruh seksi (tidak tampil sama sekali).

### 8.7 Aksi & Share
- **Share** (WA, FB, X, copy link) dengan OG card dinamis.
- **Unduh Brosur PDF** listing (foto + spesifikasi + kontak) — di-generate edge.
- Tombol Favorit.
- "Terakhir diperbarui {tanggal}" + "Dilihat {views} kali" (freshness & social proof).

### 8.8 Form "Kirim Pesan ke Admin"
Header: Foto Monica (`monic sbp.webp`), Nama: Monica Vera S, Jabatan: Admin/Agent Properti.
Dropdown pembuka: **"Beritahu Kami Siapakah Anda?"**

- **A — Calon Pembeli:** Nama (wajib), Asal Daerah (wajib), Estimasi Budget [dropdown bracket] (wajib), Rencana Pembayaran (Hard Cash / Soft Cash / KPR), Pesan Tambahan (opsional).
- **B — Penjual/Pemilik:** Nama, Asal Daerah, "Apa yang bisa kami bantu?" → *Titip Jual* (lanjut: Jenis Properti, Lokasi, Pesan) atau *Konsultasi*.
- **C — Broker/Agent:** Nama, Asal Daerah, "Apa Tujuan Anda?" → "Apakah Bisa Bekerjasama?" / "Konsultasi", Pesan.

**⚠️ TOMBOL WHATSAPP (SATU-SATUNYA, di bawah form):**
- Hanya ada **1 (satu) tombol WhatsApp** di halaman detail, diletakkan **di bagian paling bawah form ini** (lebar penuh, hijau). Tidak ada tombol WA lain di kotak harga maupun tempat lain.
- **State awal: DISABLED (nonaktif/abu-abu)** disertai teks bantu "Lengkapi form untuk menghubungi via WhatsApp".
- Tombol **AKTIF otomatis (real-time)** hanya setelah **seluruh field wajib** pada opsi yang dipilih (A/B/C) terisi valid.
- Saat AKTIF & diklik → **simpan lead ke DB lebih dulu (K6)** → buka WA dengan pesan terformat.

**Perilaku (K6):** Saat tombol WhatsApp ditekan → **simpan lead ke tabel `leads` lebih dulu**, lalu buka WA dengan **pesan otomatis terformat** dari isi form (sertakan judul + link detail + thumbnail).

Contoh pesan (Pembeli):
```
Halo Monica Vera S!
Saya tertarik dengan properti: {Judul Properti}
{Link Detail Properti}

Saya Adalah Calon Pembeli
Nama: Andre
Asal Daerah: Jakarta
Estimasi Budget: 1M–2M
Rencana Pembayaran: Hard Cash
Pesan: ...
Mohon informasi lebih lanjut.
```

### 8.9 ✦ Sticky Bottom Bar (MOBILE — BARU, WAJIB)
> Di mobile (<1024px), tampilkan **bar melekat di bawah layar** (fixed bottom, z-index tinggi, shadow atas) — elemen konversi paling penting di mobile.
```
┌─────────────────────────────────────────────┐
│ Rp 3.50 M          [ 💬 Hubungi via WA ]    │
│ Kost · Sleman       (hijau, lebar)          │
└─────────────────────────────────────────────┘
```
- Kiri: harga ringkas + jenis/lokasi mini.
- Kanan: tombol WA hijau. Klik → **scroll/expand ke form kontak (8.8)** untuk diisi dulu (tetap mematuhi K6: lead disimpan sebelum buka WA). JANGAN langsung buka WA tanpa form terisi.
- Bar sembunyi saat form kontak sedang terlihat di viewport (agar tidak dobel).
- Tidak tampil di desktop (sidebar sudah selalu terlihat).

### 8.10 ✦ Blok Konten SEO (BARU — di bawah Deskripsi)
> Paragraf naratif auto-generate (boleh AI, 2.7) untuk dibaca mesin pencari — natural, bukan keyword-stuffing.

Contoh template: *"{Jenis} ini berlokasi di {Kecamatan}, {Kabupaten}, salah satu kawasan {strategis/berkembang} di {Kota}. Dengan luas tanah {LT} m² dan {KT} kamar tidur, properti {dijual/disewa} dengan harga {harga}. Lokasinya {X} menit dari {landmark terdekat}, cocok untuk {hunian/investasi}…"*
- 2–3 paragraf, ≤ 600 kata total, unik per listing (anti duplicate content).
- Mengandung kata kunci lokasi & jenis secara alami.

---

## 9. PROGRAMMATIC SEO (Halaman Lokasi & Fitur)

### 9.0 LAYOUT HALAMAN PROGRAMMATIC (WIREFRAME WAJIB)

> ⚠️ **DIREKTIF BUILDER:** Halaman seperti `/rumah-dijual-jogja` adalah **landing page SEO** yang diranking Google — bukan sekadar halaman filter. WAJIB punya konten naratif di atas grid, bukan langsung kartu.

```
┌──────────────────────────────────────────────────┐
│ Breadcrumb: Home › Rumah Dijual › Jogja           │
├──────────────────────────────────────────────────┤
│ HERO MINI (background sky-pale / foto lokasi)     │
│ H1: "Rumah Dijual di Jogja"                       │
│ Subjudul: "{N} properti tersedia · harga mulai Rp"│
│ Paragraf intro SEO (2–3 kalimat naratif lokasi)   │
├──────────────────────────────────────────────────┤
│ Filter bar ringkas (chip cepat: harga, KT, dll)   │
├──────────────────────────────────────────────────┤
│ GRID KARTU PROPERTI (3 kolom, sama 7.3)           │
│ + Pagination SEO (?page=2)                         │
├──────────────────────────────────────────────────┤
│ BLOK KONTEN SEO (naratif tentang kawasan,         │
│ 2–3 paragraf unik, auto/editorial)                │
├──────────────────────────────────────────────────┤
│ INTERNAL LINKING (9.4):                           │
│ "Properti di Lokasi Lain" + "Jenis Lain"          │
├──────────────────────────────────────────────────┤
│ FAQ singkat (3–5 Q&A) + Schema FAQPage            │
└──────────────────────────────────────────────────┘
```
- H1 mengandung keyword utama (jenis + tujuan + lokasi).
- Meta title & description auto (3.3).
- Schema: `BreadcrumbList` + `FAQPage` + `ItemList` (daftar listing).
- Paragraf intro & blok konten SEO auto-generate (boleh AI) agar unik per halaman.

### 9.1 Halaman Lokasi (auto)
Routing dinamis (dijual & disewa):
```
/{jenis}-dijual-{kota|kabupaten|kecamatan}
/{jenis}-disewa-{lokasi}
```
Contoh: `/rumah-dijual-jogja`, `/rumah-dijual-sleman`, `/kost-dijual-dekat-ugm`, `/tanah-dijual-bantul`, `/villa-disewa-kaliurang`.
Tiap halaman: ambil listing dari DB → filter jenis+lokasi → daftar properti + pagination → meta title/description auto → internal link.

### 9.2 Halaman Fitur (auto)
Kombinasi fitur properti: `/rumah-2-lantai-sleman`, `/kost-20-kamar-dekat-ugm`, `/tanah-1000m2-sleman`, `/villa-view-merapi`. Filter via jumlah_kamar / luas / fitur lokasi.

### 9.3 Aturan
- **Anti thin-content:** generate hanya bila listing ≥ 3, else redirect kategori induk.
- `getUniqueLocations()` mengekstrak lokasi unik dari DB untuk daftar halaman.
- Semua masuk sitemap; auto-update saat listing baru.

### 9.4 Internal Linking (Topical Authority)
Pada tiap halaman kategori, tampilkan section **"Properti di Lokasi Lain"** & **"Jenis Properti Lain"** berbasis data DB. Contoh di `/rumah-dijual-sleman`: link ke rumah-dijual-jogja, rumah-dijual-bantul, rumah-dijual-kulonprogo, tanah-dijual-sleman, villa-dijual-sleman.

---

## 10. HALAMAN STATIS

> ⚠️ **DIREKTIF BUILDER:** Setiap halaman ini WAJIB punya konten & layout nyata, bukan placeholder kosong. Minimum spec per halaman di bawah.

### 10.1 About Us (pilar kepercayaan utama)
- Hero: judul "Tentang Salam Bumi Property" + tagline.
- Kisah & misi SBP: positioning "kurasi & verifikasi", bukan marketplace agen.
- Profil tim: **Monica Vera S** (foto `monic sbp.webp`, Admin/Agent) & **Ardy Salam** (foto TTD/profil). Nama, peran, kontak.
- Legitimasi: CV Salam Bumi Property, alamat, (opsional) NIB/legalitas usaha.
- Stat strip (reuse 6.4): listing, transaksi, rating.
- Nilai/keunggulan (3–4 kartu ikon): Terverifikasi, Transparan, Legalitas Dicek, Pendampingan.
- CTA: "Titip Jual Properti Anda" + "Lihat Properti".
- Schema `Organization`/`AboutPage`.

### 10.2 Notaris
- Penjelasan layanan legalitas & peran notaris dalam transaksi.
- Edukasi: cara cek keaslian sertifikat (SHM/SHGB), alur AJB, balik nama.
- (Opsional) profil/partner notaris.
- FAQ legalitas (3–5 Q&A) + CTA konsultasi WA.

### 10.3 Portofolio Gallery
- Grid galeri properti **terjual/tersewa** (social proof transaksi).
- Filter per jenis. Tiap item: foto + judul + label "TERJUAL" + lokasi + (opsional) testimoni terkait.
- Tujuan: membuktikan rekam jejak nyata (menggantikan kepercayaan dari "banyak agen").

### 10.4 Blog
- Halaman index: grid kartu artikel + filter kategori + search + pagination.
- Halaman artikel: cover, judul H1, meta penulis+tanggal+reading time, konten, daftar isi (opsional), artikel terkait, CTA, schema `BlogPosting`.
- Target keyword informasional (panduan KPR, cek SHM, investasi kost Jogja) → topical authority.

### 10.5 FAQ
- Accordion pertanyaan-jawaban dikelompokkan (Umum, Membeli, Titip Jual, Legalitas, Pembayaran).
- Minimum 10 Q&A terisi nyata (bukan lorem). Schema `FAQPage` WAJIB.
- CTA "Masih ada pertanyaan? Hubungi kami" + WA.

### 10.6 Contact
- Info: alamat, WA, email, jam operasional.
- Peta Leaflet lokasi kantor.
- Form kontak singkat (nama, kontak, pesan) → simpan ke `leads` + WA.
- Schema `LocalBusiness` (NAP konsisten).

### 10.7 Privacy Policy & Terms (WAJIB secara hukum — UU PDP)
- Kebijakan data pribadi: data apa yang dikumpulkan (NIK/KTP/WA), tujuan, dasar consent.
- Hak subjek data: akses, koreksi, penghapusan (right to erasure) + cara mengajukan.
- Retensi data: berapa lama disimpan (mis. data lead 24 bln, data kontrak sesuai kewajiban hukum).
- Cookie policy (untuk GA4).
- Kontak Data Protection (email/WA).
- Tanggal berlaku & versi.

---

## 11. LEAD CAPTURE & WHATSAPP CRM

- Semua form (detail, KPR, investasi, titip jual) **menyimpan lead ke DB sebelum redirect WA** (K6).
- Lead menyimpan: source_page, property_id, isi form, waktu.
- **Pipeline CRM** di admin (Bagian 13.6): Baru → Dihubungi → Viewing → Nego → Closed / Lost (kanban).
- Pesan WA otomatis terformat & kontekstual (judul, link, ringkasan simulasi).
- Tracking event "klik WA" (Analytics).

---

## 12. ALUR FORM SUBMISSION OWNER (Titip Jual + Tanda Tangan Digital)

> ⚠️ **DIREKTIF BUILDER — BACA DULU:**
> 1. Alur ini terbagi **DUA FASE TERPISAH** yang tidak boleh digabung dalam satu flow.
> 2. Fase 1 (Steps 1–2) = halaman publik, bisa diakses langsung oleh owner.
> 3. Fase 2 (Step 3/Tanda Tangan) = halaman **privat via link khusus** yang digenerate admin — **BUKAN sambungan langsung dari Step 2**.
> 4. **TIDAK ADA LANGKAH "OPSI PERJANJIAN"** di website sama sekali. Jangan munculkan pilihan Open Listing / Exclusive Listing kepada owner.
> 5. Setelah Step 2 selesai ("Kirim Properti"), flow untuk owner **SELESAI** — dia menunggu WA dari admin. Step 3/Tanda Tangan dibuka lewat link terpisah dari admin, bukan tombol "Lanjut" di website.

### 12.0 Ringkasan Alur

```
FASE 1 — OWNER MANDIRI (WEBSITE PUBLIK)
  ┌─────────┐     ┌──────────────┐     ┌─────────────────────┐
  │ STEP 1  │ ──► │   STEP 2     │ ──► │  HALAMAN SUKSES     │
  │ Data    │     │   Info       │     │  "Terima kasih!     │
  │ Diri    │     │   Properti   │     │   Tunggu WA kami."  │
  └─────────┘     └──────────────┘     └─────────────────────┘
  URL: /titip-jual/data-diri          /titip-jual/sukses

ADMIN (DASHBOARD) — Setelah menerima submission:
  Tinjau data → Konfigurasi Perjanjian → Generate Link → Kirim WA

FASE 2 — PENANDATANGANAN (LINK KHUSUS DARI ADMIN)
  ┌─────────────────────────────────┐     ┌───────────────────┐
  │  HALAMAN TANDA TANGAN           │ ──► │  HALAMAN TAYANG   │
  │  (dokumen read-only + kanvas)   │     │  "Properti Tayang!│
  │  URL: /sign/{token-rahasia}     │     │   Lihat di sini." │
  └─────────────────────────────────┘     └───────────────────┘
```

### 12.1 HALAMAN STEP 1 — DATA DIRI (URL: `/titip-jual/data-diri`)

**Layout halaman:**
- Background abu sangat muda.
- Card putih max-width 640px, centered, padding 40px, shadow lembut.
- Tepat di atas card: **stepper 2 langkah** (Fase 1 saja):
  ```
  ● Data Diri  ───  ○ Info Properti
  ```
  Step aktif = lingkaran biru terisi + teks bold. Step belum = lingkaran abu outline.

**Isi card:**
- Judul: "Data Diri Pemilik" (h2, bold).
- Subjudul kecil: "Isi sesuai KTP yang masih berlaku."

**Field-field (stacked, label di atas input):**
1. Nama Lengkap (KTP) * — text input.
2. NIK (KTP) * — number input, max 16 digit.
3. Alamat Lengkap (KTP) * — textarea 3 baris.
4. RT/RW * — dua input kecil sejajar.
5. Kelurahan/Desa * — text input.
6. Kecamatan * — text input.
7. **Bertindak Sebagai** * — radio button:
   - ○ Owner Sah (Pemilik Langsung)
   - ○ Pasangan (Suami/Istri)
   - ○ Ahli Waris
   - ○ Lainnya (Broker/Perantara/Saudara)
8. **[KONDISIONAL — muncul bila "Ahli Waris" dipilih]:**
   - Berapa total ahli waris? (number)
   - Apakah semua ahli waris sepakat untuk dijual? (Ya / Tidak toggle)
   - Apakah sudah dikuasakan via notaris? (Ya / Tidak)
   - Apakah turun waris sudah diurus via notaris? (Ya / Tidak)
9. No. WA Aktif 1 * — tel input, prefix "+62".
10. No. WA Aktif 2 — tel input (opsional, label "Opsional").
11. **Checkbox consent (wajib dicentang sebelum bisa lanjut):**
    `[ ] Saya menyetujui Kebijakan Privasi SBP dan mengizinkan penggunaan data pribadi saya untuk keperluan pemasaran properti. (UU PDP)`

**Footer card:**
- Tombol **"Lanjut ke Info Properti →"** (lebar penuh, biru metalik, disabled hingga semua field wajib + checkbox valid).
- Validasi inline: pesan error merah muncul langsung di bawah field jika tidak valid.

---

### 12.2 HALAMAN STEP 2 — INFO PROPERTI (URL: `/titip-jual/info-properti`)

**Layout halaman:**
- Card putih max-width 680px, centered.
- Stepper di atas card:
  ```
  ✓ Data Diri  ───  ● Info Properti
  ```
  Step 1 = centang hijau. Step 2 = lingkaran biru aktif + bold.

**Isi card:**
- Judul: "Informasi Properti" (h2).
- Subjudul: "Lengkapi data properti yang ingin Anda pasarkan."
- Kode Listing (auto-generate, tampil read-only dengan ikon copy): `SBP-YYYYMMDD-XXXX`.

**Field-field:**
1. **Tujuan** * — toggle button: `[Dijual]` `[Disewakan]` `[Dijual & Disewakan]` (satu aktif = biru).
2. **Harga Penawaran** * — number input + format Rupiah. Jika "Dijual" → harga jual. Jika "Disewakan" → harga sewa/tahun.
3. **Kondisi Harga** * — toggle: `[Nego]` `[Nett]`.
4. **Alamat Lengkap Properti** * — textarea.
5. **Link Google Maps** * — text input (URL lengkap).
6. **Jenis Properti** * — select dropdown. **Saat jenis dipilih, field-field tambahan muncul otomatis** (kondisional dari Pustaka Bagian 5 dokumen ini):
   - Rumah: LT, LB, Lebar Depan, Lantai, KT, KM.
   - Kost: Jenis Kost (Putra/Putri/Campur), LT, LB, Lebar Depan, Lantai, KT, KM, Ruang Penjaga, Token Listrik/Kamar, Harga Sewa/Kamar/Bln.
   - Tanah: LT, Lebar Depan.
   - Hotel/Homestay/Villa: LT, LB, Lebar Depan, Lantai, KT, KM, Harga Sewa Kamar/Bln, Income/Bln, Pengeluaran/Bln, Kelengkapan.
   - Apartemen: LB, Lantai, No. Unit, KT, KM, Kelengkapan.
   - Gudang: LT, LB, Lebar Depan.
   - Komersial Lainnya: LT, LB, Lebar Depan + deskripsi.
7. **Legalitas** * — select dropdown (dari Pustaka Bagian 5).
8. **Status Legalitas** * — toggle: `[On Hand]` `[On Bank]`. Jika "On Bank": input "Nama Bank" + "Outstanding (Rp)".
9. **Lingkungan** * — select: Jauh dari Semuanya / Dekat Sungai / Dekat Makam / Dekat Sutet.
10. **Lebar Jalan di Depan** — number input (meter).
11. **Informasi Tambahan & Fasilitas** — textarea.
12. **Alasan Dijual** — textarea.
13. **Upload Foto** * — dropzone multi-upload (maks 20 foto, format JPG/PNG/WEBP, auto-konversi webp server-side). Preview thumbnail setelah upload. Keterangan: "Foto pertama akan jadi cover."

**Footer card:**
- Baris dua tombol: `[← Kembali]` (outline) + `[📄 Kirim Properti →]` (biru metalik, solid, lebar cukup).
- "Kirim Properti" disabled hingga field wajib valid.
- Saat diklik: loading spinner → data tersimpan sebagai **DRAFT** → redirect ke `/titip-jual/sukses`.

---

### 12.2b HALAMAN SUKSES FASE 1 (URL: `/titip-jual/sukses`)

**Layout:** Card centered, ikon ✅ hijau besar, latar putih.
- Judul: **"Properti Berhasil Terkirim! 🎉"**
- Body: *"Terima kasih! Tim Salam Bumi Property telah menerima data properti Anda dengan Kode Listing **{KODE}**. Kami akan menghubungi Anda via WhatsApp dalam 1×24 jam untuk proses selanjutnya."*
- Tombol: `[Kembali ke Beranda]` (outline).
- Catatan kecil abu: "Belum ada yang tampil di website — properti baru tayang setelah Anda menandatangani perjanjian."

**⚠️ DIREKTIF BUILDER:** Halaman ini adalah **UJUNG ALUR** Fase 1. Tidak ada tombol "Lanjut ke Tanda Tangan". Tidak ada langkah 3 dari sini.

---

### 12.3 Opsi Perjanjian — DITENTUKAN ADMIN (bukan halaman publik)
> Definisi tetap berlaku sebagai aturan bisnis, tetapi **dikonfigurasi oleh admin di dashboard (13.5)**, bukan dipilih owner di website. Nilai yang dipilih admin otomatis mengisi dokumen Perjanjian (12.6).

Jenis transaksi: **JUAL/BELI | SEWA** (diturunkan otomatis dari `properties.tujuan`, bukan diinput admin).
- **OPEN LISTING:** bebas/tidak terikat, tidak ada durasi.
- **EXCLUSIVE LISTING:** terikat (durasi 3/6/12 bln dipilih admin, dapat diperpanjang). Jika lewat kontrak & belum terjual → dapat auto-downgrade ke Open Listing. Keunggulan: biaya iklan 100% ditanggung SBP, layanan prioritas, garansi pemasaran maksimal.

> **REVISI FEE (fleksibel & negotiable):** Persentase fee **TIDAK lagi terkunci** pada angka tetap (dulu 3%/5%/10%). Fee dinegosiasikan admin↔owner via WhatsApp manual, lalu admin **input angka persentase manual** (mis. 2% / 2.5% / 3% / 5%) di form Konfigurasi Perjanjian (13.5). Angka ini auto-sync mengisi Pasal 3 dokumen. Jenis listing dipilih admin via **radio button (Open ATAU Exclusive, tidak keduanya)**.

### 12.4 HALAMAN TANDA TANGAN (URL: `/sign/{token}` — link dari admin)

> ⚠️ **DIREKTIF BUILDER:** Halaman ini SETARA pentingnya dengan Step 1–2. Bukan halaman publik biasa — diakses hanya via token rahasia dari admin. Wireframe & aturan keamanan WAJIB diikuti.

**Keamanan Token (WAJIB):**
- `token` = UUID v4 / random 32-char, disimpan di `agreements.sign_token`.
- Saat halaman dibuka: validasi token → cek `token_expires_at` (default +72 jam) & `token_used`.
- **Jika token tidak valid / kedaluwarsa** → halaman error ramah: *"Link perjanjian ini sudah tidak berlaku. Silakan hubungi tim SBP untuk link baru."* + tombol WA.
- **Jika token sudah dipakai (token_used = true)** → tampilkan halaman *"Perjanjian sudah ditandatangani"* + link ke properti yang tayang.
- Setiap pembukaan link → `link_opened_count++`.

**Layout halaman (card centered, max-width 760px):**
```
┌──────────────────────────────────────────────┐
│ Stepper: ✓ Data Diri  ✓ Info Properti  ● TTD │
├──────────────────────────────────────────────┤
│ "Perjanjian Jasa Pemasaran"                  │
│ Nomor: {Kode Perjanjian}                     │
├──────────────────────────────────────────────┤
│ DOKUMEN PERJANJIAN (scrollable, READ-ONLY)   │
│ — Pihak Pertama & Kedua (terisi otomatis)    │
│ — Pasal 1–7 (terms diisi admin: open/excl,   │
│   durasi, fee — owner TIDAK bisa ubah)       │
│ — Materai (hg.png) + TTD Ardy (otomatis)     │
├──────────────────────────────────────────────┤
│ KANVAS TANDA TANGAN (di atas materai)        │
│ [area gambar TTD]   [× Hapus] [Simpan TTD]   │
├──────────────────────────────────────────────┤
│ ☐ Checkbox persetujuan (12.4 teks)           │
│ [ Kirim Perjanjian → ] (disabled by default) │
└──────────────────────────────────────────────┘
```

**Aturan tombol "Kirim Perjanjian":**
- AKTIF hanya jika: (1) tanda tangan tergambar di kanvas, **DAN** (2) checkbox persetujuan dicentang.
- Saat diklik:
  1. Simpan signature (PNG transparan) ke R2 → `signature_image_url`.
  2. Catat audit: `audit_ip`, `audit_user_agent`, `signed_at`, `audit_hash_dokumen` (SHA-256 dari dokumen final).
  3. Generate **PDF arsip** kontrak → `pdf_url` (R2).
  4. Set `token_used = true`, `status = signed`.
  5. **Properti auto-tayang** (`status_publish = published`, `published_at = now`).
  6. Redirect ke halaman sukses Fase 2.

**Kanvas TTD:** library signature pad (mouse + touch), responsif, garis hitam di atas gambar materai. **PENAJAMAN:** (1) goresan tanda tangan **WAJIB menimpa/menindih materai** (praktik hukum ID — TTD harus mengenai materai agar sah); materai (hg.png) diposisikan di dalam area kanvas. (2) **Area menggambar luas/tidak terbatas** — kanvas tidak dibatasi kotak kecil; owner bebas menggoreskan TTD seluas yang dibutuhkan, boleh melampaui kotak materai. Garis TTD dirender DI ATAS layer materai (z-index lebih tinggi) sehingga visual TTD menimpa materai.

**Halaman Sukses Fase 2 (`/sign/sukses`):** ikon 🚀, *"Selamat, properti Anda telah tayang!"* + tombol "Lihat Properti Saya →" (link ke detail listing). Checkbox persetujuan teks: *"Saya setuju dengan syarat dan ketentuan yang berlaku. Dengan mencentang ini, saya menyatakan semua informasi benar dan menyetujui perjanjian pemasaran dengan Salam Bumi Property."*

*(Pertimbangkan e-Meterai Peruri / e-sign tersertifikasi PSrE di fase legal lanjut untuk kekuatan hukum maksimal.)*

### 12.5 Catatan Penting
- Draft tersimpan begitu "Kirim Properti" ditekan (meski belum tanda tangan) → admin bisa follow-up kirim ulang link.
- Properti tayang hanya setelah perjanjian ditandatangani & "Kirim Perjanjian" diklik.
- Kebijakan pembatalan & booking fee diatur dalam Pasal 5/7 perjanjian (bukan ditampilkan di website publik). *(Catatan: SBP tidak memiliki sistem agen pihak ketiga — "Pihak Pertama" dalam kontrak adalah CV Salam Bumi Property sendiri.)*

### 12.6 Template Perjanjian (dinamis)
**PERJANJIAN JASA PEMASARAN — SALAM BUMI PROPERTY**
Jenis: {EXCLUSIVE/OPEN, durasi} · Jenis Perjanjian: {Jual/Beli | Sewa} · Nomor: {Kode Listing}.
**Pihak Pertama:** CV Salam Bumi Property · Jl. Pajajaran, Catur Tunggal, Depok, Sleman (Virtual Office) · WA 0813-9127-8889 · salambumiproperty@gmail.com · salambumi.xyz.
**Pihak Kedua:** {Nama, NIK, Alamat KTP — dari form owner}.
- **Pasal 1 Objek:** hak pemasaran {Exclusive/Open} atas properti {jenis, legalitas, alamat, harga penawaran [nego/nett]}.
- **Pasal 2 Jenis Listing & Masa Kontrak:** {durasi; Open=tidak terbatas}; selama kontrak owner {tidak boleh / boleh} menunjuk agen lain.
- **Pasal 3 Fee:** {3%/5%/10%} dari harga deal; dibayar ≤3 hari setelah AJB; atau setelah DP ≥30% bila tunai bertahap.
- **Pasal 4 Jenis Pemasaran:** {Open/Exclusive}.
- **Pasal 5 Kewajiban Para Pihak.**
- **Pasal 6 Penyelesaian Sengketa** (musyawarah → jalur hukum).
- **Pasal 7 Lain-lain.**
- Tanda tangan: Owner (materai) & Ardy Salam (`gsd...Copy.png`).

---

## 13. ADMIN DASHBOARD — SUPER MODERN, INTERAKTIF, USER-FRIENDLY, KOMPLEKS

> **Standar desain:** Level SaaS modern kelas dunia (referensi: Linear, Vercel, Retool). Sidebar biru metalik pekat, area konten latar putih/abu sangat muda, glassmorphism halus pada kartu KPI, chart animasi masuk, dark-mode toggle, micro-interaction di setiap interaksi.

---

### 13.0 Kerangka Layout Global

```
┌───────────────────────────────────────────────────────────────┐
│  TOPBAR (sticky, h=56px, shadow bawah tipis)                  │
│  [≡ Logo SBP]  [Breadcrumb]  [🔍 Search]  [🔔]  [👤 Admin▼] │
├───────────┬───────────────────────────────────────────────────┤
│ SIDEBAR   │                                                   │
│ (dark,    │         AREA KONTEN (overflow-y: scroll)          │
│ w=240px   │                                                   │
│ collapsed │                                                   │
│ w=64px)   │                                                   │
└───────────┴───────────────────────────────────────────────────┘
```

**Sidebar:** background `--navy #0B2447` (light mode) / `#060F1F` (dark mode) — gunakan token resmi dari Bagian 2.1, JANGAN warna lepas. Menu items: ikon SVG + label. Hover = background highlight biru metalik. Aktif = background biru metalik solid + left-accent-bar biru muda. Badge notifikasi merah di ikon (mis. "3" pada Leads Baru). Tooltip label saat collapsed. Tombol collapse/expand di bagian bawah sidebar.

**Topbar:** putih, sticky. Kiri: hamburger + logo mini. Tengah: breadcrumb. Kanan: search global (shortcut `Ctrl+K` buka command palette), lonceng notifikasi (dropdown list 5 notif terbaru + "Lihat semua"), avatar profil admin + dropdown (Profil, Pengaturan, Logout).

**Sidebar Menu Items (urut atas→bawah):**
1. 📊 Overview
2. 🏠 Listing (badge: jumlah published)
3. 📥 Draft / Submission (badge: jumlah draft baru)
4. 🎯 Leads / CRM (badge: jumlah lead baru merah)
5. 📄 Kontrak & Perjanjian
6. 🌟 Properti Pilihan / Banner
7. 💬 Testimoni
8. 👤 Data Pemilik
9. 🖼️ Media Library
10. ✍️ Blog CMS
11. 🔍 SEO Manager
12. 📍 Data Lokasi
13. ⚙️ Pengaturan

---

### 13.1 Login Aman (Halaman Standalone)
Layout: latar gradient biru metalik halus, card login white center.
Card: logo SBP besar, "Selamat datang kembali." (h2), email input, password input (toggle show/hide), tombol "Masuk" (biru solid), link "Lupa password?".
Security: hash bcrypt, rate-limit 5x/menit, sesi JWT secure, opsi 2FA (TOTP). Tidak ada kredensial hardcoded produksi.
Error states: alert merah "Email atau password salah. ({X} percobaan tersisa)".

---

### 13.2 OVERVIEW / ANALYTICS HOME (Dashboard Utama)

**Greeting banner (atas):**
"Selamat pagi/siang/malam, {Nama Admin}! 👋 — {Hari, Tanggal}"

**Baris 1 — KPI Cards (6 kartu, animasi count-up saat mount):**
```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ 🏠 Total │ ✅ Aktif │ 📥 Draft │ 🔴 SOLD  │ 🎯 Leads │ 👁️ Views │
│ Listing  │Published │          │          │ (7 hari) │ (30 hari)│
│  [NUM]   │  [NUM]   │  [NUM]   │  [NUM]   │  [NUM]   │  [NUM]   │
│ ▲ +3 bln │ ▲ +5 bln │          │          │ ▲ +12%   │ ▲ +8%    │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```
Setiap kartu: background putih, border atas colored (biru/hijau/kuning/merah/ungu/teal), ikon besar, angka hitam bold besar, angka perbandingan bulan lalu (hijau = naik, merah = turun). Hover: lift + shadow.

**Baris 2 — Charts (2 kolom):**
- *Kiri (60%):* **Bar Chart "Listing Baru per Bulan"** (12 bulan terakhir). Hover bar: tooltip jumlah. Pilihan toggle: per bulan / per minggu. Animasi slide-up saat load.
- *Kanan (40%):* **Donut Chart "Distribusi Jenis Properti"** (Rumah, Kost, Hotel, Villa, dst dengan warna unik). Legend interaktif: klik toggle show/hide segmen. Angka di tengah: total listing.

**Baris 3 — Charts (2 kolom):**
- *Kiri (50%):* **Funnel Chart "Pipeline Lead"** — Baru → Dihubungi → Viewing → Nego → Closed. Angka + persentase konversi tiap tahap. Warna: gradasi biru ke hijau.
- *Kanan (50%):* **Horizontal Bar "Top 5 Listing Terbanyak Dilihat"** — judul listing + bar + angka views. Klik baris → buka detail listing.

**Baris 4 — Timeline Aktivitas Terbaru:**
Feed vertikal (maks 10 item): ikon kategori + deskripsi + waktu relatif ("2 jam lalu").
Contoh: 🏠 Listing baru `SBP-001` oleh owner Budi · 🎯 Lead baru: Andre dari Jakarta · ✅ Properti `SBP-003` tayang.

**Quick Action Bar (sticky di atas KPI atau di header):**
`[+ Tambah Listing]` `[Lihat Draft ({N})]` `[Lihat Lead Baru ({N})]`

---

### 13.3 MANAJEMEN LISTING

**Toolbar:**
- Search input (live, debounce 300ms): cari judul/kode/lokasi.
- Filter multi: Jenis | Tujuan | Status | Badge | Lokasi.
- Tombol `[+ Tambah Listing]` (biru, kanan).
- Toggle view: Tabel / Card Grid (sama seperti front-end).

**Tabel Data (per baris: ~70px tinggi):**
| Kolom | Detail |
|-------|--------|
| Foto | thumbnail 48×48px, rounded |
| Kode | monospace, copyable (klik copy icon) |
| Judul & Lokasi | 2 baris; judul bold, lokasi abu |
| Jenis | pill badge berwarna per jenis |
| Harga | Rp format, harga lama dicoret bila ada |
| Status | pill: Published (hijau) / Draft (abu) / SOLD (merah) |
| Badge | ikon ⭐P / 💎F / 🔥H / ✅V aktif di baris |
| Views | angka + mini sparkline 7 hari |
| Tanggal | tanggal publish + "X hari lalu" |
| Aksi | ikon ✏️ Edit · 👁️ Preview · ⋮ More (Duplicate/Hapus) |

**Quick Toggles (klik langsung dari baris, tanpa buka form):**
Toggle switch kecil inline: Premium · Featured · Hot · SOLD · Properti Pilihan · Verified.
Konfirmasi toast: "SOLD diaktifkan untuk SBP-001 ✓".

**Bulk Action (muncul saat ≥1 row dicentang):**
Bar muncul di atas tabel: "3 dipilih" + tombol [Publish] [Unpublish] [SOLD] [Set Badge] [Hapus] [Export CSV].

**Pagination:** numbered + "X–Y dari Z listing" + pilihan 20/50/100 per halaman.

---

### 13.4 FORM INPUT / EDIT PROPERTI

**Layout form:** card putih max-width 900px, dibagi seksi accordion (klik seksi expand, tidak harus scroll panjang). Progress bar horizontal di atas ("3 dari 5 seksi terisi").

**Seksi 1: Identitas & Status**
- Label badge (multi-checkbox dengan visual preview): ⭐ Premium · 💎 Featured · 🔥 Hot · ✅ Verified · 🏠 Properti Pilihan · 🔴 SOLD.
- Preview card real-time di sidebar kanan (update otomatis saat field diisi).

**Seksi 2: Harga**
- Tujuan toggle + Harga + OLD Price + Kondisi (Nego/Nett). Jika OLD Price diisi → preview badge HOT + harga coret muncul di preview card.

**Seksi 3: Lokasi**
- 4 dropdown cascading (Provinsi → Kab → Kec → Kel) + Alamat + Google Maps link + otomatis embed peta preview kecil.

**Seksi 4: Detail Properti**
- Jenis Properti dropdown → field kondisional muncul (dari Pustaka Bagian 5).
- Legalitas, Status, Lingkungan, Lebar Jalan.

**Seksi 5: Media & Konten**
- Dropzone foto (drag & drop, reorder drag, set cover klik bintang, delete per foto, progress bar upload).
- Deskripsi textarea + **Tombol "✨ Generate Deskripsi AI"** (loading spinner → mengisi textarea otomatis).
- Link YouTube, Info Tambahan, Alasan Dijual.

**Seksi 6: SEO (opsional override)**
- Meta title (counter karakter, warning >60) + Meta description (warning >155).

**Footer form:** `[Simpan Draft]` (outline) + `[Publish Sekarang]` (biru solid). Auto-save draft tiap 60 detik (toast "Tersimpan otomatis ✓").

---

### 13.5 DRAFT / SUBMISSION OWNER

**Tab:** `Semua` | `Baru` | `Opsi Dikonfigurasi` | `Menunggu TTD` | `Tayang`

**Per baris tabel:**
Foto pertama + Kode + Nama Owner + Jenis Properti + Lokasi + Tanggal Masuk + **Status badge** (berwarna) + Tombol Aksi.

**Panel Detail (klik baris → drawer dari kanan, lebar 480px):**
- Tab **"Data Diri"**: Nama, NIK (terenkripsi, ikon 👁️ reveal on click dengan log), Alamat KTP, No. WA (+ tombol 📱 buka WA langsung), dll.
- Tab **"Data Properti"**: semua field yang diisi owner, preview foto.
- Tab **"Konfigurasi Perjanjian"** (admin set di sini):
  - **Jenis Transaksi: TIDAK diinput admin — diturunkan otomatis dari `properties.tujuan`** (dijual → "Jual/Beli", disewa → "Sewa"). Ditampilkan sebagai label read-only.
  - **Jenis Listing: RADIO BUTTON (pilih SATU, saling-eksklusif):** `◯ Open Listing` `◯ Exclusive Listing`. Tidak boleh keduanya tercentang.
  - **Durasi (muncul HANYA bila Exclusive dipilih):** radio/pill `◯ 3 Bulan` `◯ 6 Bulan` `◯ 12 Bulan`. Open Listing → tidak ada durasi (tidak terikat).
  - **Input Fee: angka manual `___ %`** (mis. 2 / 2.5 / 3 / 5) — hasil negosiasi WA admin↔owner di luar sistem. **Fee TIDAK lagi terkunci per jenis listing** (revisi dari aturan lama 3%/5%/10%); fleksibel & negotiable. Nilai ini auto-sync mengisi Pasal 3 dokumen perjanjian (12.6).
  - Tombol **"✅ Konfirmasi Opsi & Generate Link TTD"** → generate link unik `/sign/{token}` + status berubah "Opsi Dikonfigurasi". Validasi: jenis listing wajib dipilih, fee wajib diisi (>0), durasi wajib bila Exclusive.

> **CATATAN REVISI (alur fee fleksibel):** Sebelum generate link, admin menegosiasikan persentase fee dengan owner via WhatsApp manual. Setelah owner setuju (mis. 3%), admin input angka tersebut di field Fee. Owner di halaman `/sign` HANYA membaca + menandatangani — owner TIDAK memilih opsi/fee (konsisten dengan direktif 12.0). Aturan lama 12.3 (fee tetap 3%/5%/10% per jenis) digantikan oleh input fee manual ini.
- Tab **"Kontrak"**: tombol "📋 Salin Link TTD" (copy ke clipboard) + "📱 Kirim via WA Owner" (buka WA langsung dengan pesan: "Halo {Nama}, berikut link perjanjian Anda: {link}") + status timeline.

**Status Timeline (bawah drawer):**
Vertical timeline: `📥 Draft diterima` → `⚙️ Opsi dikonfigurasi` → `📤 Link dikirim` → `✍️ Ditandatangani` → `🚀 Tayang`.

---

### 13.6 LEADS / CRM

**Layout utama: Kanban Board** (horizontal scroll jika kolom banyak).
**Kolom:** `Baru` (biru) | `Dihubungi` (kuning) | `Viewing` (ungu) | `Nego` (oranye) | `Closed ✓` (hijau) | `Lost ✗` (abu).

Tiap kolom: header + counter lead + bar warna + kartu-kartu lead.

**Kartu lead (dalam kolom):**
- Nama + tipe badge (Pembeli/Penjual/Broker).
- Properti terkait (thumbnail mini + judul).
- Budget + Rencana pembayaran.
- Waktu masuk (relatif).
- Tombol `📱 WA` (buka chat langsung).

**Drag & drop** kartu antar kolom (update status DB real-time).

**Klik kartu → Modal detail:**
- Semua data lead (nama, kontak, asal, budget, pesan, source page, waktu).
- **Catatan/notes** (textarea + add note + riwayat notes dengan timestamp).
- **Riwayat status** (timeline kapan pindah kolom + siapa admin).
- Tombol: `📱 Buka WA` · `✏️ Edit` · `🗑️ Hapus`.

**Tombol atas:** `[+ Tambah Lead Manual]` (untuk lead dari telepon/walk-in) + `[Export CSV]`.

**Analitik mini (baris di atas kanban):**
`Total Leads: X` · `Conversion Rate: X%` · `Avg. Time to Close: X hari` · `Top Source: {halaman listing terbanyak lead}`.

---

### 13.7 MANAJEMEN TESTIMONI

**Tabel + preview:**
Daftar testimoni: foto bulat + Nama + Lokasi + Rating ⭐ + Kutipan (truncated) + Status (Tampil/Sembunyikan toggle) + Urutan (drag handle) + Aksi (Edit/Hapus).

**Tombol "Lihat Preview Slider" → Modal fullscreen** menampilkan slider testimoni persis seperti di homepage.

**Form tambah/edit testimoni:**
- Upload foto klien (preview bulat).
- Nama Klien, Lokasi, Rating (klik bintang interaktif 1–5).
- Isi Testimoni (textarea, maks 300 karakter + counter).
- Jenis Transaksi (Pembeli/Penjual/Sewa).
- Properti Terkait (optional search+link).
- Toggle: Tampilkan di Homepage.
- Tombol Simpan.

---

### 13.8 PROPERTI PILIHAN / BANNER

**Dua kolom:**
- Kiri: semua listing published → tabel + tombol "Jadikan Properti Pilihan".
- Kanan: daftar urutan banner sekarang (drag untuk reorder) + tombol ✕ remove.

**Setting slider:** input "Interval auto-slide (detik): [5]" + preview mini animasi.

---

### 13.9 KONTRAK & PERJANJIAN

**Tabel:** Kode Listing | Nama Owner | Jenis (Jual/Sewa) | Listing (Open/Excl) | Status (Draft/Signed/Expired) | Tanggal TTD | Aksi.

**Status color:** Signed = hijau, Menunggu = kuning, Draft = abu, Expired = merah.

**Aksi per baris:** `📄 Lihat PDF` · `🔗 Kirim Ulang Link` · `🔍 Jejak Audit`.

**Modal Jejak Audit:**
```
📋 Dokumen Hash: abc123...
📍 IP Penandatangan: 114.xx.xx.xx
📱 Device: iPhone 14, Safari
⏰ Waktu TTD: 2024-08-05 14:32:07 WIB
✉️ Link dibuka: 3x
```

---

### 13.10 DATA PEMILIK (PRIVAT & AMAN)

**Tabel:** Foto (jika ada) | Nama | No. WA (masked: +62 8xx-xxxx-X789) | Properti | Tanggal.

**Akses NIK & Alamat KTP:** tombol `🔓 Lihat Data Privat` → konfirmasi password admin → data terenkripsi didekripsi & ditampilkan sementara 60 detik → log akses tersimpan otomatis.

**Tombol aksi:** `📱 WA Owner` (buka WA) · `🗺️ Buka Maps` · `🔒 Log Akses` (lihat riwayat siapa & kapan buka data).

---

### 13.11 MEDIA LIBRARY (R2)

Grid foto/dokumen: thumbnail + nama file + ukuran + tanggal + properti terkait. Filter: tipe (foto/PDF/kontrak). Search by nama/properti. Bulk delete. Drag-upload baru. Info kuota R2 (progress bar: XX MB dari Y GB).

---

### 13.12 BLOG CMS

**Daftar artikel:** judul + cover mini + status (Published/Draft/Dijadwalkan) + views + tanggal + aksi Edit/Delete.

**Editor artikel:**
- Input Judul (auto-generate slug di bawah, editable).
- Cover image upload + preview.
- Editor rich-text (WYSIWYG): bold, italic, heading, link, gambar inline, blockquote, list.
- Meta title (counter) + Meta description (counter) + tab SEO preview (tampilan di Google SERP).
- Jadwalkan publish (datetime picker) atau publish sekarang.

---

### 13.13 SEO MANAGER

**Tab 1: Meta Override** — tabel halaman + current meta + tombol edit (inline).
**Tab 2: Redirect** — tabel dari/ke + kode (301/302) + tambah redirect baru.
**Tab 3: Sitemap Status** — URL sitemap.xml, jumlah URL terindeks, terakhir di-generate, tombol "Regenerate Sekarang".
**Tab 4: Thin Content** — daftar halaman programmatic yang tertahan karena listing < 3. Tampilkan jumlah listing tersedia + kapan bisa aktif.

---

### 13.14 DATA LOKASI

Tabel provinsi → kab → kec → kel (tree view dapat di-expand). Tombol Tambah per level. Edit/hapus per baris. Tombol "Import CSV" untuk bulk. Pre-seed DIY sudah lengkap.

---

### 13.15 PENGATURAN

**Dibagi tab:**
- **Profil & Keamanan:** ganti nama, email, password, enable 2FA (QR code TOTP + backup codes).
- **Kontak & Bisnis:** nomor WA tujuan, fee default (%), nama website, email CS, alamat.
- **Integrasi:** GA4 Measurement ID, Google Maps API key, Workers AI toggle on/off.
- **Fitur:** toggle on/off fitur: Investment Intelligence · Proximity Engine · AI Auto-content · Map Search.
- **Backup:** download backup DB (JSON) + jadwal backup otomatis.

---

## 14. SISTEM KEPERCAYAAN & VERIFIKASI

- **Badge "Terverifikasi SBP"** pada listing tercek (field `verified`), tampil di card & detail.
- **Alur verifikasi (admin):** sebelum mengaktifkan badge Verified, admin menyelesaikan checklist di form listing — (1) legalitas dicek (sertifikat dilihat), (2) lokasi dikonfirmasi, (3) foto asli (bukan stok), (4) harga wajar, (5) kontak owner terverifikasi. Badge `verified=true` hanya bisa diaktifkan bila checklist lengkap.
- **Trust Strip** homepage (6.9) + halaman About (legitimasi CV).
- **Testimoni** (6.8) + **Portofolio transaksi** (10.3).
- **Transparansi:** "tanpa biaya tersembunyi bagi pembeli", legalitas tiap listing jelas.
- **Edukasi anti-penipuan** (blog/FAQ): cara aman transaksi properti, jangan transfer sebelum cek legalitas.
- **Sinyal kesegaran:** "Terakhir diperbarui" + jumlah views di detail (8.1) memperkuat kepercayaan listing aktif.

---

## 15. KEAMANAN & KEPATUHAN UU PDP

- Data sensitif (NIK, KTP, tanda tangan) **terenkripsi at-rest** (AES); akses terbatas & ter-audit (log siapa membuka, kapan — lihat 13.10).
- **Consent eksplisit** saat owner submit (checkbox 12.1); **Privacy Policy** (10.7) & kebijakan retensi.
- **Retensi data:** lead 24 bulan lalu anonimkan/hapus; data kontrak & KTP disimpan selama kewajiban hukum berlaku lalu dihapus; owner dapat minta penghapusan (right to erasure) via kontak Data Protection.
- **Cookie Consent Banner (WAJIB):** banner muncul di kunjungan pertama ("Situs ini menggunakan cookie untuk analitik & pengalaman terbaik") + tombol "Setuju" / "Pengaturan". GA4 hanya aktif setelah consent. Simpan preferensi cookie.
- Auth admin kuat: bcrypt, rate-limit (5x/menit), sesi JWT secure (httpOnly cookie), 2FA opsional; **tidak ada kredensial hardcoded produksi**.
- **Proteksi web:** CSRF token pada semua form mutasi; sanitasi & escape semua input (anti-XSS); parameterized query (anti SQL-injection); rate-limit form publik (anti-spam) + honeypot/captcha ringan.
- **Keamanan upload:** validasi tipe & ukuran file (maks 8MB/foto), strip metadata EXIF, simpan di R2 dengan nama acak (bukan nama asli).
- Tanda tangan elektronik: jejak audit (UU ITE) → arsip PDF (12.4); pertimbangkan e-Meterai/e-sign tersertifikasi untuk fase legal lanjut.
- Backup database & media terjadwal + uji restore berkala.
- HTTPS-only (HSTS), security headers (CSP, X-Frame-Options, X-Content-Type-Options).

---

## 16. ERROR STATES, LOADING & EDGE CASES

> ⚠️ **DIREKTIF BUILDER:** Path "tidak bahagia" ini WAJIB ditangani konsisten — bukan dibiarkan blank/crash.

### 16.1 Loading States
- **Skeleton** (bukan spinner kosong) untuk: grid listing, detail page, kanban, tabel admin. Gradient sweep (2.6).
- Tombol saat proses (submit/save): spinner inline + teks "Memproses…" + disabled.
- Progressive: tampilkan data yang sudah ada sambil sisanya dimuat (jangan blok seluruh halaman).

### 16.2 Empty States
- Listing/pencarian 0 hasil → ilustrasi + "Belum ada properti yang cocok" + "Reset Filter".
- Belum ada lead/testimoni/blog di admin → ilustrasi + tombol "Tambah pertama".
- Smart Suggestion tanpa kandidat → sembunyikan seksi (8.6).

### 16.3 Error States
- **Gagal fetch data (API/DB)** → kartu error ramah + tombol "Coba Lagi" (retry). Jangan layar putih.
- **Gagal submit form / lead** → toast merah "Gagal mengirim, coba lagi" + data form TIDAK hilang (preserve input).
- **Gagal upload foto** → tandai foto yang gagal (merah) + opsi retry per foto; foto lain tetap tersimpan.
- **Peta Leaflet gagal load** → fallback tampilkan alamat teks + link Google Maps.
- **Gambar gagal load** → placeholder blur + ikon, jangan broken-image icon.
- **404** → halaman branded: ilustrasi, "Halaman tidak ditemukan", tombol "Ke Beranda" + "Lihat Properti" + search.
- **500 / error tak terduga** → halaman branded sopan + tombol beranda + kontak WA.
- **Token TTD invalid/expired/used** → lihat 12.4 (halaman khusus per kondisi).

### 16.4 Edge Cases Data
- Harga 0 / kosong → tampilkan "Hubungi untuk harga".
- Foto kosong → cover placeholder default berlogo SBP.
- Luas tanah 0 (mis. apartemen) → sembunyikan field LT, jangan tampilkan "0 m²".
- Properti SOLD → tetap dapat dibuka (untuk SEO/histori) tapi CTA jadi "Sudah Terjual" + sarankan properti serupa.
- Lokasi tanpa lat/long → sembunyikan peta & proximity, bukan peta kosong.

### 16.5 State Management Alur Submission (Steps 1–2)
- Data Step 1 & 2 disimpan sementara (session/server draft) sehingga **refresh atau "Kembali" tidak menghilangkan isian**.
- Jika owner menutup tab di tengah jalan lalu kembali → tawarkan lanjutkan draft (opsional) atau mulai ulang.
- Kode Listing di-generate sekali di awal Step 2 dan konsisten sampai submit.

---

## 17. ANALYTICS & TRACKING

- GA4 / Cloudflare Web Analytics + Google Search Console (sejak hari pertama). **GA4 hanya aktif setelah cookie consent (15).**
- **Event schema custom (GA4) — WAJIB konsisten:**
  | Event | Parameter | Dipicu saat |
  |-------|-----------|-------------|
  | `wa_click` | property_id, source_page, sender_type | tombol WhatsApp diklik (goal utama) |
  | `lead_submit` | property_id, sender_type | lead tersimpan ke DB |
  | `kpr_used` | property_id | kalkulator KPR diubah |
  | `investment_view` | property_id | panel Investment dilihat |
  | `filter_apply` | filters_json | filter diterapkan |
  | `share_click` | property_id, channel | share diklik |
  | `favorite_add` | property_id | favorit ditambah |
  | `titip_jual_submit` | jenis_properti | owner "Kirim Properti" |
- Conversion utama: `wa_click` & `lead_submit`. Set sebagai GA4 conversion.
- Dashboard admin (13.2) menarik metrik views & inquiry per listing dari `properties.views_count` + `leads`.
- UTM tracking pada link kampanye; Search Console dihubungkan untuk monitoring keyword.

---

## 18. ACCEPTANCE CRITERIA & ROADMAP PEMBANGUNAN

### 18.1 Acceptance Criteria (per modul)
- SSR aktif: view-source halaman listing/detail/kategori menampilkan konten + meta + JSON-LD **tanpa eksekusi JS**.
- Tidak ada konten duplikat: filter query `noindex` + canonical benar.
- Slug mengikuti aturan 3.2 (jogja dipertahankan, ≤60 char, tidak diakhiri `-`, stabil).
- Sitemap index dapat diakses di `/sitemap.xml`, auto-update, halaman thin-content tidak masuk.
- Schema valid (Rich Results Test): RealEstateListing, BreadcrumbList, FAQPage, Organization.
- Semua form menyimpan lead ke DB sebelum membuka WA.
- **Filter homepage memiliki 4 dropdown lokasi terpisah & searchable (Provinsi→Kab/Kota→Kecamatan→Kel/Desa), bukan satu kolom "Wilayah".**
- **Banner "Properti Pilihan" tampil sebagai auto-slider sinematik full-width sesuai 6.5.**
- **Homepage memuat section "Artikel Terbaru" (spill blog) berisi 3 artikel.**
- **Halaman detail hanya punya SATU tombol WhatsApp di bawah form, disabled hingga field wajib terisi, lalu aktif; tidak ada tombol WA di kotak harga.**
- **Alur owner = 3 langkah (Data Diri → Info Properti → Tanda Tangan); TIDAK ada halaman "Opsi Perjanjian" di publik; opsi perjanjian dikonfigurasi admin di dashboard.**
- KPR & Investment Intelligence real-time & akurat sesuai rumus.
- Alur owner: Draft tersimpan saat "Kirim Properti"; properti tayang hanya setelah "Kirim Perjanjian"; arsip PDF + audit tersimpan.
- Admin: login aman, semua modul (13.2–13.15) berfungsi, responsive.
- Testimoni slider tampil di homepage & dikelola dari admin.
- Mobile-first lulus Core Web Vitals (LCP/CLS/INP target).
- Tidak ada kredensial hardcoded; data sensitif terenkripsi; Privacy Policy ada.
- **Halaman detail mengikuti layout 2-kolom 8.0; mobile punya sticky bottom bar (8.9).**
- **Halaman `/sign/{token}` memvalidasi token (expired/used) & menampilkan dokumen read-only sesuai 12.4.**
- **Schema DB punya field token di `agreements`, `locations` hierarkis (parent_id), `details` JSON di properties.**
- **Halaman programmatic SEO punya H1 + paragraf intro + blok konten + FAQ (9.0), bukan grid kosong.**
- **7 halaman statis (10.x) terisi konten nyata, bukan placeholder.**
- **Semua error/empty/loading state (16) tertangani; ada halaman 404 & 500 branded.**
- **Cookie consent banner aktif; GA4 event schema (17) terpasang.**
- **State Step 1–2 submission tidak hilang saat refresh/kembali (16.5).**

### 18.2 Roadmap (urutan eksekusi)
**Fase 0 — Fondasi:** Tech stack + SSR/edge rendering, Design System, Data Model D1, seed data lokasi, auth admin aman.
**Fase 1 — Inti Publik:** Homepage (hero, filter, card, banner, footer SEO), Properties (filter+sort), Detail (galeri, breadcrumb, KPR, smart suggestion, form WA + lead capture).
**Fase 2 — SEO Engine:** slug/meta/OG/schema, sitemap index, halaman programmatic lokasi & fitur, internal linking, anti thin-content.
**Fase 3 — Owner & Legal:** alur Titip Jual **3 langkah** (Data Diri → Info Properti → Tanda Tangan), opsi perjanjian dikonfigurasi admin (bukan publik), tanda tangan digital, perjanjian dinamis read-only, arsip PDF + audit, consent PDP.
**Fase 4 — Admin Dashboard:** overview/analytics, manajemen listing, draft, **CRM lead (kanban)**, **testimoni**, banner, kontrak, data pemilik, media, blog CMS, SEO, lokasi, settings.
**Fase 5 — Diferensiasi:** Investment Intelligence, Proximity Engine, AI auto-content (deskripsi/meta/alt), OG image dinamis, Map Search, Bandingkan, Favorit, brosur PDF, Trust Strip & verifikasi.
**Fase 6 — Konten & Growth:** Blog (E-E-A-T), area guides, FAQ schema, analytics & Search Console, optimasi Core Web Vitals.

---

*Akhir Spesifikasi. Dokumen ini menggabungkan konsep asli SBP dengan seluruh penajaman strategis: SEO teknis benar (SSR, kanonik, dijual+disewa), pilar kepercayaan pengganti agen, CRM lead, Investment Intelligence, Proximity Engine, AI auto-content, testimoni auto-slider, dan Admin Dashboard kompleks — siap dijadikan input AI Web Builder.*
