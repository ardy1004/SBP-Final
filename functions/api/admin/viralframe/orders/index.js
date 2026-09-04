// GET  /api/admin/viralframe/orders?character_id=&status=  — antrean pesanan
// POST /api/admin/viralframe/orders                        — antrekan N listing sekaligus
//
// PESANAN PRODUKSI (M1, migrasi 0046). Satu baris = satu video yang sedang
// dibuat, dari dipesan sampai tayang. Ini yang menggantikan "state wizard di
// React" sebagai sumber kebenaran pekerjaan — lihat komentar panjang di
// migrations/0046_viralframe_orders.sql untuk alasan lengkapnya.
//
// Auth: _middleware.js

import { jsonOk, jsonError, jsonCreated, handleOptions } from '../../../_shared/response.js';
import { logServerError } from '../../../../_lib/logError.js';

// Status yang dianggap "masih dikerjakan" — dipakai penjaga kuota & layar antrean.
const STATUS_TERBUKA = ['baru', 'material', 'variasi', 'konsep', 'storyboard', 'menunggu_render'];
const STATUS_SAH = [...STATUS_TERBUKA, 'selesai', 'gagal', 'batal'];

// ⚠️ PENJAGA KUOTA — bukan angka karangan.
// Kapasitas render nyata dibatasi Google Flow mode gratis: 3 generate per akun,
// dan satu video memakai 3 Part = 3 generate. Jadi satu agent hanya bisa
// menyelesaikan ±1 video per siklus. Mengantre jauh lebih banyak dari itu
// menghasilkan tumpukan yang tidak akan pernah dirender — antrean yang bohong.
// Angkanya dilonggarkan jadi 5 (±5 hari produksi) supaya masih bisa menyiapkan
// stok beberapa hari ke depan tanpa membuat tumpukan mati.
// Kalau kuota Flow berubah (akun berbayar), naikkan DI SINI saja.
const MAKS_PESANAN_TERBUKA_PER_AGENT = 5;

// Batas D1: 100 bound parameter per query. Satu pesanan memakai beberapa bind,
// jadi jumlah listing per permintaan dibatasi jauh di bawah itu.
const MAKS_LISTING_PER_PERMINTAAN = 20;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const characterId = parseInt(url.searchParams.get('character_id') ?? '', 10);
  const status = url.searchParams.get('status') ?? '';

  const where = [];
  const bind = [];
  if (Number.isInteger(characterId) && characterId > 0) { where.push('o.character_id = ?'); bind.push(characterId); }
  if (status === 'terbuka') {
    where.push(`o.status IN (${STATUS_TERBUKA.map(() => '?').join(',')})`);
    bind.push(...STATUS_TERBUKA);
  } else if (STATUS_SAH.includes(status)) {
    where.push('o.status = ?'); bind.push(status);
  }

  try {
    const res = await env.DB.prepare(`
      SELECT o.id, o.property_id, o.character_id, o.status, o.variation_key,
             o.params_json, o.catatan, o.video_id, o.created_at, o.updated_at,
             p.kode_listing, p.title, p.jenis_properti,
             c.nama AS agent_nama, c.foto_url AS agent_foto,
             (SELECT pi.url_webp FROM property_images pi
               WHERE pi.property_id = p.id
               ORDER BY pi.is_cover DESC, pi.urutan ASC LIMIT 1) AS cover_url
        FROM viralframe_orders o
        JOIN properties p             ON p.id = o.property_id
        JOIN viralframe_characters c  ON c.id = o.character_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY o.created_at DESC
       LIMIT 200
    `).bind(...bind).all();

    return jsonOk({ items: res.results ?? [], total: (res.results ?? []).length });
  } catch (err) {
    console.error('[vf orders GET]', err.message);
    return jsonError('Gagal mengambil antrean pesanan', 500);
  }
}

export async function onRequestPost({ request, env }) {
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const characterId = parseInt(body.character_id, 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('character_id wajib', 422);

  const ids = Array.isArray(body.property_ids)
    ? [...new Set(body.property_ids.map(x => parseInt(x, 10)).filter(n => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length === 0) return jsonError('Pilih minimal 1 listing untuk diantrekan', 422);
  if (ids.length > MAKS_LISTING_PER_PERMINTAAN) {
    return jsonError(`Maksimal ${MAKS_LISTING_PER_PERMINTAAN} listing sekali antre.`, 422);
  }

  // Lima parameter opsional. Tidak diisi = pakai default lapis konstanta
  // (3 Part × 10 detik, VO 80%, 9:16, Google Flow) yang dihitung di hilir —
  // JANGAN menyalin defaultnya ke sini, nanti jadi sumber kebenaran kedua.
  const params = body.params && typeof body.params === 'object' ? body.params : null;

  try {
    const agent = await env.DB.prepare(
      'SELECT id, nama FROM viralframe_characters WHERE id = ?'
    ).bind(characterId).first();
    if (!agent) return jsonError('Agent tidak ditemukan', 404);

    // Penjaga kuota: hitung pesanan yang MASIH DIKERJAKAN untuk agent ini.
    const hitung = await env.DB.prepare(`
      SELECT COUNT(*) AS n FROM viralframe_orders
       WHERE character_id = ? AND status IN (${STATUS_TERBUKA.map(() => '?').join(',')})
    `).bind(characterId, ...STATUS_TERBUKA).first();
    const terbuka = hitung?.n ?? 0;
    const sisa = MAKS_PESANAN_TERBUKA_PER_AGENT - terbuka;
    if (sisa <= 0) {
      return jsonError(
        `${agent.nama} sudah punya ${terbuka} pesanan yang belum selesai (batas ${MAKS_PESANAN_TERBUKA_PER_AGENT}). `
        + 'Selesaikan atau batalkan dulu sebagian — kuota Google Flow gratis hanya cukup untuk ±1 video per agent per hari.',
        422,
      );
    }

    // Listing yang SUDAH punya pesanan terbuka untuk agent yang sama dilewati —
    // mengantre listing yang sama dua kali hanya menghasilkan dua video kembar.
    const sudahAda = await env.DB.prepare(`
      SELECT property_id FROM viralframe_orders
       WHERE character_id = ? AND status IN (${STATUS_TERBUKA.map(() => '?').join(',')})
    `).bind(characterId, ...STATUS_TERBUKA).all();
    const dilewati = new Set((sudahAda.results ?? []).map(r => r.property_id));

    const kandidat = ids.filter(id => !dilewati.has(id));
    const diterima = kandidat.slice(0, sisa);
    const ditolakKuota = kandidat.length - diterima.length;

    if (diterima.length === 0) {
      return jsonError(
        dilewati.size > 0
          ? 'Semua listing yang dipilih sudah punya pesanan yang belum selesai untuk agent ini.'
          : 'Tidak ada listing yang bisa diantrekan.',
        422,
      );
    }

    const stmt = env.DB.prepare(
      `INSERT INTO viralframe_orders (property_id, character_id, status, params_json)
       VALUES (?, ?, 'baru', ?)`
    );
    const hasil = await env.DB.batch(
      diterima.map(pid => stmt.bind(pid, characterId, params ? JSON.stringify(params) : null)),
    );

    // ⚠️ `ids` WAJIB dikembalikan, dan urutannya sejajar dengan `diterima`.
    // Meja kerja membuat pesanan lalu LANGSUNG menjalankan stasiunnya, jadi ia
    // butuh id-nya seketika. Tanpa ini klien harus menebak lewat GET ulang, dan
    // dua tab yang mengantre listing sama akan saling merebut baris yang salah.
    const ids = (hasil ?? []).map(r => r?.meta?.last_row_id ?? null);

    return jsonCreated({
      ids,
      dibuat: diterima.length,
      dilewati_sudah_antre: ids.length - kandidat.length,
      ditolak_kuota: ditolakKuota,
      sisa_kuota: sisa - diterima.length,
      pesan: `${diterima.length} pesanan diantrekan untuk ${agent.nama}.`,
    });
  } catch (err) {
    console.error('[vf orders POST]', err.message);
    await logServerError(env, {
      source: 'server',
      message: `[viralframe] orders: gagal mengantrekan — ${err.message}`,
      stack: err.stack,
      url: '/api/admin/viralframe/orders',
      context: { character_id: characterId, jumlah_listing: ids.length },
    });
    return jsonError('Gagal mengantrekan pesanan', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
