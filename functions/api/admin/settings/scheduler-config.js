// GET   /api/admin/settings/scheduler-config — preset jam posting (WIB)
// PATCH /api/admin/settings/scheduler-config — simpan preset
// Auth: _middleware.js
//
// Channel/account ID dan API key TIDAK lagi di sini: sejak migrasi 0037/0038
// keduanya milik masing-masing agent (viralframe_agent_accounts) dan diatur di
// Admin → Pengaturan → Akun Agent. Menyisakannya di sini berarti ada layar yang
// bisa diedit tapi tidak dibaca siapa pun — persis jenis konfigurasi mati yang
// bikin orang mengira sudah mengatur sesuatu.
//
// Yang tersisa memang global: jam primetime berlaku untuk semua agent
// (pengaturan slot per agent ditunda, dibahas terpisah 2026-08-11).

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { setSetting, getSchedulePreset } from '../../../_lib/schedulerProviders.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidPreset(preset) {
  if (!Array.isArray(preset) || preset.length !== 5) return false;
  const slots = new Set();
  for (const row of preset) {
    if (!row || typeof row !== 'object') return false;
    if (!Number.isInteger(row.slot) || row.slot < 1 || row.slot > 5) return false;
    if (!TIME_RE.test(row.time)) return false;
    slots.add(row.slot);
  }
  return slots.size === 5;
}

export async function onRequestGet({ env }) {
  try {
    return jsonOk({ viralframe_schedule_preset: await getSchedulePreset(env) });
  } catch (err) {
    console.error('[settings/scheduler-config GET]', err.message);
    return jsonError('Gagal memuat konfigurasi scheduler', 500);
  }
}

export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body tidak valid', 400); }

  const preset = body.viralframe_schedule_preset;
  if (!isValidPreset(preset)) return jsonError('Preset jam posting tidak valid — butuh 5 slot dengan jam HH:MM', 422);

  try {
    await setSetting(env, 'viralframe_schedule_preset', JSON.stringify(preset));
    return jsonOk({ updated: true });
  } catch (err) {
    console.error('[settings/scheduler-config PATCH]', err.message);
    return jsonError('Gagal menyimpan konfigurasi scheduler', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
