# Plan: Semua Agent Bebas Upload Listing Jenis Apa Pun

> Disusun 2026-09-16 dari pemeriksaan read-only ke kode + D1 produksi.
> **Untuk Claude Code yang mengeksekusi:** kerjakan per tahap, laporkan hasil tiap
> tahap, dan jangan `git push` kecuali user memintanya. Berkas plan ini sendiri
> **jangan ikut di-commit**.

---

## 1. Permintaan user

Di Admin → ViralFrame → **Konten Agent → "Upload video manual"**, semua agent harus
bisa memilih dan mengunggah listing **jenis properti apa pun**, sama seperti
Monica Vera sekarang.

## 2. Kondisi sekarang (terverifikasi)

| Agent | id | Spesialis (D1) |
|---|---|---|
| hana | 14 | rumah |
| angle | 15 | tanah |
| ayu | 16 | kost |
| cindy | 17 | hotel |
| lisa | 18 | homestay, villa |
| vina | 19 | apartment |
| **Monica Vera** | **20** | **`[]` → bebas** (juga agent utama) |
| Andi | 21 | ruko, gudang, komersial |

Monica bebas **bukan karena kode khusus**, melainkan karena daftar spesialisnya
kosong — dan daftar kosong diperlakukan sebagai "semua jenis".

Batasan ditegakkan di 4 lapis:

| Lapis | Lokasi | Perilaku |
|---|---|---|
| Daftar listing | `src/app/components/admin/viralframe/PanelUnggahAgent.tsx:67` | listing di luar spesialis disaring `agentCocok()` |
| Teks panel | `PanelUnggahAgent.tsx:150`, `:184-188` | "Khusus properti jenis …" |
| Sebelum presign | `functions/api/admin/viralframe/r2-sign.js:44-52` | **422** |
| Sebelum INSERT | `functions/api/admin/viralframe/agent-videos/index.js:226-229` | **422** (gerbang sebenarnya) |

Kedua 422 berasal dari satu fungsi: `cekSpesialis()` di
`functions/_lib/agentAccounts.js:166-192`.

**Pemanggil lengkap** (grep identifier, bukan komentar):
- `cekSpesialis` → hanya `r2-sign.js` (import :17, panggil :50) dan
  `agent-videos/index.js` (import :17, panggil :228).
- `agentCocok` → `AgentGrid.tsx:57` (definisi), `AdminViralFramePage.tsx:398,409`
  (meja kerja), `PanelUnggahAgent.tsx:19,67`.

## 3. Kenapa aman dicabut

1. **Alasan asli aturan sudah gugur.** Komentar `agentAccounts.js:166` menyebut
   "pembatasan mengikuti STORAGE TUJUAN" (keputusan 2026-08-11) — saat itu tiap
   agent punya akun Cloudinary sendiri. Sejak migrasi 0043 semua video masuk
   **satu bucket R2 `sbp-video`**, key `agent-videos/<property_id>/<uuid>.mp4`
   (`kunciVideoBaru()` di `functions/_lib/videoStorage.js:23`) — tanpa identitas agent.
2. **Tidak ada konsumen hilir.** `jenis_properti` tidak dibaca di
   `functions/_lib/jadwalOtomatis.js`, `functions/api/internal/viralframe/`,
   maupun `functions/api/admin/viralframe/schedule/`. Satu-satunya pembaca di jalur
   video agent adalah gerbang itu sendiri.
3. **Semua listing terjangkau.** Panel memanggil `GET /api/admin/properties`
   yang mengembalikan semua baris (`MAX_ROWS = 1000`, tanpa filter status bawaan).
   Produksi: 564 listing (rumah 276, kost 188, tanah 63, hotel 21, apartment 5,
   komersial 4, villa 3, homestay 3, gudang 1).
4. **Tidak ada gate otomatis yang menguji aturan ini** (`scripts/` nol kecocokan).

## 4. Keputusan & asumsi (baca sebelum mulai)

1. **Jalur kode.** Label spesialis **tetap tersimpan** dan tampil sebagai
   keterangan, tapi tidak lagi membatasi upload. (Alternatif tanpa kode —
   mengosongkan spesialis tiap agent di Admin → Pengaturan → Akun Agent — sudah
   disampaikan ke user. Kalau user memilih itu, plan ini tidak dipakai.)
2. **Gerbang server dicabut untuk SEMUA jalur**, termasuk "Upload Hasil" di meja
   kerja (`PanelUnggah.tsx:82,108` memanggil endpoint yang sama). Ini wajib:
   membedakan "jalur Konten Agent" di server hanya bisa lewat penanda dari
   browser, dan penanda yang bisa dikirim siapa saja bukan gerbang.
3. **UI yang diubah hanya panel upload manual Konten Agent.** Meja kerja
   ViralFrame (pengelompokan listing per agent) **tidak diubah** — lihat Tahap
   Opsional. Setelah gerbang dicabut, meja kerja tetap berperilaku sama karena
   UI-nya sudah hanya menampilkan listing yang cocok.
4. **Listing di luar spesialis diberi penanda "di luar spesialis"** di panel —
   informatif, tidak memblokir. Alasannya: video yang diunggah ke agent akan
   **diposting penjadwal otomatis ke akun sosmed milik agent itu** (mis. video
   kost lewat Hana tayang di TikTok/IG/YouTube Hana). User sudah diberi tahu.
   Kalau user tidak mau penandanya, lewati bagian penanda di Tahap 2.

---

## Tahap 0 — PRASYARAT: kode live yang belum tersimpan di git

⚠️ Panel "Upload video manual" **sudah live di produksi tapi tidak ada di commit
mana pun**:

- `src/app/components/admin/viralframe/PanelUnggahAgent.tsx` → **untracked**
- `src/app/components/admin/AdminViralFrameAgentVideosPage.tsx` → **modified**
  (+14/−1: import panel, field `spesialis` di `CharacterOption`, render panel
  dengan `key={selectedCharId}`, teks empty-state)
- Keduanya bertanggal 2026-09-11 03:43. Chunk produksi
  `/assets/AdminViralFrameAgentVideosPage-7HTXmj9o.js` memuat teks panel ini.
  Deployment produksi terakhir `3ddde52b` berlabel commit `987f01b`, padahal isinya
  lebih baru.

Akibatnya deploy dari git bersih akan **menghapus panel ini diam-diam**.

Langkah:
1. `git status --short` + `git diff src/app/components/admin/AdminViralFrameAgentVideosPage.tsx`
   — pastikan diff masih sesuai deskripsi di atas. Kalau berbeda, **berhenti dan
   laporkan ke user**.
2. Commit **hanya dua berkas itu**, sebagai commit tersendiri, mis.
   `feat(konten-agent): panel upload video manual tanpa pesanan` — sebutkan di
   badan pesan bahwa panel ini sudah live sejak 2026-09-11 tanpa tercatat di git.
3. **JANGAN ikut commit**: `BRIEF-VIRALFRAME-UNTUK-CHATGPT.md`,
   `RESPONSE-UNTUK-CLAUDE-VIRALFRAME-V2.md`, `Jawaban Chat GPT.txt` (dokumen
   referensi yang sengaja untracked), dan berkas plan ini.

## Tahap 1 — Backend: cabut gerbang spesialis

**`functions/api/admin/viralframe/r2-sign.js`**
- Hapus import `cekSpesialis` (baris 17).
- Hapus blok pengecekan baris 44-52.
- `propertyId` **tetap dipakai** oleh `kunciVideoBaru(propertyId)` (baris 54) —
  jangan dihapus. `characterId` jadi tidak terpakai → boleh dihapus parsenya.
- Rapikan komentar header (`Body: { property_id?, character_id? }`):
  `character_id` tidak lagi dibaca.

**`functions/api/admin/viralframe/agent-videos/index.js`**
- Import baris 17: buang `cekSpesialis` saja, **pertahankan**
  `resolveCloudinaryByCloudName` dan `cloudNameDariUrl`.
- Hapus blok baris 226-229.
- Baris 223: `SELECT id, jenis_properti FROM properties` → `SELECT id FROM properties`
  (cek 404 properti tetap ada).

**`functions/_lib/agentAccounts.js`**
- Hapus `cekSpesialis()` beserta komentarnya (baris 166-192).
- **Pertahankan** `parseSpesialis()` (dipakai `agent-accounts/index.js` dan
  `characters/index.js`) dan `resolveAkunTarget()` (dipakai scheduler).
- Tambahkan komentar singkat di atas `parseSpesialis()`: spesialis sekarang **label
  pengelompokan**, bukan pembatas upload; gerbang 422 dicabut 2026-09 atas
  permintaan user; alasan aslinya (akun Cloudinary per agent) gugur sejak migrasi
  0043. **Jangan pasang lagi gerbang di server tanpa keputusan user.** Komentar ini
  mencegah sesi berikutnya "memperbaiki" yang dikira lubang.

Setelah tahap ini: `grep -rn "cekSpesialis" functions src` harus **nol** (komentar
di `PanelUnggahAgent.tsx:13` dibereskan di Tahap 2).

## Tahap 2 — Panel upload manual Konten Agent

**`src/app/components/admin/viralframe/PanelUnggahAgent.tsx`**
- Baris 67: `kandidat` = seluruh `properti ?? []`, tanpa filter `agentCocok`.
- Penanda (keputusan 4): pertahankan import `agentCocok` (baris 19); di baris daftar
  (190-198) dan kartu listing terpilih (161-171) tampilkan chip kecil
  **"di luar spesialis"** bila `!agentCocok(spesialis, p.jenis_properti)`.
  Monica (`spesialis = []`) otomatis tanpa chip.
- Baris 150: agent berspesialis → mis.
  `Semua jenis bisa dipilih · spesialis: ${spesialis.join('/')}`. Agent bebas → teks
  tetap.
- Baris 184-188: pesan "Belum ada listing yang cocok dengan spesialisasi agent
  ini…" → cukup "Belum ada listing." (kasus `kandidat.length === 0`).
- Komentar header baris 9-14: perbarui — daftar tidak lagi disaring; jelaskan
  alasan chip (video diposting ke akun sosmed agent tersebut).

## Tahap 3 — Teks & komentar yang masih menjelaskan aturan lama

- `src/app/components/admin/AkunAgentCard.tsx:243` — buang kalimat
  "Aturan spesialis tidak berlaku." (aturannya sudah tidak ada di mode mana pun).
- `AkunAgentCard.tsx:244` — ganti dengan mis. "Tiap agent memakai akun & storage
  sendiri. Spesialis hanya label pengelompokan — semua agent bisa upload listing
  jenis apa pun."
- `AkunAgentCard.tsx:284` — label "Spesialis (kosong = semua jenis)" → mis.
  "Spesialis (pengelompokan di ViralFrame · kosong = semua jenis)".
- `functions/api/admin/viralframe/characters/index.js:36-39` dan `:54-56` —
  **komentar saja**, jangan ubah perilaku/response.
- `src/app/components/admin/AdminViralFramePage.tsx:447` — "tiap agent hanya
  menangani jenis properti yang jadi spesialisasinya" → mis. "Pilih agent dulu —
  listing dikelompokkan per spesialisasi agent. Untuk jenis lain, pakai Upload
  video manual di Konten Agent." (teks saja; filter meja kerja tidak disentuh).

## Tahap Opsional — Meja kerja ViralFrame (HANYA bila user meminta)

Tidak termasuk permintaan awal. Jika user ingin agent juga bebas di meja kerja:
- `AdminViralFramePage.tsx:398` (hitungan kartu) dan `:409` (filter listing) memakai
  `agentCocok`.
- Efek samping kalau filter dibuang begitu saja: semua kartu agent di `AgentGrid`
  menampilkan 564 listing dan pengelompokan kehilangan makna; kartu `disabled` bila
  `total === 0` (`AgentGrid.tsx:100,107`).
- Saran: sakelar "Tampilkan semua jenis" di meja kerja, bukan membuang filter.
  Tanyakan user dulu.

---

## Verifikasi

### A. Uji handler dengan D1 tiruan (WAJIB, sebelum deploy)

Tulis skrip di **scratchpad** (bukan di repo), pola sama dengan uji handler
sebelumnya: impor `onRequestPost` langsung via `file:///…` lalu panggil dengan
`env` palsu.

- Baca dulu `agent-videos/index.js` baris 1-180 untuk menyusun body yang lolos
  validasi awal (storage `r2`, `r2_key`, `cloudinary_url`, dst.), dan
  `r2Siap()` di `functions/_lib/videoStorage.js` untuk binding yang dibutuhkan
  `r2-sign.js` (`VIDEO`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` — isi nilai palsu; `aws4fetch` menandatangani secara lokal).
- **Mock D1 sengaja "jahat"**: untuk query apa pun yang menyebut `spesialis`,
  kembalikan `{ nama: 'hana', spesialis: '["rumah"]' }`; untuk `settings`
  kembalikan mode `per_agent` + agent utama `20`. Jadi kalau ada sisa gerbang,
  uji pasti gagal.

Kasus:
| # | Endpoint | Input | Harus |
|---|---|---|---|
| 1 | agent-videos POST | Hana (14) + properti `kost` | **201** (sebelumnya 422) |
| 2 | agent-videos POST | Monica (20) + properti `kost` | 201 (regresi) |
| 3 | agent-videos POST | properti tidak ada | 404 |
| 4 | agent-videos POST | karakter tidak ada | 404 |
| 5 | r2-sign POST | Hana + `kost` | 200, ada `uploadUrl`, key diawali `agent-videos/<property_id>/` |

### B. Gate (semua wajib exit 0)

```powershell
npm run typecheck
npm run check:functions
npm run check:bundle          # ⚠️ lihat catatan di bawah
npm run check:turnstile
npx wrangler pages functions build --outdir=<scratchpad>
Remove-Item -Recurse -Force dist, .react-router ; npm run build   # clean build
```

⚠️ **`check:bundle` bisa mencetak "LULUS" palsu** bila `wrangler pages functions
build` crash (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) — asersi C/D
diam-diam dilewati dan error sintaks yang sebenarnya tersembunyi. Kalau crash itu
muncul, baca log di `%APPDATA%\xdg.config\.wrangler\logs\wrangler-*.log`. Pernah
terjadi di repo ini (backtick di dalam template literal SQL).

### C. Deploy

```powershell
Get-Process node | Stop-Process -Force
npx wrangler pages deploy dist/client --project-name sbp-final --branch=master
```

- `--branch=master` **wajib** (tanpa itu jadi deployment preview yang memakai D1/R2
  produksi).
- Setelah deploy: `wrangler pages deployment list --project-name sbp-final` —
  deployment baru berstatus Production, **nol** preview.
- `npm run smoke -- https://salambumi.xyz` **dan** `--cached` — laporkan keduanya.
- `npm run check:hydration` (sesudah deploy).
- Pastikan chunk admin live memuat teks baru: cari berkas
  `dist/client/assets/AdminViralFrameAgentVideosPage-*.js` yang memuat
  `di luar spesialis`, lalu `curl` berkas yang sama dari `https://salambumi.xyz/assets/…`.

### D. Uji manual oleh user (WAJIB hard reload)

1. Admin → ViralFrame → Konten Agent → pilih **Hana** → buka "Upload video manual".
2. Cari listing **kost** → harus muncul, dengan chip "di luar spesialis".
3. Unggah video → sukses, muncul di grid.
4. Pilih **Monica Vera** → listing kost muncul **tanpa** chip.

⚠️ **Video uji akan ikut dijadwalkan ke sosmed sungguhan.** Semua agent
`auto_aktif = 1` dan cron memposting antara 01:00–04:30 WIB; penjadwal mengambil
video dengan `trashed_at IS NULL`. **Hapus video uji lewat Konten Agent sebelum
01:00 WIB**, atau pakai video yang memang layak tayang.

---

## Dokumentasi (bagian dari "selesai")

- Memori `C:\Users\PC\.claude\projects\g--A-DataWeb-SBP-Backup-SBP-Blueprint-18-Mobile-Friendly-Website\memory\project_viralframe_agent_accounts.md`
  baris "Spesialis … MENYARANKAN, tidak memblokir" **sudah basi**: sejak 2026-08-11
  sampai perubahan ini, spesialis memblokir 422 lewat `cekSpesialis()`. Perbarui:
  sekarang label pengelompokan, gerbang dicabut, alasan gugur sejak R2.
- Skill `.claude/skills/viralframe-context/SKILL.md` (ter-track git): tambahkan satu
  poin singkat — spesialis agent = label/pengelompokan, **bukan** pembatas upload;
  jangan pasang lagi gerbang di server tanpa keputusan user.

## Commit

- Dua commit: (1) Tahap 0 — panel yang sudah live; (2) Tahap 1-3 + dokumentasi skill.
- `git status --short` sebelum tiap commit — Bash di mesin ini rutin meninggalkan
  berkas 0 byte sampah; hapus manual, **jangan** menambah pola ke `.gitignore`
  (merusak pemindai Tailwind).
- Pesan commit gaya repo (bahasa Indonesia, `feat(...)`/`fix(...)`), diakhiri
  baris atribusi yang berlaku di sesi.
- **Jangan push** kecuali user meminta.

## Rollback

Murni kode — tidak ada migrasi dan tidak ada perubahan data. `git revert` commit
Tahap 1-3 → clean build → deploy `--branch=master`. Commit Tahap 0 (panel) jangan
ikut di-revert.

## Di luar cakupan — jangan dikerjakan

- Mengosongkan kolom `spesialis` di database.
- Mengubah filter meja kerja ViralFrame (kecuali user meminta Tahap Opsional).
- Mengubah penjadwal, kuota, atau akun sosmed agent.
- `git push`.
