import { useState, useEffect } from 'react';
import { TrendingUp, Loader2, AlertTriangle, Info, Film } from 'lucide-react';
import { getPerforma, type PerformaData, type PerformaKelompok, type PerformaGrid, type StatusGrupPerforma } from '../../../lib/api';

// Performa Konten (2026-11-18, metode direvisi 2026-11-19) — metrik DITARIK
// OTOMATIS dari Buffer & Zernio (functions/api/internal/viralframe/tarik-metrik.js,
// tiap jam :20). Semua angka & aturan statistik dihitung server (metrikKonten.js
// → analisisPerforma); halaman ini hanya menampilkan. Prinsipnya: TIDAK ada skor
// AI — indeks = views hari ke-7 ÷ median akun+platform+MINGGU yang sama, hanya
// untuk akun berjangkauan sehat, dan kelompok ber-n kecil (video ATAU listing)
// ditandai, bukan diberi peringkat. Perbandingan ANTAR agent ada di grid
// kesehatan akun — indeks selalu relatif terhadap akunnya sendiri.

const PLATFORM: Record<string, string> = {
  youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram',
};
const HARI = [14, 30, 60, 90];

const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('id-ID'));
const fmtX = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}×`);
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const fmtHarga = (h: number | null) => (h == null || h <= 0 ? null : h >= 1e9 ? `Rp ${(h / 1e9).toFixed(1).replace('.0', '')} M` : `Rp ${Math.round(h / 1e6)} jt`);
const warnaIndeks = (n: number | null) => (n == null ? 'text-[#94A3B8]' : n >= 1.5 ? 'text-emerald-600' : n >= 1 ? 'text-[#0F172A]' : 'text-[#94A3B8]');

export default function AdminViralFramePerformaPage() {
  const [hari, setHari] = useState(30);
  const [platform, setPlatform] = useState('');
  const [agent, setAgent] = useState(0);
  const [data, setData] = useState<PerformaData | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat('');
    getPerforma({ hari, platform: platform || undefined, characterId: agent || undefined })
      .then(r => {
        if (batal) return;
        // Bentuk respons diperiksa, bukan dipercaya — apiFetch hanya meng-cast.
        if (r.success && Array.isArray(r.data?.ringkasan) && Array.isArray(r.data?.pola) && Array.isArray(r.data?.top)) {
          setData({
            ...r.data,
            grid: Array.isArray(r.data.grid) ? r.data.grid : [],
            akun_lemah: Array.isArray(r.data.akun_lemah) ? r.data.akun_lemah : [],
            tak_ditemukan: Array.isArray(r.data.tak_ditemukan) ? r.data.tak_ditemukan : [],
          });
        } else { setData(null); setGalat(r.error ?? 'Gagal memuat performa'); }
      })
      .catch(() => { if (!batal) setGalat('Koneksi bermasalah'); })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [hari, platform, agent]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2"><TrendingUp size={20} className="text-[#1565C0]" /> Performa Konten</h1>
        <p className="text-sm text-[#64748B]">
          Metrik ditarik otomatis dari Buffer &amp; Zernio tiap jam.
          {data?.ditarik_terakhir && <> Data terakhir: {new Date(data.ditarik_terakhir.replace(' ', 'T') + 'Z').toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}.</>}
        </p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full p-0.5">
          {HARI.map(h => (
            <button key={h} onClick={() => setHari(h)}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${hari === h ? 'bg-[#1565C0] text-white' : 'text-[#64748B] hover:bg-gray-50'}`}>
              {h} hari
            </button>
          ))}
        </div>
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs bg-white">
          <option value="">Semua platform</option>
          {Object.entries(PLATFORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={agent} onChange={e => setAgent(Number(e.target.value))} className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs bg-white">
          <option value={0}>Semua agent</option>
          {(data?.agent ?? []).map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
        </select>
        {memuat && <Loader2 size={16} className="animate-spin text-[#94A3B8]" />}
      </div>

      {galat && <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">{galat}</div>}

      {data && data.n_post === 0 && !memuat && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-[#64748B]">
          Belum ada data metrik untuk filter ini. Penarikan berjalan otomatis tiap jam di menit :20 (07:20–00:20 WIB), satu agent per putaran.
        </div>
      )}

      {data && data.n_post > 0 && (
        <>
          <div className="flex items-start gap-2 bg-[#F0F7FF] border border-[#BFDBFE] rounded-2xl px-4 py-3 text-xs text-[#1E3A8A]">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>{fmt(data.n_post)}</strong> post tercatat, <strong>{fmt(data.n_matang)}</strong> sudah berumur ≥ 7 hari.
              {' '}Yang dibandingkan: <strong>{fmt(data.n_video_berindeks)}</strong> video dari <strong>{fmt(data.n_listing_berindeks)}</strong> listing, hanya dari akun yang jangkauannya sehat di platform itu.
              {' '}<strong>Indeks</strong> = views hari ke-7 ÷ median views akun yang sama, di platform yang sama, <strong>pada minggu yang sama</strong> — <strong>1,00×</strong> = performa biasa akun itu minggu itu,
              {' '}jadi naik-turunnya jangkauan akun dari minggu ke minggu tidak ikut terbaca sebagai mutu konten. Indeks video = median lintas platformnya.
              {' '}<strong>Kualitas</strong> = total interaksi ÷ total views × 1.000. <strong>Retensi</strong> = rata-rata durasi tonton ÷ durasi video.
              {' '}Kelompok di bawah {data.metode?.n_min_video ?? 8} video atau {data.metode?.n_min_listing ?? 3} listing ditandai <em>data kurang</em> — satu listing yang diposting 40× bukan 40 bukti.
            </div>
          </div>

          {data.tak_ditemukan.length > 0 && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-xs text-red-800">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Post tidak ditemukan di provider</strong> — diterima scheduler dan sudah lewat 2 hari, tapi tidak pernah muncul di data Buffer/Zernio.
                {' '}Penyebab yang pernah terukur: akun ditangguhkan (YouTube), otorisasi channel hilang (Buffer → Refresh channel), channel disambung ulang
                {' '}(ID baru belum diambil — Akun Agent → &quot;Ambil dari API&quot;), atau provider memang tidak memberi analitik (Threads lewat Zernio).
                <ul className="mt-1 space-y-0.5">
                  {data.tak_ditemukan.map(a => (
                    <li key={`${a.akun_id}-${a.platform}`}>
                      {a.agent ?? `#${a.akun_id}`} · {PLATFORM[a.platform] ?? a.platform}: {fmt(a.n_ditemukan)} dari {fmt(a.n_lama)} post ditemukan
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {data.akun_lemah.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Jangkauan nyaris nol</strong> — median views di bawah {data.metode?.ambang_sehat_views ?? 10} atau di bawah {Math.round((data.metode?.ambang_sehat_rasio ?? 0.05) * 100)}% median platformnya.
                {' '}Dikeluarkan dari indeks (variasinya mencerminkan platform hidup/mati, bukan mutu konten). Periksa akunnya (dibatasi, privat, atau baru):
                <ul className="mt-1 space-y-0.5">
                  {/* Satu baris per agent — rinciannya ada di grid kesehatan akun. */}
                  {[...new Map(data.akun_lemah.map(a => [a.akun_id, a.agent])).entries()].map(([id, agent]) => (
                    <li key={id}>
                      <strong>{agent}</strong>:{' '}
                      {data.akun_lemah.filter(a => a.akun_id === id)
                        .map(a => `${PLATFORM[a.platform] ?? a.platform} ${fmt(a.median_views_d7)} (umumnya ${fmt(a.median_platform)})`).join(' · ')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Ringkasan per platform */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {data.ringkasan.map(s => (
              <div key={s.platform} className="bg-white rounded-2xl border border-gray-100 p-3">
                <div className="text-xs font-semibold text-[#64748B]">{PLATFORM[s.platform] ?? s.platform}</div>
                <div className="text-lg font-bold text-[#0F172A]">{fmt(s.median_views_d7)}</div>
                <div className="text-[10px] text-[#94A3B8]">median views hari ke-7</div>
                <div className="mt-1.5 text-[11px] text-[#475569] space-y-0.5">
                  <div>{fmt(s.n_matang)}/{fmt(s.n_post)} post matang</div>
                  <div>Kualitas {s.kualitas_per_1000 == null ? '—' : s.kualitas_per_1000.toFixed(1)}/1.000</div>
                  <div>Retensi {fmtPct(s.retensi)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Kesehatan akun per platform — tempat membandingkan ANTAR agent */}
          {data.grid.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-sm font-semibold text-[#0F172A]">Kesehatan akun per platform</div>
              <p className="text-[11px] text-[#64748B] mb-2">
                Median views hari ke-7 · tren median per minggu terbit (lama → baru) · porsi post 0 views · retensi.
                {' '}Bandingkan antar agent di sini — indeks di bawah selalu relatif terhadap akunnya sendiri.
              </p>
              <GridAkun grid={data.grid} />
            </div>
          )}

          {/* Top konten */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-sm font-semibold text-[#0F172A] mb-3">
              Konten di atas biasanya (indeks median lintas platform{(data.metode?.top_min_platform ?? 2) > 1 ? `, min. ${data.metode?.top_min_platform ?? 2} platform sehat` : ''})
            </div>
            {data.top.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">Belum ada video dengan ≥ {data.metode?.top_min_platform ?? 2} platform sehat berumur 7 hari.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.top.map((v, i) => (
                  <div key={v.video_id} className="flex gap-3 border border-gray-100 rounded-xl p-2.5">
                    <div className="w-16 h-28 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {v.poster_url ? <img src={v.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Film size={18} className="text-[#CBD5E1]" />}
                    </div>
                    <div className="min-w-0 flex-1 text-[11px] text-[#475569] space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0F172A] truncate">#{i + 1} {v.kode_listing ?? `video ${v.video_id}`}</span>
                        <span className={`font-bold ${warnaIndeks(v.indeks)}`}>{fmtX(v.indeks)}</span>
                      </div>
                      <div className="truncate">{[v.jenis_properti, v.kecamatan, fmtHarga(v.harga)].filter(Boolean).join(' · ')}</div>
                      <div className="truncate">Agent {v.agent ?? '—'}{v.talent && v.talent !== v.agent ? ` · wajah ${v.talent}` : ''}{v.durasi_detik ? ` · ${Math.round(v.durasi_detik)} dtk` : ''}</div>
                      <div className="pt-0.5 text-[10px] text-[#64748B]">
                        {v.platform.map(p => `${PLATFORM[p.platform] ?? p.platform} ${fmt(p.views_d7)} (${fmtX(p.indeks)})`).join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pola per dimensi */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.pola.filter(d => d.kelompok.length > 0).map(d => (
              <div key={d.dimensi} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-sm font-semibold text-[#0F172A]">{d.dimensi}</div>
                  <div className="text-[10px] text-[#94A3B8]">{fmt(d.n_terisi)} video</div>
                </div>
                <TabelPola kelompok={d.kelompok} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TabelPola({ kelompok }: { kelompok: PerformaKelompok[] }) {
  const maks = Math.max(1, ...kelompok.filter(k => !k.data_kurang).map(k => k.median_indeks ?? 0));
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-[#94A3B8] text-left">
          <th className="font-medium pb-1">Nilai</th>
          <th className="font-medium pb-1 text-right whitespace-nowrap" title="Jumlah video / listing berbeda">Video / listing</th>
          <th className="font-medium pb-1 pl-2">Indeks median</th>
          <th className="font-medium pb-1 text-right" title="Porsi video di atas biasanya akunnya">Menang</th>
          <th className="font-medium pb-1 text-right">Kualitas</th>
          <th className="font-medium pb-1 text-right">Retensi</th>
        </tr>
      </thead>
      <tbody>
        {kelompok.map(k => (
          <tr key={k.nilai} className={k.data_kurang ? 'text-[#CBD5E1]' : 'text-[#334155]'}>
            <td className="py-0.5 pr-2 max-w-[140px] truncate" title={k.nilai}>
              {k.nilai}
              {k.data_kurang && <span className="ml-1 px-1 rounded bg-gray-100 text-[9px] text-[#94A3B8]">data kurang</span>}
            </td>
            <td className="py-0.5 text-right whitespace-nowrap">{k.n} / {k.n_listing ?? '—'}</td>
            <td className="py-0.5 pl-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 rounded-full bg-gray-100 flex-1 min-w-[40px]">
                  <div className={`h-1.5 rounded-full ${k.data_kurang ? 'bg-gray-200' : (k.median_indeks ?? 0) >= 1 ? 'bg-emerald-500' : 'bg-[#94A3B8]'}`}
                    style={{ width: `${Math.min(100, ((k.median_indeks ?? 0) / maks) * 100)}%` }} />
                </div>
                <span className={`w-11 text-right font-semibold ${k.data_kurang ? '' : warnaIndeks(k.median_indeks)}`}>{fmtX(k.median_indeks)}</span>
              </div>
            </td>
            <td className="py-0.5 text-right">{fmtPct(k.menang)}</td>
            <td className="py-0.5 text-right">{k.kualitas_per_1000 == null ? '—' : k.kualitas_per_1000.toFixed(1)}</td>
            <td className="py-0.5 text-right">{fmtPct(k.retensi)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const URUTAN_GRID = ['facebook', 'instagram', 'tiktok', 'youtube', 'threads'];

const GAYA_STATUS: Record<StatusGrupPerforma, { kotak: string; label: string }> = {
  sehat: { kotak: 'bg-emerald-50/60 border-emerald-100', label: 'Sehat — ikut dihitung di indeks' },
  lemah: { kotak: 'bg-amber-50 border-amber-200', label: 'Jangkauan nyaris nol — dikeluarkan dari indeks' },
  data_kurang: { kotak: 'bg-gray-50 border-gray-100', label: 'Data kurang (< 5 post berumur 7 hari)' },
  tanpa_data: { kotak: 'bg-gray-50 border-dashed border-gray-200', label: 'Belum ada post bermetrik' },
};

function GridAkun({ grid }: { grid: PerformaGrid[] }) {
  const platforms = URUTAN_GRID.filter(p => grid.some(g => g.platform === p));
  const agents = [...new Map(grid.map(g => [g.akun_id, g.agent ?? `#${g.akun_id}`])).entries()];
  const sel = new Map(grid.map(g => [`${g.akun_id}|${g.platform}`, g]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[11px] border-separate border-spacing-1">
        <thead>
          <tr className="text-left text-[#94A3B8]">
            <th className="font-medium">Agent</th>
            {platforms.map(p => <th key={p} className="font-medium">{PLATFORM[p]}</th>)}
          </tr>
        </thead>
        <tbody>
          {agents.map(([id, nama]) => (
            <tr key={id}>
              <td className="pr-2 pt-2 align-top font-semibold text-[#0F172A] whitespace-nowrap">{nama}</td>
              {platforms.map(p => {
                const g = sel.get(`${id}|${p}`);
                return <td key={p} className="align-top">{g ? <SelGrid g={g} /> : <div className="px-2 py-1.5 text-[#CBD5E1]">—</div>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelGrid({ g }: { g: PerformaGrid }) {
  const s = GAYA_STATUS[g.status] ?? GAYA_STATUS.data_kurang;
  const awal = g.tren[0]?.median;
  const akhir = g.tren[g.tren.length - 1]?.median;
  const arah = g.tren.length >= 2 && awal != null && akhir != null && awal > 0
    ? (akhir >= awal * 1.5 ? '↑' : akhir <= awal / 1.5 ? '↓' : '→')
    : null;
  const judul = `${s.label}. ${g.n_matang}/${g.n_post} post berumur ≥ 7 hari. Tren: ${g.tren.map(t => `minggu ${t.minggu} = ${fmt(t.median)} (${t.n} post)`).join(', ') || '—'}`;
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${s.kotak}`} title={judul}>
      <div className={`text-xs font-bold ${g.status === 'lemah' ? 'text-amber-700' : 'text-[#0F172A]'}`}>
        {g.status === 'tanpa_data' ? '—' : fmt(g.median_views_d7)}
      </div>
      {g.tren.length >= 2 && (
        <div className="text-[10px] text-[#64748B] whitespace-nowrap">
          <span className={arah === '↓' ? 'text-red-600' : arah === '↑' ? 'text-emerald-600' : ''}>{arah}</span> {g.tren.map(t => fmt(t.median)).join('→')}
        </div>
      )}
      {g.status !== 'tanpa_data' && (
        <div className="text-[10px] text-[#64748B] whitespace-nowrap">
          {g.persen_nol ? `nol ${fmtPct(g.persen_nol)} · ` : ''}ret {fmtPct(g.retensi)}
        </div>
      )}
      {g.cakupan_rendah && <div className="text-[10px] font-semibold text-red-600 whitespace-nowrap">{fmt(g.n_ditemukan)}/{fmt(g.n_lama)} ditemukan</div>}
    </div>
  );
}
