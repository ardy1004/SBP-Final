// PATCH /api/admin/leads/:id — update status_pipeline dan/atau tambah catatan
//
// Body: { status_pipeline?: string, note_baru?: string }
// notes bersifat append-only — tidak pernah menghapus/overwrite catatan lama.
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';

const VALID_STATUSES = new Set(['baru', 'dihubungi', 'negosiasi', 'closing', 'arsip']);

function parseNotes(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

function sanitize(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return jsonError('Content-Type harus application/json', 415);
  }

  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  // Validasi minimal: harus ada status_pipeline atau note_baru
  const { status_pipeline, note_baru } = body;
  if (status_pipeline === undefined && note_baru === undefined) {
    return jsonError('Harus ada status_pipeline atau note_baru', 400);
  }

  if (status_pipeline !== undefined && !VALID_STATUSES.has(status_pipeline)) {
    return jsonError(
      `status_pipeline tidak valid. Nilai yang diizinkan: ${[...VALID_STATUSES].join(', ')}`,
      422
    );
  }

  // Ambil lead saat ini
  const lead = await env.DB
    .prepare('SELECT id, notes, status_pipeline FROM leads WHERE id = ?')
    .bind(id)
    .first();
  if (!lead) return jsonError('Lead tidak ditemukan', 404);

  // ── Build UPDATE ─────────────────────────────────────────────────
  const setClauses = ['updated_at = CURRENT_TIMESTAMP'];
  const values     = [];

  if (status_pipeline !== undefined) {
    setClauses.push('status_pipeline = ?');
    values.push(status_pipeline);
  }

  if (note_baru !== undefined) {
    const teks = sanitize(String(note_baru), 1000);
    if (!teks) return jsonError('note_baru tidak boleh kosong', 422);

    const adminNama = context.data.admin?.nama ?? 'Admin';
    const notes = parseNotes(lead.notes);
    notes.push({ teks, admin: adminNama, waktu: new Date().toISOString() });

    setClauses.push('notes = ?');
    values.push(JSON.stringify(notes));
  }

  values.push(id); // untuk WHERE

  try {
    await env.DB
      .prepare(`UPDATE leads SET ${setClauses.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  } catch (err) {
    console.error('[admin leads PATCH]', err.message);
    return jsonError('Gagal menyimpan perubahan', 500);
  }

  // Return updated row
  const updated = await env.DB
    .prepare(`
      SELECT l.*, p.title AS properti_title
      FROM leads l
      LEFT JOIN properties p ON p.id = l.property_id
      WHERE l.id = ?
    `)
    .bind(id)
    .first();

  return jsonOk({
    pesan: 'Lead berhasil diperbarui',
    lead: { ...updated, notes: parseNotes(updated?.notes) },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
