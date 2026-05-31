import { jsonOk, jsonError, handleOptions } from './_shared/response.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * GET /api/blog
 * List artikel blog yang sudah published, urut terbaru dulu.
 * JOIN ke admins untuk mengambil nama penulis.
 *
 * Query params:
 *   limit  — integer (default 10, max 50)
 *   page   — integer (default 1)
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const q = new URL(request.url).searchParams;

  let page  = Math.max(1, parseInt(q.get('page')  ?? '1', 10) || 1);
  let limit = parseInt(q.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) limit = DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  try {
    const [dataRes, countRes] = await Promise.all([
      env.DB.prepare(`
        SELECT
          b.id,
          b.judul,
          b.slug,
          b.cover,
          b.excerpt,
          b.kategori,
          b.tags,
          b.reading_time_menit,
          b.published_at,
          a.nama AS author
        FROM blog_posts b
        LEFT JOIN admins a ON a.id = b.author_id
        WHERE b.status = 'published'
        ORDER BY b.published_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all(),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM blog_posts
        WHERE status = 'published'
      `).first(),
    ]);

    // tags disimpan sebagai JSON string di DB — parse agar jadi array
    const items = dataRes.results.map(post => ({
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
    }));

    const total      = countRes?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    return jsonOk({
      items,
      pagination: {
        total,
        page,
        limit,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    });
  } catch (err) {
    console.error('[blog] DB error:', err.message);
    return jsonError('Gagal mengambil data blog', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
