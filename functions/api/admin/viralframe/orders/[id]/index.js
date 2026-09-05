// PATCH  /api/admin/viralframe/orders/:id — ubah status / params pesanan
// DELETE /api/admin/viralframe/orders/:id — batalkan pesanan
//
// Bagian dari PESANAN PRODUKSI (M1, migrasi 0046).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
// ⚠️ KONTRAK K3 (BEKU): `renderPromptFlow` sekarang tinggal di `flowCompiler.js`
// (rencana v2) — `stasiunStoryboard.js` sudah tidak lagi mengekspornya.
import { renderPromptFlow } from '../../../../../_lib/flowCompiler.js';
import { periksaRetensi } from '../../../../../_lib/retensi.js';

// Sama persis dengan daftar di orders/index.js. Sengaja diulang di sini alih-alih
// diimpor dari sana: file index.js adalah HANDLER route, mengimpornya dari sini
// berarti memuat handler lain hanya untuk sebuah konstanta. Kalau daftar ini
// tumbuh, pindahkan ke functions/_lib/ dan impor dari KEDUA tempat.
const STATUS_SAH = [
  'baru', 'material', 'variasi', 'konsep', 'storyboard', 'menunggu_render',
  'selesai', 'gagal', 'batal',
];

function ambilId(params) {
  const id = parseInt(params?.id ?? '', 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET — satu pesanan LENGKAP dengan hasil stasiunnya.
// `hasil_json` sengaja TIDAK ikut di endpoint daftar: isinya storyboard penuh
// + 3 prompt Google Flow, dan mengirimnya untuk 200 baris sekaligus akan
// membuat layar antrean mengunduh ratusan KB yang tidak dipakai.
export async function onRequestGet({ env, params }) {
  const id = ambilId(params);
  if (id == null) return jsonError('id pesanan tidak valid', 400);
  try {
    const row = await env.DB.prepare(
      `SELECT o.id, o.property_id, o.character_id, o.status, o.variation_key,
              o.params_json, o.hasil_json, o.catatan, o.video_id, o.created_at, o.updated_at,
              p.kode_listing, p.title, c.nama AS agent_nama
         FROM viralframe_orders o
         JOIN properties p            ON p.id = o.property_id
         JOIN viralframe_characters c ON c.id = o.character_id
        WHERE o.id = ?`
    ).bind(id).first();
    if (!row) return jsonError('Pesanan tidak ditemukan', 404);
    let hasil = null;
    try { hasil = row.hasil_json ? JSON.parse(row.hasil_json) : null; } catch { hasil = null; }
    return jsonOk({ ...row, hasil_json: undefined, hasil });
  } catch (err) {
    console.error('[vf orders GET one]', err.message);
    return jsonError('Gagal mengambil pesanan', 500);
  }
}

export async function onRequestPatch({ request, env, params }) {
  const id = ambilId(params);
  if (id == null) return jsonError('id pesanan tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const set = [];
  const bind = [];

  if (typeof body.status === 'string') {
    if (!STATUS_SAH.includes(body.status)) {
      return jsonError(`Status tidak dikenal. Yang sah: ${STATUS_SAH.join(', ')}`, 422);
    }
    set.push('status = ?'); bind.push(body.status);
  }
  if (body.params && typeof body.params === 'object') {
    set.push('params_json = ?'); bind.push(JSON.stringify(body.params));
  }
  if (typeof body.catatan === 'string') {
    set.push('catatan = ?'); bind.push(body.catatan.slice(0, 1000));
  }
  if (body.video_id === null || Number.isInteger(body.video_id)) {
    set.push('video_id = ?'); bind.push(body.video_id);
  }
  // Hasil pipeline yang sudah disunting manusia (mis. hook diganti lewat Adu
  // Hook). Dikirim UTUH, bukan sebagian: pemanggil yang mengirim potongan akan
  // menghapus prompt Flow dan caption yang sudah ada di objek yang sama.
  //
  // ⚠️ Dibatasi ukurannya. `hasil_json` memuat storyboard + 3 prompt Flow, dan
  // tanpa batas, satu payload rusak bisa menggemukkan baris yang ikut terbaca
  // setiap kali antrean dimuat.
  let hasilBaru = null;
  if (body.hasil && typeof body.hasil === 'object' && !Array.isArray(body.hasil)) {
    hasilBaru = body.hasil;
    if (JSON.stringify(hasilBaru).length > 120000) {
      return jsonError('Hasil terlalu besar untuk disimpan', 413);
    }
  }
  if (!hasilBaru && set.length === 0) return jsonError('Tidak ada field yang bisa diubah', 422);

  try {
    // ⚠️ `prompt_flow` dan `retensi` SELALU DITURUNKAN ULANG dari `parts`,
    // tidak pernah diterima apa adanya dari klien.
    //
    // Tanpa ini, mengganti hook lewat Adu Hook memperbarui `parts` tapi
    // MENINGGALKAN prompt Google Flow yang masih memuat dialog lama — dan satu-
    // satunya cara membuatnya ulang (tombol "Buat Storyboard") justru membuat
    // pesanan dengan variasi BARU, sehingga hook yang baru dipilih ikut terbuang.
    // Fiturnya jadi mustahil dipakai sampai tuntas.
    //
    // Karena `renderPromptFlow()` deterministik dan nol logika kreatif, menurunkan
    // ulang di sini aman dan membuat prompt tak mungkin melenceng dari storyboard.
    if (hasilBaru && Array.isArray(hasilBaru.parts) && hasilBaru.parts.length > 0) {
      const prop = await env.DB.prepare(
        `SELECT p.id, p.jenis_properti, p.kecamatan, p.kabupaten
           FROM viralframe_orders o JOIN properties p ON p.id = o.property_id
          WHERE o.id = ?`
      ).bind(id).first();
      if (prop) {
        const params = hasilBaru.params ?? {};
        // `hasil_json` menyimpan `dna_agent` (snake), renderer membaca `dnaAgent`.
        // Kontrak K3: `ir = { parts, konsep, dnaAgent|null, variasi }` — `konsep`
        // ikut disertakan (bukan cuma `dna`) karena flowCompiler tidak membacanya,
        // tapi kontraknya BEKU dan pemanggil lain (jalankan.js) selalu mengisinya.
        const ir = {
          parts: hasilBaru.parts,
          konsep: hasilBaru.konsep ?? null,
          // `mood` dipulihkan dari Creative DNA bila `variasi` tersimpan belum
          // membawanya — pesanan yang dibuat SEBELUM mood masuk DNA (2026-09-05)
          // akan kehilangan warna & musiknya setiap kali prompt dirender ulang,
          // dan diamnya kegagalan itu persis yang membuatnya luput pertama kali.
          variasi: {
            ...(hasilBaru.variasi ?? {}),
            mood: hasilBaru.variasi?.mood ?? hasilBaru.konsep?.dna?.mood ?? 'hangat',
          },
          dnaAgent: hasilBaru.dna_agent ?? null,
        };
        const faceless = Boolean(params.faceless);
        hasilBaru = {
          ...hasilBaru,
          prompt_flow: renderPromptFlow({ ir, prop, params, faceless }),
          retensi: periksaRetensi({ ir, params, dna: hasilBaru.dna ?? null }),
        };
      }
    }

    if (hasilBaru) { set.push('hasil_json = ?'); bind.push(JSON.stringify(hasilBaru)); }
    set.push("updated_at = datetime('now')");

    const res = await env.DB.prepare(
      `UPDATE viralframe_orders SET ${set.join(', ')} WHERE id = ?`
    ).bind(...bind, id).run();
    if ((res.meta?.changes ?? 0) === 0) return jsonError('Pesanan tidak ditemukan', 404);
    return jsonOk({ id, diubah: true, prompt_dibuat_ulang: Boolean(hasilBaru?.prompt_flow) });
  } catch (err) {
    console.error('[vf orders PATCH]', err.message);
    return jsonError('Gagal mengubah pesanan', 500);
  }
}

export async function onRequestDelete({ env, params }) {
  const id = ambilId(params);
  if (id == null) return jsonError('id pesanan tidak valid', 400);

  try {
    // Dihapus, bukan ditandai 'batal': pesanan yang dibatalkan sebelum menghasilkan
    // apa pun tidak menyimpan informasi yang berguna, dan membiarkannya menumpuk
    // membuat layar antrean penuh baris mati. Pesanan yang SUDAH menghasilkan video
    // tidak bisa dihapus (lihat penjaga di bawah) — jejaknya masih dipakai metrik.
    const row = await env.DB.prepare(
      'SELECT status, video_id FROM viralframe_orders WHERE id = ?'
    ).bind(id).first();
    if (!row) return jsonError('Pesanan tidak ditemukan', 404);
    if (row.video_id != null) {
      return jsonError('Pesanan ini sudah menghasilkan video — hapus videonya lewat Konten Agent, bukan dari antrean.', 422);
    }

    await env.DB.prepare('DELETE FROM viralframe_orders WHERE id = ?').bind(id).run();
    return jsonOk({ id, dihapus: true });
  } catch (err) {
    console.error('[vf orders DELETE]', err.message);
    return jsonError('Gagal membatalkan pesanan', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
