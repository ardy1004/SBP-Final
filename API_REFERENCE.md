# SBP API Reference — Cloudflare Pages Functions

> Base URL (local dev): `http://localhost:8787`  
> Base URL (production): `https://salambumi.xyz`  
> Semua response: `{ success: boolean, data?: any, error?: string, details?: object }`

---

## GET /api/health

Verifikasi koneksi D1 database. Tidak butuh auth.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "db": "connected",
    "locations_count": 196,
    "timestamp": "2026-06-01T00:00:00.000Z",
    "environment": "development"
  }
}
```

---

## GET /api/locations

Cascading dropdown lokasi 4 level: provinsi → kabupaten → kecamatan → kelurahan.

**Query params:**

| Param | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `parent_id` | integer | Tidak | Kosong = provinsi; diisi = children dari parent |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      { "id": 1, "nama": "DI Yogyakarta", "tipe": "provinsi", "slug": "di-yogyakarta", "parent_id": null, "latitude": null, "longitude": null }
    ],
    "total": 1
  }
}
```

**Error:**
- `400` — `parent_id` bukan integer positif
- `404` — `parent_id` tidak ditemukan

---

## GET /api/properties

List properti published dengan filter & pagination.

**Query params:**

| Param | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| `tujuan` | `dijual\|disewa\|dijual_disewa` | semua | `dijual` mencakup `dijual_disewa` |
| `jenis` | string (comma-separated) | semua | `rumah,kost,villa` dll |
| `provinsi` | string | — | case-insensitive |
| `kabupaten` | string | — | case-insensitive |
| `kecamatan` | string | — | case-insensitive |
| `kelurahan` | string | — | case-insensitive |
| `harga_min` | integer | — | dalam Rupiah; untuk `disewa` → berlaku ke `harga_sewa_tahun` |
| `harga_max` | integer | — | idem |
| `kt` | integer | — | minimum kamar tidur |
| `km` | integer | — | minimum kamar mandi |
| `sort` | `terbaru\|termurah\|termahal\|luas\|yield` | `terbaru` | default: badge-priority + published_at |
| `page` | integer | `1` | |
| `limit` | integer | `20` | max 50 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1, "kode_listing": "SBP-20240601-0001",
        "title": "Kost 20 Kamar Dekat UGM",
        "slug": "kost-20-kamar-dekat-ugm",
        "jenis_properti": "kost", "tujuan": "dijual",
        "harga": 2500000000, "harga_lama": null, "harga_sewa_tahun": null,
        "nego": 1, "nett": 0, "harga_per_m2": 1250000,
        "jumlah_kamar_tidur": 20, "jumlah_kamar_mandi": 20,
        "luas_tanah": 2000, "luas_bangunan": 1800,
        "lebar_depan": 15.0, "lantai": 3,
        "legalitas": "SHM & IMB/PBG Lengkap", "furnished": "fully",
        "kecamatan": "Depok", "kabupaten": "Sleman", "provinsi": "DI Yogyakarta",
        "badge_premium": 1, "badge_featured": 0, "badge_hot": 0,
        "status_sold": 0, "properti_pilihan": 1, "verified": 1,
        "income_per_bulan": 30000000, "pengeluaran_per_bulan": 5000000,
        "views_count": 42, "published_at": "2024-01-15T00:00:00.000Z",
        "cover_url": "https://pub-xxx.r2.dev/foto.webp",
        "cover_alt": "Kost 20 Kamar Depok Sleman"
      }
    ],
    "pagination": {
      "total": 3, "page": 1, "limit": 20,
      "total_pages": 1, "has_next": false, "has_prev": false
    }
  }
}
```

> **Privasi:** `alamat` dan `latitude/longitude` tidak disertakan di response list.

---

## GET /api/properties/:slug

Detail lengkap 1 properti. Increment `views_count` secara non-blocking.

**Path param:** `slug` — slug URL properti (contoh: `kost-20-kamar-dekat-ugm`)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "...semua field properties...",
    "latitude": -7.773, "longitude": 110.389, "gmaps_link": "https://...",
    "details": { "jenis_kost": "campur", "ruang_penjaga": true },
    "images": [
      { "id": 1, "url_webp": "https://...", "alt_text": "...", "urutan": 0, "is_cover": 1 }
    ],
    "investment_intelligence": {
      "yield_persen": 12.0,
      "payback_tahun": 8.33,
      "cap_rate_persen": 14.4,
      "income_bersih_per_bulan": 25000000,
      "income_bersih_per_tahun": 300000000,
      "skor_investasi": 5
    }
  }
}
```

> `investment_intelligence` hanya ada bila `income_per_bulan` terisi.  
> `alamat` tetap **tidak** disertakan (privat).  
> `latitude/longitude` disertakan untuk peta Leaflet & Proximity Engine.

**Error:** `404` bila slug tidak ditemukan.

---

## POST /api/leads ⚠️ K6

**Kritis:** Lead WAJIB tersimpan ke DB sebelum response dikembalikan. Frontend buka `wa_url` SETELAH dapat response `success: true`.

**Content-Type:** `application/json`

**Request body:**

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `nama` | string | ✅ | max 100 char |
| `no_wa` | string | ✅ | Format: `08xx`, `628xx`, `+628xx` — dinormalisasi ke `628xxx` |
| `tipe_pengirim` | `pembeli\|penjual\|broker` | ✅ | |
| `source_page` | string | ✅ | URL halaman asal, untuk analytics |
| `property_id` | integer | — | ID properti terkait |
| `asal_daerah` | string | — | max 100 char |
| `budget` | string | — | mis. `"1M-2M"` |
| `rencana_pembayaran` | `hard_cash\|soft_cash\|kpr` | — | |
| `pesan` | string | — | max 1000 char |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "lead_id": 1,
    "wa_url": "https://wa.me/6281391278889?text=Halo%20Admin...",
    "wa_pesan": "Halo Admin Salam Bumi Property!\n\nSaya tertarik dengan properti: ..."
  }
}
```

**Error:**
- `400` — `property_id` bukan integer positif
- `415` — Content-Type bukan `application/json`
- `422` — Validasi gagal, `details` berisi map field → pesan error
- `500` — Gagal INSERT ke DB

---

## POST /api/admin/login

Verifikasi kredensial admin, terbitkan sesi JWT di httpOnly cookie.

**Rate limit:** 5 percobaan gagal per 15 menit per email → `429`.

**Content-Type:** `application/json`

**Request body:**

| Field | Tipe | Wajib |
|-------|------|-------|
| `email` | string | ✅ |
| `password` | string | ✅ |

**Response 200** (+ `Set-Cookie: sbp_session=<jwt>; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`):
```json
{ "success": true, "data": { "nama": "Monica Vera S", "role": "admin" } }
```

**Error:**
- `400` — Email/password kosong
- `401` — Kredensial salah (`N percobaan tersisa`)
- `429` — Rate limit tercapai
- `503` — `JWT_SECRET` belum dikonfigurasi

---

## POST /api/admin/logout

Hapus cookie sesi. Tidak butuh body.

**Response 200:**
```json
{ "success": true, "data": { "message": "Logout berhasil" } }
```

---

## GET /api/admin/me 🔒

Kembalikan data admin yang sedang login. Membutuhkan sesi valid.

**Auth:** Cookie `sbp_session` (httpOnly) ATAU `Authorization: Bearer <token>`

**Response 200:**
```json
{ "success": true, "data": { "sub": 1, "email": "admin@salambumi.id", "nama": "Monica Vera S", "role": "admin" } }
```

**Error:** `401` — Tidak ada sesi / sesi kedaluwarsa.

---

## Catatan Umum

### Autentikasi Admin
Semua route di `/api/admin/*` **kecuali** `/login` dan `/logout` membutuhkan autentikasi.  
Kirim cookie `sbp_session` (otomatis oleh browser) atau header `Authorization: Bearer <token>`.

### Format Error
```json
{ "success": false, "error": "Pesan error", "details": { "field": "pesan per field" } }
```

### Privasi Data
- `alamat` (jalan/nomor) tidak pernah dikembalikan di endpoint publik
- `latitude/longitude` hanya ada di endpoint detail (dibutuhkan peta & proximity)
- Data sensitif owner (NIK, alamat KTP) hanya di endpoint admin terproteksi

### Environment Variables (wrangler secret)
| Variable | Keterangan |
|----------|------------|
| `JWT_SECRET` | Secret untuk signing JWT — **wajib** sebelum endpoint admin bisa dipakai |

Local dev: buat file `.dev.vars` (tidak di-commit):
```
JWT_SECRET=ganti_dengan_string_acak_minimal_32_karakter
```
