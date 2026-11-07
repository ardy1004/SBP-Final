// Tombol "Susun jam semua agent" (2026-11-07).
//
// Menyusun ulang jam tayang (jam di Buffer/Zernio) agent utama + semua agent
// mode Manual sekaligus, supaya tidak ada dua akun tayang di menit yang sama.
// Aturannya hidup di server (functions/_lib/susunJam.js); panel ini hanya
// meminta PRATINJAU, menampilkannya, lalu meminta server MENERAPKAN dengan
// `variasi` yang sama. Jam tidak pernah dikirim dari sini.
//
// Fetch ditulis langsung di komponen (bukan fungsi baru di src/lib/api.ts):
// api.ts ikut bundle SSR yang anggarannya sudah mepet, sedangkan panel ini
// hanya pernah dimuat di halaman admin.

import { useState } from 'react';
import { Wand2, Loader2, Shuffle, Check, X } from 'lucide-react';
import { bacaJson } from '../../../../lib/api';

interface BarisRencana { id: number; nama: string; utama: boolean; slots: string[]; slots_lama: string[] }
interface HasilSusun {
  diterapkan: boolean;
  variasi: number;
  interval_menit: number;
  jarak_menit: number;
  gelombang: { nama: string; mulai: string; jumlah: number }[];
  rencana: BarisRencana[];
  tidak_ikut: { id: number; nama: string; alasan: string }[];
}

async function mintaSusun(variasi: number, terapkan: boolean) {
  const res = await fetch('/api/admin/viralframe/agent-accounts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aksi: 'susun_jam', variasi, terapkan }),
  });
  return bacaJson<HasilSusun>(res);
}

export default function SusunJamPanel({ modeTerpusat, onTerapkan }: {
  modeTerpusat: boolean;
  /** Dipanggil setelah susunan TERSIMPAN — pemanggil wajib memuat ulang data & menutup form yang terbuka. */
  onTerapkan: () => void;
}) {
  const [hasil, setHasil] = useState<HasilSusun | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [menerapkan, setMenerapkan] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  const pratinjau = async (variasi: number) => {
    setMemuat(true); setPesan(null);
    const r = await mintaSusun(variasi, false);
    setMemuat(false);
    if (r.success && r.data) setHasil(r.data);
    else { setHasil(null); setPesan({ ok: false, teks: r.error ?? 'Gagal menyusun jam' }); }
  };

  const terapkan = async () => {
    if (!hasil) return;
    setMenerapkan(true); setPesan(null);
    const r = await mintaSusun(hasil.variasi, true);
    setMenerapkan(false);
    if (r.success && r.data?.diterapkan) {
      setHasil(null);
      setPesan({ ok: true, teks: `Jam ${r.data.rencana.length} agent tersimpan. Berlaku mulai pengiriman berikutnya ke Buffer/Zernio — jadwal yang sudah terkirim tidak berubah.` });
      onTerapkan();
    } else {
      setPesan({ ok: false, teks: r.error ?? 'Gagal menerapkan susunan' });
    }
  };

  const berubah = (b: BarisRencana) => JSON.stringify(b.slots) !== JSON.stringify([...b.slots_lama].sort());

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={modeTerpusat || memuat || menerapkan} onClick={() => pratinjau(0)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50">
          {memuat && !hasil ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          Susun jam semua agent
        </button>
        <p className="text-[10px] text-[#64748B] flex-1 min-w-[16rem]">
          {modeTerpusat
            ? 'Hanya berlaku di mode Per agent — di mode Terpusat semua agent memakai jam agent utama.'
            : 'Menyusun ulang jam tayang agent utama + semua agent mode Manual dalam 5 gelombang primetime, berjarak 20 menit antar akun dengan urutan berbeda tiap gelombang — tidak ada dua akun yang tayang di menit yang sama. Ada pratinjau dulu sebelum disimpan.'}
        </p>
      </div>

      {pesan && <p className={`text-[11px] ${pesan.ok ? 'text-emerald-700' : 'text-red-600'}`}>{pesan.teks}</p>}

      {hasil && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <div className="text-[11px] text-[#64748B]">
            Gelombang: {hasil.gelombang.map(g => `${g.nama} ${g.mulai}`).join(' · ')} · jarak {hasil.jarak_menit} menit antar akun ·
            geser +{hasil.interval_menit} menit/hari sama untuk semua akun
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-[#94A3B8]">
                  <th className="py-1 pr-6 font-semibold w-px whitespace-nowrap">Agent</th>
                  <th className="py-1 font-semibold">Jam tayang baru <span className="font-normal">(jam lama dicoret)</span></th>
                </tr>
              </thead>
              <tbody>
                {hasil.rencana.map(b => (
                  <tr key={b.id} className="border-t border-gray-50 align-top">
                    <td className="py-1.5 pr-6 font-medium text-[#0F172A] whitespace-nowrap capitalize">
                      {b.nama}{b.utama && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-semibold normal-case">utama</span>}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {b.slots.map(j => <span key={j} className="px-1.5 py-0.5 rounded-md bg-[#F0F7FF] text-[#1565C0] font-semibold tabular-nums">{j}</span>)}
                      </div>
                      {berubah(b) && (
                        <div className="mt-0.5 text-[10px] text-[#94A3B8] line-through tabular-nums">{[...b.slots_lama].sort().join(' · ')}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasil.tidak_ikut.length > 0 && (
            <p className="text-[10px] text-[#64748B]">
              Tidak ikut: {hasil.tidak_ikut.map(t => `${t.nama} (${t.alasan})`).join(', ')}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={menerapkan} onClick={terapkan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
              {menerapkan ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Terapkan ke {hasil.rencana.length} agent
            </button>
            <button type="button" disabled={memuat || menerapkan} onClick={() => pratinjau(hasil.variasi + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-[#334155] hover:bg-gray-50 disabled:opacity-50"
              title="Susunan lain dengan aturan yang sama">
              {memuat ? <Loader2 size={12} className="animate-spin" /> : <Shuffle size={12} />} Acak ulang
            </button>
            <button type="button" disabled={menerapkan} onClick={() => { setHasil(null); setPesan(null); }}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[#64748B] hover:bg-gray-50">
              <X size={12} /> Batal
            </button>
            <span className="text-[10px] text-[#94A3B8]">Belum ada yang tersimpan sampai Anda menekan Terapkan.</span>
          </div>
        </div>
      )}
    </div>
  );
}
