// GET /api/admin/leads — list leads CRM atau badge count
//
// Query params:
//   ?count=1            → { count: N }  untuk badge sidebar (WHERE status='baru')
//   ?status=baru|...    → filter by status_pipeline (opsional)
//   ?limit=50           → batas baris (default 50, max 200)
//
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const VALID_STATUSES = new Set(['baru', 'dihubungi', 'negosiasi', 'closing', 'arsip']);

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ── Mode badge count ─────────────────────────────────────────────
  if (url.searchParams.get('count') === '1') {
    try {
      const row = await env.DB
        .prepare("SELECT COUNT(*) AS cnt FROM leads WHERE status_pipeline = 'baru'")
        .first();
      return jsonOk({ count: row?.cnt ?? 0 });
    } catch (err) {
      console.error('[admin leads count]', err.message);
      return jsonError('Gagal menghitung leads', 500);
    }
  }

  // ── Mode list ────────────────────────────────────────────────────
  const statusFilter = url.searchParams.get('status') ?? '';
  const limitRaw     = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit        = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  let sql = `
    SELECT
      l.id,
      l.nama,
      l.no_wa,
      l.pesan,
      l.asal_daerah,
      l.budget,
      l.tipe_pengirim,
      l.source_page,
      l.status_pipeline,
      l.notes,
      l.wa_clicked_at,
      l.created_at,
      l.updated_at,
      p.title AS properti_title
    FROM leads l
    LEFT JOIN properties p ON p.id = l.property_id
  `;

  const bindings = [];
  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    sql += ' WHERE l.status_pipeline = ?';
    bindings.push(statusFilter);
  }

  sql += ` ORDER BY l.created_at DESC LIMIT ${limit}`;

  try {
    const stmt   = env.DB.prepare(sql);
    const result = bindings.length > 0
      ? await stmt.bind(...bindings).all()
      : await stmt.all();

    const leads = (result.results ?? []).map(r => ({
      ...r,
      notes: parseNotes(r.notes),
    }));

    return jsonOk({ leads, total: leads.length });
  } catch (err) {
    console.error('[admin leads list]', err.message);
    return jsonError('Gagal mengambil data leads', 500);
  }
}

function parseNotes(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

export async function onRequestOptions() {
  return handleOptions();
}
