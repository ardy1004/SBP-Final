// GET  /api/admin/viralframe/characters — list semua karakter (created_at DESC)
// POST /api/admin/viralframe/characters — tambah karakter baru
//   Body JSON: { nama, foto (data:image/webp;base64,...), gender?, usia?, etnik?, style?, ciri_fisik? }
//   Foto di-upload ke R2 dengan prefix 'viralframe-characters/'.
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonCreated, jsonError, handleOptions } from '../../../_shared/response.js';
import { parseSpesialis, getModeAkun } from '../../../../_lib/agentAccounts.js';

const WEBP_PREFIX = 'data:image/webp;base64,';
// ~2.2MB terdekode (base64 ~4/3x lebih besar dari biner) — client sudah downscale
// ke 1024px sebelum kirim (Stage 2, CharacterStep.tsx), jadi upload wajar jauh di
// bawah ini. Cap ini murni jaring pengaman payload/CPU (audit 2026-07-28) —
// sebelumnya tidak ada batas ukuran sama sekali, atob() bisa dipanggil dengan
// string sembarang besar.
const MAX_BASE64_LEN = 3_000_000;
// Magic bytes WebP: 'RIFF' di byte 0-3, 'WEBP' di byte 8-11 (spec RIFF container).
// Sebelumnya cuma prefix data-URI yang dicek (data:image/webp;base64,) — payload
// APAPUN dengan prefix itu lolos meski isinya bukan gambar WebP sungguhan.
function isValidWebpMagic(bytes) {
  if (bytes.length < 12) return false;
  const s = i => String.fromCharCode(bytes[i]);
  return s(0) + s(1) + s(2) + s(3) === 'RIFF' && s(8) + s(9) + s(10) + s(11) === 'WEBP';
}

function sanitize(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    // spesialis + kesiapan storage ikut di sini (migrasi 0037) supaya dropdown
    // "Karakter / Agent" di Upload Hasil bisa menyarankan agent yang cocok
    // dengan jenis properti tanpa request kedua. LEFT JOIN: karakter tanpa
    // baris akun (mis. Vina) tetap muncul.
    const result = await env.DB.prepare(`
      SELECT c.id, c.nama, c.foto_url, c.gender, c.usia, c.etnik, c.style, c.ciri_fisik, c.created_at,
             a.spesialis,
             (a.cloudinary_name IS NOT NULL AND a.cloudinary_api_key IS NOT NULL AND a.cloudinary_api_secret IS NOT NULL) AS storage_siap
      FROM viralframe_characters c
      LEFT JOIN viralframe_agent_accounts a ON a.character_id = c.id
      ORDER BY c.created_at DESC, c.id DESC
    `).all();

    const items = (result.results ?? []).map(r => ({
      ...r,
      spesialis: parseSpesialis(r.spesialis),
      storage_siap: !!r.storage_siap,
    }));
    // mode ikut di sini supaya form Upload Hasil tahu apakah aturan spesialis
    // sedang berlaku — tanpa request kedua. Saat 'terpusat', semua upload
    // mendarat di akun agent utama dan pembatasan spesialis tidak aktif.
    const { mode, utama } = await getModeAkun(env);
    return jsonOk({ items, total: items.length, mode, utama });
  } catch (err) {
    console.error('[viralframe characters GET]', err.message);
    return jsonError('Gagal mengambil data karakter', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const nama = sanitize(body.nama ?? '', 120);
  if (!nama) return jsonError('nama tidak boleh kosong', 422);

  const photo = body?.foto;
  if (typeof photo !== 'string' || !photo) {
    return jsonError('Field foto wajib diisi', 422);
  }
  if (!photo.startsWith(WEBP_PREFIX)) {
    return jsonError('Foto harus berformat WebP (data:image/webp;base64,...)', 422);
  }
  if (photo.length - WEBP_PREFIX.length > MAX_BASE64_LEN) {
    return jsonError('Ukuran foto terlalu besar (maks ~2MB setelah decode)', 413);
  }

  let uploadBuf, uploadBytes;
  try {
    const binaryStr = atob(photo.slice(WEBP_PREFIX.length));
    uploadBytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
    uploadBuf = uploadBytes.buffer;
  } catch {
    return jsonError('Gagal decode base64 foto', 400);
  }
  if (!isValidWebpMagic(uploadBytes)) {
    return jsonError('Isi foto bukan file WebP yang valid', 422);
  }

  const gender     = sanitize(body.gender ?? '', 30) || null;
  const usia       = Number.isInteger(body.usia) ? body.usia : (parseInt(body.usia, 10) || null);
  const etnik      = sanitize(body.etnik ?? '', 60) || null;
  const style      = sanitize(body.style ?? '', 120) || null;
  const ciri_fisik = sanitize(body.ciri_fisik ?? '', 500) || null;

  const r2Key = `viralframe-characters/${crypto.randomUUID()}.webp`;

  try {
    await env.MEDIA.put(r2Key, uploadBuf, { httpMetadata: { contentType: 'image/webp' } });
  } catch (err) {
    console.error('[viralframe characters POST upload]', err.message);
    return jsonError('Gagal menyimpan foto', 500);
  }

  try {
    const res = await env.DB.prepare(`
      INSERT INTO viralframe_characters
        (nama, foto_url, gender, usia, etnik, style, ciri_fisik)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(nama, r2Key, gender, usia, etnik, style, ciri_fisik).run();

    const newRow = await env.DB
      .prepare('SELECT * FROM viralframe_characters WHERE id = ?')
      .bind(res.meta.last_row_id)
      .first();

    return jsonCreated({ pesan: 'Karakter berhasil ditambahkan', karakter: newRow });
  } catch (err) {
    console.error('[viralframe characters POST]', err.message);
    await env.MEDIA.delete(r2Key).catch(() => {});
    return jsonError('Gagal menyimpan karakter', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
