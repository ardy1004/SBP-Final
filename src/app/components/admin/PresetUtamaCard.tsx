// Editor jam posting KHUSUS akun agent utama (2026-08-15).
//
// Mekanisme lama (sebelum migrasi 0041, "0 20 * * *"-era): N jam tetap +
// drift linear (+intervalMenit tiap hari, siklus otomatis) — bukan jendela
// rentang + menit ber-seed seperti JamPrimetimeCard (yang berlaku 6 agent
// lain). Dikembalikan atas permintaan user, sekarang editable dari sini
// alih-alih konstanta di kode. Default: 06:00/09:00/12:00/17:00/19:00,
// interval 5 menit — identik formula lama.
//
// "Jumlah posting per hari" = jumlah baris jam di bawah, tidak ada field
// terpisah — tambah/hapus baris untuk mengubah jumlahnya. Geseran antar
// platform (0-19 menit) tetap berlaku di atas jam-jam ini, tidak diedit di
// sini (lihat functions/_lib/jadwalOtomatis.js — TANGGA_PLATFORM).

import { useState, useEffect } from 'react';
import { Timer, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getSchedulerConfig, saveSchedulerConfig, type PresetUtama } from '../../../lib/api';

const PRESET_DEFAULT: PresetUtama = { slots: ['06:00', '09:00', '12:00', '17:00', '19:00'], intervalMenit: 5 };
const CIUT_KEY = 'sbp_preset_utama_ciut';

export default function PresetUtamaCard() {
  const [ciut, setCiut] = useState(true);
  const [preset, setPreset] = useState<PresetUtama>(PRESET_DEFAULT);
  const [menyimpan, setMenyimpan] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; teks: string } | null>(null);

  useEffect(() => {
    try { setCiut(localStorage.getItem(CIUT_KEY) !== '0'); } catch { /* noop */ }
    getSchedulerConfig().then(r => {
      if (r.success && r.data?.preset_utama?.slots?.length) setPreset(r.data.preset_utama);
    });
  }, []);

  const toggleCiut = () => {
    setCiut(c => {
      const next = !c;
      try { localStorage.setItem(CIUT_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };

  const ubahJam = (i: number, v: string) =>
    setPreset(p => ({ ...p, slots: p.slots.map((s, idx) => (idx === i ? v : s)) }));
  const hapus = (i: number) => setPreset(p => ({ ...p, slots: p.slots.filter((_, idx) => idx !== i) }));
  const tambah = () => setPreset(p => ({ ...p, slots: [...p.slots, '12:00'] }));
  const ubahInterval = (v: string) => {
    const n = parseInt(v, 10);
    setPreset(p => ({ ...p, intervalMenit: Number.isInteger(n) && n >= 0 ? n : p.intervalMenit }));
  };

  const simpan = async () => {
    setMenyimpan(true); setMsg(null);
    const r = await saveSchedulerConfig({ preset_utama: preset });
    setMenyimpan(false);
    if (r.success && r.data?.preset_utama) {
      setPreset(r.data.preset_utama);
      setMsg({ ok: true, teks: 'Jam posting agent utama tersimpan.' });
    } else {
      setMsg({ ok: false, teks: r.error ?? 'Gagal menyimpan' });
    }
  };

  const ringkas = `${preset.slots.length}x/hari · +${preset.intervalMenit} menit/hari`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={toggleCiut} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
        {ciut ? <ChevronRight size={16} className="text-[#94A3B8]" /> : <ChevronDown size={16} className="text-[#94A3B8]" />}
        <Timer size={16} className="text-[#7C3AED]" />
        <span className="text-sm font-semibold text-[#0F172A]">Jam Posting Agent Utama</span>
        <span className="text-[11px] text-[#64748B] truncate">{ringkas}</span>
        <span className="ml-auto text-[10px] text-[#94A3B8] flex-shrink-0">hanya akun utama</span>
      </button>

      {!ciut && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[11px] text-[#64748B]">
            Ini jam PERSIS (bukan rentang seperti Jam Tayang Primetime), khusus untuk akun agent utama.
            Tiap hari, seluruh jam di bawah bergeser bersama sejumlah "interval" menit — supaya jamnya tidak
            identik persis tiap hari — lalu otomatis reset dan mulai lagi setelah beberapa hari.
            Jumlah baris jam = jumlah posting per hari. Geseran antar-platform (agar 5 akun tidak tayang
            di detik yang sama) tetap berlaku di atas jam-jam ini.
          </p>

          <div className="space-y-1.5">
            {preset.slots.map((jam, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" value={jam} onChange={e => ubahJam(i, e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                {preset.slots.length > 1 && (
                  <button onClick={() => hapus(i)} className="text-[#94A3B8] hover:text-red-500"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
          </div>

          {preset.slots.length < 10 && (
            <button onClick={tambah} className="text-[11px] font-semibold text-[#7C3AED] hover:underline">+ Tambah jam</button>
          )}

          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-[#334155]">Interval kenaikan per hari</label>
            <input type="number" min={0} max={1440} value={preset.intervalMenit} onChange={e => ubahInterval(e.target.value)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs" />
            <span className="text-xs text-[#64748B]">menit</span>
          </div>

          {msg && <p className={`text-[11px] ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.teks}</p>}

          <button onClick={simpan} disabled={menyimpan}
            className="px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold disabled:opacity-50">
            {menyimpan ? 'Menyimpan…' : 'Simpan Jam Posting'}
          </button>
        </div>
      )}
    </div>
  );
}
