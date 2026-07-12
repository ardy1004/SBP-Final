import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, data } from "react-router";
import PropertiesPage, { type SsrListingData } from "../components/PropertiesPage";
import NotFoundPage from "../components/NotFoundPage";
import { normalizeProperty, type NormalizedProperty } from "../../lib/api";
import { parseProgrammaticSlug } from "../../lib/programmaticSeo";

// Route module SSR untuk /properties DAN programmatic SEO /:slug
// (mis. /rumah-dijual-jogja, /kost-dijual-sleman).
// Sebelumnya kedua route ini CSR murni → crawler (Google first-pass, GPTBot,
// ClaudeBot, PerplexityBot — yang TIDAK menjalankan JS) hanya melihat skeleton
// kosong dengan meta generik. Loader ini query D1 langsung (pola home.tsx)
// sehingga konten listing + meta dinamis ada di HTML awal.

const SSR_LIMIT = 20; // = state `limit` awal PropertiesPage — hasil identik dgn fetch client

// Param URL yang di-support loader ini. Ada param lain (harga_min, q, kt, …)
// → fallback CSR seperti sebelumnya (hindari mismatch data SSR vs fetch client).
const SUPPORTED_PARAMS = ['tujuan', 'jenis', 'provinsi', 'kabupaten', 'kecamatan'];

const VALID_JENIS = ['rumah', 'tanah', 'kost', 'hotel', 'homestay', 'villa', 'apartment', 'ruko', 'gudang', 'komersial'];

interface SeoInfo {
  title: string;
  description: string;
  canonical: string;
  /** H1 halaman — untuk programmatic SEO ("Rumah Dijual di Sleman"), null = default */
  heading: string | null;
}

const EMPTY_FILTERS = { tujuan: '', jenis: '', provinsi: '', kabupaten: '', kecamatan: '' };

/** Payload 404 (slug programmatic tak dikenal) dengan status HTTP 404. */
function notFoundResult() {
  return data({
    ssr: false as const,
    notFound: true as const,
    properties: [] as NormalizedProperty[],
    total: 0,
    filters: EMPTY_FILTERS,
    seo: {
      title: 'Halaman Tidak Ditemukan | Salam Bumi Property',
      description: 'Halaman yang Anda cari tidak tersedia.',
      canonical: 'https://salambumi.xyz/properties',
      heading: null,
    } satisfies SeoInfo,
  }, { status: 404 });
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context as any)?.cloudflare?.env;
  const isProgrammatic = Boolean(params.slug);

  // ── 1. Tentukan filter dari slug programmatic ATAU query params ────────────
  let tujuan: string | null = null;
  let jenisList: string[] = [];
  let provinsi: string | null = null;
  let kabupaten: string | null = null;
  let kecamatan: string | null = null;
  let lokasiLabel = 'Yogyakarta';
  let seoPath = '/properties';
  let ssrEligible = true;

  if (isProgrammatic) {
    const parsed = parseProgrammaticSlug(params.slug!);
    // Slug tak dikenal → 404 (bukan menampilkan semua listing = duplicate content).
    // Tidak throw Response (app belum punya ErrorBoundary) — return data + status 404,
    // komponen merender NotFoundPage dan meta men-set noindex.
    if (!parsed) return notFoundResult();
    tujuan = parsed.tujuan;
    jenisList = [parsed.jenis];
    seoPath = `/${params.slug}`;

    if (parsed.lokasiToken) {
      // Resolve token lokasi → nama persis di DB (mis. 'sleman' → 'Kabupaten Sleman')
      // supaya filter SSR dan fetch client (exact match) konsisten.
      const like = `%${parsed.lokasiToken.replace(/-/g, ' ')}%`;
      if (env?.DB) {
        const kabRow = await env.DB.prepare(
          "SELECT kabupaten AS v FROM properties WHERE LOWER(kabupaten) LIKE ? AND status_publish = 'published' LIMIT 1"
        ).bind(like).first();
        if (kabRow?.v) {
          kabupaten = kabRow.v as string;
          lokasiLabel = kabupaten!.replace(/^Kabupaten\s+/i, '');
        } else {
          const kecRow = await env.DB.prepare(
            "SELECT kecamatan AS v FROM properties WHERE LOWER(kecamatan) LIKE ? AND status_publish = 'published' LIMIT 1"
          ).bind(like).first();
          if (kecRow?.v) {
            kecamatan = kecRow.v as string;
            lokasiLabel = kecamatan as string;
          } else {
            // Lokasi tidak dikenal di inventori → 404
            return notFoundResult();
          }
        }
      }
    }
  } else {
    tujuan = url.searchParams.get('tujuan');
    const jenisParam = url.searchParams.get('jenis');
    if (jenisParam) jenisList = jenisParam.split(',').map(j => j.trim()).filter(j => VALID_JENIS.includes(j));
    provinsi = url.searchParams.get('provinsi');
    kabupaten = url.searchParams.get('kabupaten');
    kecamatan = url.searchParams.get('kecamatan');
    // Param di luar yang di-support → serahkan ke fetch client (CSR)
    ssrEligible = ![...url.searchParams.keys()].some(k => !SUPPORTED_PARAMS.includes(k));
  }

  // ── 2. SEO copy (dipakai meta di bawah, dihitung setelah total didapat) ─────
  const filters = {
    tujuan: tujuan ?? '',
    jenis: jenisList.join(','),
    provinsi: provinsi ?? '',
    kabupaten: kabupaten ?? '',
    kecamatan: kecamatan ?? '',
  };

  const empty = { ssr: false as const, notFound: false as const, properties: [] as NormalizedProperty[], total: 0, filters, seo: buildSeo(isProgrammatic, seoPath, jenisList, tujuan, lokasiLabel, 0) };
  if (!env?.DB || !ssrEligible) return empty;

  // ── 3. Query D1 — WHERE identik dengan GET /api/properties ────────────────
  try {
    const conditions = ["p.status_publish = 'published'"];
    const bindings: unknown[] = [];

    if (tujuan === 'dijual') conditions.push("(p.tujuan = 'dijual' OR p.tujuan = 'dijual_disewa')");
    else if (tujuan === 'disewa') conditions.push("(p.tujuan = 'disewa' OR p.tujuan = 'dijual_disewa')");
    else if (tujuan === 'dijual_disewa') { conditions.push('p.tujuan = ?'); bindings.push(tujuan); }

    if (jenisList.length > 0) {
      conditions.push(`p.jenis_properti IN (${jenisList.map(() => '?').join(',')})`);
      bindings.push(...jenisList);
    }
    if (provinsi)  { conditions.push('LOWER(p.provinsi) = LOWER(?)');  bindings.push(provinsi); }
    if (kabupaten) { conditions.push('LOWER(p.kabupaten) = LOWER(?)'); bindings.push(kabupaten); }
    if (kecamatan) { conditions.push('LOWER(p.kecamatan) = LOWER(?)'); bindings.push(kecamatan); }

    const where = conditions.join(' AND ');
    const sqlData = `
      SELECT
        p.id, p.kode_listing, p.title, p.slug,
        p.jenis_properti, p.tujuan,
        p.harga, p.harga_lama, p.harga_sewa_tahun,
        p.nego, p.nett, p.harga_per_m2,
        p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
        p.luas_tanah, p.luas_bangunan, p.lebar_depan, p.lantai,
        p.legalitas, p.status_legalitas, p.furnished,
        p.kecamatan, p.kabupaten, p.provinsi,
        p.badge_premium, p.badge_featured, p.badge_hot,
        p.status_sold, p.properti_pilihan, p.verified,
        p.income_per_bulan, p.pengeluaran_per_bulan,
        p.views_count, p.published_at, p.updated_at,
        (SELECT url_webp FROM property_images
           WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_url,
        (SELECT alt_text  FROM property_images
           WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 1) AS cover_alt,
        (SELECT GROUP_CONCAT(url_webp, '|||') FROM (
           SELECT url_webp FROM property_images
             WHERE property_id = p.id ORDER BY is_cover DESC, urutan ASC LIMIT 5
         )) AS images_raw
      FROM properties p
      WHERE ${where}
      ORDER BY p.properti_pilihan DESC, p.badge_premium DESC, p.badge_featured DESC, p.badge_hot DESC, p.published_at DESC
      LIMIT ?
    `;
    const [dataRes, countRes] = await Promise.all([
      env.DB.prepare(sqlData).bind(...bindings, SSR_LIMIT).all(),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM properties p WHERE ${where}`).bind(...bindings).first(),
    ]);

    const properties: NormalizedProperty[] = (dataRes.results ?? []).map((row: unknown) =>
      normalizeProperty(row as Parameters<typeof normalizeProperty>[0])
    );
    const total = Number(countRes?.total ?? 0);

    return {
      ssr: true as const,
      notFound: false as const,
      properties,
      total,
      filters,
      seo: buildSeo(isProgrammatic, seoPath, jenisList, tujuan, lokasiLabel, total),
    };
  } catch (e) {
    console.error('[properties loader]', e);
    return empty;
  }
}

function buildSeo(
  isProgrammatic: boolean,
  seoPath: string,
  jenisList: string[],
  tujuan: string | null,
  lokasiLabel: string,
  total: number,
): SeoInfo {
  const countPart = total > 0 ? `${total} Listing Terverifikasi` : 'Listing Terverifikasi';
  if (isProgrammatic) {
    const jenisLabel = jenisList[0] ? jenisList[0].charAt(0).toUpperCase() + jenisList[0].slice(1) : 'Properti';
    const tujuanLabel = tujuan === 'disewa' ? 'Disewa' : 'Dijual';
    const heading = `${jenisLabel} ${tujuanLabel} di ${lokasiLabel}`;
    return {
      title: `${heading} — ${countPart} | Salam Bumi Property`,
      description: `Cari ${jenisLabel.toLowerCase()} ${tujuanLabel.toLowerCase()} di ${lokasiLabel}. Semua listing dikurasi & diverifikasi langsung oleh tim Salam Bumi Property — legalitas dicek, harga transparan, nego langsung pemilik.`,
      canonical: `https://salambumi.xyz${seoPath}`,
      heading,
    };
  }
  return {
    title: `Cari Properti Dijual & Disewa di Yogyakarta — ${countPart} | Salam Bumi Property`,
    description: 'Jelajahi rumah, kost, villa, tanah & properti komersial dijual maupun disewa di Yogyakarta. Filter lokasi, harga, dan spesifikasi — semua listing terverifikasi tim SBP.',
    canonical: 'https://salambumi.xyz/properties',
    heading: null,
  };
}

const OG_IMAGE = 'https://images.salambumi.xyz/salambumi.xyz.png';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo: SeoInfo = data?.seo ?? {
    title: 'Cari Properti | Salam Bumi Property',
    description: 'Listing properti terverifikasi di Yogyakarta.',
    canonical: 'https://salambumi.xyz/properties',
    heading: null,
  };
  if (data?.notFound) {
    return [
      { title: seo.title },
      { name: 'robots', content: 'noindex' },
    ];
  }
  return [
    { title: seo.title },
    { name: 'description', content: seo.description },
    { name: 'robots', content: 'index, follow' },
    { tagName: 'link', rel: 'canonical', href: seo.canonical },
    { property: 'og:site_name', content: 'Salam Bumi Property' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: seo.title },
    { property: 'og:description', content: seo.description },
    { property: 'og:url', content: seo.canonical },
    { property: 'og:image', content: OG_IMAGE },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: seo.title },
    { name: 'twitter:description', content: seo.description },
    { name: 'twitter:image', content: OG_IMAGE },
  ];
};

export default function PropertiesRoute() {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.notFound) return <NotFoundPage />;
  const ssrData: SsrListingData | undefined = loaderData.ssr
    ? { properties: loaderData.properties, total: loaderData.total, filters: loaderData.filters }
    : undefined;
  return <PropertiesPage ssrData={ssrData} heading={loaderData.seo.heading} />;
}
