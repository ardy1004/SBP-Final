// POST /api/admin/ai/generate-description
// Auth via functions/api/admin/_middleware.js (cookie session)

function formatHarga(harga) {
  if (!harga || harga <= 0) return null;
  if (harga >= 1_000_000_000) {
    const miliar = harga / 1_000_000_000;
    return `Rp ${miliar % 1 === 0 ? miliar : miliar.toFixed(1).replace('.', ',')} Miliar`;
  }
  if (harga >= 1_000_000) {
    const juta = harga / 1_000_000;
    return `Rp ${juta % 1 === 0 ? juta : juta.toFixed(0)} Juta`;
  }
  return `Rp ${harga.toLocaleString('id-ID')}`;
}

function truncateAtWord(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  const cut = str.lastIndexOf(' ', maxLen);
  return cut > 0 ? str.slice(0, cut) : str.slice(0, maxLen);
}

// Menghasilkan deskripsi kamar yang tepat per jenis properti agar AI tidak salah sebut.
function buildKamarDesc(jenis_properti, kamar_tidur, kamar_mandi) {
  const kt = kamar_tidur ? Number(kamar_tidur) : null;
  const km = kamar_mandi ? Number(kamar_mandi) : null;
  const jenis = (jenis_properti ?? '').toLowerCase();

  // Jenis yang tidak relevan dengan kamar — skip
  if (['tanah', 'ruko', 'gudang', 'komersial'].includes(jenis)) return null;

  if (!kt && !km) return null;

  if (jenis === 'kost') {
    if (kt && km && kt === km) {
      return `${kt} kamar tidur masing-masing dengan kamar mandi dalam (en-suite)`;
    }
    const parts = [];
    if (kt) parts.push(`${kt} kamar tidur`);
    if (km) parts.push(`${km} kamar mandi`);
    return parts.join(', ');
  }

  if (jenis === 'hotel') {
    const parts = [];
    if (kt) parts.push(`${kt} unit kamar`);
    if (km) parts.push(`${km} kamar mandi`);
    return parts.join(', ');
  }

  // rumah, villa, homestay, apartment
  const parts = [];
  if (kt) parts.push(`${kt} kamar tidur (KT)`);
  if (km) parts.push(`${km} kamar mandi (KM)`);
  return parts.join(', ');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    jenis_properti, tujuan, harga, kecamatan, kabupaten, provinsi,
    luas_tanah, luas_bangunan, kamar_tidur, kamar_mandi,
    legalitas, nego, furnished,
  } = body;

  if (!kecamatan || !kabupaten) {
    return Response.json(
      { error: 'Lengkapi data lokasi terlebih dahulu' },
      { status: 422 }
    );
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'DEEPSEEK_API_KEY tidak dikonfigurasi' }, { status: 500 });
  }

  const hargaReadable = formatHarga(harga) ?? 'Harga tidak tersedia';
  const kamarDesc = buildKamarDesc(jenis_properti, kamar_tidur, kamar_mandi);
  const lokasiStr = [kecamatan, kabupaten, provinsi].filter(Boolean).join(', ');

  const userPrompt = [
    'Data properti:',
    `- Jenis: ${jenis_properti ?? '-'}`,
    `- Tujuan: ${tujuan ?? '-'}`,
    `- Harga: ${hargaReadable}${nego ? ' (bisa nego)' : ' (harga tetap)'}`,
    `- Lokasi: ${lokasiStr}`,
    `- Luas Tanah: ${luas_tanah ? luas_tanah + ' m²' : 'tidak tersedia'}`,
    `- Luas Bangunan: ${luas_bangunan ? luas_bangunan + ' m²' : 'tidak tersedia'}`,
    `- Kamar: ${kamarDesc ?? 'tidak tersedia'}`,
    `- Legalitas: ${legalitas ?? 'tidak tersedia'}`,
    `- Furnished: ${furnished ? String(furnished) : 'tidak disebutkan'}`,
    '',
    'Generate konten sesuai aturan system prompt.',
  ].join('\n');

  const systemPrompt = `Kamu adalah copywriter properti profesional Indonesia yang ahli SEO lokal. Tugas: hasilkan konten listing properti berkualitas tinggi dari data yang diberikan.

ATURAN JUDUL (field: judul):
- Max 60 karakter STRICT — hitung karakter sebelum output
- Wajib mengandung: jenis properti + tujuan + lokasi (kecamatan/kabupaten)
- Jika ada angka unit/kamar yang signifikan, WAJIB disebut (contoh: 23 Kamar, 5 Unit)
- Jika ada keunggulan unik dari data (Fully Furnished, SHM, dekat landmark), MASUKKAN jika muat
- DILARANG: tanda seru, ALL CAPS, kata murah/terbaik/nomor1/eksklusif/premium/mewah
- Contoh BAIK: Kost 23 Kamar Furnished Dijual Depok Sleman
- Contoh BURUK: KOST EKSKLUSIF MEWAH TERBAIK DI SLEMAN!

ATURAN META_TITLE (field: meta_title):
- Max 60 karakter STRICT
- Format: [Judul dipersingkat] | Salam Bumi Property
- Potong judul dari kanan jika melebihi, JANGAN potong suffix brand
- Contoh: Kost 23 Kamar Furnished Depok | Salam Bumi Property

ATURAN DESKRIPSI (field: deskripsi):
- 150-350 kata total
- WAJIB 4 paragraf terpisah dengan baris kosong antar paragraf:
  P1 — Opening (2-3 kalimat): sebut jenis properti + tujuan + lokasi lengkap (kecamatan, kabupaten) + harga jika tersedia. Masukkan keyword lokasi di kalimat pertama.
  P2 — Spesifikasi (3-4 kalimat): sebut luas tanah/bangunan (jika ada), detail kamar SESUAI JENIS PROPERTI (gunakan deskripsi kamar dari input persis seperti yang diberikan), legalitas, kondisi furnished/unfurnished jika ada.
  P3 — Keunggulan Lokasi (2-3 kalimat): akses ke landmark/fasilitas terdekat, kemudahan transportasi, potensi investasi jika properti komersial/kost/hotel.
  P4 — CTA Soft (1-2 kalimat): ajak kontak untuk survei. DILARANG: kata tidak boleh dilewatkan, segera, terbatas, investasi terbaik.
- Kalimat aktif (bukan pasif). Keyword lokasi max 3x. Bahasa Indonesia formal namun tidak kaku.
- KHUSUS PER JENIS:
  Kost/Hotel/Homestay/Villa: P3 wajib sebut potensi pendapatan sewa atau yield investasi
  Tanah: P2 tidak perlu sebut kamar, fokus luas + peruntukan + kontur
  Ruko/Gudang/Komersial: P2 fokus luas + akses kendaraan + zonasi
  Rumah/Apartment: P2 sebut KT dan KM terpisah, sebut furnished status

ATURAN META_DESCRIPTION (field: meta_description):
- Max 155 karakter STRICT — hitung karakter, potong di batas kata bukan tengah kata
- Wajib mengandung: jenis properti + lokasi + 1 spesifikasi utama + 1 CTA singkat
- JANGAN ulangi kesalahan: pastikan sebutan kamar sesuai jenis (kamar tidur bukan kamar mandi untuk kost)
- Contoh BAIK (128 karakter): Kost dijual di Depok, Sleman. 23 kamar tidur en-suite, SHM, luas 800 m². Strategis dekat kampus. Hubungi untuk survei.
- Contoh BURUK: Kost dijual di Depok Sleman, luas 800 m², 23 kamar mandi, legalitas SHM.

FORMAT RESPONSE:
Respond HANYA dengan JSON valid, tanpa markdown, tanpa komentar, tanpa penjelasan apapun di luar JSON:
{"judul": "...", "deskripsi": "...", "meta_title": "...", "meta_description": "..."}`;

  let dsRes;
  try {
    dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 1200,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    return Response.json({ error: `Gagal menghubungi DeepSeek: ${err.message}` }, { status: 502 });
  }

  if (!dsRes.ok) {
    const errText = await dsRes.text().catch(() => '');
    return Response.json({ error: `DeepSeek error ${dsRes.status}: ${errText}` }, { status: 502 });
  }

  const dsJson = await dsRes.json();
  const raw = dsJson.choices?.[0]?.message?.content ?? '';

  let parsed;
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return Response.json({ error: 'DeepSeek tidak mengembalikan JSON valid', raw }, { status: 502 });
  }

  const judul = truncateAtWord(String(parsed.judul ?? ''), 60);
  const meta_title = truncateAtWord(String(parsed.meta_title ?? ''), 60);
  const meta_description = truncateAtWord(String(parsed.meta_description ?? ''), 155);
  const deskripsi = String(parsed.deskripsi ?? '');

  return Response.json({ judul, deskripsi, meta_title, meta_description });
}
