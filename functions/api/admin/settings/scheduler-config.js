// GET   /api/admin/settings/scheduler-config — jendela primetime (WIB) + preset akun utama
// PATCH /api/admin/settings/scheduler-config — simpan salah satu (jendela ATAU preset_utama)
// Auth: _middleware.js
//
// Jendela: RENTANG jam untuk agent selain utama. Menit persisnya diundi
// ber-seed di dalam rentang itu, dan tiap platform digeser lagi beberapa
// menit — supaya kelima platform tidak lagi terbit pada detik yang sama.
//
// Preset akun utama (2026-08-15): N slot jam TETAP + drift linear per hari —
// mekanisme lama (sebelum migrasi 0041) yang diminta dikembalikan khusus
// untuk akun utama, sekarang editable dari sini alih-alih konstanta di kode.
// Kedua concern ditumpangkan di satu endpoint (bukan file baru) — pola sama
// seperti PATCH agent-accounts/index.js, anggaran bundle Functions 99.7%.
//
// Key & channel ID tidak ada di sini sejak 0037/0038 — itu milik tiap agent.

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { setSetting } from '../../../_lib/schedulerProviders.js';
import { minPanjangJendela, getJendela, getPresetUtama } from '../../../_lib/jadwalOtomatis.js';

const JAM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const keMenit = (j) => Number(j.slice(0, 2)) * 60 + Number(j.slice(3));

// Jendela harus lebih panjang dari tangga geseran platform, kalau tidak platform
// paling belakang tidak punya ruang dan semuanya menumpuk di batas akhir.
// Ambangnya DITURUNKAN dari tangga di jadwalOtomatis.js, bukan dihitung ulang di
// sini — jalur baca (getJendela) memakai fungsi yang sama persis, jadi mustahil
// ada nilai yang lolos disimpan tapi ditolak saat dipakai.
const MIN_PANJANG = minPanjangJendela();

export async function onRequestGet({ env }) {
  const [jendela, presetUtama] = await Promise.all([getJendela(env), getPresetUtama(env)]);
  return jsonOk({ jendela, min_panjang_menit: MIN_PANJANG, preset_utama: presetUtama });
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid', 400); }

  if ('preset_utama' in body) return simpanPresetUtama(env, body.preset_utama);
  if ('jendela' in body) return simpanJendela(env, body.jendela);
  return jsonError('Tidak ada yang diubah', 400);
}

async function simpanJendela(env, j) {
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
    console.error('[settings/scheduler-config PATCH jendela]', err.message);
    return jsonError('Gagal menyimpan jendela', 500);
  }
}

async function simpanPresetUtama(env, p) {
  if (!p || !Array.isArray(p.slots) || p.slots.length === 0 || p.slots.length > 10) {
    return jsonError('Butuh 1–10 jam posting', 422);
  }
  for (const jam of p.slots) {
    if (!JAM_RE.test(jam)) return jsonError('Format jam harus HH:MM', 422);
  }
  if (!Number.isInteger(p.intervalMenit) || p.intervalMenit < 0 || p.intervalMenit > 1440) {
    return jsonError('Interval harus angka 0–1440 menit', 422);
  }
  // Dedupe + urutkan — dua slot dengan jam identik cuma menghasilkan baris
  // jadwal kembar tanpa manfaat, bukan kesalahan fatal, jadi disaring diam-diam.
  const slots = [...new Set(p.slots)].sort((a, b) => keMenit(a) - keMenit(b));

  try {
    const bersih = { slots, intervalMenit: p.intervalMenit };
    await setSetting(env, 'viralframe_preset_utama', JSON.stringify(bersih));
    return jsonOk({ preset_utama: bersih });
  } catch (err) {
    console.error('[settings/scheduler-config PATCH preset_utama]', err.message);
    return jsonError('Gagal menyimpan preset akun utama', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
