// GET /api/blog/:slug — detail artikel blog publik (hanya status='published')
// JOIN admins untuk nama penulis. Parse tags JSON aman.

import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug || typeof slug !== 'string') return jsonError('Slug tidak valid', 400);

  try {
    const post = await env.DB.prepare(`
      SELECT
        b.id, b.judul, b.slug, b.cover, b.excerpt, b.konten,
        b.kategori, b.tags, b.reading_time_menit, b.status,
        b.published_at, b.meta_title, b.meta_description,
        b.created_at, b.updated_at,
        a.nama AS author_nama
      FROM blog_posts b
      LEFT JOIN admins a ON a.id = b.author_id
      WHERE b.slug = ? AND b.status = 'published'
      LIMIT 1
    `).bind(slug).first();

    if (!post) return jsonError(`Artikel "${slug}" tidak ditemukan`, 404);

    let tags = [];
    if (post.tags) {
      try { tags = JSON.parse(post.tags); } catch { tags = []; }
    }

    return jsonOk({ ...post, tags });
  } catch (err) {
    console.error('[blog/detail] DB error:', err.message);
    return jsonError('Gagal mengambil artikel', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
