// GET /api/admin/overview — KPI dashboard (data nyata dari DB)
// Auth: _middleware.js (admin-only, otomatis mencakup semua /api/admin/*)

import { jsonOk, jsonError, handleOptions } from '../_shared/response.js';
import { SQL_TANGGAL_WIB, sqlTanggalWibMinus, tanggalWib, SQL_BULAN_INI_WIB, sqlBulanWibMinus, bulanWib } from '../../_lib/waktu.js';

const JENIS_LABEL = {
  apartment: 'Apartment', rumah: 'Rumah', tanah: 'Tanah', kost: 'Kost',
  hotel: 'Hotel', homestay: 'Homestay/Guesthouse', villa: 'Villa',
  ruko: 'Ruko', gudang: 'Gudang', komersial: 'Komersial Lainnya',
};
const JENIS_COLORS = [
  '#1565C0', '#29B6F6', '#10B981', '#F5A623',
  '#7C3AED', '#EF4444', '#059669', '#0891B2', '#78716C', '#DC2626',
];
const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];

function fmtWaktu(dtStr) {
  if (!dtStr) return '';
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;

  try {
    const [
      listingByStatusRes,
      leadsStatsRow,
      waHariIniRow,
      agreementsStatsRes,
      viewsTotalRow,
      ownersTotalRow,
      leadsPerBulanRes,
      distribusiJenisRes,
      leadsRecentRes,
      agreementsRecentRes,
      listingsRecentRes,
      viewsPerHariRes,
    ] = await Promise.all([

      // 1. Breakdown listing per status_publish
      db.prepare(`SELECT status_publish, COUNT(*) AS cnt FROM properties GROUP BY status_publish`).all(),

      // 2. Leads: total + bulan ini + bulan lalu (untuk delta)
      db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN created_at >= ${SQL_BULAN_INI_WIB} THEN 1 ELSE 0 END) AS bulan_ini,
          SUM(CASE WHEN created_at >= ${sqlBulanWibMinus(1)}
                   AND created_at < ${SQL_BULAN_INI_WIB} THEN 1 ELSE 0 END) AS bulan_lalu
        FROM leads
      `).first(),

      // 3. Kontak WA hari ini — dari property_view_daily (lebih akurat: klik sticky bar)
      db.prepare(`
        SELECT COALESCE(SUM(wa_clicks), 0) AS cnt
        FROM property_view_daily
        WHERE tanggal = ${SQL_TANGGAL_WIB}
      `).first(),

      // 4. Breakdown agreements per status
      db.prepare(`SELECT status, COUNT(*) AS cnt FROM agreements GROUP BY status`).all(),

      // 5. Total views kumulatif (SUM views_count semua properti)
      // NOTE: bukan per-30-hari — views_count adalah counter kumulatif sejak listing dibuat
      db.prepare(`SELECT COALESCE(SUM(views_count), 0) AS total FROM properties`).first(),

      // 6. Total owners terdaftar
      db.prepare(`SELECT COUNT(*) AS cnt FROM owners`).first(),

      // 7. Leads per bulan — 6 bulan terakhir
      db.prepare(`
        SELECT strftime('%Y-%m', created_at, '+7 hours') AS ym, COUNT(*) AS leads
        FROM leads
        WHERE created_at >= ${sqlBulanWibMinus(5)}
        GROUP BY ym ORDER BY ym
      `).all(),

      // 8. Distribusi jenis properti (semua status)
      db.prepare(`
        SELECT jenis_properti, COUNT(*) AS cnt
        FROM properties GROUP BY jenis_properti ORDER BY cnt DESC
      `).all(),

      // 9. Activity: leads terbaru
      db.prepare(`
        SELECT l.nama, p.title, l.created_at
        FROM leads l LEFT JOIN properties p ON p.id = l.property_id
        ORDER BY l.created_at DESC LIMIT 4
      `).all(),

      // 10. Activity: agreements baru ditandatangani
      db.prepare(`
        SELECT a.kode_perjanjian, a.signed_at, p.title
        FROM agreements a JOIN properties p ON p.id = a.property_id
        WHERE a.status = 'signed' AND a.signed_at IS NOT NULL
        ORDER BY a.signed_at DESC LIMIT 3
      `).all(),

      // 11. Activity: listing baru published/sold
      db.prepare(`
        SELECT title, kode_listing, published_at, status_publish
        FROM properties
        WHERE status_publish IN ('published','sold') AND published_at IS NOT NULL
        ORDER BY published_at DESC LIMIT 3
      `).all(),

      // 12. Views per hari — 30 hari terakhir (untuk chart)
      db.prepare(`
        SELECT tanggal, SUM(views) AS views, SUM(wa_clicks) AS wa_clicks
        FROM property_view_daily
        WHERE tanggal >= ${sqlTanggalWibMinus(29)}
        GROUP BY tanggal
        ORDER BY tanggal ASC
      `).all(),
    ]);

    // --- KPI ---
    const listingMap = Object.fromEntries(
      (listingByStatusRes.results ?? []).map(r => [r.status_publish, r.cnt])
    );
    const agreementsMap = Object.fromEntries(
      (agreementsStatsRes.results ?? []).map(r => [r.status, r.cnt])
    );

    const kpi = {
      listing_published:  listingMap.published  ?? 0,
      listing_draft:      listingMap.draft       ?? 0,
      listing_sold:       listingMap.sold        ?? 0,
      listing_archived:   listingMap.archived    ?? 0,
      leads_total:        leadsStatsRow?.total      ?? 0,
      leads_bulan_ini:    leadsStatsRow?.bulan_ini  ?? 0,
      leads_bulan_lalu:   leadsStatsRow?.bulan_lalu ?? 0,
      wa_hari_ini:        waHariIniRow?.cnt         ?? 0,
      agreements_signed:  agreementsMap.signed      ?? 0,
      agreements_pending: agreementsMap.menunggu_ttd ?? 0,
      agreements_total:   Object.values(agreementsMap).reduce((s, v) => s + v, 0),
      views_total:        viewsTotalRow?.total      ?? 0,
      owners_total:       ownersTotalRow?.cnt       ?? 0,
    };

    // --- Leads per Bulan (isi missing month dengan 0) ---
    const leadsMap = Object.fromEntries((leadsPerBulanRes.results ?? []).map(r => [r.ym, r.leads]));
    const leads_per_bulan = Array.from({ length: 6 }, (_, i) => {
      const { ym, bulanIdx } = bulanWib(new Date(), -(5 - i));
      return { bulan: BULAN_ID[bulanIdx], leads: leadsMap[ym] ?? 0 };
    });

    // --- Distribusi Jenis ---
    const distribusi_jenis = (distribusiJenisRes.results ?? []).map((r, i) => ({
      name:  JENIS_LABEL[r.jenis_properti] ?? r.jenis_properti,
      value: r.cnt,
      color: JENIS_COLORS[i % JENIS_COLORS.length],
    }));

    // --- Aktivitas Terbaru (gabungkan + sort by waktu) ---
    const activities = [];
    for (const r of (leadsRecentRes.results ?? [])) {
      activities.push({
        tipe: 'lead', warna: '#10B981',
        teks: r.title ? `Lead baru: ${r.nama} → ${r.title}` : `Lead baru dari ${r.nama}`,
        waktu: fmtWaktu(r.created_at), _ts: r.created_at,
      });
    }
    for (const r of (agreementsRecentRes.results ?? [])) {
      activities.push({
        tipe: 'sign', warna: '#F5A623',
        teks: `Perjanjian ${r.kode_perjanjian} ditandatangani`,
        waktu: fmtWaktu(r.signed_at), _ts: r.signed_at,
      });
    }
    for (const r of (listingsRecentRes.results ?? [])) {
      const sold = r.status_publish === 'sold';
      activities.push({
        tipe: sold ? 'sold' : 'listing', warna: sold ? '#EF4444' : '#1565C0',
        teks: `${r.kode_listing}: "${r.title}" ${sold ? 'dimarkir TERJUAL' : 'dipublikasikan'}`,
        waktu: fmtWaktu(r.published_at), _ts: r.published_at,
      });
    }
    activities.sort((a, b) => {
      if (!a._ts && !b._ts) return 0;
      if (!a._ts) return 1;
      if (!b._ts) return -1;
      return new Date(b._ts) - new Date(a._ts);
    });
    const aktivitas_terbaru = activities.slice(0, 8).map(({ _ts, ...rest }) => rest);

    // --- Views per Hari (fill missing days dengan 0) ---
    const viewsMap = Object.fromEntries(
      (viewsPerHariRes.results ?? []).map(r => [r.tanggal, { views: r.views, wa_clicks: r.wa_clicks }])
    );
    // tanggalWib(), BUKAN toISOString(): bucket di DB sekarang bertanggal WIB, jadi
    // pengisi hari kosong harus memakai kalender yang sama — kalau tidak, label
    // grafik meleset satu hari dan data hari terakhir tampak selalu nol.
    const now2 = new Date();
    const views_per_hari = Array.from({ length: 30 }, (_, i) => {
      const tgl = tanggalWib(now2, -(29 - i));
      const entry = viewsMap[tgl] ?? { views: 0, wa_clicks: 0 };
      return { tanggal: tgl, views: entry.views, wa_clicks: entry.wa_clicks };
    });

    return jsonOk({ kpi, leads_per_bulan, distribusi_jenis, aktivitas_terbaru, views_per_hari });

  } catch (err) {
    // Pesan error internal cukup ke log (wrangler tail), JANGAN ke body response —
    // detail SQL/skema tidak perlu sampai ke browser meski route ini admin-only.
    console.error('[admin/overview]', err.message);
    return jsonError('Gagal mengambil data overview', 500);
  }
}

export async function onRequestOptions() {
  return handleOptions();
}
