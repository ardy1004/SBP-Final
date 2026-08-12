import { useState, useEffect, useCallback } from 'react';
import { getScheduleSlotsStatus, type StatusSlotAkun } from '../../../../lib/api';

// Indikator slot harian SATU akun.
//
// Sejak migrasi 0041 slot tidak lagi global dan tidak lagi berjam tetap: tiap
// akun punya kuota sendiri (agent utama 3, agent lain naik bertahap menurut
// hari nyata), jamnya diundi di dalam jendela primetime, dan tiap platform
// digeser beberapa menit supaya tidak terbit bersamaan.
export default function SlotIndicatorStrip({ characterId, refreshKey }: { characterId: number; refreshKey?: number }) {
  const [data, setData] = useState<StatusSlotAkun | null>(null);
  const [buka, setBuka] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await getScheduleSlotsStatus(characterId);
    // Bentuk respons wajib diperiksa, bukan dipercaya: apiFetch cuma meng-CAST.
    if (r.success && Array.isArray(r.data?.rencana)) setData(r.data);
    else setData(null);
  }, [characterId]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return null;

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-[11px] font-semibold text-[#94A3B8]">
          SLOT HARI INI — {data.terisi}/{data.kuota} terpakai
        </div>
        <div className="text-[10px] text-[#94A3B8]">
          {data.akun_utama
            ? 'Akun utama · kuota penuh'
            : `${data.hari_nyata ?? 0} hari nyata · kuota ${data.kuota}/hari`}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {data.rencana.map((r, i) => {
          // Status per jendela datang dari server. Dulu dihitung `i < terisi`
          // (n pertama dianggap terpakai) — salah begitu jendela yang terisi
          // tidak berurutan, mis. pagi dilewati karena jamnya sudah lewat.
          const terpakai = r.terpakai;
          const jam = Object.values(r.waktu).sort();
          const rentang = jam.length ? `${jam[0].slice(11, 16)}–${jam[jam.length - 1].slice(11, 16)}` : '—';
          return (
            <button key={i} type="button" onClick={() => setBuka(buka === i ? null : i)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium ${
                terpakai ? 'bg-gray-100 border-gray-300 text-gray-600' : 'bg-emerald-50 border-emerald-300 text-emerald-700'
              }`}>
              <span className={`w-2 h-2 rounded-full ${terpakai ? 'bg-gray-400' : 'bg-emerald-500'}`} />
              {r.nama} · {rentang}
            </button>
          );
        })}
        {data.rencana.length === 0 && (
          <span className="text-xs text-[#94A3B8]">Belum ada channel sosmed untuk akun ini.</span>
        )}
      </div>

      {buka != null && data.rencana[buka] && (
        <div className="mt-2 border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-1">
          {Object.entries(data.rencana[buka].waktu).map(([p, t]) => (
            <div key={p} className="flex items-center justify-between text-[11px]">
              <span className="text-[#374151] capitalize">{p}</span>
              <span className="font-mono text-[#0F172A]">{t.slice(11, 16)}</span>
            </div>
          ))}
          <p className="text-[10px] text-[#94A3B8] pt-1">
            Jam berbeda tiap hari &amp; tiap platform — supaya tidak terbit serempak.
          </p>
        </div>
      )}

      {data.gagal.length > 0 && (
        <p className="mt-2 text-[11px] text-red-600">
          Gagal hari ini: {data.gagal.map(g => g.platform).join(', ')}
        </p>
      )}
    </div>
  );
}
