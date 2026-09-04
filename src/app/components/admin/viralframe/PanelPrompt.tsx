// STASIUN 7 — GERBANG MANUSIA. Prompt Google Flow, siap tempel.
//
// Ini satu-satunya titik di seluruh pipeline yang MEMANG butuh manusia: Google
// Flow tidak punya API render, jadi orang harus menempel prompt dan mengunduh
// hasilnya. Bentuknya karena itu daftar kerja yang tinggal disalin satu per satu.
//
// ─── Kenapa foto dipisah "wajib" dan "cadangan" ──────────────────────────────
// Dokumentasi resmi Google menyebut batas 3 ingredient per generate; pemilik akun
// melaporkan 7. Alih-alih menebak salah satunya, renderer memberi PERINGKAT
// berdasarkan skor visi dan panel ini menandai yang teratas sebagai wajib. Kalau
// Flow ternyata 3, tiga foto teratas sudah cukup; kalau 7, semuanya terpakai.
import { useState } from 'react';
import { Copy, Check, Wand2 } from 'lucide-react';

interface FotoRef { id: number; label: string }
export interface PromptPart {
  part: number;
  peran: string;
  foto_utama: FotoRef[];
  foto_cadangan: FotoRef[];
  dialog: string;
  teks_layar: string;
  prompt: string;
}

export default function PanelPrompt({ parts }: { parts: PromptPart[] }) {
  const [tersalin, setTersalin] = useState<number | null>(null);

  const salin = async (teks: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(idx);
      setTimeout(() => setTersalin(c => (c === idx ? null : c)), 1600);
    } catch { /* clipboard ditolak browser — user masih bisa blok & salin manual */ }
  };

  if (parts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display font-bold text-[#0F172A] text-sm flex items-center gap-1.5">
          <Wand2 size={15} className="text-[#B45309]" /> Prompt Google Flow
        </h2>
        <span className="text-[11px] text-[#94A3B8]">{parts.length} generate · tempel satu per satu</span>
      </div>

      <div className="p-4 space-y-3">
        {parts.map((p, i) => (
          <div key={p.part} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-bold text-[#0F172A]">
                Part {p.part} <span className="font-normal text-[#94A3B8]">· {p.peran}</span>
              </span>
              <button
                onClick={() => salin(p.prompt, i)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                style={{ background: tersalin === i ? '#10B981' : '#1565C0' }}>
                {tersalin === i ? <><Check size={12} /> Tersalin</> : <><Copy size={12} /> Salin</>}
              </button>
            </div>

            <pre className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[#334155] font-mono max-h-56 overflow-y-auto">
              {p.prompt}
            </pre>

            <div className="px-3 py-2 border-t border-gray-100 space-y-1">
              <div className="text-[11px]">
                <span className="font-semibold text-[#0F172A]">Lampirkan foto:</span>{' '}
                <span className="text-[#334155]">
                  {p.foto_utama.map(f => `#${f.id} ${f.label}`).join(' · ') || '—'}
                </span>
              </div>
              {p.foto_cadangan.length > 0 && (
                <div className="text-[11px] text-[#94A3B8]">
                  Cadangan (kalau slot Flow masih tersisa):{' '}
                  {p.foto_cadangan.map(f => `#${f.id} ${f.label}`).join(' · ')}
                </div>
              )}
              {p.teks_layar && (
                <div className="text-[11px] text-[#64748B]">
                  Teks layar (ditambahkan editor, bukan oleh Flow):{' '}
                  <b className="text-[#334155]">{p.teks_layar}</b>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
