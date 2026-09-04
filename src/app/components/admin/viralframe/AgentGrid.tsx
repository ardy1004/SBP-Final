// ViralFrame — layar PERTAMA: deretan agent, bukan lagi daftar 558 properti.
//
// ─── Kenapa agent dulu, baru properti (2026-09-04) ───────────────────────────
// Kolom `spesialis` di `viralframe_agent_accounts` (migrasi 0037) sudah lama
// berisi jenis properti tiap agent, tapi selama ini hanya dipakai untuk
// MENYARANKAN agent saat upload — tidak pernah jadi navigasi. Layar ini
// membalik arahnya: pilih agent → lihat listing yang jadi spesialisasinya.
//
// `spesialis` KOSONG berarti bebas semua jenis (Monica Vera), bukan "belum
// diisi" — jangan tampilkan sebagai agent tanpa inventori.
//
// ⚠️ Kartu WAJIB menampilkan jumlah listing yang sebenarnya. Inventori antar
// agent sangat timpang (diukur ke D1 produksi 2026-09-04: Hana 273 listing,
// Vina 5, Lisa 5, Andi 6). Menyembunyikan angka itu membuat agent bersisa
// tipis baru ketahuan SETELAH diklik — kejutan yang tidak perlu.
import { Sparkles, ImageOff, ListChecks } from 'lucide-react';
import { cfImg } from '../../../../lib/img';

// Foto agent = objek publik di R2 (prefix `viralframe-characters/`), jadi bisa
// lewat endpoint publik /api/media + resize Cloudflare. Dulu diimpor dari
// workspaceShared.tsx yang ikut terhapus saat ViralFrame dibangun ulang; ditaruh
// di sini karena AgentGrid satu-satunya pemakainya sekarang. Kalau nanti ada
// pemakai kedua, barulah pindahkan ke modul bersama — bukan sebaliknya.
function thumbSrc(url: string | null, width: number): string {
  if (!url) return '';
  return cfImg(`/api/media?key=${encodeURIComponent(url)}`, width);
}

export interface AgentRow {
  id: number;
  nama: string;
  foto_url: string;
  /** Jenis properti yang jadi spesialisasi. Kosong = bebas semua jenis. */
  spesialis?: string[];
}

/** Ringkasan inventori per agent — dihitung induk dari daftar properti yang sudah dimuat. */
export interface AgentStat {
  total: number;
  adaKonten: number;
  /** Pesanan produksi yang belum selesai (tabel `viralframe_orders`). */
  antre: number;
}

// Selaras dengan JENIS_COLORS di AdminViralFramePage.tsx.
const JENIS_WARNA: Record<string, string> = {
  rumah: '#1565C0', kost: '#7C3AED', villa: '#10B981',
  tanah: '#F5A623', hotel: '#EF4444', apartment: '#0891B2',
  homestay: '#059669', gudang: '#78716C', komersial: '#DC2626',
  ruko: '#B45309', pabrik: '#57534E', gedung: '#475569',
};

function rapikanNama(n: string): string {
  return n.replace(/\b\w/g, c => c.toUpperCase());
}

export function agentCocok(spesialis: string[] | undefined, jenis: string): boolean {
  // Daftar kosong = bebas semua jenis (Monica Vera).
  if (!spesialis || spesialis.length === 0) return true;
  return spesialis.includes(jenis);
}

export default function AgentGrid({ agents, stats, onPilih, loading }: {
  agents: AgentRow[];
  stats: Record<number, AgentStat>;
  onPilih: (a: AgentRow) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-gray-100 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-[#64748B]">
          Belum ada agent. Tambahkan lewat workspace ViralFrame → Pilih Karakter.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {agents.map(a => {
        const s = stats[a.id] ?? { total: 0, adaKonten: 0, antre: 0 };
        const bebas = !a.spesialis || a.spesialis.length === 0;
        const kosong = s.total === 0;
        const foto = thumbSrc(a.foto_url, 320);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onPilih(a)}
            disabled={kosong}
            className={`group text-left bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
              kosong
                ? 'border-gray-100 opacity-55 cursor-not-allowed'
                : 'border-gray-100 hover:border-[#1565C0] hover:shadow-md'
            }`}
          >
            <div className="relative aspect-square bg-gray-100 overflow-hidden">
              {foto ? (
                <img
                  src={foto}
                  alt={a.nama}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#CBD5E1]">
                  <ImageOff size={26} />
                </div>
              )}
              {bebas && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                  <Sparkles size={10} /> Semua jenis
                </span>
              )}
              {/* Antrean produksi terlihat sejak layar agent — supaya tumpukan
                  pekerjaan tidak baru ketahuan setelah kartunya diklik. */}
              {s.antre > 0 && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950 shadow-sm">
                  <ListChecks size={10} /> {s.antre} antre
                </span>
              )}
            </div>

            <div className="p-3">
              <div className="font-display font-bold text-[#0F172A] text-sm truncate">{rapikanNama(a.nama)}</div>

              <div className="flex flex-wrap gap-1 mt-1.5 min-h-[18px]">
                {bebas ? (
                  <span className="text-[10px] text-[#94A3B8]">bebas memilih listing apa pun</span>
                ) : (
                  a.spesialis!.map(j => (
                    <span key={j}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                      style={{ background: JENIS_WARNA[j] ?? '#64748B' }}>
                      {j}
                    </span>
                  ))
                )}
              </div>

              <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-[#0F172A] tabular-nums leading-none">
                  {s.total}
                  <span className="text-[11px] font-normal text-[#94A3B8] ml-1">listing</span>
                </span>
                {s.total > 0 && (
                  <span className="text-[11px] text-[#64748B] tabular-nums">
                    {s.adaKonten} ada konten
                  </span>
                )}
              </div>

              {kosong && (
                <p className="text-[10px] text-[#94A3B8] mt-1.5">Belum ada listing untuk spesialisasi ini.</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
