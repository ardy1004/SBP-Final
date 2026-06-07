import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import HomePage from "../components/HomePage";
import type { NormalizedProperty, ApiTestimonial, ApiBlogPost } from "../../lib/api";
import { normalizeProperty } from "../../lib/api";

// ── Cloudflare D1 bindings tersedia via context.cloudflare.env (dari cloudflareDevProxy / Pages Functions)
export async function loader({ context }: LoaderFunctionArgs) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (context as any)?.cloudflare?.env;
    if (!env?.DB) return { properties: [], testimonials: [], blogPosts: [] };

    const db = env.DB as D1Database;

    const [propsRes, testimRes, blogRes] = await Promise.all([
      // Query identik dengan GET /api/properties — kolom dan filter sama persis
      db.prepare(`
        SELECT
          p.id, p.kode_listing, p.title, p.slug,
          p.jenis_properti, p.tujuan,
          p.harga, p.harga_lama, p.harga_sewa_tahun,
          p.nego, p.nett, p.harga_per_m2,
          p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
          p.luas_tanah, p.luas_bangunan, p.lebar_depan, p.lantai,
          p.legalitas, p.furnished,
          p.kecamatan, p.kabupaten, p.provinsi,
          p.badge_premium, p.badge_featured, p.badge_hot,
          p.status_sold, p.properti_pilihan, p.verified,
          p.income_per_bulan, p.pengeluaran_per_bulan,
          p.views_count, p.published_at, p.updated_at,
          (SELECT url_webp FROM property_images
             WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url,
          (SELECT alt_text  FROM property_images
             WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_alt
        FROM properties p
        WHERE p.status_publish = 'published'
        ORDER BY p.properti_pilihan DESC, p.badge_premium DESC,
                 p.badge_featured DESC, p.badge_hot DESC, p.published_at DESC
        LIMIT 10
      `).all(),

      db.prepare(`
        SELECT id, nama_klien, lokasi, foto_url, isi_testimoni, rating, jenis_transaksi
        FROM testimonials
        WHERE tampilkan = 1
        ORDER BY urutan ASC
        LIMIT 6
      `).all(),

      db.prepare(`
        SELECT bp.id, bp.judul, bp.slug, bp.excerpt,
               bp.cover, bp.tags, bp.published_at,
               bp.kategori, bp.reading_time_menit,
               a.nama AS author
        FROM blog_posts bp
        LEFT JOIN admins a ON bp.author_id = a.id
        WHERE bp.status = 'published' AND bp.published_at IS NOT NULL
        ORDER BY bp.published_at DESC
        LIMIT 3
      `).all(),
    ]);

    // Normalisasi properties (integer → boolean, dll.)
    const properties: NormalizedProperty[] = (propsRes.results ?? []).map((row: unknown) =>
      normalizeProperty(row as Parameters<typeof normalizeProperty>[0])
    );

    // Normalisasi testimonials → sesuai ApiTestimonial
    const testimonials: ApiTestimonial[] = (testimRes.results ?? []).map((t: unknown) => {
      const row = t as Record<string, unknown>;
      return {
        id: row.id as number,
        nama_klien: row.nama_klien as string,
        lokasi: (row.lokasi as string | null) ?? null,
        foto_url: row.foto_url as string | null,
        isi_testimoni: row.isi_testimoni as string,
        rating: row.rating as number,
        jenis_transaksi: (row.jenis_transaksi as string | null) ?? null,
        tanggal: null,
      };
    });

    // Normalisasi blog posts → sesuai ApiBlogPost (tags adalah JSON string di D1)
    const blogPosts: ApiBlogPost[] = (blogRes.results ?? []).map((b: unknown) => {
      const row = b as Record<string, unknown>;
      let tags: string[] = [];
      try { tags = JSON.parse(row.tags as string ?? "[]"); } catch { /* noop */ }
      return {
        id: row.id as number,
        judul: row.judul as string,
        slug: row.slug as string,
        cover: (row.cover as string | null) ?? null,
        excerpt: (row.excerpt as string | null) ?? null,
        kategori: null,
        tags,
        reading_time_menit: null,
        published_at: row.published_at as string,
        author: (row.author as string | null) ?? null,
      };
    });

    return { properties, testimonials, blogPosts };
  } catch (e) {
    console.error("[home loader]", e);
    return { properties: [], testimonials: [], blogPosts: [] };
  }
}

export const meta: MetaFunction = () => [
  { title: "Salam Bumi Property | Portal Properti Terpercaya Yogyakarta" },
  { name: "description", content: "Portal properti berbasis kepercayaan & kecerdasan investasi untuk Yogyakarta. Temukan rumah, kost, tanah terbaik — semua listing dikurasi dan diverifikasi langsung oleh tim SBP." },
  { name: "robots", content: "index, follow" },
  { property: "og:title", content: "Salam Bumi Property | Portal Properti Terpercaya Yogyakarta" },
  { property: "og:description", content: "Portal properti terpercaya di Yogyakarta — listing dikurasi, diverifikasi, analisis investasi cerdas." },
  { property: "og:type", content: "website" },
  { property: "og:url", content: "https://salambumi.xyz" },
  { property: "og:image", content: "https://images.salambumi.xyz/kost%20dijual%20jogja.webp" },
  // JSON-LD WebSite + Organization (SSR) — pass object langsung, bukan JSON.stringify
  {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": "https://salambumi.xyz/#website",
          url: "https://salambumi.xyz",
          name: "Salam Bumi Property",
          description: "Portal properti terpercaya di Yogyakarta",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://salambumi.xyz/properties?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@type": "LocalBusiness",
          "@id": "https://salambumi.xyz/#organization",
          name: "CV Salam Bumi Property",
          url: "https://salambumi.xyz",
          logo: "https://images.salambumi.xyz/materai/fav.webp",
          telephone: "+6281391278889",
          email: "salambumiproperty@gmail.com",
          address: {
            "@type": "PostalAddress",
            addressRegion: "DI Yogyakarta",
            addressCountry: "ID",
          },
          areaServed: "DI Yogyakarta",
        },
      ],
    },
  },
];

export default function HomeRoute() {
  const { properties, testimonials, blogPosts } = useLoaderData<typeof loader>();
  return (
    <HomePage
      ssrProperties={properties}
      ssrTestimonials={testimonials}
      ssrBlogPosts={blogPosts}
    />
  );
}
