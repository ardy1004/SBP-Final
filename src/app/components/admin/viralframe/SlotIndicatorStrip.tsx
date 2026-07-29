import { useState, useEffect, useCallback } from 'react';
import { getScheduleSlotsStatus, type ScheduleSlot } from '../../../../lib/api';

const STATUS_STYLE: Record<ScheduleSlot['status'], string> = {
  available: 'bg-emerald-50 border-emerald-300 text-emerald-700',
  used: 'bg-gray-100 border-gray-300 text-gray-600',
  passed: 'bg-red-50 border-red-200 text-red-400',
};
const STATUS_DOT: Record<ScheduleSlot['status'], string> = {
  available: 'bg-emerald-500',
  used: 'bg-gray-400',
  passed: 'bg-red-400',
};
const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube Shorts', tiktok: 'TikTok', threads: 'Threads', facebook: 'Facebook Pages', instagram: 'Instagram' };

// Strip 5 lampu status slot primetime hari ini — dipakai bersama di Content
// Library & Konten Agent karena slot bersifat GLOBAL (dipakai bareng kedua
// modul, lihat schedulerProviders.js). refreshKey berubah (dari parent, tiap
// kali scheduling selesai) memicu refetch langsung tanpa nunggu interval.
export default function SlotIndicatorStrip({ refreshKey }: { refreshKey?: number }) {
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null);
  const [openSlot, setOpenSlot] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await getScheduleSlotsStatus();
    if (r.success && r.data) setSlots(r.data.slots);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  if (!slots) return null;

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 p-3">
      <div className="text-[11px] font-semibold text-[#94A3B8] mb-2">SLOT PRIMETIME HARI INI</div>
      <div className="flex flex-wrap gap-2">
        {slots.map(s => (
          <button key={s.slot} onClick={() => s.status === 'used' && setOpenSlot(openSlot === s.slot ? null : s.slot)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium ${STATUS_STYLE[s.status]} ${s.status === 'used' ? 'cursor-pointer' : 'cursor-default'}`}>
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s.status]}`} />
            Slot {s.slot} · {s.time_wib}
          </button>
        ))}
      </div>

      {openSlot != null && (() => {
        const s = slots.find(x => x.slot === openSlot);
        if (!s?.used_by) return null;
        return (
          <div className="mt-2 border border-gray-100 rounded-xl p-3 bg-gray-50">
            <div className="text-xs font-semibold text-[#0F172A] mb-1.5">{s.used_by.video_name} <span className="text-[10px] font-normal text-[#94A3B8]">({s.used_by.video_type === 'agent' ? 'Konten Agent' : 'Content Library'})</span></div>
            <div className="space-y-1">
              {s.used_by.platforms.map(p => (
                <div key={p.platform} className="flex items-center justify-between text-[11px]">
                  <span className="text-[#374151]">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                  {p.status === 'scheduled'
                    ? <span className="text-emerald-600 font-semibold">✅ Terjadwal</span>
                    : <span className="text-red-500 font-semibold" title={p.error ?? ''}>❌ Gagal</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
