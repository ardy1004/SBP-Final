import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, Link } from "react-router";
import { Calendar, Clock, ChevronRight, ArrowLeft } from "lucide-react";
import { sanitizeHtml } from "../../lib/sanitize";

interface BlogDetail {
  id: number;
  judul: string;
  slug: string;
  cover: string | null;
  excerpt: string | null;
  konten: string | null;
  kategori: string | null;
  tags: string[];
  reading_time_menit: number | null;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  author_nama: string | null;
}

export async function loader({ params, context }: LoaderFunctionArgs) {
  const slug = params.slug;
  if (!slug) throw new Response(null, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context as any)?.cloudflare?.env;
  if (!env?.DB) throw new Response(null, { status: 503 });

  const db = env.DB as D1Database;

  try {
    const row = await db.prepare(`
      SELECT
        b.id, b.judul, b.slug, b.cover, b.excerpt, b.konten,
        b.kategori, b.tags, b.reading_time_menit,
        b.published_at, b.meta_title, b.meta_description,
        a.nama AS author_nama
      FROM blog_posts b
      LEFT JOIN admins a ON a.id = b.author_id
      WHERE b.slug = ? AND b.status = 'published'
      LIMIT 1
    `).bind(slug).first();

    if (!row) throw new Response(null, { status: 404 });

    const r = row as Record<string, unknown>;
    let tags: string[] = [];
    if (r.tags) { try { tags = JSON.parse(r.tags as string); } catch { tags = []; } }

    const post: BlogDetail = {
      id: r.id as number,
      judul: r.judul as string,
      slug: r.slug as string,
      cover: r.cover as string | null,
      excerpt: r.excerpt as string | null,
      konten: r.konten as string | null,
      kategori: r.kategori as string | null,
      tags,
      reading_time_menit: r.reading_time_menit as number | null,
      published_at: r.published_at as string | null,
      meta_title: r.meta_title as string | null,
      meta_description: r.meta_description as string | null,
      author_nama: r.author_nama as string | null,
    };

    return { post };
  } catch (e) {
    if (e instanceof Response) throw e;
    console.error('[blog-detail loader]', e);
    throw new Response(null, { status: 500 });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.post) {
    return [
      { title: "Artikel Tidak Ditemukan | Salam Bumi Property" },
      { name: "robots", content: "noindex" },
    ];
  }
  const p = data.post;
  const title = p.meta_title || `${p.judul} | Blog Salam Bumi Property`;
  const desc = p.meta_description || p.excerpt || `${p.judul} — artikel dari Salam Bumi Property.`;
  const canonical = `https://salambumi.xyz/blog/${p.slug}`;
  const ogImage = p.cover || 'https://images.salambumi.xyz/materai/hg.png';

  return [
    { title },
    { name: "description", content: desc },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: title },
    { property: "og:description", content: desc },
    { property: "og:image", content: ogImage },
    { property: "og:type", content: "article" },
    { property: "og:url", content: canonical },
    { tagName: "link", rel: "canonical", href: canonical },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: desc },
    { name: "twitter:image", content: ogImage },
    // Article structured data — sinyal E-E-A-T (author, tanggal) untuk SEO & GEO
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: p.judul,
        description: desc,
        image: ogImage,
        url: canonical,
        mainEntityOfPage: canonical,
        ...(p.published_at ? { datePublished: p.published_at, dateModified: p.published_at } : {}),
        inLanguage: "id",
        author: {
          "@type": p.author_nama ? "Person" : "Organization",
          name: p.author_nama || "Tim Salam Bumi Property",
        },
        publisher: {
          "@type": "Organization",
          "@id": "https://salambumi.xyz/#organization",
          name: "CV Salam Bumi Property",
          url: "https://salambumi.xyz",
        },
      },
    },
  ];
};

function formatTanggal(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export default function BlogDetailRoute() {
  const { post } = useLoaderData<typeof loader>();

  return (
    <div className="pt-nav min-h-screen" style={{ background: '#F0F4F8' }}>
      {/* Hero cover */}
      {post.cover && (
        <div className="relative w-full h-64 sm:h-80 lg:h-96 overflow-hidden">
          <img
            src={post.cover}
            alt={post.judul}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1624204386084-dd8c05e32226?w=1200&q=80'; }}
            suppressHydrationWarning
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-[#64748B] mb-5 flex-wrap">
          <Link to="/" className="hover:text-[#1565C0]">Home</Link>
          <ChevronRight size={12} />
          <Link to="/blog" className="hover:text-[#1565C0]">Blog</Link>
          <ChevronRight size={12} />
          <span className="text-[#0F172A] font-semibold line-clamp-1">{post.judul}</span>
        </nav>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          {post.kategori && (
            <span className="inline-block px-3 py-1 bg-[#E3F2FD] text-[#1565C0] text-xs rounded-full font-medium mb-4">
              {post.kategori}
            </span>
          )}
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] mb-4 leading-tight">{post.judul}</h1>

          <div className="flex items-center gap-4 text-xs text-[#64748B] mb-6 pb-6 border-b border-gray-100 flex-wrap">
            {post.author_nama && (
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-[#1565C0] flex items-center justify-center text-white text-[10px] font-bold">
                  {post.author_nama.charAt(0)}
                </div>
                <span>{post.author_nama}</span>
              </div>
            )}
            {post.published_at && (
              <div className="flex items-center gap-1"><Calendar size={13} /> {formatTanggal(post.published_at)}</div>
            )}
            {post.reading_time_menit && (
              <div className="flex items-center gap-1"><Clock size={13} /> {post.reading_time_menit} menit baca</div>
            )}
          </div>

          {/* Konten — HTML dari DB. Disanitasi saat simpan (API) + saat render (defense-in-depth) */}
          <div
            className="blog-content prose prose-sm sm:prose max-w-none text-[#334155] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.konten) }}
          />

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-gray-100">
              {post.tags.map((t) => (
                <span key={t} className="px-3 py-1 bg-gray-100 text-[#64748B] text-xs rounded-full">#{t}</span>
              ))}
            </div>
          )}
        </div>

        <Link to="/blog" className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-[#1565C0] hover:underline">
          <ArrowLeft size={15} /> Kembali ke Blog
        </Link>
      </article>
    </div>
  );
}
