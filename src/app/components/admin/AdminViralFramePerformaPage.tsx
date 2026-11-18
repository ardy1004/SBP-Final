import { useState, useEffect } from 'react';
import { TrendingUp, Loader2, AlertTriangle, Info, Film } from 'lucide-react';
import { getPerforma, type PerformaData, type PerformaKelompok } from '../../../lib/api';

// Performa Konten (2026-11-18) — metrik DITARIK OTOMATIS dari Buffer & Zernio
// (functions/api/internal/viralframe/tarik-metrik.js, tiap jam :20).
// Semua angka & aturan statistik dihitung server (metrikKonten.js →
// analisisPerforma); halaman ini hanya menampilkan. Prinsipnya: TIDAK ada skor
// AI — indeks = views hari ke-7 ÷ median akun+platform yang sama, jadi akun
// besar tidak otomatis menang, dan kelompok ber-n kecil ditandai, bukan diberi
// peringkat.

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
        if (r.success && Array.isArray(r.data?.ringkasan) && Array.isArray(r.data?.pola) && Array.isArray(r.data?.top)) setData(r.data);
        else { setData(null); setGalat(r.error ?? 'Gagal memuat performa'); }
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
              <strong>{fmt(data.n_post)}</strong> post tercatat, <strong>{fmt(data.n_matang)}</strong> sudah berumur ≥ 7 hari dan dipakai untuk perbandingan.
              {' '}<strong>Indeks</strong> = views hari ke-7 ÷ median views akun yang sama di platform yang sama — <strong>1,00×</strong> = performa biasa akun itu,
              {' '}<strong>2,00×</strong> = dua kali lipat. <strong>Kualitas</strong> = (likes + komentar + share + simpan) per 1.000 views. <strong>Retensi</strong> = rata-rata durasi tonton ÷ durasi video.
            </div>
          </div>

          {data.akun_lemah.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Jangkauan nyaris nol</strong> — median views akun ini di bawah 5% median platformnya. Periksa akunnya (dibatasi, privat, atau baru):
                <ul className="mt-1 space-y-0.5">
                  {data.akun_lemah.map(a => (
                    <li key={`${a.akun_id}-${a.platform}`}>
                      {a.agent} · {PLATFORM[a.platform] ?? a.platform}: median {fmt(a.median_views_d7)} views vs {fmt(a.median_platform)} umumnya ({a.n} post)
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

          {/* Top konten */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-sm font-semibold text-[#0F172A] mb-3">Konten terbaik (indeks rata-rata lintas platform, min. 2 platform)</div>
            {data.top.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">Belum ada video dengan ≥ 2 platform berumur 7 hari.</p>
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
                      {(v.dna.hook || v.dna.sudut) && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {[v.dna.hook, v.dna.sudut, v.dna.naratif, v.dna.foto_pembuka && `buka: ${v.dna.foto_pembuka}`].filter(Boolean).map(t => (
                            <span key={t as string} className="px-1.5 py-0.5 rounded-full bg-[#F0F7FF] text-[#1565C0] text-[10px]">{t}</span>
                          ))}
                        </div>
                      )}
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
                  <div className="text-[10px] text-[#94A3B8]">{fmt(d.n_terisi)} post</div>
                </div>
                <TabelPola kelompok={d.kelompok} />
              </div>
            ))}
          </div>
          {data.pola.some(d => d.dimensi.startsWith('Hook') && d.kelompok.length === 0) && (
            <p className="text-[11px] text-[#94A3B8]">
              Dimensi Creative DNA (hook, sudut, struktur) hanya terisi untuk video yang dibuat lewat meja kerja ViralFrame — upload manual tidak punya catatan DNA.
            </p>
          )}
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
          <th className="font-medium pb-1 text-right">n</th>
          <th className="font-medium pb-1 pl-2">Indeks median</th>
          <th className="font-medium pb-1 text-right" title="Porsi post di atas median akunnya">Menang</th>
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
            <td className="py-0.5 text-right">{k.n}</td>
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
