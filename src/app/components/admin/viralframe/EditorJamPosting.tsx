// Editor jam posting tetap + interval drift harian — dipakai BERSAMA oleh
// kartu "Jam Posting Agent Utama" (PresetUtamaCard) dan jadwal manual tiap
// agent (AkunAgentCard, 2026-11-05). Keduanya dijalankan mesin yang sama
// (slotPresetHariIni di functions/_lib/jadwalOtomatis.js) dan divalidasi aturan
// yang sama (validasiPresetJam) saat disimpan — server yang memutuskan, editor
// ini hanya membantu.
//
// "Jumlah video per hari" = jumlah baris jam. Stepper +/− hanya jalan pintas:
// menambah menyisipkan jam di tengah celah terlebar, mengurangi membuang jam
// paling malam. Setiap jam tetap bisa diubah satu per satu.

import { useState, useEffect } from 'react';
import { Trash2, Minus, Plus } from 'lucide-react';
import type { PresetUtama } from '../../../../lib/api';

const MAKS_JAM = 10;
// Rentang yang dipakai saat MENYISIPKAN jam baru lewat tombol +. Bukan aturan
// validasi (server menerima 05:00 s.d. ±21:45) — cuma rentang wajar jam tayang.
const SISIP_AWAL = 6 * 60;
const SISIP_AKHIR = 21 * 60 + 30;

const keMenit = (j: string) => Number(j.slice(0, 2)) * 60 + Number(j.slice(3, 5));
const keJam = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const bulat5 = (m: number) => Math.round(m / 5) * 5;

/**
 * Jam baru yang PALING JAUH dari jam tetangganya di dalam rentang 06:00–21:30:
 * tengah celah di antara dua jam (jaraknya setengah celah), atau tepat di ujung
 * rentang bila jam pertama/terakhir belum menyentuhnya (jaraknya penuh). Seri
 * dipecah ke yang lebih awal.
 */
export function jamSisipan(slots: string[]): string {
  const titik = slots.map(keMenit).sort((a, b) => a - b);
  if (titik.length === 0) return keJam(12 * 60);
  const kandidat: { m: number; jarak: number }[] = [];
  if (titik[0] > SISIP_AWAL) kandidat.push({ m: SISIP_AWAL, jarak: titik[0] - SISIP_AWAL });
  for (let i = 1; i < titik.length; i++) {
    kandidat.push({ m: bulat5((titik[i - 1] + titik[i]) / 2), jarak: (titik[i] - titik[i - 1]) / 2 });
  }
  const akhir = titik[titik.length - 1];
  if (akhir < SISIP_AKHIR) kandidat.push({ m: SISIP_AKHIR, jarak: SISIP_AKHIR - akhir });
  if (kandidat.length === 0) return keJam(bulat5((titik[0] + akhir) / 2));
  const terbaik = kandidat.reduce((a, b) => (b.jarak > a.jarak ? b : a));
  return keJam(terbaik.m);
}

/**
 * Jam awal saat agent beralih ke mode Manual: `n` jam disebar rata 06:30–21:00,
 * digeser 0/5/10/15 menit menurut id agent supaya delapan akun tidak tayang di
 * menit yang persis sama.
 */
export function jamAwalManual(n: number, characterId: number): string[] {
  const awal = 6 * 60 + 30, akhir = 21 * 60;
  const geser = (characterId * 5) % 20;
  const k = Math.max(1, Math.min(MAKS_JAM, n));
  return Array.from({ length: k }, (_, i) => keJam(bulat5((k === 1 ? 12 * 60 : awal + (akhir - awal) * i / (k - 1))) + geser));
}

export default function EditorJamPosting({ preset, onChange }: {
  preset: PresetUtama;
  onChange: (p: PresetUtama) => void;
}) {
  // Teks mentah input interval — TERPISAH dari preset.intervalMenit. Kalau
  // input dibind langsung ke angka, mengosongkan field untuk mengetik ulang
  // (mis. ganti "5" jadi "15") membuat React membalikkan DOM ke nilai lama di
  // tengah pengetikan (parseInt('')=NaN -> state tidak berubah -> React memaksa
  // value kembali) sehingga keystroke berikutnya menempel di angka lama ("51"
  // bukan "15"). Bug nyata 2026-08-15; pola ini dipindah utuh dari PresetUtamaCard.
  const [intervalText, setIntervalText] = useState(String(preset.intervalMenit));
  // Sinkron kalau nilai datang dari LUAR (dimuat dari server / agent lain),
  // tapi jangan menimpa ketikan yang sedang berlangsung dan setara nilainya.
  useEffect(() => {
    if (parseInt(intervalText, 10) !== preset.intervalMenit) setIntervalText(String(preset.intervalMenit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.intervalMenit]);

  const ubahJam = (i: number, v: string) => onChange({ ...preset, slots: preset.slots.map((s, idx) => (idx === i ? v : s)) });
  const hapus = (i: number) => onChange({ ...preset, slots: preset.slots.filter((_, idx) => idx !== i) });
  const tambah = () => onChange({ ...preset, slots: [...preset.slots, jamSisipan(preset.slots)].sort((a, b) => keMenit(a) - keMenit(b)) });
  const kurang = () => {
    const urut = [...preset.slots].sort((a, b) => keMenit(a) - keMenit(b));
    onChange({ ...preset, slots: urut.slice(0, -1) });
  };
  const ubahIntervalText = (v: string) => {
    setIntervalText(v);
    const n = parseInt(v, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 1440) onChange({ ...preset, intervalMenit: n });
  };

  const n = preset.slots.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#334155]">Jumlah video per hari</span>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
          <button type="button" onClick={kurang} disabled={n <= 1} aria-label="Kurangi satu video per hari"
            className="px-2 py-1 text-[#64748B] hover:bg-gray-50 disabled:opacity-30"><Minus size={12} /></button>
          <span className="px-3 py-1 text-sm font-bold text-[#0F172A] min-w-[2.5rem] text-center border-x border-gray-200" aria-live="polite">{n}</span>
          <button type="button" onClick={tambah} disabled={n >= MAKS_JAM} aria-label="Tambah satu video per hari"
            className="px-2 py-1 text-[#64748B] hover:bg-gray-50 disabled:opacity-30"><Plus size={12} /></button>
        </div>
        <span className="text-[10px] text-[#94A3B8]">maks {MAKS_JAM}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {preset.slots.map((jam, i) => (
          <div key={i} className="flex items-center gap-1 border border-gray-200 rounded-lg pl-1 pr-1.5 py-0.5 bg-white">
            <input type="time" value={jam} onChange={e => ubahJam(i, e.target.value)} aria-label={`Jam posting ke-${i + 1}`}
              className="px-1 py-0.5 text-xs outline-none bg-transparent" />
            {n > 1 && (
              <button type="button" onClick={() => hapus(i)} className="text-[#94A3B8] hover:text-red-500" title="Hapus jam ini"><Trash2 size={12} /></button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-[#334155]">Interval kenaikan per hari</label>
        <input type="number" min={0} max={1440} value={intervalText} onChange={e => ubahIntervalText(e.target.value)}
          onBlur={() => setIntervalText(String(preset.intervalMenit))}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white" />
        <span className="text-xs text-[#64748B]">menit</span>
      </div>

      <p className="text-[10px] text-[#94A3B8]">
        Aturan saat disimpan: jam paling awal <strong>05:00</strong>, jarak antar jam minimal <strong>30 menit</strong>,
        jam terakhir sekitar <strong>21:45</strong> (makin besar interval, makin awal batasnya). Tiap jam juga
        digeser 0–19 menit per platform supaya akun-akun tidak tayang di detik yang sama.
      </p>
    </div>
  );
}
