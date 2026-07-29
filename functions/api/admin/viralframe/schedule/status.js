// GET /api/admin/viralframe/schedule/status — status 5 slot primetime hari
// ini (WIB), dipakai indikator SlotIndicatorStrip di Content Library & Konten
// Agent. Slot dianggap 'used' HANYA kalau ada baris sukses ('scheduled') —
// percobaan gagal total tidak menutup slot (lihat pickNextSlot).
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { getSchedulePreset, getDriftMinutes, buildSlotTime } from '../../../../_lib/schedulerProviders.js';
import { tanggalWib } from '../../../../_lib/waktu.js';

async function resolveVideoName(env, videoType, videoId) {
  try {
    if (videoType === 'agent') {
      const row = await env.DB.prepare('SELECT caption FROM viralframe_agent_videos WHERE id = ?').bind(videoId).first();
      return row?.caption || `Video Agent #${videoId}`;
    }
    const row = await env.DB.prepare('SELECT label FROM viralframe_videos WHERE id = ?').bind(videoId).first();
    return row?.label || `Video #${videoId}`;
  } catch {
    return `Video #${videoId}`;
  }
}

export async function onRequestGet({ env }) {
  try {
    const preset = await getSchedulePreset(env);
    const todayWib = tanggalWib();
    const driftMinutes = getDriftMinutes(todayWib);
    const now = Date.now();

    const res = await env.DB.prepare(
      `SELECT video_id, video_type, provider, platform, slot_index, status, error_message
       FROM viralframe_scheduled_posts WHERE substr(scheduled_at,1,10) = ?`
    ).bind(todayWib).all();
    const rows = res.results ?? [];

    const bySlot = new Map();
    for (const r of rows) {
      if (!bySlot.has(r.slot_index)) bySlot.set(r.slot_index, []);
      bySlot.get(r.slot_index).push(r);
    }

    const slots = [];
    for (let slot = 1; slot <= 5; slot++) {
      const presetRow = preset.find(p => p.slot === slot) ?? preset[0];
      const scheduledAt = buildSlotTime(todayWib, presetRow, driftMinutes);
      const group = bySlot.get(slot) ?? [];
      const hasSuccess = group.some(r => r.status === 'scheduled');

      let status, usedBy = null;
      if (hasSuccess) {
        status = 'used';
        const first = group[0];
        usedBy = {
          video_id: first.video_id,
          video_type: first.video_type,
          video_name: await resolveVideoName(env, first.video_type, first.video_id),
          platforms: group.map(r => ({ platform: r.platform, status: r.status, error: r.error_message })),
        };
      } else if (new Date(scheduledAt).getTime() <= now) {
        status = 'passed';
      } else {
        status = 'available';
      }

      // time_wib WAJIB dari scheduledAt (sudah termasuk drift rotasi harian),
      // BUKAN presetRow.time mentah -- dulu salah pakai jam dasar, bikin
      // indikator nampilin "09:00" padahal jam aktual yang dipakai "09:20".
      slots.push({ slot, time_wib: scheduledAt.slice(11, 16), base_time: presetRow.time, scheduled_at: scheduledAt, status, used_by: usedBy });
    }

    return jsonOk({ slots, drift_minutes: driftMinutes });
  } catch (err) {
    console.error('[vf schedule/status]', err.message);
    return jsonError('Gagal memuat status slot', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
