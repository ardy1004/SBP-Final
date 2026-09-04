// STASIUN 0 — BAHAN. Apa yang akan dipakai, ditampilkan SEBELUM dibuat.
//
// ─── Kenapa DNA bisa dikoreksi di sini ───────────────────────────────────────
// Kalau DNA-nya salah, videonya PASTI salah — dan membetulkannya setelah render
// berarti membuang satu dari tiga generate Google Flow yang tersedia hari itu.
// Koreksi di layar ini yang paling murah. Hasil suntingan dikirim lewat
// `params.dna` dan menang atas hasil rakitan otomatis di server.
//
// ─── Kenapa foto berperingkat, bukan sekadar daftar ──────────────────────────
// Dokumentasi Google menyebut batas 3 ingredient per generate; pemilik akun
// melaporkan 7. Alih-alih menebak, storyboard memilih sampai 7 TAPI panel
// menandai 3 teratas sebagai wajib. Kalau ternyata 3, tiga teratas sudah cukup.
import { useState, useEffect, useCallback } from 'react';
import { Loader2, ImageOff, Star, ShieldAlert, Sparkles, RotateCcw } from 'lucide-react';
import { bacaJson } from '../../../../lib/api';

export interface DnaProduk {
  fakta: { label: string; nilai: string }[];
  keunikan: string[];
  ruangTerbukti: string[];
  larangan: string[];
}
interface DnaAgent {
  nama: string; ciri: string[]; bahasaInggris: string; suara: string; fotoUrl: string | null;
}
interface FotoBahan {
  id: number; url: string; label: string | null; skor: number | null;
  catatan: string | null; dinilai: boolean; utama: boolean;
}
export interface Bahan {
  dna: DnaProduk;
  dna_agent: DnaAgent;
  foto: FotoBahan[];
  material: { total_foto: number; berlabel: number; label_unik: number; perlu_dinilai: boolean };
  rotasi: { sudah: number; maks: number };
  flow: { utama: number; maks: number };
}

// Foto properti ada di bucket PRIVAT `sbp-media` — hanya bisa lewat endpoint
// admin ber-allowlist prefiks, bukan URL publik.
function fotoSrc(key: string | null): string {
  if (!key) return '';
  return `/api/admin/media?key=${encodeURIComponent(key)}`;
}

export default function PanelBahan({ propertyId, characterId, onSiap }: {
  propertyId: number;
  characterId: number;
  /** Dipanggil tiap kali bahan berubah — induk menyimpannya untuk dikirim saat generate. */
  onSiap: (b: Bahan | null, dnaSunting: DnaProduk | null) => void;
}) {
  const [bahan, setBahan] = useState<Bahan | null>(null);
  const [dna, setDna] = useState<DnaProduk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disunting, setDisunting] = useState(false);

  useEffect(() => {
    let batal = false;
    setLoading(true); setError(''); setDisunting(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/viralframe/bahan?property_id=${propertyId}&character_id=${characterId}`,
          { credentials: 'include' },
        );
        const json = await bacaJson<Bahan>(res);
        if (batal) return;
        if (!json.success || !json.data) { setError(json.error ?? 'Gagal memuat bahan.'); return; }
        setBahan(json.data);
        setDna(json.data.dna);
        onSiap(json.data, null);
      } catch (err: unknown) {
        if (!batal) setError(err instanceof Error ? err.message : 'Gagal memuat bahan.');
      } finally {
        if (!batal) setLoading(false);
      }
    })();
    return () => { batal = true; };
    // onSiap sengaja tidak jadi dependensi — induk membuatnya ulang tiap render,
    // dan memasukkannya ke sini membuat panel memuat ulang tanpa henti.
  }, [propertyId, characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ubahDna = useCallback((baru: DnaProduk) => {
    setDna(baru);
    setDisunting(true);
    onSiap(bahan, baru);
  }, [bahan, onSiap]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-2 text-sm text-[#64748B]">
        <Loader2 size={15} className="animate-spin" /> Menyiapkan bahan…
      </div>
    );
  }
  if (error || !bahan || !dna) {
    return (
      <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 text-sm">
        {error || 'Bahan tidak tersedia.'}
      </div>
    );
  }

  const { dna_agent: agen, foto, material, rotasi, flow } = bahan;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display font-bold text-[#0F172A] text-sm">Bahan</h2>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1E40AF] font-semibold tabular-nums">
            Rotasi ke-{rotasi.sudah + 1} dari {rotasi.maks || '—'}
          </span>
          {disunting && (
            <button
              onClick={() => { setDna(bahan.dna); setDisunting(false); onSiap(bahan, null); }}
              className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#0F172A]">
              <RotateCcw size={11} /> Kembalikan
            </button>
          )}
        </div>
      </div>

      <div className="p-4 grid lg:grid-cols-2 gap-4">
        {/* ── DNA PRODUK ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5">
              DNA Produk — fakta terverifikasi
            </div>
            <div className="space-y-1">
              {dna.fakta.map((f, i) => (
                <label key={f.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#64748B] w-24 shrink-0">{f.label}</span>
                  <input
                    value={f.nilai}
                    onChange={e => {
                      const fakta = dna.fakta.map((x, j) => (j === i ? { ...x, nilai: e.target.value } : x));
                      ubahDna({ ...dna, fakta });
                    }}
                    className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#1565C0]"
                  />
                </label>
              ))}
              {dna.fakta.length === 0 && (
                <p className="text-xs text-[#94A3B8]">Listing ini belum punya data terisi sama sekali.</p>
              )}
            </div>
          </div>

          {dna.keunikan.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5 flex items-center gap-1">
                <Sparkles size={11} /> Keunikan terlihat di foto
              </div>
              <ul className="space-y-0.5">
                {dna.keunikan.map((k, i) => (
                  <li key={i} className="text-xs text-[#334155] leading-snug">• {k}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Pagar anti-halusinasi. Ini yang menutup kelas bug "dekat UGM" &
              "fully furnished" pada listing yang tidak punya keduanya. */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5 flex items-center gap-1">
              <ShieldAlert size={11} /> Dilarang disebut
            </div>
            <textarea
              value={dna.larangan.join(', ')}
              onChange={e => ubahDna({ ...dna, larangan: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              rows={2}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#1565C0] leading-relaxed"
            />
            <p className="text-[10px] text-[#94A3B8] mt-1">
              Diturunkan dari foto & data listing ini. Hapus yang memang ada tapi belum difoto.
            </p>
          </div>
        </div>

        {/* ── DNA AGENT + FOTO ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5">
              DNA Agent — diulang identik di setiap Part
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F8FAFC] border border-gray-100">
              <div className="w-11 h-11 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                {agen.fotoUrl
                  ? <img src={`/api/media?key=${encodeURIComponent(agen.fotoUrl)}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center text-[#CBD5E1]"><ImageOff size={14} /></div>}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0F172A] capitalize">{agen.nama}</div>
                <div className="text-[11px] text-[#64748B] leading-snug">{agen.ciri.join(' · ') || 'ciri belum diisi'}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5 flex items-center justify-between">
              <span>Foto — {flow.utama} teratas wajib dilampirkan</span>
              <span className="font-normal normal-case">{material.berlabel}/{material.total_foto} berlabel</span>
            </div>

            {material.perlu_dinilai ? (
              <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3 text-xs leading-relaxed">
                Foto listing ini belum dinilai AI. Penilaian berjalan otomatis saat
                “Buat Storyboard” ditekan — {material.total_foto} foto, ±6 foto per lintasan.
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {foto.map(f => (
                  <div key={f.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                    {f.url
                      ? <img src={fotoSrc(f.url)} alt={f.label ?? ''} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-[#CBD5E1]"><ImageOff size={13} /></div>}
                    {f.utama && (
                      <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#1565C0] text-white flex items-center justify-center">
                        <Star size={9} fill="currentColor" />
                      </span>
                    )}
                    {f.skor != null && (
                      <span className="absolute bottom-0 right-0 px-1 rounded-tl text-[9px] font-bold bg-black/60 text-white tabular-nums">
                        {f.skor}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8px] leading-tight bg-black/55 text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!material.perlu_dinilai && (
              <p className="text-[10px] text-[#94A3B8] mt-1.5">
                {material.label_unik} label unik → maksimal {rotasi.maks} variasi masuk akal untuk listing ini.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
