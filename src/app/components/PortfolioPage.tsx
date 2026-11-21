import { useState } from 'react';
import { redirect, useLoaderData, Link } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { pageMeta } from '../../lib/pageMeta';
import { urlFotoPortfolio, type PortfolioPublik } from '../../lib/api';
import { ambilPortfolioPublik, KATEGORI_PORTFOLIO, labelKategori } from '../../../functions/_lib/portfolio.js';

// /portfolio — bukti kerja nyata (2026-11-21, migrasi 0062): foto AJB, survey
// lokasi, serah terima kunci yang diunggah admin (Admin → Portfolio). Dulu
// berisi data mock dan diredirect ke beranda; sekarang data D1 lewat SSR.
// Tanpa satu pun item tampil → tetap diarahkan ke beranda (halaman kosong
// justru merusak kesan kredibel).

export const meta = () => pageMeta({
  title: 'Portofolio — Bukti Kerja | Salam Bumi Property',
  description: 'Dokumentasi transaksi, AJB, dan survey lokasi properti yang didampingi tim Salam Bumi Property di Yogyakarta.',
  path: '/portfolio',
});

export async function loader({ context }: LoaderFunctionArgs) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context as any)?.cloudflare?.env;
  let items: PortfolioPublik[] = [];
  if (env?.DB) {
    try {
      items = await ambilPortfolioPublik(env.DB, 200);
    } catch (err) {
      console.error('[portfolio loader]', (err as Error)?.message);
    }
  }
  if (items.length === 0) throw redirect('/');
  return { items };
}

// Tanggal dari teks "YYYY-MM-DD" diformat MANUAL — Intl/Date bergantung zona
// waktu & locale mesin, sumber klasik hydration mismatch (server UTC, klien WIB).
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function tanggalPendek(t: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t ?? '');
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1] ?? ''} ${m[1]}` : null;
}

export default function PortfolioPage() {
  const { items } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<string>('semua');
  const kategoriAda = KATEGORI_PORTFOLIO.filter(k => items.some(i => i.kategori === k.id));
  const tampil = filter === 'semua' ? items : items.filter(i => i.kategori === filter);

  return (
    <div className="pt-nav">
      <section className="py-14" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-3">Bukti Kerja Kami</h1>
          <p className="text-white/75">Dokumentasi transaksi, AJB, dan survey lokasi yang kami dampingi langsung</p>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {kategoriAda.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-8 justify-center">
              {[{ id: 'semua', label: 'Semua' }, ...kategoriAda].map(k => (
                <button key={k.id} type="button" onClick={() => setFilter(k.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    filter === k.id ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'
                  }`}>
                  {k.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {tampil.map(it => {
              const tgl = tanggalPendek(it.tanggal);
              return (
                <figure key={it.id} id={`p-${it.id}`} className="scroll-mt-24 bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  <a href={urlFotoPortfolio(it.foto_key)} target="_blank" rel="noopener" className="block relative aspect-square bg-[#E2E8F0] group">
                    <img src={urlFotoPortfolio(it.thumb_key)} alt={`${labelKategori(it.kategori)}${it.keterangan ? ` — ${it.keterangan}` : ''}`}
                      width={480} height={480} loading="lazy" decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 text-[11px] font-semibold text-[#0F172A]">
                      {labelKategori(it.kategori)}
                    </span>
                  </a>
                  <figcaption className="p-3 space-y-1">
                    {it.keterangan && <p className="text-sm text-[#0F172A] leading-snug">{it.keterangan}</p>}
                    {(it.lokasi || tgl) && (
                      <p className="text-xs text-[#64748B]">{[it.lokasi, tgl].filter(Boolean).join(' · ')}</p>
                    )}
                    {it.url_listing && (
                      <Link to={it.url_listing} className="inline-block text-xs font-semibold text-[#1565C0] hover:underline">Lihat listing →</Link>
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
