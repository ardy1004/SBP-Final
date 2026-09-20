# PLAN — Urutan Kirim Manual (Drag & Drop) di Konten Agent

Status: **belum dieksekusi**. Dokumen ini ditulis Claude (riset only, nol perubahan kode) untuk diserahkan ke sesi Claude Code lain yang akan mengeksekusi.

## 1. Latar Belakang

Halaman **Admin → Konten Agent** (`AdminViralFrameAgentVideosPage.tsx`) menampilkan video upload manual per karakter/agent dalam grid kartu. Auto-scheduler (`functions/api/internal/viralframe/auto-schedule.js`) mengirim video ke Buffer/Zernio berdasarkan **FIFO murni**: video dengan `created_at` paling lama diambil duluan.

Kondisi ini SUDAH DIVERIFIKASI di kode (bukan asumsi):
- **Query scheduler** (`auto-schedule.js:160-163`):
  ```sql
  SELECT id, cloudinary_url, caption, hashtags FROM viralframe_agent_videos
   WHERE character_id = ? AND trashed_at IS NULL AND cloudinary_url IS NOT NULL
   ORDER BY created_at ASC, id ASC LIMIT ?
  ```
- **Query list grid** (`functions/api/admin/viralframe/agent-videos/index.js:141`):
  ```js
  const orderBy = view === 'trash' ? 'v.trashed_at DESC, v.id DESC' : 'v.created_at DESC, v.id DESC';
  ```
  → grid aktif tampil **terbaru di atas**, jadi video **terlama (yang duluan dikirim scheduler) ada di bagian bawah** — persis yang dikeluhkan user.
- Tidak ada kolom urutan/prioritas apa pun di tabel `viralframe_agent_videos` — pengurutan 100% derivatif `created_at`.
- Tidak ada library drag-and-drop di `package.json` (dicek, nihil).

**Keputusan user (sudah dikonfirmasi via tanya-jawab, JANGAN diubah tanpa konfirmasi ulang):**
- Drag & drop terjadi **langsung di kartu grid yang sekarang ada** (bukan dipindah ke tampilan list terpisah).
- Mekanismenya harus benar-benar drag & drop bebas (bukan tombol naik/turun), user bisa menggeser video mana pun ke posisi mana pun untuk mengubah urutan kirimnya.

## 2. Tujuan

Admin bisa menggeser (drag) kartu video di grid Konten Agent untuk mengatur urutan kirim ke Buffer/Zernio secara bebas — video yang digeser ke depan/atas akan dikirim scheduler lebih dulu, terlepas dari kapan video itu diupload.

## 3. Ringkasan Desain

- **Kolom baru**: `urutan_kirim INTEGER` di `viralframe_agent_videos`. Diberi nilai **berjarak (gap 1000)** per `character_id`, hanya berlaku untuk baris `trashed_at IS NULL`.
- **Cakupan urutan = per `character_id`**, konsisten dengan scope scheduler (`WHERE character_id = ?`) dan scope grid (sidebar sudah memilih satu karakter sekaligus).
- **Strategi reorder = renumber penuh antrean karakter itu setiap kali drag selesai** (bukan gap-insertion parsial). Alasan: jumlah video aktif per karakter kecil (puluhan, bukan ribuan), jadi renumber penuh murah, dan ini **menghindari seluruh kelas bug "gap habis"** yang harus ditangani gap-insertion. Client mengirim **seluruh array ID video aktif karakter itu dalam urutan baru**, server menomori ulang `1000, 2000, 3000, …` sesuai urutan array itu dalam satu batch.
- **Grid berubah urutan tampil**: dari `created_at DESC` (terbaru dulu) menjadi `urutan_kirim ASC` (antrean kirim dulu) untuk view aktif. Ini **perubahan UX yang disengaja** — posisi kartu di grid = posisi di antrean kirim, supaya drag terasa intuitif (geser ke depan = kirim lebih cepat). Tab Sampah tidak berubah (tetap `trashed_at DESC`).
- **Scheduler ganti `ORDER BY`**: dari `created_at ASC, id ASC` menjadi `urutan_kirim ASC, id ASC`.
- Video baru (upload) & video yang di-restore dari Sampah **otomatis mendapat `urutan_kirim` di AKHIR antrean** (`MAX(urutan_kirim) + 1000` untuk karakter itu) — supaya perilaku default tanpa campur tangan manual tetap masuk akal (video baru ke belakang antrean, bukan menyerobot).

## 4. Tahap 1 — Migrasi Database

Buat `migrations/0050_agent_videos_urutan_kirim.sql`:

```sql
-- =============================================================================
-- SBP — Migration 0050: Urutan kirim manual (drag & drop) untuk Konten Agent
--
-- `urutan_kirim` menggantikan created_at sebagai dasar urutan FIFO scheduler
-- (auto-schedule.js) dan urutan tampil grid Konten Agent. Nilainya berjarak
-- (gap 1000) per character_id, hanya relevan untuk video trashed_at IS NULL.
-- Backfill di bawah MEMPERTAHANKAN urutan lama persis (created_at ASC) supaya
-- migrasi ini nol dampak terhadap antrean yang sudah berjalan — video yang
-- "akan dikirim duluan" sebelum migrasi tetap "akan dikirim duluan" sesudahnya,
-- sampai admin benar-benar menggeser sesuatu.
-- =============================================================================

ALTER TABLE viralframe_agent_videos ADD COLUMN urutan_kirim INTEGER;

CREATE INDEX IF NOT EXISTS idx_agent_videos_urutan
  ON viralframe_agent_videos(character_id, urutan_kirim);

-- Backfill: video aktif diberi urutan_kirim sesuai created_at ASC (perilaku
-- lama), per character_id, kelipatan 1000. Video di Sampah dibiarkan NULL
-- (tidak relevan — dikecualikan semua query aktif oleh trashed_at IS NULL, dan
-- akan diisi ulang otomatis saat dipulihkan lewat kode aplikasi, bukan di sini).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY character_id ORDER BY created_at ASC, id ASC) AS rn
  FROM viralframe_agent_videos
  WHERE trashed_at IS NULL
)
UPDATE viralframe_agent_videos
SET urutan_kirim = (SELECT rn * 1000 FROM ranked WHERE ranked.id = viralframe_agent_videos.id)
WHERE id IN (SELECT id FROM ranked);
```

⚠️ **Sebelum menjalankan ke produksi:**
1. `wrangler d1 export sbp-db --remote --output=backup-sebelum-0050.sql` (wajib, aturan project).
2. `wrangler d1 migrations list sbp-db --remote` harus "No migrations to apply" dulu.
3. **Verifikasi dukungan window function (`ROW_NUMBER() OVER`) dengan dry-run SELECT dulu** sebelum UPDATE sungguhan — jalankan lewat `--command` (bukan `--file`, sesuai jebakan wrangler D1 yang sudah didokumentasikan di CLAUDE.md):
   ```
   wrangler d1 execute sbp-db --remote --command "SELECT id, character_id, ROW_NUMBER() OVER (PARTITION BY character_id ORDER BY created_at ASC, id ASC) AS rn FROM viralframe_agent_videos WHERE trashed_at IS NULL LIMIT 10"
   ```
   Kalau ini gagal (versi SQLite D1 tidak mendukung window function — kecil kemungkinan, tapi cek dulu), ganti pendekatan backfill dengan skrip Node yang membaca semua baris aktif per character_id, urutkan di JS, lalu UPDATE satu-satu lewat `--file` (pola sama seperti script lain di `scripts/`).
4. Jalankan `wrangler d1 migrations apply sbp-db --remote`.
5. Verifikasi hasil: `SELECT character_id, id, created_at, urutan_kirim FROM viralframe_agent_videos WHERE trashed_at IS NULL ORDER BY character_id, urutan_kirim LIMIT 20` — urutannya harus identik dengan `ORDER BY character_id, created_at ASC`.

## 5. Tahap 2 — Backend: Endpoint Reorder Baru

Buat file baru `functions/api/admin/viralframe/agent-videos/reorder.js`:

- **`PATCH /api/admin/viralframe/agent-videos/reorder`**
- Body: `{ character_id: number, ordered_ids: number[] }`
- Validasi:
  - `character_id` integer valid.
  - `ordered_ids` array of integer, tidak kosong.
  - **Ambil set video aktif SEBENARNYA dari DB** (`SELECT id FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL`), lalu verifikasi `ordered_ids` adalah **permutasi persis** dari set itu (panjang sama, anggota sama — pakai perbandingan Set, bukan cuma panjang). Kalau tidak cocok → `422` dengan pesan jelas ("Daftar video tidak sinkron, muat ulang halaman"). Ini penjaga wajib, bukan opsional:
    - Mencegah IDOR (client tidak bisa menyelundupkan id video milik karakter lain).
    - Mencegah drift kalau ada tab lain yang trash/restore/upload video di karakter yang sama saat drag sedang berlangsung.
- Eksekusi: `env.DB.batch(ordered_ids.map((id, i) => env.DB.prepare('UPDATE viralframe_agent_videos SET urutan_kirim = ? WHERE id = ? AND character_id = ?').bind((i + 1) * 1000, id, characterId)))`.
  - Kalau `ordered_ids.length` bisa melebihi puluhan-ratusan (defensif), pecah batch per 50 statement mengikuti pola chunking yang sudah ada di `properties/bulk.js`.
- Response: `jsonOk({ updated: ordered_ids.length })`.
- Auth: otomatis lewat `functions/api/admin/_middleware.js` (folder `admin/`), tidak perlu kode tambahan.
- Tambahkan `export async function onRequestOptions() { return handleOptions(); }` sesuai pola semua endpoint lain di folder ini.

## 6. Tahap 3 — Backend: Video Baru Dapat Urutan Akhir Antrean

Edit `functions/api/admin/viralframe/agent-videos/index.js`, `onRequestPost` (sekitar baris 226, sebelum blok INSERT):

```js
const { maxUrutan } = await env.DB.prepare(
  'SELECT COALESCE(MAX(urutan_kirim), 0) AS maxUrutan FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL'
).bind(characterId).first();
const urutanKirim = (maxUrutan ?? 0) + 1000;
```

Tambahkan `urutan_kirim` ke daftar kolom & values di statement INSERT yang sudah ada (baris 228-231), dan `urutanKirim` ke `.bind(...)`.

## 7. Tahap 4 — Backend: Restore Dapat Urutan Baru (Single + Bulk)

**Restore satu video** — edit `functions/api/admin/viralframe/agent-videos/[id].js`, `onRequestPatch`:
- Saat ini endpoint ini TIDAK pernah SELECT baris sebelum UPDATE. Ketika `trash === false` (restore), tambahkan langkah: SELECT `character_id` baris ini dulu, hitung `MAX(urutan_kirim)+1000` untuk `character_id` itu (sama seperti Tahap 3), lalu tambahkan `urutan_kirim = ?` ke `sets`/`binds` bersamaan dengan `trashed_at = NULL`.
- ⚠️ Wajib — tanpa ini, video yang dipulihkan dari Sampah punya `urutan_kirim` basi (nilai lama dari sebelum ditrash) atau `NULL`. `NULL` di SQLite `ORDER BY … ASC` muncul **PALING DEPAN**, jadi video yang baru dipulihkan bisa tiba-tiba jadi prioritas #1 di scheduler tanpa diminta siapa pun — bug diam-diam yang persis pola "placeholder hardcoded" yang sudah beberapa kali terjadi di project ini.

**Bulk restore** — edit `functions/api/admin/viralframe/agent-videos/bulk.js`, cabang `action === 'restore'` (baris 35-38):
- `ids` di sini bisa lintas karakter. Ganti pendekatan single-UPDATE menjadi:
  1. `SELECT id, character_id FROM viralframe_agent_videos WHERE id IN (...)` untuk ids yang diminta.
  2. Group by `character_id`.
  3. Untuk tiap grup, SELECT `MAX(urutan_kirim)` existing (aktif) di karakter itu, lalu assign `base+1000, base+2000, …` ke tiap video dalam grup itu (urutan di dalam grup bebas, misal urutan `id ASC`).
  4. Jalankan sebagai `env.DB.batch([...])` — satu UPDATE per video (set `trashed_at = NULL, urutan_kirim = ?`), bukan lagi satu UPDATE massal `WHERE id IN (...)`.

## 8. Tahap 5 — Backend: Scheduler Pakai `urutan_kirim`

Edit `functions/api/internal/viralframe/auto-schedule.js` baris 160-163:

```diff
  const antre = await env.DB.prepare(
    `SELECT id, cloudinary_url, caption, hashtags FROM viralframe_agent_videos
-    WHERE character_id = ? AND trashed_at IS NULL AND cloudinary_url IS NOT NULL
-    ORDER BY created_at ASC, id ASC LIMIT ?`
+    WHERE character_id = ? AND trashed_at IS NULL AND cloudinary_url IS NOT NULL
+    ORDER BY urutan_kirim ASC, id ASC LIMIT ?`
  ).bind(ag.id, butuh).all().catch(() => null);
```

Tidak ada tempat lain yang perlu diubah — `commit-agent.js` (jadwal manual per video) mengambil satu video by id, tidak bergantung urutan; `caption.js` (riwayat caption anti-pengulangan) sengaja `ORDER BY created_at DESC` untuk histori, bukan antrean kirim, JANGAN ikut diubah.

## 9. Tahap 6 — Frontend: Ambil & Tampilkan `urutan_kirim`

- `functions/api/admin/viralframe/agent-videos/index.js`: tambahkan `v.urutan_kirim` ke `SELECT_COLS` (baris ~21-28).
- `functions/api/admin/viralframe/agent-videos/index.js` baris 141: ganti
  ```diff
  - const orderBy = view === 'trash' ? 'v.trashed_at DESC, v.id DESC' : 'v.created_at DESC, v.id DESC';
  + const orderBy = view === 'trash' ? 'v.trashed_at DESC, v.id DESC' : 'v.urutan_kirim ASC, v.id ASC';
  ```
- `AdminViralFrameAgentVideosPage.tsx`: tambahkan `urutan_kirim: number | null;` ke interface `AgentVideo` (dekat baris 64-104).

## 10. Tahap 7 — Frontend: Drag & Drop UI

- Install dependency baru: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. **Jalankan `npm run check:bundle` SEBELUM install untuk catat baseline**, lalu lagi SESUDAH menambah drag-and-drop untuk melihat dampaknya terhadap anggaran bundle (lihat catatan anggaran `BUDGET_FUNCTIONS_RAW`/Assertion A di `CLAUDE.md` — dnd-kit ini bundel FRONTEND bukan Functions, jadi cek anggaran sisi client, bukan sisi Functions).
- Di `AdminViralFrameAgentVideosPage.tsx`, bungkus grid (baris ~604-757) dengan `<DndContext>` + `<SortableContext items={filteredVideos.map(v => v.id)} strategy={rectSortingStrategy}>`.
- Tiap kartu video jadi sortable item lewat `useSortable({ id: v.id })`. **Pasang `listeners`/`attributes` HANYA pada elemen pegangan kecil (drag handle, ikon `GripVertical` dari `lucide-react` yang sudah dipakai di file ini)**, bukan di seluruh kartu — kartu berisi `<video controls>`, textarea caption/hashtag, checkbox pilih, dan context menu klik-kanan yang semuanya harus tetap berfungsi normal tanpa terpicu drag.
- Tambahkan badge kecil nomor urut ("#1", "#2", …) di pojok tiap kartu — reference visual langsung untuk urutan kirim, mengatasi keluhan awal user ("tidak tahu mana yang duluan terkirim").
- **Reorder hanya aktif saat `ratioFilter === 'semua'`.** Kalau filter rasio lain dipilih, sembunyikan/nonaktifkan drag handle + tampilkan hint singkat ("Set filter ke Semua untuk mengatur urutan kirim"). Alasan: `ordered_ids` yang dikirim ke endpoint reorder harus permutasi PENUH dari video aktif karakter itu (lihat Tahap 5 validasi); drag di subset terfilter akan selalu ditolak 422 oleh guard itu.
- `onDragEnd`:
  1. Hitung array baru via `arrayMove(filteredVideos, oldIndex, newIndex)` (util resmi `@dnd-kit/sortable`).
  2. Update state `videos` secara optimistic ke urutan baru.
  3. `PATCH /api/admin/viralframe/agent-videos/reorder` dengan `{ character_id: selectedCharId, ordered_ids: videoBaru.map(v => v.id) }`, pakai helper `kirimAksi()` yang sudah ada di file ini (baris 304-317) supaya kegagalan tampil lewat `aksiError` yang konsisten dengan aksi lain di halaman ini.
  4. Kalau gagal, panggil `refreshAfterAction()` untuk menarik ulang data asli dari server (batalkan optimistic update yang salah).

## 11. Guardrail & Edge Case Wajib (jangan dilewati)

1. **Restore (single & bulk) WAJIB assign urutan_kirim baru** — lihat Tahap 4. Tanpa ini video pulih bisa menyerobot ke depan antrean secara diam-diam (NULL sorts first di SQLite ASC).
2. **Validasi permutasi penuh di endpoint reorder** — lihat Tahap 5. Tanpa ini: (a) IDOR lintas karakter, (b) drag di grid terfilter bisa merusak urutan video yang sedang tidak terlihat.
3. **Video baru (upload) WAJIB ke akhir antrean**, bukan NULL — lihat Tahap 3.
4. **Drag handle terpisah dari area interaktif kartu** — jangan buat seluruh kartu draggable, akan merusak kontrol video/textarea/checkbox yang sudah ada.
5. **`view === 'trash'` tidak boleh kena drag** — Sampah tetap `trashed_at DESC`, tidak ada konsep antrean kirim untuk video yang sudah ditrash.

## 12. Checklist Testing Manual (di production setelah deploy, headful browser)

1. Buka Konten Agent, pilih karakter dengan ≥3 video aktif.
2. Verifikasi grid tampil terurut sesuai antrean (badge "#1" di kartu yang seharusnya paling dulu terkirim — cross-check manual dengan `created_at` sebelum ada drag apa pun, harus cocok urutan lama).
3. Drag video dari posisi belakang ke paling depan, lepas — cek UI langsung berubah, tidak ada error di `aksiError`.
4. **Reload halaman penuh** — urutan baru harus tetap (bukan cuma optimistic UI yang hilang saat refresh). Ini bukti persistensi ke DB.
5. Baca langsung ke D1: `wrangler d1 execute sbp-db --remote --command "SELECT id, urutan_kirim FROM viralframe_agent_videos WHERE character_id=<id> AND trashed_at IS NULL ORDER BY urutan_kirim ASC, id ASC LIMIT 5"` — video yang barusan digeser ke depan harus muncul pertama.
6. Trash sebuah video lalu restore — cek dia mendapat `urutan_kirim` baru di AKHIR antrean (bukan NULL, bukan di depan). Cek juga jalur bulk (select multi → toolbar → Pulihkan).
7. Upload video baru untuk karakter yang sama — cek otomatis dapat `urutan_kirim` tertinggi (akhir antrean, badge nomor terakhir).
8. Ganti filter rasio ke selain "Semua" — cek drag handle hilang/nonaktif dengan hint yang jelas.
9. Cek `npm run typecheck` (0 error) dan `npx wrangler pages functions build --outdir=<tmp>` (exit 0) sebelum deploy.

## 13. Gate & Urutan Deploy

Ikuti pola project yang sudah mapan (lihat `CLAUDE.md`):

1. `wrangler d1 export sbp-db --remote --output=backup-sebelum-0050.sql`
2. `wrangler d1 migrations list sbp-db --remote` → pastikan "No migrations to apply" dulu.
3. `wrangler d1 migrations apply sbp-db --remote` (migrasi 0050).
4. `npm install` (dnd-kit).
5. Clean build wajib (route/bundle SSR berubah): `Remove-Item -Recurse -Force dist, .react-router; npm run build` (PowerShell) — halaman ini admin/client-only jadi risikonya rendah, tapi tetap ikuti aturan project.
6. `npm run typecheck` → 0 error.
7. `npm run check:bundle` → bandingkan dengan baseline sebelum dnd-kit ditambahkan, pastikan masih dalam anggaran (atau minta persetujuan user kalau perlu menaikkan anggaran, sesuai aturan "menaikkan angka = keputusan user" di `CLAUDE.md`).
8. `npx wrangler pages functions build --outdir=<tmp>` → exit 0 (verifikasi Functions build, karena banyak file di `functions/` disentuh).
9. `wrangler pages deploy dist/client --project-name sbp-final --branch=master`.
10. Jalankan checklist manual di Bagian 12 langsung di production.

Catatan: fitur ini admin-only (client-rendered lewat `clientOnly()`), jadi TIDAK termasuk 320 URL yang di-smoke test publik dan TIDAK menyentuh hydration SSR halaman publik — smoke test & `check:hydration` publik tidak wajib dijalankan ulang untuk perubahan ini, tapi tidak ada salahnya sebagai sanity check umum kalau ragu.

## 14. Ringkasan File yang Disentuh

| File | Perubahan |
|---|---|
| `migrations/0050_agent_videos_urutan_kirim.sql` | **Baru** — kolom `urutan_kirim` + index + backfill |
| `functions/api/admin/viralframe/agent-videos/reorder.js` | **Baru** — endpoint PATCH reorder |
| `functions/api/admin/viralframe/agent-videos/index.js` | `SELECT_COLS` +kolom, `orderBy` aktif, `onRequestPost` +urutan akhir |
| `functions/api/admin/viralframe/agent-videos/[id].js` | `onRequestPatch` — restore assign urutan baru |
| `functions/api/admin/viralframe/agent-videos/bulk.js` | Cabang `restore` — assign urutan baru per karakter |
| `functions/api/internal/viralframe/auto-schedule.js` | `ORDER BY` baris 160-163 |
| `src/app/components/admin/AdminViralFrameAgentVideosPage.tsx` | Interface `AgentVideo`, DndContext/Sortable, drag handle, badge urutan, filter guard |
| `package.json` | +`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
