// Editor jendela jam tayang — setelan GLOBAL, berlaku untuk semua agent.
//
// Dipindah dari Admin → Pengaturan ke halaman Konten Agent (2026-08-12) supaya
// seluruh kendali penjadwalan berkumpul di satu tempat: kredensial, saklar
// auto, jam kirim, dan jam tayang.
//
// Yang diatur di sini RENTANG, bukan jam persis. Menit sebenarnya diundi
// ber-seed di dalam rentang (berbeda tiap hari & tiap agent), lalu tiap platform
// digeser lagi 0–19 menit — lihat functions/_lib/jadwalOtomatis.js.

import { useState, useEffect } from 'react';
import { Clock, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getSchedulerConfig, saveSchedulerConfig, type JendelaJam } from '../../../lib/api';

const JENDELA_DEFAULT: JendelaJam[] = [
  { nama: 'Pagi', mulai: '06:30', akhir: '08:30' },
  { nama: 'Siang', mulai: '11:30', akhir: '13:30' },
  { nama: 'Malam', mulai: '19:00', akhir: '21:30' },
];

// Jendela harus lebih panjang dari tangga geseran platform (maks 19 menit),
// kalau tidak platform paling belakang tidak punya ruang dan semuanya menumpuk
// di batas akhir. Divalidasi juga di server.
const MIN_PANJANG_MENIT = 29;
const keMenit = (j: string) => Number(j.slice(0, 2)) * 60 + Number(j.slice(3));
const CIUT_KEY = 'sbp_jam_primetime_ciut';

export default function JamPrimetimeCard() {
  const [ciut, setCiut] = useState(true);
  const [jendela, setJendela] = useState<JendelaJam[]>(JENDELA_DEFAULT);
  const [menyimpan, setMenyimpan] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; teks: string } | null>(null);

  useEffect(() => {
    try { setCiut(localStorage.getItem(CIUT_KEY) !== '0'); } catch { /* noop */ }
    getSchedulerConfig().then(r => {
      if (r.success && Array.isArray(r.data?.jendela) && r.data.jendela.length) setJendela(r.data.jendela);
    });
  }, []);

  const toggleCiut = () => {
    setCiut(c => {
      const next = !c;
      try { localStorage.setItem(CIUT_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };

  const ubah = (i: number, k: keyof JendelaJam, v: string) =>
    setJendela(prev => prev.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const hapus = (i: number) => setJendela(prev => prev.filter((_, idx) => idx !== i));
  const tambah = () => setJendela(prev => [...prev, { nama: 'Baru', mulai: '15:00', akhir: '16:00' }]);
  const terlaluPendek = jendela.filter(j => keMenit(j.akhir) - keMenit(j.mulai) < MIN_PANJANG_MENIT);

  const simpan = async () => {
    setMenyimpan(true); setMsg(null);
    const r = await saveSchedulerConfig({ jendela });
    setMenyimpan(false);
    setMsg(r.success ? { ok: true, teks: 'Jendela tersimpan.' } : { ok: false, teks: r.error ?? 'Gagal menyimpan' });
  };

  const ringkas = jendela.map(j => `${j.mulai}–${j.akhir}`).join(' · ');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={toggleCiut} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
        {ciut ? <ChevronRight size={16} className="text-[#94A3B8]" /> : <ChevronDown size={16} className="text-[#94A3B8]" />}
        <Clock size={16} className="text-[#F97316]" />
        <span className="text-sm font-semibold text-[#0F172A]">Jam Tayang Primetime</span>
        <span className="text-[11px] text-[#64748B] truncate">{ringkas}</span>
        <span className="ml-auto text-[10px] text-[#94A3B8] flex-shrink-0">berlaku semua agent</span>
      </button>

      {!ciut && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[11px] text-[#64748B]">
            Ini <strong>rentang</strong>, bukan jam persis. Menit sebenarnya diundi di dalam rentang — berbeda tiap hari
            dan tiap agent — lalu tiap platform digeser lagi 0–19 menit supaya tidak terbit serempak.
            Berapa jendela yang dipakai mengikuti kuota harian akun: 3 = semua, 1–2 = dirotasi harian.
          </p>

          {jendela.map((j, i) => {
            const panjang = keMenit(j.akhir) - keMenit(j.mulai);
            return (
              <div key={i} className="flex items-center gap-2">
                <input value={j.nama} onChange={e => ubah(i, 'nama', e.target.value)} placeholder="Nama"
                  className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <input type="time" value={j.mulai} onChange={e => ubah(i, 'mulai', e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <span className="text-xs text-[#94A3B8]">→</span>
                <input type="time" value={j.akhir} onChange={e => ubah(i, 'akhir', e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <span className={`text-[10px] ${panjang < MIN_PANJANG_MENIT ? 'text-red-600 font-semibold' : 'text-[#94A3B8]'}`}>
                  {panjang} mnt
                </span>
                {jendela.length > 1 && (
                  <button onClick={() => hapus(i)} className="text-[#94A3B8] hover:text-red-500"><Trash2 size={13} /></button>
                )}
              </div>
            );
          })}

          {jendela.length < 6 && (
            <button onClick={tambah} className="text-[11px] font-semibold text-[#1565C0] hover:underline">+ Tambah jendela</button>
          )}

          {terlaluPendek.length > 0 && (
            <p className="text-[11px] text-red-600">
              Jendela minimal {MIN_PANJANG_MENIT} menit — di bawah itu kelima platform menumpuk di batas akhir.
            </p>
          )}
          {msg && <p className={`text-[11px] ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.teks}</p>}

          <button onClick={simpan} disabled={menyimpan || terlaluPendek.length > 0}
            className="px-4 py-2 rounded-xl bg-[#1565C0] text-white text-sm font-semibold disabled:opacity-50">
            {menyimpan ? 'Menyimpan…' : 'Simpan Jendela'}
          </button>
        </div>
      )}
    </div>
  );
}
