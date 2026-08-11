import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { normalizePropertyDetail } from "../../lib/api";
import PropertyDetailPage from "../components/PropertyDetailPage";
// Import lintas backend↔frontend dari functions/_lib (pola CLAUDE.md, sama seperti
// geoLandmarks.js di routes/properties.tsx) — bucket harian WAJIB memakai ekspresi
// yang sama persis dengan jalur API, kalau tidak satu view bisa masuk tanggal
// berbeda tergantung dilayani SSR atau API.
import { SQL_TANGGAL_WIB } from "../../../functions/_lib/waktu.js";
import { cfImg, cfImgOg, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from "../../lib/img";

const ORIGIN = 'https://salambumi.xyz';

/**
 * URL absolut untuk konsumen di LUAR browser: og:image, twitter:image, dan array
 * `image` di JSON-LD. Ketiganya tidak punya base URL untuk me-resolve path relatif.
 *
 * ⚠️ Sampai 2026-08-11 hanya og:image yang diabsolutkan; array `image` di
 * RealEstateListing dikirim mentah ("/api/media?key=…") sehingga Google tidak bisa
 * mengambilnya sama sekali — dan gambar adalah field yang praktis wajib untuk rich
 * result listing properti. Satu helper untuk SEMUA jalur supaya tidak terpecah lagi.
 */
function abs(u: string): string {
  return u.startsWith('http') ? u : `${ORIGIN}${u}`;
}

/**
 * Potong di batas kata — dan kalau bisa, di batas KALIMAT.
 *
 * `slice()` mentah memotong di tengah kata ("…untuk in...") dan membuat deskripsi
 * JSON-LD berhenti menggantung ("…2 lantai, 4 KT, "). Itu bukan sekadar jelek:
 * field `description` inilah yang paling sering dikutip mentah-mentah oleh mesin
 * generatif, jadi kalimat terpenggal ikut tersalin ke jawaban AI.
 *
 * Titik akhir kalimat di 60% terakhir rentang dipakai lebih dulu (kutipan jadi utuh
 * dan tanpa elipsis); kalau tidak ada, mundur ke spasi terakhir.
 */
function potongDiBatasKata(s: string, max: number): string {
  const teks = s.trim();
  if (teks.length <= max) return teks;
  const kandidat = teks.slice(0, max);

  const akhirKalimat = Math.max(
    kandidat.lastIndexOf('. '), kandidat.lastIndexOf('! '), kandidat.lastIndexOf('? '),
  );
  if (akhirKalimat > max * 0.6) return kandidat.slice(0, akhirKalimat + 1);

  const spasi = kandidat.lastIndexOf(' ');
  // Tanpa spasi yang masuk akal (satu kata sangat panjang) lebih baik potong apa
  // adanya daripada mengembalikan potongan yang nyaris kosong.
  const dasar = spasi > max * 0.5 ? kandidat.slice(0, spasi) : kandidat;
  return dasar.replace(/[\s,;:.\-—]+$/, '') + '…';
}

// Identik dengan functions/api/properties/[slug].js
function hitungInvestmentIntelligence(p: {
  income_per_bulan: number | null;
  pengeluaran_per_bulan: number | null;
  harga: number;
}) {
  if (!p.income_per_bulan || !p.harga) return null;
  const pengeluaran = p.pengeluaran_per_bulan ?? 0;
  const bersihPerBulan = p.income_per_bulan - pengeluaran;
  const bersihPerTahun = bersihPerBulan * 12;
  const grossPerTahun = p.income_per_bulan * 12;
  if (bersihPerTahun <= 0 || p.harga <= 0) return null;
  const yieldPersen = (bersihPerTahun / p.harga) * 100;
  const capRatePersen = (grossPerTahun / p.harga) * 100;
  const paybackTahun = p.harga / bersihPerTahun;
  const skor = (y: number) => (y >= 8 ? 5 : y >= 6 ? 4 : y >= 4 ? 3 : y >= 2 ? 2 : 1);
  return {
    yield_persen: Math.round(yieldPersen * 100) / 100,
    payback_tahun: Math.round(paybackTahun * 100) / 100,
    cap_rate_persen: Math.round(capRatePersen * 100) / 100,
    income_bersih_per_bulan: bersihPerBulan,
    income_bersih_per_tahun: bersihPerTahun,
    skor_investasi: skor(yieldPersen),
  };
}

export async function loader({ params, context }: LoaderFunctionArgs) {
  const slug = params.slug;
  if (!slug) throw new Response(null, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context as any)?.cloudflare?.env;
  if (!env?.DB) throw new Response(null, { status: 503 });

  const db = env.DB as D1Database;

  try {
    // Query identik dengan GET /api/properties/:slug — tanpa kolom alamat (privasi K7)
    const row = await db.prepare(`
      SELECT
        id, kode_listing, title, slug,
        jenis_properti, tujuan,
        harga, harga_lama, harga_sewa_tahun, nego, nett, harga_per_m2,
        jumlah_kamar_tidur, jumlah_kamar_mandi,
        luas_tanah, luas_bangunan, lebar_depan, lantai,
        legalitas, furnished,
        kelurahan, kecamatan, kabupaten, provinsi,
        latitude, longitude, gmaps_link,
        deskripsi, video_youtube,
        income_per_bulan, pengeluaran_per_bulan,
        badge_premium, badge_featured, badge_hot,
        status_sold, properti_pilihan, verified,
        views_count, published_at, updated_at,
        meta_title, meta_description,
        details
      FROM properties
      WHERE slug = ? AND status_publish = 'published'
      LIMIT 1
    `).bind(slug).first();

    if (!row) throw new Response(null, { status: 404 });

    const r = row as Record<string, unknown>;

    const imagesRes = await db.prepare(`
      SELECT id, url_webp, alt_text, urutan, is_cover
      FROM property_images
      WHERE property_id = ?
      ORDER BY urutan ASC, id ASC
    `).bind(r.id).all();

    let detailsParsed: Record<string, unknown> | null = null;
    if (r.details) {
      try { detailsParsed = JSON.parse(r.details as string); } catch { /* noop */ }
    }

    const investment_intelligence = hitungInvestmentIntelligence({
      income_per_bulan: r.income_per_bulan as number | null,
      pengeluaran_per_bulan: r.pengeluaran_per_bulan as number | null,
      harga: r.harga as number,
    });

    type DbImage = { id: number; url_webp: string; alt_text: string; urutan: number; is_cover: number };
    const images = (imagesRes.results ?? []) as DbImage[];
    const coverImg = images.find(img => img.is_cover === 1) ?? images[0] ?? null;

    const apiDetail = {
      id: r.id as number,
      kode_listing: r.kode_listing as string,
      title: r.title as string,
      slug: r.slug as string,
      jenis_properti: r.jenis_properti as string,
      tujuan: r.tujuan as 'dijual' | 'disewa' | 'dijual_disewa',
      harga: r.harga as number,
      harga_lama: r.harga_lama as number | null,
      harga_sewa_tahun: r.harga_sewa_tahun as number | null,
      nego: r.nego as number,
      nett: r.nett as number,
      harga_per_m2: r.harga_per_m2 as number | null,
      jumlah_kamar_tidur: r.jumlah_kamar_tidur as number | null,
      jumlah_kamar_mandi: r.jumlah_kamar_mandi as number | null,
      luas_tanah: r.luas_tanah as number | null,
      luas_bangunan: r.luas_bangunan as number | null,
      lebar_depan: r.lebar_depan as number | null,
      lantai: r.lantai as number | null,
      legalitas: r.legalitas as string,
      furnished: r.furnished as string | null,
      kelurahan: r.kelurahan as string | null,
      kecamatan: r.kecamatan as string,
      kabupaten: r.kabupaten as string,
      provinsi: r.provinsi as string,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      gmaps_link: r.gmaps_link as string | null,
      deskripsi: r.deskripsi as string | null,
      video_youtube: r.video_youtube as string | null,
      income_per_bulan: r.income_per_bulan as number | null,
      pengeluaran_per_bulan: r.pengeluaran_per_bulan as number | null,
      badge_premium: r.badge_premium as number,
      badge_featured: r.badge_featured as number,
      badge_hot: r.badge_hot as number,
      status_sold: r.status_sold as number,
      properti_pilihan: r.properti_pilihan as number,
      verified: r.verified as number,
      views_count: r.views_count as number,
      published_at: r.published_at as string,
      updated_at: r.updated_at as string,
      cover_url: coverImg?.url_webp ?? null,
      cover_alt: coverImg?.alt_text ?? null,
      meta_title: r.meta_title as string | null,
      meta_description: r.meta_description as string | null,
      details: detailsParsed,
      images,
      investment_intelligence,
    };

    const property = normalizePropertyDetail(apiDetail);

    // Track view: increment counter kumulatif + upsert tracker harian.
    // Replikasi logic functions/api/properties/[slug].js agar KEDUA jalur konsisten.
    try {
      await Promise.all([
        db.prepare('UPDATE properties SET views_count = views_count + 1 WHERE id = ?')
          .bind(r.id).run(),
        db.prepare(`
          INSERT INTO property_view_daily (property_id, tanggal, views)
          VALUES (?, ${SQL_TANGGAL_WIB}, 1)
          ON CONFLICT(property_id, tanggal) DO UPDATE SET views = views + 1
        `).bind(r.id).run(),
      ]);
    } catch (e: any) { console.error('[views]', e?.message); }

    return { property };
  } catch (e) {
    if (e instanceof Response) throw e;
    console.error('[property-detail loader]', e);
    throw new Response(null, { status: 500 });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.property) {
    return [
      { title: "Properti Tidak Ditemukan | Salam Bumi Property" },
      { name: "robots", content: "noindex" },
    ];
  }
  const p = data.property;
  const tujuanPath = p.tujuan === 'disewa' ? 'disewa' : 'dijual';
  const jenisSlug = (p.jenisRaw ?? p.jenis).toLowerCase();
  const provSlug = p.provinsi.toLowerCase().replace(/\s+/g, '-');
  const kabSlug = p.kabupaten.toLowerCase().replace(/\s+/g, '-');
  const kecSlug = (p.kecamatan || 'jogja').toLowerCase().replace(/\s+/g, '-');
  const canonicalUrl = `https://salambumi.xyz/${tujuanPath}/${jenisSlug}/${provSlug}/${kabSlug}/${kecSlug}/${p.slug}`;

  // Title: pakai meta_title admin bila terisi, jika tidak → fallback computed (identik perilaku lama).
  const fallbackTitle = `${p.title} ${p.kecamatan} ${p.kabupaten} | Salam Bumi Property`;
  const titleSeo = p.meta_title?.trim() ? p.meta_title.trim() : fallbackTitle;

  // Judul share (og:title/twitter:title) SENGAJA beda dari titleSeo: dipakai saat link
  // di-share manual ke WhatsApp/FB, jadi pakai Judul Listing (title, human-friendly) —
  // bukan meta_title yang formatnya faktual demi menghindari duplikat di Google.
  const titleShare = p.title?.trim() ? p.title.trim() : titleSeo;

  // Description: pakai meta_description admin bila terisi, jika tidak → fallback deskripsi/lokasi (identik perilaku lama).
  const rawDesc = p.deskripsi ||
    `${p.jenis} ${tujuanPath === 'dijual' ? 'dijual' : 'disewa'} di ${p.kecamatan}, ${p.kabupaten}, ${p.provinsi}.`;
  const fallbackDesc = potongDiBatasKata(rawDesc, 155);
  const desc = p.meta_description?.trim() ? p.meta_description.trim() : fallbackDesc;
  // Dipotong ke 1200×630 pasti (lihat cfImgOg) supaya og:image:width/height di bawah
  // adalah fakta, bukan tebakan — dimensi asli foto tidak tersimpan di D1.
  const ogImage = abs(cfImgOg(p.images[0] ?? 'https://images.salambumi.xyz/materai/hg.png'));

  return [
    { title: titleSeo },
    { name: "description", content: desc },
    { name: "robots", content: "index, follow" },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:site_name", content: "Salam Bumi Property" },
    { property: "og:title", content: titleShare },
    { property: "og:description", content: desc },
    { property: "og:image", content: ogImage },
    // Tanpa dimensi, sebagian klien sosial merender kartu kecil alih-alih gambar
    // besar — merugikan tepat di jalur share WhatsApp yang jadi kanal utama SBP.
    // Halaman beranda sudah mengirim ini sejak awal; halaman detail belum.
    { property: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { property: "og:image:alt", content: titleShare },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: titleShare },
    { name: "twitter:description", content: desc },
    { name: "twitter:image", content: ogImage },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "RealEstateListing",
            name: p.title,
            // 500 (bukan 300): ini field yang paling sering dikutip mentah oleh mesin
            // generatif, dan potongan 300 karakter selalu berhenti di tengah kalimat.
            description: potongDiBatasKata(rawDesc, 500),
            // ⚠️ WAJIB absolut — schema.org tidak punya base URL. Sampai 2026-08-11
            // baris ini mengirim "/api/media?key=…" mentah sehingga Google tak pernah
            // bisa mengambil satu pun gambar listing. Lebar 1200 mengikuti anjuran
            // Google untuk rich result (≥1200px).
            image: p.images.slice(0, 5).map(u => abs(cfImg(u, 1200))),
            url: canonicalUrl,
            offers: {
              "@type": "Offer",
              price: p.harga,
              priceCurrency: "IDR",
              availability: p.status_sold
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
            },
            // addressLocality = kota/kabupaten; kelurahan & kecamatan masuk
            // addressSubLocality. Sebelumnya keduanya dijejalkan ke addressLocality
            // ("Depok, Kabupaten Sleman") — secara schema.org itu salah, dan mesin
            // pencari kehilangan sinyal wilayah yang lebih halus.
            address: {
              "@type": "PostalAddress",
              ...(([p.kelurahan, p.kecamatan].filter(Boolean).join(', '))
                ? { addressSubLocality: [p.kelurahan, p.kecamatan].filter(Boolean).join(', ') }
                : {}),
              addressLocality: p.kabupaten,
              addressRegion: p.provinsi,
              addressCountry: "ID",
            },
            // ⚠️ `geo` HANYA diemit bila kedua koordinat ada. 527 dari 533 properti
            // belum berkoordinat (entri data manual, bukan bug); memancarkan
            // GeoCoordinates bernilai null lebih buruk daripada tidak ada sama sekali
            // karena itu structured data yang tidak valid.
            ...(p.latitude != null && p.longitude != null
              ? { geo: { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude } }
              : {}),
            // Sinyal kuat untuk pencarian properti & mesin jawaban AI — datanya sudah
            // dimuat loader, sebelumnya tidak pernah dipancarkan.
            // Nama field SESUDAH normalizeProperty(): jumlah_kamar_tidur -> kamar_tidur.
            ...(p.kamar_tidur ? { numberOfRooms: p.kamar_tidur } : {}),
            ...(p.kamar_mandi ? { numberOfBathroomsTotal: p.kamar_mandi } : {}),
            ...(p.luas_bangunan
              ? { floorSize: { "@type": "QuantitativeValue", value: p.luas_bangunan, unitCode: "MTK" } }
              : {}),
            ...(p.luas_tanah
              ? { lotSize: { "@type": "QuantitativeValue", value: p.luas_tanah, unitCode: "MTK" } }
              : {}),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://salambumi.xyz" },
              {
                "@type": "ListItem",
                position: 2,
                name: tujuanPath === 'dijual' ? "Dijual" : "Disewa",
                item: `https://salambumi.xyz/properties?tujuan=${tujuanPath}`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: p.jenis,
                item: `https://salambumi.xyz/properties?tujuan=${tujuanPath}&jenis=${jenisSlug}`,
              },
              {
                "@type": "ListItem",
                position: 4,
                name: p.kabupaten,
                item: `https://salambumi.xyz/properties?tujuan=${tujuanPath}&jenis=${jenisSlug}&kabupaten=${encodeURIComponent(p.kabupaten)}`,
              },
              { "@type": "ListItem", position: 5, name: p.title, item: canonicalUrl },
            ],
          },
        ],
      },
    },
  ];
};

export default function PropertyDetailRoute() {
  const { property } = useLoaderData<typeof loader>();
  return <PropertyDetailPage ssrProperty={property} />;
}
