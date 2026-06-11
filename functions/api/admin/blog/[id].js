// GET    /api/admin/blog/:id — detail artikel (semua status)
// PATCH  /api/admin/blog/:id — partial update
// DELETE /api/admin/blog/:id — hapus artikel
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { sanitizeHtml } from '../../_lib/sanitize.js';

const VALID_STATUS = new Set(['draft', 'published', 'scheduled']);

function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

function readingTime(konten) {
  const words = (konten ?? '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const post = await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ?').bind(id).first();
    if (!post) return jsonError('Artikel tidak ditemukan', 404);
    let tags = [];
    if (post.tags) { try { tags = JSON.parse(post.tags); } catch { tags = []; } }
    return jsonOk({ ...post, tags });
  } catch (err) {
    console.error('[admin blog GET id]', err.message);
    return jsonError('Gagal mengambil artikel', 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  const exists = await env.DB.prepare('SELECT id, status, published_at FROM blog_posts WHERE id = ?').bind(id).first();
  if (!exists) return jsonError('Artikel tidak ditemukan', 404);

  const pairs = [];

  if (body.judul !== undefined) {
    const v = sanitize(body.judul, 200);
    if (!v) return jsonError('judul tidak boleh kosong', 422);
    pairs.push({ col: 'judul', val: v });
  }
  if (body.konten !== undefined) {
    const v = sanitizeHtml(typeof body.konten === 'string' ? body.konten.slice(0, 100000) : '');
    pairs.push({ col: 'konten', val: v });
    pairs.push({ col: 'reading_time_menit', val: readingTime(v) });
  }
  if (body.excerpt !== undefined)  pairs.push({ col: 'excerpt',  val: sanitize(body.excerpt, 500) || null });
  if (body.kategori !== undefined) pairs.push({ col: 'kategori', val: sanitize(body.kategori, 100) || null });
  if (body.cover !== undefined)    pairs.push({ col: 'cover',    val: sanitize(body.cover, 1000) || null });
  if (body.meta_title !== undefined)       pairs.push({ col: 'meta_title',       val: sanitize(body.meta_title, 200) || null });
  if (body.meta_description !== undefined) pairs.push({ col: 'meta_description', val: sanitize(body.meta_description, 300) || null });

  if (body.tags !== undefined) {
    let tags = null;
    if (Array.isArray(body.tags)) {
      const clean = body.tags.map(t => sanitize(String(t), 50)).filter(Boolean).slice(0, 20);
      tags = JSON.stringify(clean);
    }
    pairs.push({ col: 'tags', val: tags });
  }

  if (body.status !== undefined) {
    if (!VALID_STATUS.has(body.status)) return jsonError('status tidak valid', 422);
    pairs.push({ col: 'status', val: body.status });
    // set published_at saat pertama kali dipublish
    if (body.status === 'published' && !exists.published_at) {
      pairs.push({ col: 'published_at', val: new Date().toISOString() });
    }
  }

  if (pairs.length === 0) return jsonError('Tidak ada field yang dikirim', 400);

  try {
    const setClauses = pairs.map(p => `${p.col} = ?`).join(', ');
    const vals = pairs.map(p => p.val);
    await env.DB.prepare(
      `UPDATE blog_posts SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(...vals, id).run();

    const updated = await env.DB.prepare('SELECT id, judul, slug, status, published_at FROM blog_posts WHERE id = ?').bind(id).first();
    return jsonOk({ pesan: 'Artikel berhasil diperbarui', artikel: updated });
  } catch (err) {
    console.error('[admin blog PATCH]', err.message);
    return jsonError('Gagal menyimpan perubahan', 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('ID tidak valid', 400);

  try {
    const exists = await env.DB.prepare('SELECT id FROM blog_posts WHERE id = ?').bind(id).first();
    if (!exists) return jsonError('Artikel tidak ditemukan', 404);
    await env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();
    return jsonOk({ success: true });
  } catch (err) {
    console.error('[admin blog DELETE]', err.message);
    return jsonError('Gagal menghapus artikel', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
