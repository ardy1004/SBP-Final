# PLAN — Titip Jual: Properti Dulu, Data Diri Belakangan

Status: **DRAFT RENCANA — belum ada kode yang diubah.** Ditulis untuk dieksekusi di sesi Claude Code terpisah.
Dibuat: 2026-09-19. Riset dasar ada di memori proyek `project_titipjual_reorder_draft.md` (diskusi 2026-07-25, ditunda) dan `project_titipjual_regresi_dan_paritas.md`.

## 0. Tujuan (dari brief user)

1. Titip Jual Tahap 1 = **form upload properti**, field-nya sama persis dengan form admin manual (`/admin/listing/new`), termasuk nomor HP/WA pemilik.
2. Titip Jual Tahap 2 = **data diri pemilik** (KYC: nama KTP, NIK, alamat KTP, bertindak sebagai, ahli waris) — **nomor HP/WA DIHAPUS dari sini**, karena sudah diisi di Tahap 1.
3. Kalau user berhenti setelah Tahap 1 (tidak lanjut ke Tahap 2), **properti tetap harus tercatat sebagai baris nyata di Manajemen Properti admin**, lengkap dengan nomor WA, supaya admin bisa follow-up manual.

## 1. Ringkasan kondisi sekarang (hasil riset, jangan diulang)

- `src/app/components/TitipJualPage.tsx`: Step 1 = Data Diri (termasuk No. WA 1 & 2) → `POST /api/titip-jual-prospek` (cuma bikin baris `leads`, BUKAN `properties`). Step 2 = Info Properti + foto + consent + Turnstile → `POST /api/titip-jual` sekali jalan, INSERT atomik `properties` + `owners` (lengkap NIK) + `agreements`.
- Form admin (`AdminPropertyDetailPage.tsx` + `functions/api/admin/properties/index.js` + `[id]/index.js`): pola POST minimal → PATCH lengkap. Field sudah satu sumber dengan Titip Jual lewat `src/lib/propertyFields.ts`.
- **Temuan kunci yang membuat rencana ini murah dieksekusi**: kolom `properties.owner_phone` SUDAH TIDAK DIPAKAI. Kontak owner sekarang baca/tulis ke `owners.no_wa_1`/`no_wa_2` (lihat `functions/api/admin/properties/[id]/index.js` baris ±204-227, ±324-338). Kalau baris `owners` belum ada, PATCH admin **membuat baris owners RINGAN** — cuma `no_wa_1`, `no_wa_2`, `property_id`, tanpa NIK/nama:
  ```js
  await env.DB.prepare(`INSERT INTO owners (no_wa_1, no_wa_2, property_id) VALUES (?, ?, ?)`)
  ```
  Pola inilah yang akan dipakai ulang untuk Tahap 1 baru — bukan hal baru, sudah terbukti jalan di produksi.
- Skema `owners`: hanya `no_wa_1` NOT NULL, semua kolom KYC nullable (migrasi `0011_update_owners_constraints.sql`). `agreements.owner_id` NOT NULL — agreement baru bisa dibuat setelah ada baris `owners` (boleh yang ringan).
- Pola "tiket" JWT scope sudah ada dan terbukti: `functions/api/titip-jual-prospek.js` menerbitkan `tiketFoto` (scope `titipjual-foto`) yang diverifikasi `functions/api/titip-jual-foto.js` lewat `verifyJWT` dari `functions/api/_shared/jwt.js` — **sengaja lepas dari Turnstile** karena token Turnstile sekali pakai. Pola yang sama akan dipakai untuk menghubungkan Tahap 1 → Tahap 2 (lihat §3.3).
- `properties.submit_id` UNIQUE sudah ada untuk idempotensi submit (migrasi `0042_titipjual_submit_id.sql`).

## 2. Keputusan desain

### 2.1 Dua submit terpisah, bukan satu submit atomik
- **Endpoint baru `functions/api/titip-jual-mulai.js`** (Tahap 1): terima seluruh field properti (sama seperti payload Step 2 lama) + `no_wa`/`no_wa_2` + foto (`photo_keys`) + `cf_turnstile_token`. Membuat:
  - `properties` (status `draft`, sama seperti sekarang)
  - `owners` RINGAN: `no_wa_1`, `no_wa_2`, `property_id` — TANPA NIK/nama/alamat KTP.
  - Upload foto ke R2 + `property_images` (logika disalin dari `titip-jual.js` baris ±614-682, tidak perlu ditulis ulang dari nol).
  - Balikan: `{ kode_listing, property_id, owner_id, tiket_lanjut }`.
- **Endpoint baru `functions/api/titip-jual-lengkapi.js`** (Tahap 2, opsional): terima `nama_ktp`, `nik`, `alamat_ktp` terstruktur, `rt_rw`, `bertindak_sebagai`, `data_ahli_waris`, dan **`tiket_lanjut`** (BUKAN `property_id` mentah dari client — lihat §3.3 soal keamanan). Melakukan:
  - Verifikasi `tiket_lanjut` → dapat `property_id`/`owner_id` tepercaya dari isi token, bukan dari body.
  - Cek baris `owners` itu belum pernah dilengkapi (`nik_encrypted IS NULL`) — kalau sudah, balas idempoten (lihat §3.4), jangan menimpa/duplikat.
  - Enkripsi NIK (`encryptNIK`, sama seperti sekarang), `UPDATE owners SET nama_pemilik=?, nik_encrypted=?, nama_ktp=?, alamat_ktp=?, rt_rw=?, kelurahan=?, kecamatan=?, bertindak_sebagai=?, data_ahli_waris=? WHERE id=?`.
  - Buat baris `agreements` (logika disalin dari `titip-jual.js` baris ±553-571).
  - Tembak CAPI `CompleteRegistration` (logika disalin dari `titip-jual.js` baris ±704-731).
- **`functions/api/titip-jual.js` (lama) TIDAK DIHAPUS/DIUBAH.** Ini jaring pengaman untuk tab/bundle lama yang masih ter-cache dan akan tetap memanggil endpoint lama dengan bentuk lama sampai user itu reload. Konsisten dengan pola yang sudah ada di project ini (`photo_keys` vs `photos` dual-path di file yang sama — lihat komentar di `titip-jual.js` baris ±276-283).

**Kenapa bukan satu endpoint dengan parameter mode**: dua file terpisah lebih gampang diuji sendiri-sendiri, dan validasi Tahap 1 (field properti) vs Tahap 2 (field KYC) sudah sangat berbeda bentuknya — pola yang sama dipakai project ini untuk endpoint admin (`index.js` POST vs `[id]/index.js` PATCH, dua file berbeda untuk dua langkah).

### 2.2 Tiket foto diterbitkan lebih awal, lepas dari prospek/Turnstile
Foto di Tahap 1 baru harus bisa diunggah progresif SAAT user memilih file — sebelum dia klik submit akhir Tahap 1 (sama seperti pengalaman upload foto hari ini, cuma sekarang terjadi di step pertama, bukan kedua). Tiket foto tidak boleh menunggu Turnstile (token sekali pakai) atau menunggu submit akhir.

- **Endpoint baru kecil `functions/api/titip-jual-tiket-foto.js`**: dipanggil begitu komponen form properti (Tahap 1 baru) mount. Tanpa Turnstile (mengikuti alasan yang sudah didokumentasikan di `titip-jual-foto.js` baris ±42-52), rem anti-flood sederhana (hitung request semenit terakhir per pola `prospekTerakhirSemenit` di `titip-jual-prospek.js` — reuse pola yang sama, jangan tulis ulang). Balikan: `{ tiket_foto }` (JWT scope `titipjual-foto`, sama persis dengan yang dipakai `titip-jual-foto.js` sekarang — **tidak perlu ubah** `titip-jual-foto.js` sama sekali).
- `functions/api/titip-jual-prospek.js` **TIDAK dihapus** (bundle lama masih memanggilnya), tapi frontend BARU tidak lagi memanggilnya — perannya (jaring pengaman via baris `leads`) digantikan sepenuhnya oleh baris `properties` nyata yang lahir di akhir Tahap 1 baru (jauh lebih kaya informasi daripada baris `leads`).

### 2.3 Keamanan sambungan Tahap 1 → Tahap 2: tiket JWT, bukan `property_id` mentah
Ini closing item dari risiko IDOR yang sudah diflag di diskusi 2026-07-25 dan belum pernah diselesaikan. Solusinya: **jangan pernah percaya `property_id`/`owner_id` yang dikirim client di body Tahap 2.** Sebagai gantinya:

- Respons Tahap 1 (`titip-jual-mulai.js`) menyertakan `tiket_lanjut`: JWT `{ scope: 'titipjual-lanjut', property_id, owner_id, exp }`, ditandatangani `signJWT` (`functions/api/_shared/jwt.js`, pola sama dengan `tiketFoto`).
- Klien menyimpan `tiket_lanjut` di `titipJualDraft.ts` (field baru, sejajar dengan `tiketFoto`).
- `titip-jual-lengkapi.js` memverifikasi `tiket_lanjut` dengan `verifyJWT`, ambil `property_id`/`owner_id` dari ISI TOKEN (bukan dari field lain di body walau client mengirimkannya) — token yang valid secara kriptografis dari server kita sendiri adalah satu-satunya sumber ID yang dipercaya.
- **Masa berlaku**: 7 hari (bukan 1 jam seperti `tiketFoto`) — karena tujuannya justru mengizinkan user kembali besok/lusa untuk melengkapi data diri, bukan hanya dalam satu sesi. Kalau kedaluwarsa saat user kembali, tampilkan pesan: "Sesi kedaluwarsa — admin kami akan menghubungi Anda via WhatsApp untuk melanjutkan proses" (properti + WA sudah aman di admin, jadi ini bukan jalan buntu).
- Defense-in-depth tambahan: `titip-jual-lengkapi.js` tetap cek `owners.nik_encrypted IS NULL` sebelum menulis — kalau tiket valid tapi baris sudah dilengkapi sebelumnya (replay/klik ganda), balas idempoten (§3.4), jangan bikin `agreements` kedua.
- **Tahap 2 TIDAK perlu widget Turnstile baru** — tiket yang sudah lolos verifikasi kriptografis dari Tahap 1 (yang sudah lolos Turnstile) sudah cukup, sama seperti `titip-jual-foto.js` sengaja tidak minta Turnstile lagi.

### 2.4 Idempotensi
- Tahap 1: reuse persis mekanisme `submit_id` UNIQUE yang sudah ada di `properties` (logika `cariSubmitLama()` di `titip-jual.js` dipindah/disalin ke `titip-jual-mulai.js`, disesuaikan agar tidak menyertakan info `agreements`/`kode_perjanjian` karena belum tentu ada).
- Tahap 2: idempotensi natural via cek `owners.nik_encrypted IS NULL` — kalau sudah terisi dan `tiket_lanjut` dipakai ulang (mis. double-click, atau user buka draft lama), balas 200 dengan data yang sudah ada (`kode_perjanjian` existing), JANGAN insert `agreements` kedua.

### 2.5 Event Meta CAPI/Pixel (⚠️ WAJIB load skill `meta-ads-tracking` sebelum mengubah bagian ini)
Default rekomendasi (butuh verifikasi ulang saat eksekusi, jangan asumsi buta):
- Akhir Tahap 1 (properti tercatat, masih prospek) → tembak `Lead` (bukan `CompleteRegistration`) — konsisten dengan semantik yang sudah ada di `titip-jual-prospek.js` hari ini (`Lead` = kontak sudah diserahkan, belum tuntas).
- Akhir Tahap 2 (KYC + agreement selesai) → tetap `CompleteRegistration`, persis seperti sekarang.
- Ini menjaga kalibrasi ROAS yang sudah ada (jangan sampai `CompleteRegistration` menjadi lebih "murah" untuk didapat karena sekarang dipicu tanpa NIK).

## 3. Perubahan Frontend — `src/app/components/TitipJualPage.tsx`

Ini refactor besar pada satu file SSR-bundled (ikut `BUDGET_FUNCTIONS_RAW`) — clean build wajib setelahnya.

1. **Ganti nama komponen supaya tidak membingungkan** (jangan cuma tukar isi `Step1`/`Step2` — riskan salah tempel logika):
   - Komponen properti (isi saat ini ada di `Step2`, baris ±557-1545) → jadi komponen PERTAMA yang dirender, misal nama baru `StepProperti`.
   - Komponen data diri (isi saat ini ada di `Step1`, baris ±308-523) → jadi komponen KEDUA, misal nama baru `StepDataDiri`.
2. **`Stepper`** (baris ±225-247): tukar urutan label jadi `['Info Properti', 'Data Diri']`.
3. **Pindahkan field WA** dari `StepDataDiri` (dulu `Step1`) ke `StepProperti` (dulu `Step2`):
   - Blok input "No. WA Aktif 1 *" dan "No. WA Aktif 2" (baris ±494-513) pindah ke form properti.
   - Validasi `no_wa`/`no_wa_2` di `validate()` (baris ±353-354) pindah mengikuti.
   - `Step1State` interface (baris ±35-50): hapus `no_wa`/`no_wa_2`, field-field KYC saja yang tersisa.
4. **Pindahkan Turnstile + consent checkbox** (baris ±1462-1506) ke `StepProperti` — jadi syarat submit Tahap 1, bukan Tahap 2.
5. **`StepProperti` (submit function, dulu `handleSubmit` di `Step2`)**:
   - Panggil `titip-jual-tiket-foto` saat mount (ganti sumber `tiketFoto` yang sebelumnya dari `kirimProspek()`).
   - Submit akhir memanggil `POST /api/titip-jual-mulai` (bukan `/api/titip-jual`), payload = semua field properti (SAMA seperti sekarang) + `no_wa`/`no_wa_2` + `cf_turnstile_token`. HAPUS field-field owner (`nama_ktp`, `nik`, `alamat_ktp`, dst) dari payload ini — itu tugas Tahap 2.
   - Sukses → simpan `tiket_lanjut` + `property_id`(hanya utk tampilan, tidak dikirim balik) ke draft, panggil `onNext` yang sekarang PALING TIDAK menampilkan pilihan: **lanjut ke Data Diri** atau **selesai dulu** (lihat poin 7).
6. **`StepDataDiri` (submit function, dulu `handleNext` di `Step1`)**:
   - Hapus validasi `no_wa` (baris ±353-354).
   - Hapus pemanggilan `kirimProspek()` (baris ±362) — tidak relevan lagi, diganti alur Tahap 1 baru.
   - Ganti target submit dari sekadar `onNext(form)` jadi POST sungguhan ke `POST /api/titip-jual-lengkapi` dengan `tiket_lanjut` dari draft + field KYC. Ini artinya `StepDataDiri` sekarang komponen yang MELAKUKAN network call (dulu `Step1` cuma lokal state, network call ada di `Step2`) — pindahkan state `loading`/`apiError` yang relevan ke sini.
7. **UI baru: layar antara setelah Tahap 1 sukses.** Sekarang Tahap 2 opsional, bukan wajib lanjut otomatis. Tampilkan:
   - Konfirmasi: "Properti Anda sudah tercatat (Kode Listing: SBP-...). Tim kami bisa menghubungi Anda via WhatsApp." 
   - Tombol utama: **"Lengkapi Data Diri Sekarang"** → lanjut ke `StepDataDiri` (supaya proses perjanjian resmi bisa diproses tanpa nunggu WA balik).
   - Tombol sekunder: **"Nanti Saja"** → ke halaman selesai/beranda, jelaskan admin akan follow-up manual.
8. **`STEP1_ERROR_KEYS`** (baris ±534-537): balik makna — sekarang berisi key ERROR milik KYC (`nama_ktp`, `nik`, `alamat_ktp`, `rt_rw`, `kelurahan`, `kecamatan`, `bertindak_sebagai`) karena field itu yang sekarang ada di step KEDUA/lain-layar dari titik pemanggilan errornya. Sesuaikan ke arah manapun error 422 sekarang bisa muncul dari 2 endpoint berbeda, bukan 1.
9. **`titipJualDraft.ts`**: tambah field baru `tiketLanjut?: string` dan `kodeListingTahap1?: string` (untuk ditampilkan di UI kalau user reload sebelum lanjut Tahap 2). `leadId` boleh tetap ada di type tapi tidak lagi ditulis oleh flow baru (biarkan untuk kompatibilitas type lama, atau hapus kalau TypeScript tidak keberatan — cek pemakaian lain dulu).
10. **`genDisplayKode()`** (baris ±545-549): dulu dipakai `Step2` (preview kode sebelum submit sungguhan) — sekarang relevan di `StepProperti`, pastikan tetap dipanggil hanya di komponen yang TIDAK pernah dirender SSR (aturan lama soal `new Date()` + hydration tetap berlaku, lihat komentar di kode & CLAUDE.md).
11. **SuccessPage**: perlu varian baru untuk "Tahap 1 selesai, Tahap 2 belum" (lihat poin 7) DAN tetap punya varian "kedua tahap selesai" (mirip sekarang) untuk saat `StepDataDiri` sukses submit `titip-jual-lengkapi`.

## 4. Perubahan skema DB

**Tidak ada migrasi wajib.** `owners` sudah nullable untuk semua kolom KYC kecuali `no_wa_1`. `properties.submit_id` UNIQUE sudah ada.

Opsional (verifikasi saat eksekusi, bukan blocker): cek apakah ada index di `owners.property_id` untuk mempercepat lookup Tahap 2 — kalau tabelnya kecil (skala ratusan/ribuan baris) ini tidak signifikan, jangan tambah migrasi kalau tidak perlu.

## 5. Daftar file yang disentuh (ringkasan eksekusi)

**Baru:**
- `functions/api/titip-jual-mulai.js`
- `functions/api/titip-jual-lengkapi.js`
- `functions/api/titip-jual-tiket-foto.js`

**Diubah:**
- `src/app/components/TitipJualPage.tsx` (refactor besar, lihat §3)
- `src/lib/titipJualDraft.ts` (tambah `tiketLanjut`, `kodeListingTahap1`)

**Tidak disentuh (sengaja, untuk kompatibilitas mundur):**
- `functions/api/titip-jual.js`
- `functions/api/titip-jual-prospek.js`
- `functions/api/titip-jual-foto.js`
- `src/lib/propertyFields.ts` (sudah benar, dipakai apa adanya)
- Semua file admin (`AdminPropertyDetailPage.tsx`, `functions/api/admin/properties/**`) — sudah kompatibel dari sononya karena pola "owners ringan" sudah ada di sana.

## 6. Rencana pengujian & gate (ikuti urutan CLAUDE.md)

1. `npm run typecheck`
2. `npx wrangler pages functions build --outdir=<tmp>` (verifikasi bundle Functions untuk 3 endpoint baru)
3. Clean build WAJIB karena `TitipJualPage.tsx` ikut SSR: `Remove-Item -Recurse -Force dist, .react-router && npm run build`
4. `npm run check:bundle` (anggaran naik? cek — 3 endpoint baru + refactor besar file yang sudah SSR-bundled sebelumnya)
5. `npm run check:turnstile` (endpoint baru yang manggil `verifyTurnstile` harus otomatis kesapu; `titip-jual-lengkapi.js` & `titip-jual-tiket-foto.js` SENGAJA tidak manggil Turnstile — pastikan scriptnya tidak salah menuduh)
6. `npm run smoke -- https://salambumi.xyz` (default & `--cached`)
7. `npm run check:hydration` (setelah deploy — halaman `/titip-jual` termasuk 7 halaman yang diuji)

**Uji manual wajib (gate otomatis tidak menangkap ini — lihat `feedback_arch_change_workflow`):**
1. Isi Tahap 1 (properti) saja, tutup tab → cek properti muncul di Admin → Manajemen Properti dengan status draft, dan Kontak Owner terisi nomor WA yang benar.
2. Lanjut Tahap 2 dari draft yang sama → cek `owners` ke-UPDATE (bukan baris baru), `agreements` baru lahir sekali, CAPI `CompleteRegistration` sekali tembak.
3. Coba pakai `tiket_lanjut` dua kali (submit Tahap 2 dua kali) → harus idempoten, bukan agreement dobel.
4. Coba modifikasi `tiket_lanjut` (rusak signature) → harus ditolak, bukan crash 500.
5. Submit Tahap 1 dua kali dengan `submit_id` sama (retry jaringan) → idempoten seperti sekarang.
6. Buka tab lama (bundle sebelum perubahan, kalau bisa disimulasikan) → pastikan tetap bisa submit lewat `/api/titip-jual` lama tanpa error.
7. Uji Turnstile & pixel dengan browser headful sungguhan (bukan curl) — sesuai catatan lama soal Turnstile/Pixel harus headful.

## 7. Keputusan yang sudah diasumsikan (boleh dikoreksi user sebelum/ saat eksekusi)

Supaya rencana ini bisa langsung dieksekusi tanpa nunggu jawaban lebih lanjut, asumsi berikut dipakai sebagai default — tandai ke user kalau eksekutor menemukan salah satu perlu dikonfirmasi ulang:

1. Nama endpoint: `titip-jual-mulai.js` / `titip-jual-lengkapi.js` / `titip-jual-tiket-foto.js`.
2. Setelah Tahap 1 sukses: tampilkan pilihan "Lengkapi Data Diri Sekarang" vs "Nanti Saja" (bukan auto-redirect paksa ke Tahap 2).
3. Event Meta: `Lead` di akhir Tahap 1, `CompleteRegistration` di akhir Tahap 2 (perlu verifikasi ulang dengan skill `meta-ads-tracking` saat eksekusi, jangan asumsi buta).
4. `titip-jual-prospek.js` dipensiunkan dari flow BARU (tidak dipanggil dari frontend baru) tapi filenya tetap ada untuk bundle lama.
5. Tidak ada badge/penanda baru di Admin Listing untuk "properti Titip Jual belum lengkap KYC" di rilis ini — cukup andalkan `owners.nik_encrypted IS NULL` yang sudah bisa di-query manual kalau admin butuh. Bisa jadi enhancement terpisah nanti.
6. Masa berlaku `tiket_lanjut`: 7 hari.

## 8. Urutan eksekusi yang disarankan

1. Backend dulu (3 endpoint baru), uji lewat `curl`/skrip tanpa UI — bisa mengikuti pola `scripts/` yang sudah ada untuk simulasi payload tanpa menembus Turnstile sungguhan (lihat catatan verifikasi di `project_titipjual_regresi_dan_paritas.md`: "Simulasi blok validasi backend dgn payload persis dari frontend").
2. Baru sentuh `TitipJualPage.tsx` setelah backend teruji independen.
3. Update `titipJualDraft.ts` bersamaan dengan frontend.
4. Jalankan seluruh gate §6.
5. Deploy, lalu jalankan `check:hydration` (butuh production live).
6. Uji manual browser sungguhan (§6, bagian manual) — TIDAK bisa diklaim selesai tanpa ini.
