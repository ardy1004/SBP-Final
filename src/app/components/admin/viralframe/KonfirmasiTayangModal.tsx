import { useState } from 'react';
import { X, Loader2, CheckCircle2, HelpCircle } from 'lucide-react';
import { bacaJson } from '../../../../lib/api';

// Modal "Pastikan status posting" (2026-11-17).
//
// KENAPA ADA. Dilaporkan user: video bertanda "gagal" di Konten Agent ternyata
// sudah tayang. Kita memutus panggilan ke Buffer/Zernio setelah 10 detik, tapi
// provider tetap memproses request-nya — hasilnya AMBIGU, dan hanya manusia
// yang bisa melihat kenyataannya (akun medsos / dashboard Buffer / Zernio).
// Modal ini mencatat kenyataan itu tanpa memanggil provider sama sekali:
//   Ada       → baris jadi 'scheduled', video keluar dari antrean.
//   Tidak ada → baris 'unconfirmed' jadi 'failed', tombol Ulangi terbuka.
// Endpoint: POST /api/admin/viralframe/schedule/commit-agent { konfirmasi }.

const LABEL: Record<string, string> = {
  youtube: 'YouTube Shorts', tiktok: 'TikTok', threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram',
};

type Pilihan = 'ada' | 'tidak_ada' | 'belum';

export default function KonfirmasiTayangModal({ videoId, platforms, bolehTidakAda, onClose, onSelesai }: {
  videoId: number;
  platforms: string[];
  /** false untuk kegagalan DEFINITIF (provider menolak) — "tidak ada" sudah
   *  pasti benar di sana, yang perlu dicatat hanya kebalikannya. */
  bolehTidakAda: boolean;
  onClose: () => void;
  onSelesai: () => void;
}) {
  const [pilihan, setPilihan] = useState<Record<string, Pilihan>>(
    () => Object.fromEntries(platforms.map(p => [p, 'belum' as Pilihan])),
  );
  const [fase, setFase] = useState<'form' | 'kirim' | 'done'>('form');
  const [galat, setGalat] = useState('');
  const [ringkas, setRingkas] = useState<string[]>([]);

  const kelompok = (nilai: Pilihan) => platforms.filter(p => pilihan[p] === nilai);
  const adaYangDipilih = kelompok('ada').length + kelompok('tidak_ada').length > 0;

  const kirimSatu = async (hasil: 'tayang' | 'tidak_ada', daftar: string[]) => {
    const res = await fetch('/api/admin/viralframe/schedule/commit-agent', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId, konfirmasi: { hasil, platforms: daftar } }),
    });
    const j = await bacaJson<{ diubah: string[]; dilewati: { platform: string; alasan: string }[] }>(res);
    // Bentuk respons diperiksa, bukan dipercaya (bacaJson hanya meng-cast).
    if (!j.success || !Array.isArray(j.data?.diubah)) throw new Error(j.error ?? `HTTP ${res.status}`);
    return j.data;
  };

  const simpan = async () => {
    setGalat('');
    setFase('kirim');
    const catatan: string[] = [];
    try {
      const ada = kelompok('ada');
      const tidak = kelompok('tidak_ada');
      if (ada.length) {
        const d = await kirimSatu('tayang', ada);
        if (d.diubah.length) catatan.push(`Dicatat sudah tayang: ${d.diubah.map(p => LABEL[p] ?? p).join(', ')}.`);
        for (const x of d.dilewati ?? []) catatan.push(`${LABEL[x.platform] ?? x.platform}: ${x.alasan}.`);
      }
      if (tidak.length) {
        const d = await kirimSatu('tidak_ada', tidak);
        if (d.diubah.length) catatan.push(`Dicatat tidak ada: ${d.diubah.map(p => LABEL[p] ?? p).join(', ')} — sekarang bisa diulang lewat tombol "Ulangi platform gagal".`);
        for (const x of d.dilewati ?? []) catatan.push(`${LABEL[x.platform] ?? x.platform}: ${x.alasan}.`);
      }
      setRingkas(catatan);
      setFase('done');
    } catch (err: unknown) {
      setGalat(err instanceof Error ? err.message : 'Gagal menyimpan');
      setFase('form');
    }
  };

  const tombol = (p: string, nilai: Pilihan, teks: string, aktifCls: string) => (
    <button type="button" onClick={() => setPilihan(s => ({ ...s, [p]: nilai }))}
      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${pilihan[p] === nilai ? aktifCls : 'border-gray-200 text-[#64748B] hover:bg-gray-50'}`}>
      {teks}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={fase === 'form' ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
            <HelpCircle size={15} className="text-amber-600" /> Pastikan status posting
          </h3>
          {fase !== 'kirim' && (
            <button onClick={fase === 'done' ? onSelesai : onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
          )}
        </div>

        {fase !== 'done' && (
          <>
            <p className="text-xs text-[#64748B] mb-3">
              {bolehTidakAda
                ? 'Buffer/Zernio tidak memberi jawaban pasti untuk platform di bawah — post-nya bisa saja sudah dibuat. Cek akun medsos agent (atau dashboard Buffer/Zernio), lalu catat yang Anda lihat.'
                : 'Provider mencatat platform di bawah sebagai gagal. Kalau ternyata post-nya ada di medsos, catat di sini supaya tidak diulang dan tayang dua kali.'}
            </p>
            <div className="space-y-1.5 mb-3">
              {platforms.map(p => (
                <div key={p} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50">
                  <span className="font-medium text-[#0F172A]">{LABEL[p] ?? p}</span>
                  <div className="flex gap-1">
                    {tombol(p, 'ada', 'Ada', 'border-emerald-300 bg-emerald-50 text-emerald-700')}
                    {bolehTidakAda && tombol(p, 'tidak_ada', 'Tidak ada', 'border-red-200 bg-red-50 text-red-600')}
                    {tombol(p, 'belum', 'Belum dicek', 'border-gray-300 bg-gray-100 text-[#475569]')}
                  </div>
                </div>
              ))}
            </div>
            {galat && <p className="text-xs text-red-600 mb-2">{galat}</p>}
            <button onClick={simpan} disabled={!adaYangDipilih || fase === 'kirim'}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {fase === 'kirim' ? <><Loader2 size={14} className="animate-spin" /> Menyimpan…</> : 'Simpan'}
            </button>
          </>
        )}

        {fase === 'done' && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs text-[#0F172A]">
              <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">{(ringkas.length ? ringkas : ['Tidak ada yang berubah.']).map((t, i) => <p key={i}>{t}</p>)}</div>
            </div>
            <button onClick={onSelesai} className="w-full mt-1 py-2 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90">Selesai</button>
          </div>
        )}
      </div>
    </div>
  );
}
