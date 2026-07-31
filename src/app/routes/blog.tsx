import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import BlogPage from "../components/BlogPage";
import type { ApiBlogPost } from "../../lib/api";
import { pageMeta } from "../../lib/pageMeta";

export const meta = () => pageMeta({
  title: 'Blog & Panduan Properti Yogyakarta | Salam Bumi Property',
  description: 'Artikel, tips, dan panduan seputar jual-beli properti, investasi kost, KPR, dan legalitas di Yogyakarta — ditulis oleh tim Salam Bumi Property.',
  path: '/blog',
});

// SSR loader — query D1 langsung, pola sama dengan routes/home.tsx (blog teaser
// 3-post di homepage). Limit 50 mereplikasi behavior CSR lama (getBlogPosts({limit:50})).
export async function loader({ context }: LoaderFunctionArgs) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (context as any)?.cloudflare?.env;
    if (!env?.DB) return { posts: [] };

    const db = env.DB as D1Database;
    const res = await db.prepare(`
      SELECT
        b.id, b.judul, b.slug, b.cover, b.excerpt, b.kategori,
        b.tags, b.reading_time_menit, b.published_at, a.nama AS author
      FROM blog_posts b
      LEFT JOIN admins a ON a.id = b.author_id
      WHERE b.status = 'published'
      ORDER BY b.published_at DESC
      LIMIT 50
    `).all();

    const posts: ApiBlogPost[] = (res.results ?? []).map((b: unknown) => {
      const row = b as Record<string, unknown>;
      let tags: string[] = [];
      try { tags = JSON.parse((row.tags as string) ?? "[]"); } catch { /* noop */ }
      return {
        id: row.id as number,
        judul: row.judul as string,
        slug: row.slug as string,
        cover: (row.cover as string | null) ?? null,
        excerpt: (row.excerpt as string | null) ?? null,
        kategori: (row.kategori as string | null) ?? null,
        tags,
        reading_time_menit: (row.reading_time_menit as number | null) ?? null,
        published_at: row.published_at as string,
        author: (row.author as string | null) ?? null,
      };
    });

    return { posts };
  } catch (e) {
    console.error("[blog loader]", e);
    return { posts: [] };
  }
}

export default function BlogRoute() {
  const { posts } = useLoaderData<typeof loader>();
  return <BlogPage ssrPosts={posts} />;
}
