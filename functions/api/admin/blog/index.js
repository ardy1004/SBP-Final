// GET  /api/admin/blog — list semua artikel (semua status)
// POST /api/admin/blog — buat artikel baru
// Auth: otomatis via functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { sanitizeHtml } from '../../_lib/sanitize.js';

const VALID_STATUS = new Set(['draft', 'published', 'scheduled']);

function sanitize(val, maxLen = 1000) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randHex4() {
  return Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function readingTime(konten) {
  const words = (konten ?? '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const result = await env.DB.prepare(`
      SELECT id, judul, slug, kategori, status, published_at, created_at
      FROM blog_posts
      ORDER BY created_at DESC
    `).all();
    return jsonOk({ items: result.results ?? [], total: (result.results ?? []).length });
  } catch (err) {
    console.error('[admin blog GET]', err.message);
    return jsonError('Gagal mengambil data blog', 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return jsonError('Content-Type harus application/json', 415);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Body JSON tidak valid', 400); }

  // judul & konten boleh mengandung HTML untuk konten — judul disanitasi ketat
  const judul = sanitize(body.judul ?? '', 200);
  if (!judul) return jsonError('judul tidak boleh kosong', 422);

  const konten   = sanitizeHtml(typeof body.konten === 'string' ? body.konten.slice(0, 100000) : '');
  const excerpt  = sanitize(body.excerpt ?? '', 500) || null;
  const kategori = sanitize(body.kategori ?? '', 100) || null;
  const cover    = sanitize(body.cover ?? '', 1000) || null;
  const meta_title       = sanitize(body.meta_title ?? '', 200) || null;
  const meta_description = sanitize(body.meta_description ?? '', 300) || null;

  const status = VALID_STATUS.has(body.status) ? body.status : 'draft';

  // tags: array → JSON string
  let tags = null;
  if (Array.isArray(body.tags)) {
    const clean = body.tags.map(t => sanitize(String(t), 50)).filter(Boolean).slice(0, 20);
    tags = JSON.stringify(clean);
  }

  const slug = `${slugify(judul) || 'artikel'}-${randHex4()}`;
  const reading_time_menit = readingTime(konten);
  const author_id = context.data?.admin?.sub ?? null;
  const published_at = status === 'published' ? new Date().toISOString() : null;

  try {
    const res = await env.DB.prepare(`
      INSERT INTO blog_posts
        (judul, slug, cover, excerpt, konten, kategori, tags, author_id,
         reading_time_menit, status, published_at, meta_title, meta_description,
         created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      judul, slug, cover, excerpt, konten, kategori, tags, author_id,
      reading_time_menit, status, published_at, meta_title, meta_description
    ).run();

    return jsonOk({ id: res.meta?.last_row_id ?? null, slug }, 201);
  } catch (err) {
    console.error('[admin blog POST]', err.message);
    return jsonError('Gagal menyimpan artikel', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
