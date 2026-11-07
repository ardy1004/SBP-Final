// Editor jam posting KHUSUS akun agent utama (2026-08-15).
//
// Mekanisme lama (sebelum migrasi 0041, "0 20 * * *"-era): N jam tetap +
// drift linear (+intervalMenit tiap hari, siklus otomatis) — bukan jendela
// rentang + menit ber-seed seperti JamPrimetimeCard. Dikembalikan atas
// permintaan user, sekarang editable dari sini alih-alih konstanta di kode.
// Default: 06:00/09:00/12:00/17:00/19:00, interval 5 menit — identik formula lama.
//
// "Jumlah posting per hari" = jumlah baris jam, tidak ada field terpisah.
// Sejak 2026-11-05 agent lain juga bisa memakai mekanisme yang sama lewat
// "Jadwal manual" di kartu Akun Agent — editornya satu komponen
// (viralframe/EditorJamPosting.tsx) dan aturan simpannya satu fungsi
// (validasiPresetJam di functions/_lib/jadwalOtomatis.js).

import { useState, useEffect } from 'react';
import { Timer, ChevronDown, ChevronRight } from 'lucide-react';
import { getSchedulerConfig, saveSchedulerConfig, type PresetUtama } from '../../../lib/api';
import EditorJamPosting from './viralframe/EditorJamPosting';

const PRESET_DEFAULT: PresetUtama = { slots: ['06:00', '09:00', '12:00', '17:00', '19:00'], intervalMenit: 5 };
const CIUT_KEY = 'sbp_preset_utama_ciut';

export default function PresetUtamaCard({ onTersimpan, muatUlang = 0 }: {
  onTersimpan?: () => void;
  /** Naik setiap kali jadwal diubah dari kartu LAIN — terutama "Susun jam semua
   *  agent", yang juga menulis jam agent utama. Tanpa memuat ulang, kartu ini
   *  menampilkan jam lama, dan menekan Simpan di sini menimpa susunan baru. */
  muatUlang?: number;
} = {}) {
  const [ciut, setCiut] = useState(true);
  const [preset, setPreset] = useState<PresetUtama>(PRESET_DEFAULT);
  const [menyimpan, setMenyimpan] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; teks: string } | null>(null);

  useEffect(() => {
    try { setCiut(localStorage.getItem(CIUT_KEY) !== '0'); } catch { /* noop */ }
  }, []);
  useEffect(() => {
    getSchedulerConfig().then(r => {
      if (r.success && r.data?.preset_utama?.slots?.length) setPreset(r.data.preset_utama);
    });
  }, [muatUlang]);

  const toggleCiut = () => {
    setCiut(c => {
      const next = !c;
      try { localStorage.setItem(CIUT_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };

  const simpan = async () => {
    setMenyimpan(true); setMsg(null);
    const r = await saveSchedulerConfig({ preset_utama: preset });
    setMenyimpan(false);
    if (r.success && r.data?.preset_utama) {
      setPreset(r.data.preset_utama);
      setMsg({ ok: true, teks: 'Jam posting agent utama tersimpan. Berlaku mulai penjadwalan berikutnya.' });
      onTersimpan?.();
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
            Agent lain bisa memakai cara yang sama lewat <strong>Jadwal manual</strong> di kartu Akun Agent.
          </p>

          <EditorJamPosting preset={preset} onChange={setPreset} />

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
