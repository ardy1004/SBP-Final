# Brief: Minta Saran Membangun "ViralFrame" — Mesin Storyboard & Prompt Google Flow

> **Cara pakai:** tempel/unggah seluruh berkas ini ke ChatGPT, lalu kirim pesan
> singkat: *"Baca brief ini, lalu jawab BAGIAN 8."*

---

## 1. Siapa saya dan apa yang sedang dibangun

Saya pemilik **Salam Bumi Property** (salambumi.xyz), agen properti di Yogyakarta
dengan ±558 listing aktif. Saya sedang membangun fitur bernama **ViralFrame** di
dashboard admin saya sendiri.

**Tujuan fitur:** dari satu listing properti, menghasilkan **storyboard** +
**prompt siap tempel ke Google Flow (Veo 3.1)**, supaya saya bisa memproduksi
video pendek vertikal untuk TikTok/Reels/Shorts secara rutin tanpa menulis
naskah satu per satu.

**Masalah yang mau saya pecahkan lewat brief ini:**
Ketika saya meminta storyboard **langsung ke ChatGPT**, hasilnya **bagus** —
naskahnya hidup, prompt-nya menghasilkan video yang enak ditonton. Tapi ketika
sistem otomatis saya yang menghasilkannya, **kualitas videonya jelek**: kaku,
tidak konsisten dengan foto referensi, dan retensinya buruk.

Saya ingin tahu **apa yang berbeda**, dan bagaimana memperbaiki mesinnya.

---

## 2. Batasan keras (tidak bisa diubah)

Ini bukan preferensi — ini batas alat dan kuota yang saya pakai.

| Batasan | Nilai | Sumber |
|---|---|---|
| Durasi per generate di Google Flow | **maks 10 detik** | kuota Flow mode gratis |
| Generate per hari (mode gratis) | **3×** | kuota Flow |
| Reference image per generate | **3** (peran: Subject / Scene / Style) | dokumentasi Google "Ingredients to Video" |
| Rasio | **9:16 vertikal** | platform tujuan |
| Bentuk video | **3 Part × 10 detik = 30 detik** | turunan dari kuota di atas |

**Konsekuensi penting:** satu video = 3 kali generate terpisah, masing-masing
10 detik, yang **tidak saling tahu**. Foto agent memakai 1 slot Subject, jadi
tersisa **2 slot** untuk foto properti per Part.

Alur kerja saya:
```
Sistem menghasilkan storyboard + 3 prompt
  → saya tempel satu per satu ke Google Flow (manual, tidak ada API render)
  → saya unduh 3 klip
  → gabung jadi 1 video 30 detik
  → unggah & jadwalkan otomatis
```

---

## 3. Arsitektur mesin saya sekarang

Prinsip yang saya pegang:

> **SISTEM melempar dadu (memilih gaya), AI mengerjakan kerajinan (cerita &
> dialog), SISTEM merender prompt akhir secara deterministik.**

Alasannya: kalau AI yang memilih gaya, ia selalu memilih 3–4 gaya yang itu-itu
saja (pencari modus), jadi 100 video untuk listing berbeda terlihat kembar.
Karena itu **kombinasi gaya dipilih kode**, bukan AI, dan disimpan sebagai
`variation_key` unik per listing di database supaya tidak pernah berulang.

### Sumbu variasi yang dipilih SISTEM (bukan AI)

- **Mekanisme cerita** (12 pilihan): rasa penasaran, sebelum–sesudah, fitur
  tersembunyi, bantah anggapan, POV penghuni, tur cepat, bicara angka,
  perbandingan, fokus satu ruang, kejutan di akhir, cerita lokasi, checklist
- **Hook / pembuka** (6): pertanyaan terbuka, fakta mengejutkan, pernyataan
  berani, pemecah pola, cuplikan akhir, daftar berangka
- **Ritme** (4): satu shot penuh (1 cut/Part), dua bagian (2), montase (3),
  montase cepat (5)
- **Mood** (5): hangat, sinematik, cerah, tenang, energik
- **Foto pembuka**: label ruangan yang wajib membuka Part 1

### Yang dikerjakan AI (satu panggilan)

Menerima kombinasi gaya di atas sebagai **batasan yang tidak boleh diubah**,
lalu menghasilkan JSON: konsep cerita, dan per Part → daftar `cuts`
(`foto_id`, `detik`, `kamera`, `aksi`), `dialog` (Bahasa Indonesia),
`teks_layar`.

### Yang dikerjakan kode (deterministik, nol kreativitas)

Merender JSON itu jadi prompt Google Flow berbahasa Inggris.

### Data pendukung

- **Vision AI** melabeli tiap foto properti (24 label ruangan: Fasad, Ruang Tamu,
  Dapur, …), memberi **skor kelayakan video 0–100**, dan **catatan** "apa yang
  menjual dari foto ini".
- **DNA Produk**: fakta terverifikasi dari database (LT/LB, kamar, kelurahan,
  legalitas, furnished, dll) + daftar **larangan** (hal yang TIDAK ada buktinya).
- **DNA Agent**: 8 karakter presenter tetap (nama, usia, etnik, pakaian, ciri
  fisik) yang harus tampak **sama persis** di ketiga Part.

---

## 4. Prompt yang saya kirim ke AI penyusun storyboard

Ini teks nyata (variabel sudah diisi contoh):

```
Kamu sutradara video pendek properti Indonesia. Kamu menerima BATASAN GAYA yang
sudah ditetapkan sistem dan TIDAK BOLEH mengubahnya — tugasmu mengeksekusinya
sebaik mungkin, bukan memilih gaya lain.
Jawab HANYA JSON valid. Tanpa markdown, tanpa kalimat pembuka.

---

PROPERTI — Rumah Megah Link Premium Mrican, Demangan, Gejayan Dekat UNY, Sanatadharma
FAKTA TERVERIFIKASI (hanya ini yang boleh disebut sebagai fakta)
- Jenis: rumah — dijual
- Harga: Rp 6.2 miliar
- Lokasi: Caturtunggal, Depok, Sleman
- Luas tanah: 492 m²
- Luas bangunan: 400 m²
- Kamar: 4 kamar tidur, 4 kamar mandi
- Lantai: 2 lantai
- Legalitas: SHM

KEUNIKAN YANG TERLIHAT DI FOTO
- Fasad: fasad simetris dua lantai, cat putih bersih
- Ruang Tamu: plafon tinggi, cahaya alami kuat dari jendela besar
- Dapur: kitchen set granit menyatu dengan ruang makan

RUANG YANG ADA FOTONYA: Fasad, Ruang Tamu, Kamar Tidur, Dapur, Taman/Halaman

DILARANG DISEBUT — tidak ada buktinya di listing ini
- Kolam Renang, Rooftop, Gym/Fitness, Carport/Garasi, Walk-in Closet, Musholla,
  jarak atau waktu tempuh dalam ANGKA ke tempat mana pun (mis. "500 meter dari X",
  "5 menit ke Y") kecuali angkanya tertulis di FAKTA di atas

CATATAN PEMILIK (boleh dipakai, jangan ditambah-tambahi)
Dijual/Disewakan Rumah Megah Mrican, Demangan, Gejayan Dekat UNY, UAJY Hukum, Sanatadharma

TALENT — Hana
- 25 tahun, asia_tenggara, Wanita, profesional, hijab muslimah

BATASAN GAYA (ditetapkan sistem — WAJIB dipatuhi, JANGAN diganti)
- Mesin cerita : Fitur tersembunyi — tunjukkan satu hal yang tidak terlihat dari foto listing biasa
- Pembuka      : Pertanyaan terbuka — buka dengan pertanyaan yang jawabannya baru muncul belakangan
- Ritme        : Montase — tiga potongan, tempo sedang, tiap potongan punya satu poin (target 3 cut per Part)
- Mood         : Hangat — warna hangat keemasan, musik akustik lembut
- Foto pembuka : Part 1 WAJIB dibuka dengan foto berlabel "Fasad"

FOTO YANG TERSEDIA (pakai HANYA id dari daftar ini)
  1. [id 2101] Fasad (skor 88) — fasad simetris dua lantai, cat putih bersih
  2. [id 2103] Ruang Tamu (skor 74) — plafon tinggi, cahaya alami kuat
  3. [id 2107] Dapur (skor 61) — kitchen set granit
  4. [id 2110] Kamar Tidur (skor 55) — kamar utama, jendela menghadap taman
  5. [id 2112] Taman/Halaman (skor 40) — halaman belakang berumput

BENTUK VIDEO (dikunci kuota Google Flow, tidak bisa diubah)
- 3 Part × 10 detik. Peran berurutan: Hook → Body → CTA.
- Voiceover 8 detik per Part → MAKSIMAL 20 kata per Part.
  Ini rentang target, bukan plafon: tulis 90-100% dari 20 kata. Dialog yang
  terlalu pendek membuat model video mengisi sisa waktu dengan mengulang frasa.
- Maksimal 4 foto referensi per Part, dan 2 foto pertama tiap Part adalah yang
  PALING PENTING — taruh yang terkuat di depan.

ATURAN KERAS
- Deskripsi tiap cut WAJIB sesuai foto yang benar-benar ada. Patuhi daftar
  "DILARANG DISEBUT" di atas.
- Dialog terucap DILARANG menyebut nominal harga, dan dilarang menumpuk urgensi.
  Harga tampil lewat teks layar.
- Part terakhir WAJIB menutup dengan ajakan yang objeknya sama seperti contoh ini:
  "Yuk jadwalkan survei lokasi, biar lihat sendiri kondisinya."
- JANGAN membuka dengan sapaan ("Halo guys, aku ..."). Detik pertama adalah hook.
- Hook Part 1 WAJIB memuat minimal satu hal konkret (angka, ukuran, jumlah kamar,
  atau nama tempat).
- SETIAP ANGKA yang diucapkan HARUS berasal dari FAKTA TERVERIFIKASI di atas.
- "teks_layar" Part 1 dan Part terakhir WAJIB terisi.
- "kamera" berisi UKURAN SHOT + GERAK KAMERA saja (maks 6 kata). DILARANG
  menuliskan aksi subjek di situ, dan DILARANG menyebut orang memegang kamera.
- SEMUA cut dalam SATU Part terjadi di RUANG YANG SAMA. Ganti ruangan hanya
  ANTAR Part. Maksimal 2 foto properti per Part.

KELUARAN JSON
{
  "konsep": { "sudut": "...", "emosi": "...", "payoff": "...", "alasan": "..." },
  "parts": [
    {
      "peran": "Hook",
      "cuts": [
        { "foto_id": 2101, "detik": 3,
          "kamera": "shot size + gerak kamera, BAHASA INGGRIS",
          "aksi": "apa yang dilakukan subjek & apa yang terlihat, BAHASA INGGRIS" }
      ],
      "dialog": "narasi Part ini dalam Bahasa Indonesia, 20 kata",
      "teks_layar": "teks overlay singkat untuk editor"
    }
  ]
}
Jumlah "parts" HARUS 3. Σ "detik" tiap Part HARUS 10.
"kamera" dan "aksi" BAHASA INGGRIS; "dialog" dan "teks_layar" BAHASA INDONESIA.
```

---

## 5. Prompt Google Flow yang dihasilkan kode saya

Kode merender JSON dari AI menjadi ini (**nol keputusan kreatif di tahap ini**):

```
Vertical 9:16 short-form video, 10 seconds, one continuous scene.

REFERENCE IMAGES (attached — follow them exactly, they are the source of truth):
[1] SUBJECT — the presenter. Keep the face, hairstyle, and outfit EXACTLY as in this image.
[2] SCENE — the real house facade seen from the street. Match its actual layout,
    materials and lighting. Do not redecorate it or substitute a different place.
Everything visible must come from these images. Do not add rooms, furniture, people,
graphics, text overlays or map insets that are not in them.

SUBJECT DESCRIPTION (must match image [1]): 25-year-old, Southeast Asian, woman,
wearing professional business attire, wearing a hijab.
LOCATION: an Indonesian rumah property in Depok, Sleman.

[00:00-00:03] Medium shot, slow push-in. She looks up at the two-storey facade. Filmed inside reference image [2].
[00:03-00:06] Wide shot, static. She walks towards the front door. Filmed inside reference image [2].
[00:06-00:10] Close-up, slow pan. She points at the symmetrical white columns. Filmed inside reference image [2].

Dialogue (spoken in Indonesian, warm mid-range female voice, relaxed conversational
delivery): "Rumah 492 meter di Mrican ini punya satu hal yang jarang ada di kelas segini."
Music: soft acoustic guitar, gentle and unhurried.
Ambient: quiet natural room tone, no crowd noise.

Style: warm golden color grade, soft afternoon light, shot on mirrorless camera look,
shallow depth of field, subtle film grain, natural handheld micro-jitter, 9:16 vertical.
Negative: subtitles, captions, burned-in text, watermark, logo, map overlay, infographic,
distorted hands, extra people, different room, CGI render, plastic skin, over-smoothed
skin, selfie stick, gimbal, camera in hand, mirror reflection of a camera.
```

---

## 6. Contoh hasil NYATA yang jelek (beserta diagnosis saya)

Prompt di bawah ini **benar-benar terkirim ke Flow** dan videonya buruk:

```
Vertical 9:16 short-form video, 10 seconds, single scene.

SUBJECT: 26-year-old, asia_tenggara, man, wearing profesional, wajah tampan,
badan berotot, gagah. Same face, same outfit, same voice in every part.
CONTEXT: an Indonesian komersial property in Jetis, Kota Yogyakarta.

[00:00-00:05] Wide shot, slow zoom in. Andi stands in front of the busy street corner,
pointing towards the property, camera at arm's length, selfie perspective, hands empty
Context: the house facade seen from the street.
[00:05-00:10] Medium shot, static. Andi gestures towards the digital map overlay,
showing the proximity to Tugu Jogja, camera at arm's length, selfie perspective,
hands empty Context: the interior space.

Dialogue (Indonesian, warm mid-range male voice): "Hanya lima ratus meter dari Tugu
Jogja, lahan hook delapan ratus tiga puluh tiga meter ini siap jadi hotel impian.
Yuk jadwalkan survei lokasi, biar lihat sendiri kondisinya."
```

**Cacat yang sudah saya temukan dan perbaiki sendiri:**

1. **Prompt tidak pernah menyebut foto referensi sama sekali** → Veo menganggap
   foto sebagai saran lepas dan mengarang ruangannya sendiri. (Sudah diperbaiki:
   lihat blok `REFERENCE IMAGES` di Bagian 5.)
2. **Data Indonesia mentah bocor** ke prompt Inggris: `asia_tenggara`,
   `wearing profesional`, `wajah tampan, badan berotot, gagah`. (Sudah
   diterjemahkan.)
3. **Instruksi kamera saling bertentangan**: "Wide shot" + "selfie perspective"
   di kalimat yang sama, tertempel di semua cut. (Sudah diperbaiki.)
4. **Halusinasi**: "lima ratus meter dari Tugu Jogja" — datanya cuma bilang
   "Dekat Tugu Jogja" tanpa angka. Juga "digital map overlay" yang tidak ada.
   (Sudah dipagari.)
5. **Terlalu banyak ruangan berbeda dalam satu klip 10 detik** → model dipaksa
   mengarang transisi. (Sudah dibatasi 1 ruangan per Part.)

**Yang MASIH belum saya pecahkan:** setelah semua itu diperbaiki, hasilnya
membaik tapi **masih kalah** dibanding storyboard yang saya minta langsung ke
ChatGPT. Berarti ada sesuatu yang lebih mendasar yang saya lewatkan.

---

## 7. Aturan yang sudah saya buktikan sendiri (jangan disarankan ulang)

Supaya jawaban Anda tidak mengulang yang sudah saya tahu:

- **Jangan menyuruh model "berbicara cepat / tanpa jeda"** → Veo membacanya
  sebagai arahan akting dan suaranya jadi robotik.
- **Panjang dialog adalah RENTANG, bukan plafon.** Ditulis "maksimal" saja
  membuat model bermain aman di bawahnya, dialog habis sebelum klip selesai,
  lalu Veo mengisi hening dengan mengulang frasa.
- **2,5 kata/detik** — dikalibrasi dari 6 storyboard yang videonya sudah terbukti
  bagus (VO 8 detik = 19–22 kata).
- **Voiceover = 80% durasi klip**, bukan 100%, supaya ada ruang napas.
- **Tipe CTA harus dikirim sebagai CONTOH KALIMAT**, bukan nama kategori —
  dengan label saja, AI mengarang ajakan kabur.
- **Harga hanya boleh di teks layar**, tidak diucapkan. Flow pernah menolak
  dialog yang memuat harga + ajakan + urgensi sekaligus.
- **Label ruangan Bahasa Indonesia dilarang bocor** ke prompt Inggris.
- **Nilai contoh di skema JSON harus angka nyata**, bukan `0` — model menyalin
  placeholder apa adanya.

---

## 8. YANG SAYA MINTA DARI ANDA

Tolong jawab **berurutan** dan sespesifik mungkin. Kalau Anda perlu mengoreksi
asumsi saya, koreksi saja — saya lebih butuh yang benar daripada yang enak
didengar.

### 8.1 Diagnosis perbedaan
Ketika saya meminta storyboard **langsung ke Anda**, hasilnya lebih bagus
daripada mesin saya — padahal mesin saya memberi Anda konteks yang jauh lebih
lengkap (fakta terverifikasi, skor foto, batasan gaya).
**Apa sebenarnya yang Anda lakukan berbeda?** Apakah masalahnya:
- prompt saya terlalu banyak aturan sehingga menekan kreativitas?
- struktur JSON yang kaku membunuh narasi?
- urutan informasi yang salah?
- atau memang ada langkah berpikir yang hilang (mis. tidak ada tahap
  "pikirkan dulu sudut ceritanya" sebelum menulis)?

### 8.2 Perbaikan prompt penyusun storyboard
Tulis ulang prompt di **Bagian 4** menjadi versi yang menurut Anda menghasilkan
storyboard jauh lebih baik. Boleh mengubah struktur, urutan, bahkan format
keluaran — asal tetap menghasilkan JSON yang bisa diparse mesin, dan tetap
menghormati batasan keras di Bagian 2.
Jelaskan **alasan** tiap perubahan besar.

### 8.3 Perbaikan prompt Google Flow
Tulis ulang template prompt di **Bagian 5**. Yang saya butuh khususnya:
- Bagaimana **mengikat 3 reference image** (Subject/Scene/Style) supaya Veo
  benar-benar mematuhinya, bukan sekadar terinspirasi?
- Apakah format **timestamp `[00:00-00:03]`** memang cara terbaik untuk beberapa
  shot dalam satu generate 10 detik, atau ada yang lebih efektif?
- Bagaimana menjaga **wajah, pakaian, dan suara presenter identik** di 3 generate
  terpisah yang tidak saling tahu?
- Apakah `Negative:` saya berlebihan atau kurang?

### 8.4 Struktur 3 × 10 detik
Dengan batasan 3 klip terpisah @10 detik yang digabung jadi 30 detik:
- Bagaimana pembagian **Hook / Body / CTA** yang terbaik?
- Berapa detik idealnya hook sebelum "membayar" rasa penasaran?
- Bagaimana membuat **sambungan antar klip** terasa mulus padahal digenerate
  terpisah? (Apakah ada trik prompt untuk frame awal/akhir?)

### 8.5 Retensi
Patokan yang saya pakai: TikTok 15–30 detik dianggap sehat di atas **50%**
retensi, kuat di atas **65%**; 63% video ber-CTR tertinggi mengunci penonton di
**3 detik pertama**.
- Untuk video **properti** khususnya, apa yang paling menentukan retensi?
- Apa kesalahan paling umum yang membuat penonton scroll di properti?
- Adakah pola hook yang terbukti untuk real estate short-form?

### 8.6 Sistem variasi
Saya memakai 5 sumbu (mekanisme × hook × ritme × mood × foto pembuka) yang
dipilih **kode**, bukan AI, supaya video untuk listing yang sama tidak pernah
kembar sampai 100 variasi.
- Apakah pendekatan ini masuk akal, atau justru **membelenggu** AI sehingga
  hasilnya kaku? (Ini kecurigaan terbesar saya.)
- Kalau membelenggu, apa alternatif yang tetap menjamin variasi tanpa
  mematikan kualitas?

### 8.7 Demonstrasi langsung — INI YANG PALING SAYA BUTUHKAN
Pakai data listing nyata di bawah ini, lalu **buatkan sendiri** storyboard
lengkap + 3 prompt Google Flow, dengan cara **yang menurut Anda paling benar**
(bebas, tidak perlu mengikuti format saya).

Setelah itu, **bandingkan** hasil Anda dengan format mesin saya di Bagian 4–5,
dan sebutkan **apa persisnya yang membuat versi Anda lebih baik**. Itulah yang
akan saya masukkan ke kode.

```
LISTING UJI
Judul     : Rumah Megah Link Premium Mrican, Demangan, Gejayan Dekat UNY, Sanatadharma
Jenis     : rumah, dijual
Harga     : Rp 6,2 miliar
Lokasi    : Kelurahan Caturtunggal, Kec. Depok, Kab. Sleman, Yogyakarta
Luas      : tanah 492 m², bangunan 400 m²
Kamar     : 4 kamar tidur, 4 kamar mandi
Lantai    : 2
Legalitas : SHM
Deskripsi : Dijual/Disewakan Rumah Megah Mrican, Demangan, Gejayan
            Dekat UNY, UAJY Hukum, Sanatadharma

FOTO TERSEDIA (dengan skor kelayakan video 0-100 dan catatan)
  [2101] Fasad        (88) fasad simetris dua lantai, cat putih bersih
  [2103] Ruang Tamu   (74) plafon tinggi, cahaya alami kuat dari jendela besar
  [2107] Dapur        (61) kitchen set granit menyatu dengan ruang makan
  [2110] Kamar Tidur  (55) kamar utama, jendela menghadap taman
  [2112] Taman/Halaman(40) halaman belakang berumput

PRESENTER : "Hana" — wanita 25 tahun, Asia Tenggara, berhijab,
            pakaian bisnis profesional. Wajah & pakaian diambil dari 1 foto
            referensi yang sama untuk ketiga Part.

TIDAK ADA (dilarang disebut): kolam renang, rooftop, gym, carport/garasi,
            walk-in closet, musholla, dan angka jarak/waktu tempuh ke mana pun.

TARGET    : TikTok 9:16, 3 Part × 10 detik = 30 detik, CTA "jadwalkan survei".
```

### 8.8 Satu hal yang paling penting
Kalau saya hanya boleh mengubah **SATU hal** di seluruh sistem ini untuk
menaikkan kualitas video paling besar — apa itu, dan kenapa?

---

## Lampiran: apa yang sudah otomatis diperiksa mesin saya

Supaya Anda tahu batas mana yang sudah dijaga kode (nol AI, deterministik):

| Pemeriksaan | Aturan |
|---|---|
| Anggaran kata | 90–110% dari 2,5 kata × detik VO |
| Hook konkret | dialog Part 1 harus memuat angka/ukuran/nama tempat |
| Bukan sapaan | Part 1 tidak boleh diawali "halo/hai/selamat/perkenalkan" |
| Teks layar | Part 1 dan Part terakhir wajib terisi |
| Harga tidak diucapkan | tidak ada pola rupiah/juta/miliar di dialog |
| Jarak tidak dikarang | angka "N meter/menit dari X" harus ada di fakta listing |
| CTA punya objek | Part terakhir memuat kata kerja ajakan sesuai tipe CTA |
| Ritme dipatuhi | jumlah cut per Part sesuai sumbu ritme yang dipilih sistem |
| Foto sah | setiap `foto_id` benar-benar ada, maks 2 foto properti per Part |

Yang **tidak** bisa diperiksa mesin — dan justru itu yang saya minta bantuan
Anda: **apakah ceritanya menarik, dan apakah orang mau menonton sampai habis.**
