// GET   /api/admin/settings/scheduler-config — jendela primetime (WIB)
// PATCH /api/admin/settings/scheduler-config — simpan jendela
// Auth: _middleware.js
//
// Menggantikan preset 5 slot tetap (migrasi 0041). Sekarang yang diatur adalah
// RENTANG jam, bukan jam persis: menit sebenarnya diundi ber-seed di dalam
// rentang itu, dan tiap platform digeser lagi beberapa menit — supaya kelima
// platform tidak lagi terbit pada detik yang sama seperti dulu.
//
// Key & channel ID tidak ada di sini sejak 0037/0038 — itu milik tiap agent.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { setSetting } from '../../../_lib/schedulerProviders.js';
import { TANGGA_PLATFORM, getJendela } from '../../../_lib/jadwalOtomatis.js';

const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const keMenit = (j) => Number(j.slice(0, 2)) * 60 + Number(j.slice(3));

// Jendela harus lebih panjang dari tangga geseran platform, kalau tidak platform
// paling belakang tidak punya ruang dan semuanya menumpuk di batas akhir.
const MIN_PANJANG = Math.max(...TANGGA_PLATFORM) + 10;

export async function onRequestGet({ env }) {
  return jsonOk({ jendela: await getJendela(env), min_panjang_menit: MIN_PANJANG });
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid', 400); }

  const j = body.jendela;
  if (!Array.isArray(j) || j.length === 0 || j.length > 6) {
    return jsonError('Butuh 1–6 jendela', 422);
  }
  const bersih = [];
  for (const row of j) {
    if (!JAM_RE.test(row?.mulai) || !JAM_RE.test(row?.akhir)) return jsonError('Format jam harus HH:MM', 422);
    const panjang = keMenit(row.akhir) - keMenit(row.mulai);
    if (panjang < MIN_PANJANG) {
      return jsonError(`Jendela "${row.nama ?? row.mulai}" cuma ${panjang} menit — minimal ${MIN_PANJANG} menit supaya tiap platform punya ruang geser`, 422);
    }
    bersih.push({ nama: String(row.nama ?? '').slice(0, 30) || row.mulai, mulai: row.mulai, akhir: row.akhir });
  }
  bersih.sort((a, b) => keMenit(a.mulai) - keMenit(b.mulai));

  try {
    await setSetting(env, 'viralframe_jendela', JSON.stringify(bersih));
    return jsonOk({ jendela: bersih });
  } catch (err) {
    console.error('[settings/scheduler-config PATCH]', err.message);
    return jsonError('Gagal menyimpan jendela', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
