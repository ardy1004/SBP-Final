import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, data } from "react-router";
import PropertiesPage, { type SsrListingData } from "../components/PropertiesPage";
import NotFoundPage from "../components/NotFoundPage";
import { normalizeProperty, type NormalizedProperty } from "../../lib/api";
import { parseProgrammaticSlug } from "../../lib/programmaticSeo";
// functions/_lib import bersama backend↔frontend (lihat CLAUDE.md) — sama pola
// dgn generateMetaSeo di AdminPropertyDetailPage.tsx.
import { parseLandmarkSlug, peringkatDekatLandmark, LANDMARK_RADIUS_KM } from "../../../functions/_lib/geoLandmarks.js";
import { isInertParam } from "../../../functions/_lib/queryParams.js";
import { buildPropertyUrl } from "../../../functions/_lib/propertyUrl.js";
import { cfImg } from "../../lib/img";
import { urlHalaman, type PaginationInfo } from "../../lib/pagination";

// Route module SSR untuk /properties DAN programmatic SEO /:slug
// (mis. /rumah-dijual-jogja, /kost-dijual-sleman).
// Sebelumnya kedua route ini CSR murni → crawler (Google first-pass, GPTBot,
// ClaudeBot, PerplexityBot — yang TIDAK menjalankan JS) hanya melihat skeleton
// kosong dengan meta generik. Loader ini query D1 langsung (pola home.tsx)
// sehingga konten listing + meta dinamis ada di HTML awal.

const SSR_LIMIT = 20; // = state `limit` awal PropertiesPage — hasil identik dgn fetch client

const ORIGIN = 'https://salambumi.xyz';

// Param URL yang di-support loader ini. Ada param lain (harga_min, q, kt, …)
// → fallback CSR seperti sebelumnya (hindari mismatch data SSR vs fetch client).
//
// ⚠️ 'page' WAJIB ada di daftar ini. Daftar inilah yang menentukan `ssrEligible`
// di bawah; kalau 'page' tidak terdaftar, ?page=2 membuat SSR mengembalikan
// halaman KOSONG dan cache edge menyimpannya — mekanisme yang sama persis dengan
// bug fbclid yang didokumentasikan di komentar `ssrEligible` di bawah.
const SUPPORTED_PARAMS = ['tujuan', 'jenis', 'provinsi', 'kabupaten', 'kecamatan', 'page'];

/** Batas atas nomor halaman — jaring pengaman terhadap URL ?page=999999 karangan crawler. */
const MAX_PAGE = 500;

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

/**
 * Pemetaan jenis properti → tipe schema.org untuk item di dalam ItemList.
 * Yang TIDAK terdaftar di sini (tanah, ruko, gudang, komersial, hotel) sengaja
 * jatuh ke 'RealEstateListing': semuanya bukan tempat tinggal, jadi 'Residence'
 * akan salah secara semantik dan itu lebih buruk daripada tipe generik.
 */
const SCHEMA_TYPE_JENIS: Record<string, string> = {
  rumah: 'SingleFamilyResidence',
  villa: 'SingleFamilyResidence',
  homestay: 'SingleFamilyResidence',
  apartment: 'Apartment',
  kost: 'Residence',
};

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

/**
 * Payload 404 dengan status HTTP 404. Dipakai untuk TIGA kondisi:
 *   1. slug programmatic tak dikenal grammar-nya (perilaku lama)
 *   2. halaman programmatic tanpa satu pun listing (gate konten tipis)
 *   3. nomor halaman di luar jangkauan (?page=999)
 *
 * Untuk (2): sampai 2026-08-11 ambang "minimal 3 listing" hanya diterapkan saat
 * MENYUSUN sitemap, bukan di route-nya — jadi URL yang tak lolos ambang tetap
 * balas 200 + `index, follow` dengan isi nol. Search Console mencatat akibatnya:
 * 15 halaman "Di-crawl - saat ini tidak diindeks". Kasus terburuknya
 * /ruko-dijual-yogyakarta, yang menangkap 19 tayangan untuk kueri komersial nyata
 * padahal inventori ruko di D1 NOL — meranking permintaan yang tak bisa dilayani.
 */
function notFoundResult() {
  return data({
    ssr: false as const,
    notFound: true as const,
    properties: [] as NormalizedProperty[],
    total: 0,
    pagination: null as PaginationInfo | null,
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
  const page = parsePage(url.searchParams.get('page'));
  const offset = (page - 1) * SSR_LIMIT;

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
      // Gate konten tipis di bawah sengaja TIDAK berlaku di sini: tanpa DB kita
      // tidak tahu jumlah listing sebenarnya, dan 404 karena database mati akan
      // menghapus halaman yang sebetulnya berisi dari indeks.
      if (!env?.DB) {
        return { ssr: false as const, notFound: false as const, properties: [] as NormalizedProperty[], total: 0, pagination: null as PaginationInfo | null, filters: EMPTY_FILTERS, seo: buildLandmarkSeo(landmarkParsed, 0, params.slug!, 1) };
      }
      return await loadLandmarkPage(env, landmarkParsed, params.slug!, page, offset);
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

  // Path dasar untuk href paginasi & canonical — membawa filter yang sedang aktif
  // tapi TIDAK membawa `page`. Untuk /properties, hanya param yang benar-benar
  // memengaruhi hasil query yang ikut; param inert (fbclid, utm_*) sengaja dibuang
  // supaya tautan paginasi tidak memperbanyak varian URL dengan isi identik.
  const basePath = isProgrammatic
    ? seoPath
    : (() => {
        const qs = new URLSearchParams();
        for (const k of SUPPORTED_PARAMS) {
          if (k === 'page') continue;
          const v = url.searchParams.get(k);
          if (v) qs.set(k, v);
        }
        const s = qs.toString();
        return s ? `/properties?${s}` : '/properties';
      })();

  const empty = { ssr: false as const, notFound: false as const, properties: [] as NormalizedProperty[], total: 0, pagination: null as PaginationInfo | null, filters, seo: buildSeo(isProgrammatic, basePath, jenisList, tujuan, lokasiLabel, 0, 1) };
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
      LIMIT ? OFFSET ?
    `;
    const [dataRes, countRes] = await Promise.all([
      env.DB.prepare(sqlData).bind(...bindings, SSR_LIMIT, offset).all(),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM properties p WHERE ${where}`).bind(...bindings).first(),
    ]);

    const properties: NormalizedProperty[] = (dataRes.results ?? []).map((row: unknown) =>
      normalizeProperty(row as Parameters<typeof normalizeProperty>[0])
    );
    const total = Number(countRes?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / SSR_LIMIT));

    // Gate konten tipis — lihat notFoundResult(). HANYA untuk halaman programmatic:
    // /properties adalah katalog utama dan tidak boleh pernah 404 walau kombinasi
    // filternya kebetulan menghasilkan nol.
    if (isProgrammatic && total === 0) return notFoundResult();

    // Nomor halaman di luar jangkauan → 404, bukan halaman kosong ber-200. Tanpa ini
    // ruang paginasi jadi tak terbatas dan crawler menghabiskan anggaran perayapan
    // di URL yang semuanya berisi nol listing.
    if (total > 0 && page > totalPages) return notFoundResult();

    return {
      ssr: true as const,
      notFound: false as const,
      properties,
      total,
      pagination: { page, totalPages, basePath } as PaginationInfo | null,
      filters,
      seo: buildSeo(isProgrammatic, basePath, jenisList, tujuan, lokasiLabel, total, page),
    };
  } catch (e) {
    console.error('[properties loader]', e);
    return empty;
  }
}

/**
 * Sufiks judul untuk halaman ke-2 dan seterusnya. Tanpa ini seluruh halaman
 * paginasi berjudul identik — sinyal duplikat yang persis ingin kita hindari.
 */
function sufiksHalaman(page: number): string {
  return page > 1 ? ` — Halaman ${page}` : '';
}

function buildSeo(
  isProgrammatic: boolean,
  basePath: string,
  jenisList: string[],
  tujuan: string | null,
  lokasiLabel: string,
  total: number,
  page: number,
): SeoInfo {
  const countPart = total > 0 ? `${total} Listing Terverifikasi` : 'Listing Terverifikasi';
  // ⚠️ Canonical MANDIRI per halaman (…?page=2 menunjuk dirinya sendiri), bukan
  // menunjuk halaman 1. Meng-canonical-kan semua halaman ke halaman 1 adalah pola
  // lama yang justru membuat Google membuang halaman dalam — padahal justru di
  // halaman dalam itulah 514 listing yang belum terindeks berada.
  const canonical = `${ORIGIN}${urlHalaman(basePath, page)}`;
  if (isProgrammatic) {
    const jenisLabel = jenisList[0] ? capitalize(jenisList[0]) : 'Properti';
    const tujuanLabel = tujuan === 'disewa' ? 'Disewa' : 'Dijual';
    const heading = `${jenisLabel} ${tujuanLabel} di ${lokasiLabel}`;
    return {
      title: `${heading} — ${countPart}${sufiksHalaman(page)} | Salam Bumi Property`,
      description: `Cari ${jenisLabel.toLowerCase()} ${tujuanLabel.toLowerCase()} di ${lokasiLabel}. Semua listing dikurasi & diverifikasi langsung oleh tim Salam Bumi Property — legalitas dicek, harga transparan, nego langsung pemilik.`,
      canonical,
      heading,
      subheading: null,
    };
  }
  return {
    title: `Cari Properti Dijual & Disewa di Yogyakarta — ${countPart}${sufiksHalaman(page)} | Salam Bumi Property`,
    description: 'Jelajahi rumah, kost, villa, tanah & properti komersial dijual maupun disewa di Yogyakarta. Filter lokasi, harga, dan spesifikasi — semua listing terverifikasi tim SBP.',
    canonical,
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

function buildLandmarkSeo(parsed: LandmarkParsed, total: number, slug: string, page: number): SeoInfo {
  const { jenisLabel, landmark } = parsed;
  const countPart = total > 0 ? `${total} Listing Terverifikasi` : 'Listing Terverifikasi';
  const heading = `${jenisLabel} Dekat ${landmark.label}`;
  return {
    title: `${heading} — ${countPart}${sufiksHalaman(page)} | Salam Bumi Property`,
    description: `Cari ${jenisLabel.toLowerCase()} dekat ${landmark.label} di Yogyakarta — dalam radius ±${LANDMARK_RADIUS_KM} km maupun yang disebut dekat ${landmark.label} di judul listing. Semua listing dikurasi & diverifikasi langsung oleh tim Salam Bumi Property.`,
    canonical: `${ORIGIN}${urlHalaman(`/${slug}`, page)}`,
    heading,
    // ⚠️ Sejak 2026-08-12 daftar ini TIDAK lagi murni radius: listing yang
    // judulnya menyebut landmark ikut masuk walau centroid kecamatannya di luar
    // cincin. Kalimat lama ("dalam radius ±3,5 km") karena itu jadi klaim yang
    // tidak lagi benar untuk seluruh isi halaman — dan di /kost-dekat-uii
    // justru TIDAK BENAR SAMA SEKALI, karena ke-30 listingnya masuk lewat judul.
    subheading: total > 0
      ? `${countPart} di sekitar ${landmark.label} — dihimpun dari radius ±${LANDMARK_RADIUS_KM} km per area (kecamatan, bukan GPS presisi) dan dari listing yang menyebut ${landmark.label} di judulnya.`
      : `Belum ada listing di sekitar ${landmark.label} saat ini.`,
  };
}

async function loadLandmarkPage(env: { DB: D1Database }, parsed: LandmarkParsed, slug: string, page: number, offset: number) {
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

    // Peringkat "dekat landmark" — SATU SUMBER dengan chatbot
    // (functions/_lib/searchProperties.js) sejak 2026-08-12. Sebelumnya halaman
    // ini punya salinan haversine sendiri dan keduanya sudah menyimpang.
    // Selain radius, sebutan landmark DI JUDUL kini ikut dihitung: 0 dari 184
    // kost punya koordinat asli sehingga radius sebenarnya cuma proksi
    // kecamatan — /kost-dekat-uii 404 dengan nol hasil padahal 30 kost menyebut
    // UII di judulnya. Array.sort JS stabil → urutan SQL (badge/tanggal) tetap
    // terjaga di dalam lapis yang sama.
    const withinRadius = peringkatDekatLandmark(rows, parsed.landmark);

    const total = withinRadius.length;
    const totalPages = Math.max(1, Math.ceil(total / SSR_LIMIT));

    // Gate konten tipis — sama seperti jalur lokasi. Ini yang menutup kombinasi
    // landmark tanpa listing (mis. /kost-dekat-uii, /villa-dekat-ugm): 10 jenis ×
    // 11 landmark = 110 URL, hanya 36 yang lolos ambang sitemap ≥3, dan sisanya
    // selama ini tetap balas 200 + `index, follow` dengan nol hasil.
    if (total === 0) return notFoundResult();
    if (page > totalPages) return notFoundResult();

    const properties: NormalizedProperty[] = withinRadius
      // Jarak dihitung di JS (D1 tak punya fungsi trig), jadi paginasinya juga di
      // JS — irisan array, bukan OFFSET SQL.
      .slice(offset, offset + SSR_LIMIT)
      // Baris D1 datang sebagai Record<string, unknown> sehingga TypeScript tidak
      // melihat irisan dengan ApiPropertyListItem — lewat `unknown` dulu, sesuai
      // saran compiler. Bentuknya dijamin oleh SELECT di atas yang kolomnya
      // sengaja disamakan dengan GET /api/properties.
      .map(x => normalizeProperty(x as unknown as Parameters<typeof normalizeProperty>[0]));

    return {
      ssr: true as const,
      notFound: false as const,
      properties,
      total,
      pagination: { page, totalPages, basePath: `/${slug}` } as PaginationInfo | null,
      filters: { ...EMPTY_FILTERS, jenis: parsed.jenis },
      seo: buildLandmarkSeo(parsed, total, slug, page),
    };
  } catch (e) {
    console.error('[properties loader] landmark', e);
    // Query gagal ≠ tidak ada listing. Jangan 404 di sini — kegagalan D1 sesaat
    // tidak boleh menghapus halaman yang sebenarnya berisi dari indeks Google.
    return { ssr: false as const, notFound: false as const, properties: [] as NormalizedProperty[], total: 0, pagination: null as PaginationInfo | null, filters: EMPTY_FILTERS, seo: buildLandmarkSeo(parsed, 0, slug, 1) };
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

  const pag = data?.pagination ?? null;

  /**
   * Item ItemList yang DIPERKAYA. Sebelumnya tiap item hanya position+url+name —
   * kompetitor (rumah123) mengirim entitas properti utuh di level kategori, dan
   * itu bahan yang bisa dipakai mesin pencari maupun mesin generatif tanpa harus
   * membuka halaman detail satu per satu.
   *
   * `geo` sengaja TIDAK diemit: hanya 6 dari 535 properti punya koordinat, dan
   * NormalizedProperty tidak membawanya. Menyusul saat pengisian koordinat.
   */
  const itemsLd = (data?.properties ?? []).slice(0, SSR_LIMIT).map((p, i) => {
    const jenisRaw = String(p.jenisRaw ?? '').toLowerCase();
    const url = buildPropertyUrl({
      tujuan: p.tujuan,
      jenis_properti: p.jenisRaw ?? p.jenis,
      provinsi: p.provinsi,
      kabupaten: p.kabupaten,
      kecamatan: p.kecamatan,
      slug: p.slug,
    });
    const cover = p.images?.[0];
    return {
      '@type': 'ListItem',
      position: (pag ? (pag.page - 1) * SSR_LIMIT : 0) + i + 1,
      item: {
        '@type': SCHEMA_TYPE_JENIS[jenisRaw] ?? 'RealEstateListing',
        '@id': url,
        url,
        name: p.title,
        address: {
          '@type': 'PostalAddress',
          ...(p.kecamatan ? { addressSubLocality: p.kecamatan } : {}),
          addressLocality: p.kabupaten,
          addressRegion: p.provinsi,
          addressCountry: 'ID',
        },
        // URL gambar WAJIB absolut — sama alasannya dengan JSON-LD di halaman detail.
        ...(cover ? { image: `${ORIGIN}${cfImg(cover, 800)}` } : {}),
        ...(p.harga
          ? { offers: { '@type': 'Offer', price: p.harga, priceCurrency: 'IDR',
              availability: p.status_sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } }
          : {}),
        ...(p.kamar_tidur ? { numberOfBedrooms: p.kamar_tidur } : {}),
        ...(p.kamar_mandi ? { numberOfBathroomsTotal: p.kamar_mandi } : {}),
        ...(p.luas_bangunan
          ? { floorSize: { '@type': 'QuantitativeValue', value: p.luas_bangunan, unitCode: 'MTK' } }
          : {}),
        ...(p.luas_tanah
          ? { lotSize: { '@type': 'QuantitativeValue', value: p.luas_tanah, unitCode: 'MTK' } }
          : {}),
      },
    };
  });

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
    // rel prev/next: Google sudah tidak memakainya sebagai sinyal indeksasi, tapi
    // Bing masih, dan biayanya nol. Tautan <a href> di komponen tetap jalur utama.
    ...(pag && pag.page > 1
      ? [{ tagName: 'link', rel: 'prev', href: `${ORIGIN}${urlHalaman(pag.basePath, pag.page - 1)}` }]
      : []),
    ...(pag && pag.page < pag.totalPages
      ? [{ tagName: 'link', rel: 'next', href: `${ORIGIN}${urlHalaman(pag.basePath, pag.page + 1)}` }]
      : []),
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
        // ⚠️ Jumlah item yang BENAR-BENAR dirender, bukan total katalog. Sampai
        // 2026-08-11 baris ini mengirim data.total (mis. 213) padahal
        // itemListElement hanya berisi 20 — schema yang menjanjikan sesuatu yang
        // tidak ada di halaman. Total keseluruhan tetap tampil sebagai teks di
        // halaman dan di <title>, tempat yang semestinya.
        numberOfItems: itemsLd.length,
        itemListElement: itemsLd,
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
  return (
    <PropertiesPage
      ssrData={ssrData}
      heading={loaderData.seo.heading}
      subheading={loaderData.seo.subheading}
      pagination={loaderData.pagination ?? null}
    />
  );
}
