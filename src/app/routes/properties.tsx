import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, data } from "react-router";
import PropertiesPage, { type SsrListingData } from "../components/PropertiesPage";
import NotFoundPage from "../components/NotFoundPage";
import { normalizeProperty, type NormalizedProperty } from "../../lib/api";
import { parseProgrammaticSlug } from "../../lib/programmaticSeo";
// functions/_lib import bersama backend↔frontend (lihat CLAUDE.md) — sama pola
// dgn generateMetaSeo di AdminPropertyDetailPage.tsx.
import { parseLandmarkSlug, resolveApproxCoord, haversineKm, LANDMARK_RADIUS_KM } from "../../../functions/_lib/geoLandmarks.js";
import { isInertParam } from "../../../functions/_lib/queryParams.js";
import { buildPropertyUrl } from "../../../functions/_lib/propertyUrl.js";

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

// Sumber yang sama dipakai cache edge untuk membersihkan cache key — kedua sisi
// WAJIB sepakat, kalau tidak halaman kosong bisa ter-cache di kunci bersih.

const VALID_JENIS = ['rumah', 'tanah', 'kost', 'hotel', 'homestay', 'villa', 'apartment', 'ruko', 'gudang', 'komersial'];

interface SeoInfo {
  title: string;
  description: string;
  canonical: string;
  /** H1 halaman — untuk programmatic SEO ("Rumah Dijual di Sleman"), null = default */
  heading: string | null;
  /** Subteks kustom di bawah H1 (disclaimer radius perkiraan utk halaman landmark), null = teks default */
  subheading: string | null;
}

const EMPTY_FILTERS = { tujuan: '', jenis: '', provinsi: '', kabupaten: '', kecamatan: '' };

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

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
      subheading: null,
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
  // Hanya diisi via resolusi slug programmatic (bukan query param publik — tak
  // ada UI filter kelurahan) — dipakai murni utk WHERE SQL di bawah.
  let kelurahan: string | null = null;
  let lokasiLabel = 'Yogyakarta';
  let seoPath = '/properties';
  let ssrEligible = true;

  if (isProgrammatic) {
    const parsed = parseProgrammaticSlug(params.slug!);
    // Slug tak dikenal di grammar lokasi → coba grammar landmark
    // ({jenis}-dekat-{landmark}, mis. "kost-dekat-ugm") sebelum menyerah 404.
    if (!parsed) {
      const landmarkParsed = parseLandmarkSlug(params.slug!, VALID_JENIS, capitalize);
      // Grammar tak dikenal sama sekali (bukan lokasi, bukan landmark) → 404
      // (bukan menampilkan semua listing = duplicate content). Tidak throw
      // Response (app belum punya ErrorBoundary) — return data + status 404,
      // komponen merender NotFoundPage + noindex.
      if (!landmarkParsed) return notFoundResult();
      // Slug valid tapi D1 tak tersedia (mis. `npm run dev` tanpa proxy — lihat
      // CLAUDE.md) → render halaman kosong seperti path lokasi, JANGAN 404.
      if (!env?.DB) {
        return { ssr: false as const, notFound: false as const, properties: [] as NormalizedProperty[], total: 0, filters: EMPTY_FILTERS, seo: buildLandmarkSeo(landmarkParsed, 0, params.slug!) };
      }
      return await loadLandmarkPage(env, landmarkParsed, params.slug!);
    }
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
            // Fallback level ke-3: kelurahan/desa (mis. "kost-dijual-condongcatur")
            // — slug flat sama seperti kabupaten/kecamatan, tanpa prefix.
            const kelRow = await env.DB.prepare(
              "SELECT kelurahan AS v FROM properties WHERE LOWER(kelurahan) LIKE ? AND status_publish = 'published' LIMIT 1"
            ).bind(like).first();
            if (kelRow?.v) {
              kelurahan = kelRow.v as string;
              lokasiLabel = kelurahan as string;
            } else {
              // Lokasi tidak dikenal di inventori → 404
              return notFoundResult();
            }
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
    // Param di luar yang di-support → serahkan ke fetch client (CSR), KECUALI
    // param inert (pelacak iklan + diagnostik) yang terbukti tidak memengaruhi
    // hasil query. Tanpa pengecualian ini, satu klik iklan ber-fbclid membuat
    // halaman dirender KOSONG, lalu cache edge menyimpannya di bawah cache key
    // yang sudah dibersihkan dari fbclid — sehingga Googlebot ikut menerima
    // halaman tanpa satu pun listing. Lihat functions/_lib/queryParams.js.
    ssrEligible = ![...url.searchParams.keys()].some(
      k => !SUPPORTED_PARAMS.includes(k) && !isInertParam(k),
    );
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
    if (kelurahan) { conditions.push('LOWER(p.kelurahan) = LOWER(?)'); bindings.push(kelurahan); }

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
    const jenisLabel = jenisList[0] ? capitalize(jenisList[0]) : 'Properti';
    const tujuanLabel = tujuan === 'disewa' ? 'Disewa' : 'Dijual';
    const heading = `${jenisLabel} ${tujuanLabel} di ${lokasiLabel}`;
    return {
      title: `${heading} — ${countPart} | Salam Bumi Property`,
      description: `Cari ${jenisLabel.toLowerCase()} ${tujuanLabel.toLowerCase()} di ${lokasiLabel}. Semua listing dikurasi & diverifikasi langsung oleh tim Salam Bumi Property — legalitas dicek, harga transparan, nego langsung pemilik.`,
      canonical: `https://salambumi.xyz${seoPath}`,
      heading,
      subheading: null,
    };
  }
  return {
    title: `Cari Properti Dijual & Disewa di Yogyakarta — ${countPart} | Salam Bumi Property`,
    description: 'Jelajahi rumah, kost, villa, tanah & properti komersial dijual maupun disewa di Yogyakarta. Filter lokasi, harga, dan spesifikasi — semua listing terverifikasi tim SBP.',
    canonical: 'https://salambumi.xyz/properties',
    heading: null,
    subheading: null,
  };
}

// ── Halaman landmark: {jenis}-dekat-{landmark}, mis. /kost-dekat-ugm ──────────
// Terpisah dari alur lokasi (kabupaten/kecamatan) di atas karena jarak dihitung
// via Haversine di JS (SQLite/D1 tak punya fungsi trig), bukan filter SQL biasa.
interface LandmarkParsed {
  jenis: string;
  jenisLabel: string;
  landmark: { slug: string; label: string; lat: number; lon: number };
}

function buildLandmarkSeo(parsed: LandmarkParsed, total: number, slug: string): SeoInfo {
  const { jenisLabel, landmark } = parsed;
  const countPart = total > 0 ? `${total} Listing Terverifikasi` : 'Listing Terverifikasi';
  const heading = `${jenisLabel} Dekat ${landmark.label}`;
  return {
    title: `${heading} — ${countPart} | Salam Bumi Property`,
    description: `Cari ${jenisLabel.toLowerCase()} dekat ${landmark.label} (radius ±${LANDMARK_RADIUS_KM} km) di Yogyakarta. Semua listing dikurasi & diverifikasi langsung oleh tim Salam Bumi Property.`,
    canonical: `https://salambumi.xyz/${slug}`,
    heading,
    subheading: total > 0
      ? `${countPart} dalam radius ±${LANDMARK_RADIUS_KM} km dari ${landmark.label} — jarak estimasi per area (kecamatan), bukan lokasi presisi GPS.`
      : `Belum ada listing dalam radius ±${LANDMARK_RADIUS_KM} km dari ${landmark.label} saat ini.`,
  };
}

async function loadLandmarkPage(env: { DB: D1Database }, parsed: LandmarkParsed, slug: string) {
  try {
    const dataRes = await env.DB.prepare(`
      SELECT
        p.id, p.kode_listing, p.title, p.slug,
        p.jenis_properti, p.tujuan,
        p.harga, p.harga_lama, p.harga_sewa_tahun,
        p.nego, p.nett, p.harga_per_m2,
        p.jumlah_kamar_tidur, p.jumlah_kamar_mandi,
        p.luas_tanah, p.luas_bangunan, p.lebar_depan, p.lantai,
        p.legalitas, p.status_legalitas, p.furnished,
        p.kecamatan, p.kabupaten, p.provinsi,
        p.latitude, p.longitude,
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
      WHERE p.status_publish = 'published' AND p.jenis_properti = ?
        AND p.kecamatan IS NOT NULL AND p.kecamatan != ''
      ORDER BY p.properti_pilihan DESC, p.badge_premium DESC, p.badge_featured DESC, p.badge_hot DESC, p.published_at DESC
    `).bind(parsed.jenis).all();

    const rows = (dataRes.results ?? []) as Record<string, unknown>[];
    const { lat: lmLat, lon: lmLon } = parsed.landmark;

    // Filter jarak (Haversine) — resolveApproxCoord pakai koordinat properti asli
    // bila ada, fallback centroid kecamatan (approx=true). Array.sort JS stabil →
    // urutan SQL di atas (prioritas badge/tanggal) tetap terjaga untuk jarak sama.
    const withinRadius = rows
      .map(row => {
        const coord = resolveApproxCoord(row);
        if (!coord) return null;
        const distanceKm = haversineKm(coord.lat, coord.lon, lmLat, lmLon);
        return { row, distanceKm };
      })
      .filter((x): x is { row: Record<string, unknown>; distanceKm: number } => x !== null && x.distanceKm <= LANDMARK_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const total = withinRadius.length;
    const properties: NormalizedProperty[] = withinRadius
      .slice(0, SSR_LIMIT)
      .map(x => normalizeProperty(x.row as Parameters<typeof normalizeProperty>[0]));

    return {
      ssr: true as const,
      notFound: false as const,
      properties,
      total,
      filters: { ...EMPTY_FILTERS, jenis: parsed.jenis },
      seo: buildLandmarkSeo(parsed, total, slug),
    };
  } catch (e) {
    console.error('[properties loader] landmark', e);
    return { ssr: false as const, notFound: false as const, properties: [] as NormalizedProperty[], total: 0, filters: EMPTY_FILTERS, seo: buildLandmarkSeo(parsed, 0, slug) };
  }
}

const OG_IMAGE = 'https://images.salambumi.xyz/salambumi.xyz.png';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo: SeoInfo = data?.seo ?? {
    title: 'Cari Properti | Salam Bumi Property',
    description: 'Listing properti terverifikasi di Yogyakarta.',
    canonical: 'https://salambumi.xyz/properties',
    heading: null,
    subheading: null,
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
    // ItemList: halaman detail sudah punya RealEstateListing, halaman listing
    // belum punya structured data sama sekali — padahal halaman inilah yang
    // menerima trafik pencarian generik ("rumah dijual jogja"). Hanya diisi
    // saat SSR benar-benar membawa data; kalau tidak, kita akan mengirim daftar
    // kosong ke Google dan itu lebih buruk daripada tidak mengirim apa pun.
    ...(data?.ssr && data.properties.length > 0 ? [{
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: seo.title,
        numberOfItems: data.total,
        itemListElement: data.properties.slice(0, 20).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: buildPropertyUrl({
            tujuan: p.tujuan,
            jenis_properti: p.jenisRaw ?? p.jenis,
            provinsi: p.provinsi,
            kabupaten: p.kabupaten,
            kecamatan: p.kecamatan,
            slug: p.slug,
          }),
          name: p.title,
        })),
      },
    }] : []),
  ];
};

export default function PropertiesRoute() {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.notFound) return <NotFoundPage />;
  const ssrData: SsrListingData | undefined = loaderData.ssr
    ? { properties: loaderData.properties, total: loaderData.total, filters: loaderData.filters }
    : undefined;
  return <PropertiesPage ssrData={ssrData} heading={loaderData.seo.heading} subheading={loaderData.seo.subheading} />;
}
