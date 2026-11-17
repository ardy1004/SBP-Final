// Modal "Pindahkan ke agent lain" — Konten Agent (2026-11-17).
//
// PINDAH, bukan SALIN: baris video berganti pemilik antrean, file R2-nya tetap
// (bucket bersama tanpa identitas agent). Video tidak akan tayang di akun asal.
// Semua aturan ada di server (aksi 'transfer' di agent-videos/bulk.js); modal
// ini hanya membantu memilih tujuan dan menjelaskan hasilnya.

import { useEffect, useState } from 'react';
import { Loader2, X, ArrowRightLeft } from 'lucide-react';
import { bacaJson, getAgentAccounts, type AgentAccount } from '../../../../lib/api';
import { agentCocok } from './AgentGrid';

export interface VideoTransfer {
  id: number;
  jenis_properti: string;
  /** Agent produsen bila video ini sudah pernah dipindah — talent di videonya. */
  asal_nama: string | null;
}

interface HasilTransfer {
  affected: number;
  dilewati: Record<AlasanLewat, number[]>;
}

type AlasanLewat = 'pernah_dijadwalkan' | 'di_sampah' | 'sudah_di_tujuan' | 'tidak_ada' | 'berubah_bersamaan';

// Urutan = urutan tampil. Kalimatnya menjelaskan AKIBAT, bukan cuma kode alasan —
// admin perlu tahu kenapa jumlah yang pindah lebih sedikit dari yang dipilih.
const ALASAN_LEWAT: Record<AlasanLewat, string> = {
  pernah_dijadwalkan: 'pernah dikirim ke scheduler. Kalau dipindah, video ini bisa tayang dua kali',
  di_sampah: 'ada di Sampah',
  sudah_di_tujuan: 'sudah ada di antrean agent tujuan',
  tidak_ada: 'sudah tidak ada (mungkin baru dihapus)',
  berubah_bersamaan: 'berubah saat diproses (mungkin baru dijadwalkan). Muat ulang lalu coba lagi',
};

export default function TransferAgentModal({ videos, asal, onClose, onSelesai }: {
  videos: VideoTransfer[];
  asal: { id: number; nama: string };
  onClose: () => void;
  onSelesai: () => void;
}) {
  const [phase, setPhase] = useState<'muat' | 'form' | 'submitting' | 'done'>('muat');
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [tujuanId, setTujuanId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasil, setHasil] = useState<HasilTransfer | null>(null);

  useEffect(() => {
    let batal = false;
    getAgentAccounts().then(r => {
      if (batal) return;
      // apiFetch cuma meng-CAST — bentuknya diperiksa, bukan dipercaya.
      const items = r.success && Array.isArray(r.data?.items) ? r.data.items : null;
      if (!items) { setErrorMsg(r.error ?? 'Gagal memuat daftar agent'); setPhase('form'); return; }
      setAgents(items.filter(a => a.character_id !== asal.id));
      setPhase('form');
    });
    return () => { batal = true; };
  }, [asal.id]);

  const tujuan = agents.find(a => a.character_id === tujuanId) ?? null;
  // Talent = produsen pertama, bukan pemilik antrean sekarang: video yang sudah
  // pernah dipindah membawa wajah agent asalnya, bukan wajah `asal` di sini.
  const talent = [...new Set(videos.map(v => v.asal_nama ?? asal.nama))];
  const luarSpesialis = tujuan ? videos.filter(v => !agentCocok(tujuan.spesialis, v.jenis_properti)).length : 0;

  const submit = async () => {
    if (!tujuan) return;
    setErrorMsg('');
    setPhase('submitting');
    try {
      const res = await fetch('/api/admin/viralframe/agent-videos/bulk', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transfer', ids: videos.map(v => v.id), character_id: tujuan.character_id }),
      });
      const j = await bacaJson<HasilTransfer>(res);
      if (!j.success || typeof j.data?.affected !== 'number' || typeof j.data.dilewati !== 'object' || j.data.dilewati === null) {
        setErrorMsg(j.error ?? `HTTP ${res.status}`);
        setPhase('form');
        return;
      }
      setHasil(j.data);
      setPhase('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Koneksi bermasalah');
      setPhase('form');
    }
  };

  const bisaTutup = phase === 'form' || phase === 'muat';

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={bisaTutup ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
            <ArrowRightLeft size={15} className="text-[#1565C0]" /> Pindahkan ke Agent Lain
          </h3>
          {phase !== 'submitting' && (
            <button onClick={phase === 'done' ? onSelesai : onClose} className="p-1 rounded-lg hover:bg-gray-100" title="Tutup"><X size={16} /></button>
          )}
        </div>

        {phase === 'muat' && (
          <div className="py-6 text-center text-sm text-[#64748B]"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Memuat daftar agent…</div>
        )}

        {phase === 'form' && (
          <>
            <p className="text-xs text-[#64748B] mb-3">
              <strong className="text-[#0F172A]">{videos.length} video</strong> dari antrean {asal.nama} akan dipindah ke
              ujung antrean agent tujuan. Video ini tidak akan tayang di akun {asal.nama}.
            </p>

            {agents.length === 0 ? (
              <p className="text-xs text-[#94A3B8] mb-3">Tidak ada agent lain.</p>
            ) : (
              <div className="space-y-1.5 mb-3">
                {agents.map(a => {
                  // Stok yang benar-benar akan dikirim cron (stok_antre), bukan
                  // jumlah tab Aktif — video berriwayat tidak ikut antrean.
                  const stok = a.stok_antre ?? a.video_aktif;
                  const hari = a.kuota > 0 ? Math.floor(stok / a.kuota) : null;
                  const dipilih = tujuanId === a.character_id;
                  return (
                    <label key={a.character_id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors ${
                        dipilih ? 'border-[#1565C0] bg-[#F0F7FF]' : 'border-gray-100 hover:bg-gray-50'
                      }`}>
                      <input type="radio" name="tujuan-transfer" checked={dipilih}
                        onChange={() => setTujuanId(a.character_id)} className="accent-[#1565C0]" />
                      <span className="flex-1 min-w-0 font-medium text-[#0F172A] truncate">{a.nama}</span>
                      {/* Stok dihitung dengan rumus yang sama seperti kartu Akun
                          Agent, supaya dua tempat tidak pernah menyebut angka beda. */}
                      <span className={`text-[11px] flex-shrink-0 ${
                        stok === 0 ? 'text-red-600 font-semibold' : hari != null && hari < 3 ? 'text-amber-700' : 'text-[#94A3B8]'
                      }`}>
                        {stok === 0 ? 'stok habis' : `${stok} video`}
                        {stok > 0 && hari != null && ` · ±${hari} hari`}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Peringatan talent WAJIB tampil: foto agent produsen dipakai sebagai
                referensi render, jadi wajah & suaranya ikut ke akun tujuan. */}
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mb-2">
              ⚠️ Video ini menampilkan talent <strong>{talent.join(', ')}</strong>.
              {tujuan ? <> Setelah dipindah, akun <strong>{tujuan.nama}</strong> akan memposting video berwajah {talent.join(', ')}.</> : ' Wajah dan suaranya ikut ke akun tujuan.'}
            </p>
            {tujuan && luarSpesialis > 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mb-2">
                {luarSpesialis} dari {videos.length} video di luar spesialis {tujuan.nama} ({tujuan.spesialis.join(', ')}).
              </p>
            )}
            <p className="text-[11px] text-[#94A3B8] mb-3">
              Video yang pernah dikirim ke scheduler otomatis dilewati, supaya tidak tayang dua kali.
            </p>

            {errorMsg && <p className="text-xs text-red-600 mb-3">{errorMsg}</p>}
            <button onClick={submit} disabled={!tujuan}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-40">
              {tujuan ? `Pindahkan ${videos.length} video ke ${tujuan.nama}` : 'Pilih agent tujuan'}
            </button>
          </>
        )}

        {phase === 'submitting' && (
          <div className="py-6 text-center text-sm text-[#64748B]">
            <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Memindahkan {videos.length} video…
          </div>
        )}

        {phase === 'done' && hasil && (
          <div className="space-y-2">
            <p className={`text-sm font-semibold ${hasil.affected > 0 ? 'text-emerald-600' : 'text-[#64748B]'}`}>
              {hasil.affected > 0
                ? `✅ ${hasil.affected} video dipindah ke ${tujuan?.nama ?? 'agent tujuan'}.`
                : 'Tidak ada video yang dipindah.'}
            </p>
            {(Object.keys(ALASAN_LEWAT) as AlasanLewat[]).map(k => {
              const n = Array.isArray(hasil.dilewati[k]) ? hasil.dilewati[k].length : 0;
              return n > 0 && (
                <p key={k} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  {n} video dilewati: {ALASAN_LEWAT[k]}.
                </p>
              );
            })}
            <button onClick={onSelesai} className="w-full mt-1 py-2 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90">Selesai</button>
          </div>
        )}
      </div>
    </div>
  );
}
