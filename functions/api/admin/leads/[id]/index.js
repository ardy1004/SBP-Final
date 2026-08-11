// GET    /api/admin/leads/:id — detail satu lead + properti terkait
// PATCH  /api/admin/leads/:id — update status_pipeline dan/atau tambah catatan
// DELETE /api/admin/leads/:id — hapus lead permanen (drag & drop ke kotak hapus di Kanban)
//
// Body PATCH: { status_pipeline?: string, note_baru?: string }
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

async function fetchLeadById(db, id) {
  return db.prepare(`
    SELECT
      l.id, l.nama, l.no_wa, l.asal_daerah, l.tipe_pengirim, l.budget,
      l.rencana_pembayaran, l.pesan, l.source_page, l.wa_clicked_at,
      l.status_pipeline, l.notes, l.created_at, l.updated_at,
      p.id          AS p_id,
      p.title       AS p_title,
      p.slug        AS p_slug,
      p.jenis_properti AS p_jenis_properti,
      p.tujuan      AS p_tujuan,
      p.provinsi    AS p_provinsi,
      p.kabupaten   AS p_kabupaten,
      p.kecamatan   AS p_kecamatan
    FROM leads l
    LEFT JOIN properties p ON p.id = l.property_id
    WHERE l.id = ?
  `).bind(id).first();
}

function toLeadResponse(row) {
  return {
    id: row.id,
    nama: row.nama,
    no_wa: row.no_wa,
    asal_daerah: row.asal_daerah,
    tipe_pengirim: row.tipe_pengirim,
    budget: row.budget,
    rencana_pembayaran: row.rencana_pembayaran,
    pesan: row.pesan,
    source_page: row.source_page,
    wa_clicked_at: row.wa_clicked_at,
    status_pipeline: row.status_pipeline,
    notes: parseNotes(row.notes),
    created_at: row.created_at,
    updated_at: row.updated_at,
    properti: row.p_id ? {
      id: row.p_id,
      title: row.p_title,
      slug: row.p_slug,
      jenis_properti: row.p_jenis_properti,
      tujuan: row.p_tujuan,
      provinsi: row.p_provinsi,
      kabupaten: row.p_kabupaten,
      kecamatan: row.p_kecamatan,
    } : null,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/leads/:id
// ═══════════════════════════════════════════════════════════════════
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const row = await fetchLeadById(env.DB, id);
    if (!row) return jsonError('Lead tidak ditemukan', 404);
    return jsonOk({ lead: toLeadResponse(row) });
  } catch (err) {
    console.error('[admin leads GET]', err.message);
    return jsonError('Gagal mengambil data lead', 500);
  }
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
  const updated = await fetchLeadById(env.DB, id);

  return jsonOk({
    pesan: 'Lead berhasil diperbarui',
    lead: toLeadResponse(updated),
  });
}

// ═══════════════════════════════════════════════════════════════════
// DELETE /api/admin/leads/:id
// ═══════════════════════════════════════════════════════════════════
export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const res = await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    if (res.meta.changes === 0) return jsonError('Lead tidak ditemukan', 404);
    return jsonOk({ pesan: 'Lead berhasil dihapus' });
  } catch (err) {
    console.error('[admin leads DELETE]', err.message);
    return jsonError('Gagal menghapus lead', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
