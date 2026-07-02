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
    legalitas, nego, kondisi, fasilitas,
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

  const hargaReadable = formatHarga(harga);
  const parts = [
    `Jenis properti: ${jenis_properti ?? '-'}`,
    `Tujuan: ${tujuan ?? '-'}`,
    hargaReadable ? `Harga: ${hargaReadable}${nego ? ' (nego)' : ''}` : 'Harga: -',
    `Lokasi: ${kecamatan}, ${kabupaten}${provinsi ? ', ' + provinsi : ''}`,
    luas_tanah    ? `Luas tanah: ${luas_tanah} m²` : null,
    luas_bangunan ? `Luas bangunan: ${luas_bangunan} m²` : null,
    kamar_tidur   ? `Kamar tidur: ${kamar_tidur}` : null,
    kamar_mandi   ? `Kamar mandi: ${kamar_mandi}` : null,
    legalitas     ? `Legalitas: ${legalitas}` : null,
    kondisi       ? `Kondisi: ${kondisi}` : null,
    fasilitas     ? `Fasilitas: ${fasilitas}` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `Kamu adalah copywriter properti profesional SEO Indonesia. Tugas: generate judul listing, deskripsi, meta_title, dan meta_description dari data properti. ATURAN WAJIB: (1) JUDUL: max 60 karakter, format [Jenis] [Tujuan] di [Kecamatan] [Kabupaten], keyword lokasi wajib ada di 5 kata pertama, DILARANG: ALL CAPS, tanda seru, kata murah/terbaik/nomor1. (2) META_TITLE: max 60 karakter, format [Judul singkat] | Salam Bumi Property, potong judul jika perlu tapi jangan potong suffix. (3) DESKRIPSI: 150-350 kata, WAJIB 4 paragraf: P1=opening dengan keyword+lokasi+harga jika ada (2-3 kalimat), P2=spesifikasi lengkap luas/kamar/fasilitas/legalitas (3-4 kalimat), P3=keunggulan lokasi dan akses (2-3 kalimat), P4=CTA soft tanpa harga (1-2 kalimat). Keyword lokasi max 3x pengulangan. Gunakan kalimat aktif. (4) META_DESCRIPTION: STRICT max 155 karakter, potong di batas kata bukan tengah kalimat, wajib mengandung jenis properti+lokasi+1 CTA singkat. Respond HANYA dengan JSON valid tanpa markdown, tanpa penjelasan: {"judul": "...", "deskripsi": "...", "meta_title": "...", "meta_description": "..."}`;

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
          { role: 'user', content: parts },
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
