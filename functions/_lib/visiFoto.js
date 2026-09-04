// Baca foto dari R2 → data URI base64, untuk dikirim ke model bervisi.
//
// ⚠️ HARUS base64, BUKAN URL. Diukur langsung ke API dengan key produksi
// (2026-08-19): endpoint OpenAI-compatible Gemini MENOLAK `image_url` berisi URL
// remote — selalu HTTP 400, bahkan untuk URL publik Wikipedia, di dua model,
// dengan maupun tanpa `reasoning_effort`. Yang diterima hanya data URI base64.
// Jangan "menyederhanakan" ini kembali jadi URL; itu jalan buntu yang sudah
// dibuktikan mahal sekali.
//
// Byte dibaca LANGSUNG dari R2 (`env.MEDIA.get(key)`), bukan lewat fetch ke
// /api/media: kolom `url_webp` MEMANG menyimpan key R2 (`property-photos/…`),
// jadi round-trip HTTP-nya murni pemborosan (~2 detik terukur).

/** Prefiks key R2 yang boleh dibaca — selaras allowlist di /api/media. */
const PREFIKS_AMAN = ['property-photos/', 'viralframe-characters/'];

function keDataUri(contentType, buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  // Dipecah 32 KB: String.fromCharCode dengan spread pada array besar
  // menabrak batas argumen JS engine.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${contentType};base64,${btoa(bin)}`;
}

/**
 * Satu foto → data URI. Mengembalikan null bila gagal (key asing, objek hilang).
 * Kegagalan satu foto TIDAK BOLEH menggagalkan seluruh lintasan — foto yang
 * gagal dibaca cukup dilewati.
 */
export async function fotoKeDataUri(env, key) {
  const k = String(key ?? '').trim();
  if (!k || !PREFIKS_AMAN.some(p => k.startsWith(p))) return null;
  try {
    const obj = await env.MEDIA.get(k);
    if (!obj) return null;
    return keDataUri(obj.httpMetadata?.contentType ?? 'image/webp', await obj.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Beberapa foto sekaligus, berurutan.
 *
 * ⚠️ Kembaliannya HANYA foto yang BERHASIL dibaca, lengkap dengan barisnya.
 * Ini penting: prompt visi menyatakan pemetaan posisi gambar ke daftar, jadi
 * kalau daftar yang dikirim lebih panjang daripada gambar yang benar-benar
 * terlampir, pemetaannya meleset DAN model ditawari foto yang tak pernah ia
 * lihat. Itu persis kelas halusinasi yang jadi alasan seluruh jalur base64 ini.
 */
export async function bacaFotoBatch(env, rows, maks) {
  const hasil = [];
  for (const r of rows) {
    if (hasil.length >= maks) break;
    const uri = await fotoKeDataUri(env, r.url_webp);
    if (uri) hasil.push({ row: r, uri });
  }
  return hasil;
}

/** Ambil objek JSON pertama dari balasan model (buang pagar ```json dan basa-basi). */
export function uraiJsonModel(raw) {
  let txt = String(raw ?? '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const awal = txt.indexOf('{');
  const akhir = txt.lastIndexOf('}');
  if (awal < 0 || akhir <= awal) return null;
  try { return JSON.parse(txt.slice(awal, akhir + 1)); } catch { return null; }
}
