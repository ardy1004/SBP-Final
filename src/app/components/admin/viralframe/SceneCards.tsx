// PartCards — kartu tampilan hasil JSON tervalidasi, Part-aware (refactor 2026-08-01).
// Nama BERKAS dipertahankan (SceneCards.tsx) supaya import path di
// AdminViralFrameWorkspacePage.tsx tidak berubah; komponennya sendiri diganti nama
// jadi PartCards karena unit tampilannya sekarang PART (1 Part = 1 generate call),
// bukan lagi scene/foto individual.
import { useState } from 'react';
import { Copy, Check, FileImage } from 'lucide-react';
import { getLipsync, MAX_REF_IMAGES_PER_PART } from './options';
import { partPromptText, type ParsedJSON, type ParsedPart } from './jsonValidator';

const ROLE_BADGE: Record<string, string> = {
  Hook: 'bg-amber-100 text-amber-700 border-amber-200',
  Body: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  CTA: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

function badgeCls(role: string | undefined): string {
  const r = (role ?? '').split(/[\s|]/)[0];
  return ROLE_BADGE[r] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

export default function PartCards({ data }: { data: ParsedJSON }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const list = data.parts ?? [];
  const pn = data.production_notes ?? {};

  const copyPrompt = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(c => (c === idx ? null : c)), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };

  return (
    <div className="space-y-4">
      {list.map((p: ParsedPart, i) => {
        const role = p.role ?? '';
        const voDur = p.vo_duration_sec ?? 0;
        const maxWords = getLipsync(voDur).maxWords;
        const wc = p.dialog ? p.dialog.trim().split(/\s+/).filter(Boolean).length : 0;
        const wcOk = wc <= Math.ceil(maxWords * 1.1);
        const prompt = partPromptText(p);
        const dialogLine = p.dialogue?.line?.trim() ?? '';
        const refImgs = Array.isArray(p.reference_images) ? p.reference_images : [];
        const overQuota = refImgs.length > MAX_REF_IMAGES_PER_PART;

        return (
          <div key={i} className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white">
            {/* Header badge */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badgeCls(role)}`}>
                  Part {p.part ?? i + 1} · {role || '—'}
                </span>
                <span className="text-xs text-[#64748B]">{p.duration_sec ?? '—'}s (VO {voDur}s)</span>
                <span className={`text-xs flex items-center gap-1 ${wcOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {wcOk ? '✅' : '⚠️'} {wc}/{maxWords} kata
                </span>
                {/* Penanda audio native: sekali lihat ketahuan videonya akan bersuara
                    atau bisu — inti temuan audit ViralFrame 2026-07-26, dipertahankan
                    di model Part. */}
                {p.dialogue && (
                  <span
                    className={`text-xs flex items-center gap-1 ${dialogLine ? 'text-emerald-600' : 'text-red-600'}`}
                    title={dialogLine
                      ? 'Dialog tertanam di prompt — Veo/Flow akan mengucapkannya'
                      : 'dialogue.line kosong — video akan BISU di Veo/Flow'}>
                    {dialogLine ? '🔊 dialog tertanam' : '🔇 tanpa dialog'}
                  </span>
                )}
              </div>
              <span className={`flex items-center gap-1 text-[11px] font-mono ${overQuota ? 'text-red-600 font-semibold' : 'text-[#94A3B8]'}`}>
                <FileImage size={12} /> {refImgs.length} foto ref{overQuota ? ` ⚠ MELEBIHI KUOTA ${MAX_REF_IMAGES_PER_PART}` : ''}
              </span>
            </div>

            {/* Strip nama file reference image — urutan = urutan lampir Google Flow */}
            {refImgs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[11px] font-mono text-[#64748B]">
                {refImgs.map((f, fi) => (
                  <span key={fi} className="px-1.5 py-0.5 bg-[#F8FAFC] border border-gray-100 rounded">{fi + 1}. {f}</span>
                ))}
              </div>
            )}

            {/* Dialog / narasi Part */}
            {p.dialog && (
              <div>
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Dialog / Narasi</div>
                <p className="text-sm text-[#0F172A] leading-relaxed">{p.dialog}</p>
              </div>
            )}

            {/* Prompt siap-tempel Part ini (rangkuman field terstruktur, lihat partPromptText()) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">Prompt Siap Tempel (Part ini)</div>
                <button onClick={() => copyPrompt(i, prompt)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                  style={{ color: copiedIdx === i ? '#10B981' : '#1565C0' }}>
                  {copiedIdx === i ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Part {i + 1}</>}
                </button>
              </div>
              <pre className="w-full p-3 border border-gray-200 rounded-xl text-xs font-mono text-[#0F172A] bg-[#F8FAFC] whitespace-pre-wrap break-words leading-relaxed">{prompt || '(kosong)'}</pre>
            </div>

            {/* cuts[] — potongan di dalam Part ini */}
            {Array.isArray(p.cuts) && p.cuts.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Cuts</div>
                <div className="space-y-1">
                  {p.cuts.map((c, ci) => (
                    <div key={ci} className="flex gap-2 text-xs p-2 border border-gray-100 rounded-lg bg-[#F8FAFC]">
                      <span className="font-mono text-[#1565C0] shrink-0">{c.t ?? `cut ${ci + 1}`}</span>
                      <span className="text-[#0F172A]">{c.photo ? `[${c.photo}] ` : ''}{c.action || <span className="text-red-500">(action kosong)</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* negative_prompt (tool bukan audio-native, ditampilkan bila diisi) */}
            {!p.dialogue && p.negative_prompt && (
              <div>
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Negative Prompt</div>
                <p className="text-xs text-[#0F172A] font-mono bg-[#F8FAFC] border border-gray-100 rounded-lg p-2">{p.negative_prompt}</p>
              </div>
            )}

            {/* On-screen text + transisi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {Array.isArray(p.on_screen_text) && p.on_screen_text.length > 0 && (
                <div>
                  <div className="font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">On-Screen Text</div>
                  <p className="text-[#0F172A]">{p.on_screen_text.join(' / ')}</p>
                </div>
              )}
              {p.transition_to_next && (
                <div>
                  <div className="font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Transisi → Berikutnya</div>
                  <p className="text-[#0F172A]">{p.transition_to_next}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Production notes */}
      <div className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-[#F8FAFC]">
        <div className="font-display font-bold text-[#0F172A] text-sm">Production Notes</div>
        {pn.caption && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Caption</div>
            <p className="text-sm text-[#0F172A]">{pn.caption}</p>
          </div>
        )}
        {Array.isArray(pn.hashtags) && pn.hashtags.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Hashtags</div>
            <p className="text-sm text-[#1565C0] font-medium">{pn.hashtags.map(h => `#${String(h).replace(/^#/, '')}`).join(' ')}</p>
          </div>
        )}
        {pn.thumbnail_concept && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Konsep Thumbnail</div>
            <p className="text-sm text-[#0F172A]">{pn.thumbnail_concept}</p>
          </div>
        )}
        {pn.posting_time_suggestion && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Saran Waktu Posting</div>
            <p className="text-sm text-[#0F172A]">{pn.posting_time_suggestion}</p>
          </div>
        )}
      </div>
    </div>
  );
}
